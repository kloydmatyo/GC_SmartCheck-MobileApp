import { auth, db } from "@/config/firebase";
import NetInfo from "@react-native-community/netinfo";
import {
    collection,
    doc,
    FirestoreError,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    Timestamp,
    where,
    writeBatch,
} from "firebase/firestore";
import { GradeStorageRecord, GradingResult } from "../types/scanning";
import { LogService } from "./logService";
import { OfflineGrade, RealmService } from "./realmService";

const GRADE_RESULTS_COLLECTION = "scannedResults";

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
      // ── 1. Check StudentCache Realm (fast, no network) ───────────────────
      const { RealmService } = await import("./realmService");
      const cacheRealm = await RealmService.getCacheRealm();
      const cached = cacheRealm
        .objects("StudentCache")
        .filtered("student_id == $0", studentId);
      if (cached.length > 0) return true;

      // ── 2. Check ClassCache rosters (students embedded as JSON) ──────────
      const allClasses = cacheRealm.objects("ClassCache");
      for (const cls of allClasses as any) {
        try {
          const students: { student_id: string }[] = JSON.parse(
            cls.students || "[]",
          );
          if (students.some((s) => s.student_id === studentId)) return true;
        } catch {
          // malformed JSON — skip
        }
      }

      // ── 3. Fallback: single Firestore query by student_id field (both variants) ──────────
      const [studentFieldSnap, studentCamelSnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("student_id", "==", studentId))),
        getDocs(query(collection(db, "students"), where("studentId", "==", studentId))),
      ]);
      if (!studentFieldSnap.empty || !studentCamelSnap.empty) return true;

      LogService.warn(
        "STUDENT_ID_INVALID",
        `Student ID not found: ${studentId}`,
        { studentId },
      );
      return false;
    } catch {
      // Allow if validation fails — don't block save
      return true;
    }
  }

  static async validateExamId(examId: string): Promise<boolean> {
    if (!examId) {
      LogService.warn("EXAM_ID_INVALID", "Empty exam ID provided");
      return false;
    }

    // Check staging first if it's a staging ID
    if (examId.startsWith("staging_")) {
      try {
        const stagingRealm = await RealmService.getStagingRealm();
        const hexId = examId.replace("staging_", "");
        const sQuiz = stagingRealm.objectForPrimaryKey(
          "OfflineQuiz",
          new Realm.BSON.ObjectId(hexId),
        );
        return !!sQuiz;
      } catch (e) {
        console.error("Error validating staging exam:", e);
        return false;
      }
    }

    try {
      const netState = await NetInfo.fetch();
      const isOnline = !!(netState.isConnected && netState.isInternetReachable);

      if (isOnline) {
        // 1. Try Firestore
        const snap = await getDoc(doc(db, "exams", examId));
        if (snap.exists()) return true;
      }

      // 2. Fallback to local cache if Firestore record not found or offline
      const cacheRealm = await RealmService.getCacheRealm();
      const cached = cacheRealm.objectForPrimaryKey("QuizCache", examId);
      return !!cached;
    } catch (error) {
      // If we're offline, try cache before giving up
      try {
        const cacheRealm = await RealmService.getCacheRealm();
        const cached = cacheRealm.objectForPrimaryKey("QuizCache", examId);
        return !!cached;
      } catch {
        LogService.error(
          "EXAM_ID_INVALID",
          "Failed to validate exam ID anywhere",
          {
            examId,
            error,
          },
        );
        return true; // Allow as a last resort if everything fails
      }
    }
  }
  static async isDuplicate(
    studentId: string,
    examId: string,
    uid: string,
    includeStaging: boolean = true,
  ): Promise<boolean> {
    try {
      // 1. Check local storage (Staging and Cache)
      try {
        const { RealmService } = await import("./realmService");
        if (includeStaging) {
          const stagingRealm = await RealmService.getStagingRealm();
          const pending = stagingRealm.objects("OfflineGrade").filtered(
            "studentId == $0 AND examId == $1",
            studentId,
            examId,
          );
          if (pending.length > 0) return true;
        }

        const cacheRealm = await RealmService.getCacheRealm();
        const cached = cacheRealm.objects("GradeCache").filtered(
          "studentId == $0 AND examId == $1",
          studentId,
          examId,
        );
        if (cached.length > 0) return true;
      } catch (e) {
        console.warn("[GradeStorageService] Local duplicate check failed:", e);
      }

      // 2. Check Firestore (If online)
      const netState = await NetInfo.fetch();
      const isOnline = !!(netState.isConnected && netState.isInternetReachable);

      if (isOnline) {
        const q = query(
          collection(db, GRADE_RESULTS_COLLECTION),
          where("examId", "==", examId),
          where("studentId", "==", studentId),
        );
        const snap = await getDocs(q);
        return !snap.empty;
      }

      return false;
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
    console.log(
      `[GradeStorageService] Starting save for student ${result.studentId}, exam ${resolvedExamId}`,
    );

    // ── Check Connectivity First ──
    const netState = await NetInfo.fetch();
    const isOnline = !!(netState.isConnected && netState.isInternetReachable);

    if (!isOnline) {
      console.log(
        "[GradeStorageService] Offline detected. Bypassing validation and queueing to RealmDB.",
      );
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
        scannedBy: uid,
        createdAt: new Date(),
        answers: result.answers?.map((a) => a.studentAnswer) ?? [],
        isNullId: result.metadata?.isValidId === false,
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
        2000,
      );
      if (!studentValid) {
        console.warn(`[GradeStorageService] Student ${result.studentId} not in local cache during online save. Proceeding anyway.`);
      }
    } catch {
      console.warn(
        "[GradeStorageService] Student validation timed out/failed. Proceeding with offline-first trust.",
      );
    }

    // ── 2. Exam ID validation (with 2s SLA) ──
    try {
      const examValid = await withTimeout(
        GradeStorageService.validateExamId(resolvedExamId),
        2000,
      );
      if (!examValid) {
        console.warn(`[GradeStorageService] Exam ${resolvedExamId} not in local cache during online save. Proceeding anyway.`);
      }
    } catch {
      console.warn(
        "[GradeStorageService] Exam validation timed out/failed. Proceeding with offline-first trust.",
      );
    }

    // ── 3. Duplicate check (with 2s SLA) ──
    try {
      const duplicate = await withTimeout(
        // Don't check staging — a pending offline record is not a "true" duplicate yet
        GradeStorageService.isDuplicate(result.studentId, resolvedExamId, uid, false),
        2000,
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
    } catch {
      console.warn(
        "[GradeStorageService] Duplicate check timed out. Proceeding.",
      );
    }

    console.log(
      `[GradeStorageService] Validation & duplicate check passed for ${result.studentId}`,
    );

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
      answers: result.answers?.map((a) => a.studentAnswer) ?? [],
      isNullId: result.metadata?.isValidId === false,
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
    batch.set(gradeRef, { ...lean, createdAt: Timestamp.now(), scannedAt: serverTimestamp() });

    console.log(
      `[GradeStorageService] Attempting Firestore write to doc ${gradeRef.id}...`,
    );

    try {
      // Enforce 5-second SLA for the Firestore commit
      await withTimeout(batch.commit(), 5000);

      await LogService.info("SAVE_SUCCESS", "Grade result saved to Firestore", {
        docId: gradeRef.id,
        studentId: record.studentId,
        examId: record.examId,
      });

      console.log(
        `[GradeStorageService] Successfully saved to Firestore! Doc: ${gradeRef.id}`,
      );

      // Update GradeCache immediately so exam-preview Results tab reflects the
      // new score without waiting for the next full sync.
      try {
        const { RealmService } = await import("./realmService");
        const cacheRealm = await RealmService.getCacheRealm();
        cacheRealm.write(() => {
          cacheRealm.create(
            "GradeCache",
            {
              id: gradeRef.id,
              studentId: record.studentId,
              examId: record.examId,
              score: record.score,
              totalPoints: record.totalPoints,
              percentage: record.percentage,
              gradeEquivalent: record.gradeEquivalent ?? "",
              dateScanned: record.dateScanned ?? "",
              scannedBy: record.scannedBy ?? "",
              createdAt: new Date(),
            },
            true, // UpdateMode.Modified — safe to call even if it already exists
          );
        });
        console.log(
          `[GradeStorageService] GradeCache updated for doc ${gradeRef.id}`,
        );
      } catch (cacheErr) {
        // Non-fatal — Firestore is the source of truth
        console.warn(
          "[GradeStorageService] GradeCache update failed (non-fatal):",
          cacheErr,
        );
      }

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
        console.warn(
          `[GradeStorageService] Network unavailable (${msg}). Handing off to RealmDB for offline queueing.`,
        );
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
      console.log(
        `[GradeStorageService] Opening RealmDB to queue record for student ${record.studentId}...`,
      );
      const realm = await RealmService.getStagingRealm();

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
          answers: JSON.stringify(record.answers ?? []),
          isNullId: record.isNullId ?? false,
        });
      });

      const queueLength = realm.objects("OfflineGrade").length;
      console.log(
        `[GradeStorageService] Record successfully queued in RealmDB. Total offline items: ${queueLength}`,
      );

      await LogService.info(
        "SAVE_OFFLINE_QUEUED",
        "No network — grade queued for sync in RealmDB",
        {
          studentId: record.studentId,
          examId: record.examId,
          queueLength,
        },
      );

      const result: SaveResult = {
        success: true,
        status: "pending",
        message:
          "No internet connection. Result saved locally to Realm and will sync automatically.",
      };

      // Attempt immediate sync in background — if online, this pushes the
      // queued grade to Firestore right away without waiting for app resume.
      NetInfo.fetch().then((state) => {
        if (state.isConnected && state.isInternetReachable) {
          GradeStorageService.syncOfflineQueue().catch((err) =>
            console.warn(
              "[GradeStorageService] Immediate sync after queue failed:",
              err,
            ),
          );
        }
      });

      return result;
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
      const realm = await RealmService.getStagingRealm();
      return realm.objects<OfflineGrade>("OfflineGrade").length;
    } catch (error) {
      console.error(
        "[GradeStorageService] Failed to get offline item count",
        error,
      );
      return 0;
    }
  }

  static async syncOfflineQueue(): Promise<void> {
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        console.log("[GradeStorageService] Skipping offline sync: detected offline.");
        return;
      }

      const { auth } = await import("../config/firebase");

      // Only wait if auth is not already initialized
      if (!auth.currentUser) {
        await new Promise<void>((resolve) => {
          const unsubscribe = auth.onAuthStateChanged(() => {
            unsubscribe();
            resolve();
          });
          // Safety timeout to prevent hanging if state never changes
          setTimeout(() => {
            unsubscribe();
            resolve();
          }, 3000);
        });
      }

      // If user is still not logged in after restore, we can't sync
      if (!auth.currentUser) {
        console.log(
          "[GradeStorageService] Cannot sync: User is not logged in.",
        );
        return;
      }

      const realm = await RealmService.getStagingRealm();
      const currentUid = auth.currentUser.uid;
      
      // Only sync records that belong to the current authenticated user
      const offlineGrades = realm.objects<OfflineGrade>("OfflineGrade")
        .filtered("scannedBy == $0", currentUid);

      if (offlineGrades.length === 0) {
        console.log(
          `[GradeStorageService] No offline grades found for user ${currentUid}. Skipping sync.`,
        );
        return;
      }

      console.log(
        `[GradeStorageService] Found ${offlineGrades.length} offline grades to sync.`,
      );

      await LogService.info(
        "OFFLINE_SYNC_STARTED",
        `Syncing ${offlineGrades.length} offline grade(s) from RealmDB via atomic batch transaction`,
      );

      const batch = writeBatch(db);

      // Limit to max 100 per batch for better stability on mobile connections
      const recordsToSync = Array.from(
        offlineGrades as unknown as OfflineGrade[],
      ).slice(0, 100);
      
      const recordsActuallySynced: OfflineGrade[] = [];

      for (const record of recordsToSync) {
        // Drop records with missing examId — Firestore will always reject these
        if (!record.examId || record.examId.trim() === "") {
          console.warn(
            `[GradeStorageService] Dropping record for student ${record.studentId}: empty examId.`,
          );
          realm.write(() => {
            if (record && record.isValid && record.isValid()) realm.delete(record);
          });
          continue;
        }

        // ── Re-validation (Local Only) ──
        // We skip network-based duplicate checks here to avoid
        // sequential request bottlenecks that cause timeouts.
        try {
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
            answers: record.answers ? JSON.parse(record.answers) : [],
            isNullId: record.isNullId ?? false,
            status: "saved",
            scannedBy: record.scannedBy,
            createdAt: Timestamp.now(), 
            scannedAt: serverTimestamp(),
          });

          recordsActuallySynced.push(record);
        } catch (err) {
          console.error(
            `[GradeStorageService] Failed to prepare record for ${record.studentId}.`,
            err,
          );
          continue;
        }
      }

      // ── Transactionally commit all or nothing ──
      if (recordsActuallySynced.length > 0) {
        console.log(
          `[GradeStorageService] Committing atomic batch of ${recordsActuallySynced.length} records to Firestore...`,
        );
        
        try {
          await withTimeout(batch.commit(), 15000); 
          console.log("[GradeStorageService] Batch commit SUCCESSFUL.");
          
          // Successful batch — clear from Realm
          realm.write(() => {
            for (const record of recordsActuallySynced) {
              if (record && record.isValid && record.isValid()) {
                realm.delete(record);
              }
            }
          });
        } catch (batchError: any) {
          console.warn(
            "[GradeStorageService] Atomic batch failed, falling back to individual syncs to isolate error:",
            batchError?.message || batchError,
          );
          
          // FALLBACK: Try individual syncs to identify the problematic record
          for (const record of recordsActuallySynced) {
            // Snapshot all needed field values BEFORE any possible realm.delete() call
            // to avoid "Accessing object which has been invalidated or deleted" errors.
            const snap = {
              studentId: record.studentId,
              examId: record.examId,
              score: record.score,
              totalPoints: record.totalPoints,
              percentage: record.percentage,
              gradeEquivalent: record.gradeEquivalent,
              correctAnswers: record.correctAnswers,
              totalQuestions: record.totalQuestions,
              dateScanned: record.dateScanned,
              answers: record.answers,
              isNullId: record.isNullId,
              scannedBy: record.scannedBy,
            };

            try {
              const individualBatch = writeBatch(db);
              const gradeRef = doc(collection(db, GRADE_RESULTS_COLLECTION));

              individualBatch.set(gradeRef, {
                ...snap,
                answers: snap.answers ? JSON.parse(snap.answers) : [],
                isNullId: snap.isNullId ?? false,
                status: "saved",
                createdAt: Timestamp.now(),
                scannedAt: serverTimestamp(),
              });

              await withTimeout(individualBatch.commit(), 5000);

              // Individual success — clear this specific record
              realm.write(() => {
                if (record && record.isValid && record.isValid()) {
                  realm.delete(record);
                }
              });
              console.log(`[GradeStorageService] Individual sync SUCCESS for student ${snap.studentId}`);
            } catch (indError: any) {
              const isPermissionError =
                indError?.message?.includes("permissions") ||
                indError?.code === "permission-denied";

              if (isPermissionError) {
                console.error(
                  `[GradeStorageService] PERMANENT REJECTION for student ${snap.studentId} (Exam ${snap.examId}): Permission Denied.`,
                );
                // Drop it from Realm so it stops blocking the queue
                realm.write(() => {
                  if (record && record.isValid && record.isValid()) {
                    realm.delete(record);
                  }
                });
                // Use snapshotted values — record may already be invalidated here
                await LogService.error("SYNC_PERMISSION_DENIED", "Record dropped due to missing permissions", {
                  studentId: snap.studentId,
                  examId: snap.examId,
                  scannedBy: snap.scannedBy,
                });
              } else {
                console.warn(
                  `[GradeStorageService] Individual sync FAILED for ${snap.studentId}:`,
                  indError?.message,
                );
                // For other errors (timeout, etc), keep it in Realm for next retry
              }
            }
          }
        }
      }
      
      console.log("[GradeStorageService] Sync cycle complete.");

      await LogService.info(
        "OFFLINE_SYNC_CYCLE_COMPLETE",
        "Offline sync processing attempt finished"
      );
    } catch (error) {
      await LogService.error(
        "OFFLINE_SYNC_CRITICAL_FAILURE",
        "Critical error during sync cycle",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Purge all pending OfflineGrade records from staging Realm.
   * Use this to clear stuck/stale records that can no longer be synced.
   */
  static async clearStagingQueue(): Promise<number> {
    try {
      const realm = await RealmService.getStagingRealm();
      const all = realm.objects("OfflineGrade");
      const count = all.length;
      realm.write(() => realm.delete(all));
      console.log(
        `[GradeStorageService] Cleared ${count} stale staging records.`,
      );
      return count;
    } catch (err) {
      console.warn("[GradeStorageService] Failed to clear staging queue:", err);
      return 0;
    }
  }
}
