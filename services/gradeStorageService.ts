import { auth, db } from "@/config/firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  doc,
  FirestoreError,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { GradeStorageRecord, GradingResult } from "../types/scanning";
import { LogService } from "./logService";

const GRADE_RESULTS_COLLECTION = "grade_results";
const OFFLINE_QUEUE_KEY = "gcsc-grade-queue";

export interface SaveResult {
  success: boolean;
  status: "saved" | "duplicate" | "pending" | "error";
  docId?: string;
  message: string;
}

/** Rejects after `ms` milliseconds with a timeout error */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

/** Classify a Firestore error code into a user-friendly message */
function firestoreErrorMessage(error: unknown): string {
  if (error instanceof FirestoreError) {
    switch (error.code) {
      case "permission-denied":
        return "Permission denied. Please sign in again.";
      case "not-found":
        return "Record not found. It may have been deleted.";
      case "already-exists":
        return "This record already exists.";
      case "deadline-exceeded":
      case "unavailable":
        return "Server unavailable. Result queued for sync.";
      case "resource-exhausted":
        return "Request limit reached. Please try again shortly.";
      case "unauthenticated":
        return "Session expired. Please sign in again.";
      default:
        return `Firestore error (${error.code}): ${error.message}`;
    }
  }
  if (error instanceof Error) {
    if (
      error.message.includes("offline") ||
      error.message.includes("network") ||
      error.message.includes("unavailable") ||
      error.message.includes("timeout")
    ) {
      return "offline";
    }
    return error.message;
  }
  return "Unknown error";
}

