import { auth, db } from "@/config/firebase";
import NetInfo from "@react-native-community/netinfo";
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
// @ts-ignore
import Realm from "realm";
import { GradeStorageRecord, GradingResult } from "../types/scanning";
import { LogService } from "./logService";

const GRADE_RESULTS_COLLECTION = "scannedResults";

export class OfflineGrade extends Realm.Object<OfflineGrade> {
  _id!: Realm.BSON.ObjectId;
  studentId!: string;
  examId!: string;
  score!: number;
  totalPoints!: number;
  percentage!: number;
  gradeEquivalent!: string;
  correctAnswers!: number;
  totalQuestions!: number;
  dateScanned!: string;
  status!: string;
  scannedBy!: string;
  createdAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: "OfflineGrade",
    primaryKey: "_id",
    properties: {
      _id: { type: "objectId", default: () => new Realm.BSON.ObjectId() },
      studentId: "string",
      examId: "string",
      score: "int",
      totalPoints: "int",
      percentage: "double",
      gradeEquivalent: "string",
      correctAnswers: "int",
      totalQuestions: "int",
      dateScanned: "string",
      status: "string",
      scannedBy: "string",
      createdAt: "date",
    },
  };
}

let realmInstance: Realm | null = null;
async function getRealm(): Promise<Realm> {
  if (!realmInstance) {
    realmInstance = await Realm.open({
      schema: [OfflineGrade],
      schemaVersion: 1,
    });
  }
  return realmInstance;
}

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
      // ── Primary: check top-level `students` collection ──────────────────
      // 1a. Document ID is the student ID (most common pattern in this app)
      const directRef = doc(db, "students", studentId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) return true;

      // 1b. `student_id` field within the collection
      const studentFieldQ = query(
        collection(db, "students"),
        where("student_id", "==", studentId),
      );
      const studentFieldSnap = await getDocs(studentFieldQ);
      if (!studentFieldSnap.empty) return true;

      // ── Fallback: check class rosters ────────────────────────────────────
      const q = query(
        collection(db, "classes"),
        where("students", "array-contains-any", [{ student_id: studentId }]),
      );
      const snap = await getDocs(q);
      if (!snap.empty) return true;

      // Manual fallback for SDKs that don't support partial object matching
      const allClasses = await getDocs(collection(db, "classes"));
      for (const classDoc of allClasses.docs) {
        const students: { student_id: string }[] =
          classDoc.data().students ?? [];
        if (students.some((s) => s.student_id === studentId)) return true;
      }

      LogService.warn(
        "STUDENT_ID_INVALID",
        `Student ID not found in students collection or any class: ${studentId}`,
        { studentId },
      );
      return false;
    } catch (error) {
      LogService.error("STUDENT_ID_INVALID", "Failed to validate student ID", {
        studentId,
        error,
      });
      // Allow if validation fails due to network — don't block save
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
    uid: string,
  ): Promise<boolean> {
    try {
      // Query by examId only to avoid needing a composite index in Firestore
      const q = query(
        collection(db, GRADE_RESULTS_COLLECTION),
        where("examId", "==", examId),
      );
      const snap = await getDocs(q);

      // Client-side filter for studentId and user ownership
      return snap.docs.some((docSnap) => {
        const data = docSnap.data();
        return data.studentId === studentId && data.scannedBy === uid;
      });
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
    console.log(`[GradeStorageService] Starting save for student ${result.studentId}, exam ${resolvedExamId}`);

    // ── Check Connectivity First ──
    const netState = await NetInfo.fetch();
    const isOnline = !!(netState.isConnected && netState.isInternetReachable);

    if (!isOnline) {
      console.log("[GradeStorageService] Offline detected. Bypassing validation and queueing to RealmDB.");
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
        status: "pending",
        savedBy: uid,
        createdAt: new Date(),
      };
      return GradeStorageService.queueOffline(record);
    }

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

    // ── 1. Student ID validation (with 2s SLA) ──
    try {
      const studentValid = await withTimeout(
        GradeStorageService.validateStudentId(result.studentId),
        2000
      );
      if (!studentValid) {
        return {
          success: false,
          status: "error",
          message: `Student ID "${result.studentId}" was not found in the database.`,
        };
      }
    } catch (err) {
      console.warn("[GradeStorageService] Student validation timed out/failed. Proceeding with offline-first trust.");
    }

    // ── 2. Exam ID validation (with 2s SLA) ──
    try {
      const examValid = await withTimeout(
        GradeStorageService.validateExamId(resolvedExamId),
        2000
      );
      if (!examValid) {
        return {
          success: false,
          status: "error",
          message: `Exam ID "${resolvedExamId}" is not active or does not exist.`,
        };
      }
    } catch (err) {
      console.warn("[GradeStorageService] Exam validation timed out/failed. Proceeding with offline-first trust.");
    }

    // ── 3. Duplicate check (with 2s SLA) ──
    try {
      const duplicate = await withTimeout(
        GradeStorageService.isDuplicate(result.studentId, resolvedExamId, uid),
        2000
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
    } catch (err) {
      console.warn("[GradeStorageService] Duplicate check timed out. Proceeding.");
    }

    console.log(`[GradeStorageService] Validation & duplicate check passed for ${result.studentId}`);

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
      scannedBy: uid,
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

    console.log(`[GradeStorageService] Attempting Firestore write to doc ${gradeRef.id}...`);

    try {
      // Enforce 2-second SLA for the Firestore commit
      await withTimeout(batch.commit(), 2000);

      await LogService.info("SAVE_SUCCESS", "Grade result saved to Firestore", {
        docId: gradeRef.id,
        studentId: record.studentId,
        examId: record.examId,
      });

      console.log(`[GradeStorageService] Successfully saved to Firestore! Doc: ${gradeRef.id}`);

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
        console.warn(`[GradeStorageService] Network unavailable (${msg}). Handing off to RealmDB for offline queueing.`);
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
      console.log(`[GradeStorageService] Opening RealmDB to queue record for student ${record.studentId}...`);
      const realm = await getRealm();

      realm.write(() => {
        realm.create("OfflineGrade", {
          studentId: record.studentId,
          examId: record.examId,
          score: record.score,
          totalPoints: record.totalPoints,
          percentage: record.percentage,
          gradeEquivalent: record.gradeEquivalent,
          correctAnswers: record.correctAnswers,
          totalQuestions: record.totalQuestions,
          dateScanned: record.dateScanned,
          status: "pending",
          scannedBy: record.scannedBy,
          createdAt: record.createdAt,
        });
      });

      const queueLength = realm.objects("OfflineGrade").length;
      console.log(`[GradeStorageService] Record successfully queued in RealmDB. Total offline items: ${queueLength}`);

      await LogService.info(
        "SAVE_OFFLINE_QUEUED",
        "No network — grade queued for sync in RealmDB",
        {
          studentId: record.studentId,
          examId: record.examId,
          queueLength,
        },
      );

      return {
        success: true,
        status: "pending",
        message:
          "No internet connection. Result saved locally to Realm and will sync automatically.",
      };
    } catch (error) {
      await LogService.error(
        "SAVE_FAILED",
        "Failed to queue grade result in RealmDB",
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

  static async getOfflineItemCount(): Promise<number> {
    try {
      const realm = await getRealm();
      return realm.objects<OfflineGrade>("OfflineGrade").length;
    } catch (error) {
      console.error("[GradeStorageService] Failed to get offline item count", error);
      return 0;
    }
  }

  static async syncOfflineQueue(): Promise<void> {
    try {
      // ── Wait for Firebase Auth State To Restore ──
      const { auth } = await import("../config/firebase");
      await new Promise<void>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((user: any) => {
          unsubscribe();
          resolve();
        });
      });

      // If user is still not logged in after restore, we can't sync
      if (!auth.currentUser) {
        console.log("[GradeStorageService] Cannot sync: User is not logged in.");
        return;
      }

      const realm = await getRealm();
      const offlineGrades = realm.objects<OfflineGrade>("OfflineGrade");

      if (offlineGrades.length === 0) {
        console.log("[GradeStorageService] No offline grades found in RealmDB. Skipping sync.");
        return;
      }

      console.log(`[GradeStorageService] Found ${offlineGrades.length} offline grades to sync.`);

      await LogService.info(
        "OFFLINE_SYNC_STARTED",
        `Syncing ${offlineGrades.length} offline grade(s) from RealmDB via atomic batch transaction`,
      );

      const batch = writeBatch(db);

      // Limit to max 400 for safety, as Firestore batch limit is 500 operations
      const recordsToSync = Array.from(offlineGrades as unknown as OfflineGrade[]).slice(0, 400);
      let validRecordsToSyncCount = 0;

      for (const record of recordsToSync) {
        // ── Re-validate everything before syncing ──
        try {
          // 1. Check if student still exists
          const studentValid = await GradeStorageService.validateStudentId(record.studentId);
          if (!studentValid) {
            console.warn(`[GradeStorageService] Skipping sync for invalid student: ${record.studentId}`);
            continue;
          }

          // 2. Check if exam is still active
          const examValid = await GradeStorageService.validateExamId(record.examId);
          if (!examValid) {
            console.warn(`[GradeStorageService] Skipping sync for invalid/inactive exam: ${record.examId}`);
            continue;
          }

          // 3. Re-check duplicate before syncing
          const duplicate = await GradeStorageService.isDuplicate(
            record.studentId,
            record.examId,
            record.scannedBy || GradeStorageService.requireAuth(),
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
            // Duplicate won't be synced but will be deleted from local Realm 
            continue;
          }
        } catch (err) {
          // If a check fails due to network, we can't sync this record in this batch
          console.error(`[GradeStorageService] Re-validation failed for ${record.studentId}. Skipping in this batch.`, err);
          continue;
        }

        const gradeRef = doc(collection(db, GRADE_RESULTS_COLLECTION));

        batch.set(gradeRef, {
          studentId: record.studentId,
          examId: record.examId,
          score: record.score,
          totalPoints: record.totalPoints,
          percentage: record.percentage,
          gradeEquivalent: record.gradeEquivalent,
          correctAnswers: record.correctAnswers,
          totalQuestions: record.totalQuestions,
          dateScanned: record.dateScanned,
          status: "saved",
          scannedBy: record.scannedBy,
          createdAt: Timestamp.now(), // Source of truth sync time
        });

        validRecordsToSyncCount++;
      }

      // ── Transactionally commit all or nothing ──
      if (validRecordsToSyncCount > 0) {
        console.log(`[GradeStorageService] Committing atomic batch of ${validRecordsToSyncCount} records to Firestore...`);
        await withTimeout(batch.commit(), 5000); // 5 sec SLA for batch
        console.log("[GradeStorageService] Batch commit SUCCESSFUL.");
      }

      // If we reach here, batch successfully committed (or there were only duplicates)
      // Now it's safe to clear ONLY the synchronized records from Realm
      console.log(`[GradeStorageService] Cleaning up ${recordsToSync.length} records from RealmDB...`);
      realm.write(() => {
        realm.delete(recordsToSync);
      });
      console.log("[GradeStorageService] RealmDB cleanup complete.");

      await LogService.info("OFFLINE_SYNC_SUCCESS", "Offline sync batch complete", {
        synced: validRecordsToSyncCount,
        clearedFromRealm: recordsToSync.length,
      });
    } catch (error) {
      // Intentionally DO NOT clear Realm on error
      await LogService.error(
        "OFFLINE_SYNC_FAILED",
        "Offline sync batch failed. Realm DB kept intact for future re-try.",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
} 