export class GradeStorageService {
  private static requireAuth(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      LogService.warn(
        "AUTH_MISSING",
        "Attempted grade save without active auth token",
      );
      throw new Error("No active authentication token. Please sign in again.");
    }
    return uid;
  }

  static async validateStudentId(studentId: string): Promise<boolean> {
    try {
      // Query classes where the students array contains a matching student_id
      const q = query(
        collection(db, "classes"),
        where("students", "array-contains-any", [{ student_id: studentId }]),
      );
      const snap = await getDocs(q);

      // array-contains-any does partial object match only in some SDK versions;
      // fall back to a manual scan of the first page if the query returns empty
      if (!snap.empty) return true;

      // Manual fallback: scan all classes and check each students array
      const allClasses = await getDocs(collection(db, "classes"));
      for (const classDoc of allClasses.docs) {
        const students: { student_id: string }[] =
          classDoc.data().students ?? [];
        if (students.some((s) => s.student_id === studentId)) return true;
      }

      LogService.warn(
        "STUDENT_ID_INVALID",
        `Student ID not found in any class: ${studentId}`,
        { studentId },
      );
      return false;
    } catch (error) {
      LogService.error("STUDENT_ID_INVALID", "Failed to validate student ID", {
        studentId,
        error,
      });
      // Prototype: allow if validation fails due to network — don't block save
      return true;
    }
  }

  static async validateExamId(examId: string): Promise<boolean> {
    if (!examId) {
      LogService.warn("EXAM_ID_INVALID", "Empty exam ID provided");
      return false;
    }
    try {
      const snap = await getDoc(doc(db, "exams", examId));
      if (!snap.exists()) {
        LogService.warn("EXAM_ID_INVALID", `Exam ID not found: ${examId}`, {
          examId,
        });
        return false;
      }
      const status = snap.data()?.status as string | undefined;
      if (status && status !== "Active") {
        LogService.warn(
          "EXAM_ID_INVALID",
          `Exam is not active (status: ${status})`,
          { examId, status },
        );
        return false;
      }
      return true;
    } catch (error) {
      LogService.error("EXAM_ID_INVALID", "Failed to validate exam ID", {
        examId,
        error,
      });
      return true;
    }
  }
  static async isDuplicate(
    studentId: string,
    examId: string,
  ): Promise<boolean> {
    try {
      const q = query(
        collection(db, GRADE_RESULTS_COLLECTION),
        where("studentId", "==", studentId),
        where("examId", "==", examId),
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (error) {
      LogService.error("SAVE_FAILED", "Duplicate check query failed", {
        studentId,
        examId,
        error,
      });
      return false;
    }
  }
  static async saveGradingResult(
    result: GradingResult,
    examId: string,
  ): Promise<SaveResult> {
    // Auth guard
    let uid: string;
    try {
      uid = GradeStorageService.requireAuth();
    } catch (err: unknown) {
      return {
        success: false,
        status: "error",
        message: err instanceof Error ? err.message : "Authentication error",
      };
    }

    const resolvedExamId = examId || result.examId;

    await LogService.info(
      "SCAN_SUCCESS",
      "Grading complete — beginning save pipeline",
      {
        studentId: result.studentId,
        examId: resolvedExamId,
        score: result.score,
        percentage: result.percentage,
      },
    );

    // Student ID validation
    const studentValid = await GradeStorageService.validateStudentId(
      result.studentId,
    );
    if (!studentValid) {
      return {
        success: false,
        status: "error",
        message: `Student ID "${result.studentId}" was not found in the database.`,
      };
    }

    // Exam ID validation
    const examValid = await GradeStorageService.validateExamId(resolvedExamId);
    if (!examValid) {
      return {
        success: false,
        status: "error",
        message: `Exam ID "${resolvedExamId}" is not active or does not exist.`,
      };
    }

    // Duplicate check
    const duplicate = await GradeStorageService.isDuplicate(
      result.studentId,
      resolvedExamId,
    );
    if (duplicate) {
      await LogService.warn("SAVE_DUPLICATE", "Duplicate entry blocked", {
        studentId: result.studentId,
        examId: resolvedExamId,
      });
      return {
        success: false,
        status: "duplicate",
        message: `A grade for Student ${result.studentId} in this exam already exists.`,
      };
    }

    // Build Firestore record
    const record: GradeStorageRecord = {
      studentId: result.studentId,
      examId: resolvedExamId,
      score: result.score,
      totalPoints: result.totalPoints,
      percentage: result.percentage,
      gradeEquivalent: result.gradeEquivalent,
      correctAnswers: result.correctAnswers,
      totalQuestions: result.totalQuestions,
      dateScanned: result.dateScanned,
      status: "saved",
      savedBy: uid,
      createdAt: new Date(),
    };

    return GradeStorageService.writeToFirestore(record);
  }
  private static async writeToFirestore(
    record: GradeStorageRecord,
  ): Promise<SaveResult> {
    // Slim payload — drop internal JS Date (Timestamp.now() is the source of truth)
    const { createdAt: _drop, ...lean } = record;

    // Auto-generate the doc ID so we can reference it in the batch
    const gradeRef = doc(collection(db, GRADE_RESULTS_COLLECTION));

    const batch = writeBatch(db);
    batch.set(gradeRef, { ...lean, createdAt: Timestamp.now() });

    try {
      // Enforce 2-second SLA for the Firestore commit
      await withTimeout(batch.commit(), 2000);

      await LogService.info("SAVE_SUCCESS", "Grade result saved to Firestore", {
        docId: gradeRef.id,
        studentId: record.studentId,
        examId: record.examId,
      });

      return {
        success: true,
        status: "saved",
        docId: gradeRef.id,
        message: "Grade result saved successfully.",
      };
    } catch (error: unknown) {
      const msg = firestoreErrorMessage(error);
      const isOffline =
        msg === "offline" ||
        msg.includes("unavailable") ||
        msg.includes("timed out");

      if (isOffline) {
        // Rollback is implicit (batch never committed); queue offline
        return GradeStorageService.queueOffline(record);
      }

      await LogService.error("SAVE_FAILED", "Firestore write failed", {
        studentId: record.studentId,
        examId: record.examId,
        errorCode: error instanceof FirestoreError ? error.code : "unknown",
        error: msg,
      });

      return {
        success: false,
        status: "error",
        message: msg,
      };
    }
  }

  //  Offline Queueing

  private static async queueOffline(
    record: GradeStorageRecord,
  ): Promise<SaveResult> {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue: GradeStorageRecord[] = raw ? JSON.parse(raw) : [];
      queue.push(record);
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));

      await LogService.info(
        "SAVE_OFFLINE_QUEUED",
        "No network — grade queued for sync",
        {
          studentId: record.studentId,
          examId: record.examId,
          queueLength: queue.length,
        },
      );

      return {
        success: true,
        status: "pending",
        message:
          "No internet connection. Result saved locally and will sync automatically.",
      };
    } catch (error) {
      await LogService.error(
        "SAVE_FAILED",
        "Failed to queue grade result offline",
        {
          studentId: record.studentId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return {
        success: false,
        status: "error",
        message:
          "Failed to save result. Please check your connection and try again.",
      };
    }
  }

  //  Offline Sync

  static async syncOfflineQueue(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!raw) return;

      const queue: GradeStorageRecord[] = JSON.parse(raw);
      if (queue.length === 0) return;

      await LogService.info(
        "OFFLINE_SYNC_STARTED",
        `Syncing ${queue.length} offline grade(s)`,
      );

      const remaining: GradeStorageRecord[] = [];

      for (const record of queue) {
        // Re-check duplicate before syncing
        const duplicate = await GradeStorageService.isDuplicate(
          record.studentId,
          record.examId,
        );
        if (duplicate) {
          await LogService.warn(
            "SAVE_DUPLICATE",
            "Skipped duplicate during offline sync",
            {
              studentId: record.studentId,
              examId: record.examId,
            },
          );
          continue;
        }

        const result = await GradeStorageService.writeToFirestore(record);
        if (result.status !== "saved") {
          remaining.push(record); // Keep failed records for next sync attempt
        }
      }

      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));

      await LogService.info("OFFLINE_SYNC_SUCCESS", "Offline sync complete", {
        synced: queue.length - remaining.length,
        remaining: remaining.length,
      });
    } catch (error) {
      await LogService.error(
        "OFFLINE_SYNC_FAILED",
        "Offline sync encountered an error",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
