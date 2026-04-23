import { auth, db } from "@/config/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { NetworkService } from "./networkService";
import { OfflineStorageService, PendingUpdate } from "./offlineStorageService";
import {
  OfflineClass,
  OfflinePendingUpdate,
  OfflineQuiz,
  RealmService,
} from "./realmService";

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  conflicts: ConflictInfo[];
}

export interface ConflictInfo {
  examId: string;
  localVersion: number;
  serverVersion: number;
  localData: any;
  serverData: any;
}

export type ConflictResolution = "use-local" | "use-server" | "merge";

export class SyncService {
  private static isSyncing: boolean = false;
  private static initialized: boolean = false;
  private static syncListeners: ((result: SyncResult) => void)[] = [];

  /**
   * Initialize sync service
   */
  static initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    // Listen for network changes
    NetworkService.addListener((isConnected) => {
      if (isConnected) {
        console.log("Network restored, triggering auto-sync...");
        // Wait for auth to be ready before syncing
        if (auth.currentUser) {
          this.syncPendingUpdates();
        } else {
          const unsubscribe = auth.onAuthStateChanged((user) => {
            unsubscribe();
            if (user) {
              this.syncPendingUpdates();
            }
          });
        }
      }
    });
  }

  /**
   * Sync all pending updates
   */
  static async syncPendingUpdates(): Promise<SyncResult> {
    if (this.isSyncing) {
      console.log("Sync already in progress");
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        conflicts: [],
      };
    }

    const isOnline = await NetworkService.isOnline();
    if (!isOnline) {
      console.log("Device is offline, skipping sync");
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        conflicts: [],
      };
    }

    this.isSyncing = true;
    let syncedCount = 0;
    let failedCount = 0;
    const conflicts: ConflictInfo[] = [];

    try {
      // 1. Flush Grades from Staging
      try {
        await this.syncStagingGrades();
        syncedCount++;
      } catch (e) {
        console.error("Flush Grades Error", e);
        failedCount++;
      }

      // 2. Flush Classes from Staging
      try {
        await this.syncStagingClasses();
        syncedCount++;
      } catch (e) {
        console.error("Flush Classes Error", e);
        failedCount++;
      }

      // 3. Flush Exams from Staging
      try {
        await this.syncStagingExams();
        syncedCount++;
      } catch (e) {
        console.error("Flush Exams Error", e);
        failedCount++;
      }

      // 4. Flush queued document updates
      try {
        const pendingUpdates = await OfflineStorageService.getPendingUpdates();
        for (const update of pendingUpdates) {
          try {
            const conflict = await this.syncUpdate(update);
            if (conflict) {
              conflicts.push(conflict);
              failedCount++;
              continue;
            }
            await OfflineStorageService.removePendingUpdate(update.id);
            syncedCount++;
          } catch (updateError: any) {
            console.error(
              `Failed to sync update ${update.id} for exam ${update.examId}:`,
              updateError,
            );
            const errorCode = updateError?.code || updateError?.errorInfo?.code;
            const isPermissionError =
              errorCode === "permission-denied" ||
              errorCode === "PERMISSION_DENIED" ||
              updateError?.message?.includes(
                "Missing or insufficient permissions",
              );

            if (isPermissionError) {
              // Permission errors are unrecoverable — drop immediately
              console.warn(
                `[SyncService] Removing unauthorized pending update ${update.id}`,
              );
              await OfflineStorageService.removePendingUpdate(update.id);
            } else {
              // Increment retry count and drop after 5 failures
              await OfflineStorageService.incrementRetryCount(update.id);
              if ((update.retryCount || 0) >= 5) {
                console.warn(
                  `[SyncService] Dropping update ${update.id} after max retries`,
                );
                await OfflineStorageService.removePendingUpdate(update.id);
              }
            }
            failedCount++;
          }
        }
      } catch (e) {
        console.error("Pending update sync error", e);
        failedCount++;
      }

      // 5. Update the Cache Realm from Firestore
      try {
        await this.syncFirestoreToCache();
        syncedCount++;
      } catch (e) {
        console.error("Refresh Cache Error", e);
        failedCount++;
      }

      const result: SyncResult = {
        success: failedCount === 0,
        syncedCount,
        failedCount,
        conflicts,
      };

      console.log(
        `Full sync complete. Synced: ${syncedCount}, Failed: ${failedCount}`,
      );
      this.notifyListeners(result);
      return result;
    } catch (error) {
      console.error("Error during sync:", error);
      return {
        success: false,
        syncedCount,
        failedCount,
        conflicts,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Fetch user data from Firestore and store in Primary Cache Realm
   */
  static async syncFirestoreToCache(): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const realm = await RealmService.getCacheRealm();

    // Sync Classes
    const classesQuery = query(
      collection(db, "classes"),
      where("createdBy", "==", currentUser.uid),
    );
    const classesSnap = await getDocs(classesQuery);

    // Sync Exams + their latest answer keys
    const examsQuery = query(
      collection(db, "exams"),
      where("createdBy", "==", currentUser.uid),
    );
    const examsSnap = await getDocs(examsQuery);
    const examsWithAK: any[] = [];

    for (const examDoc of examsSnap.docs) {
      const akQuery = query(
        collection(db, "answerKeys"),
        where("examId", "==", examDoc.id),
      );
      const akSnap = await getDocs(akQuery);
      let answerKeyJson = "";
      if (!akSnap.empty) {
        const latestAk = akSnap.docs.sort(
          (a, b) => (b.data().version || 0) - (a.data().version || 0),
        )[0];
        answerKeyJson = JSON.stringify(latestAk.data());
      }
      examsWithAK.push({
        id: examDoc.id,
        data: examDoc.data(),
        answerKey: answerKeyJson,
      });
    }

    // Sync Grades (limit to 100 recent)
    const gradesQuery = query(
      collection(db, "scannedResults"),
      where("scannedBy", "==", currentUser.uid),
      limit(100),
    );
    const gradesSnap = await getDocs(gradesQuery);

    // 4. Fetch pending updates to ensure we don't overwrite local work
    const stagingRealm = await RealmService.getStagingRealm();
    const pendingUpdates = stagingRealm.objects<OfflinePendingUpdate>(
      "OfflinePendingUpdate",
    );
    const updateMap = new Map<string, any>();
    pendingUpdates.forEach((u) => {
      if (u.action === "update" || u.action === "update-answer-key") {
        updateMap.set(u.examId, JSON.parse(u.data));
      }
    });

    realm.write(() => {
      // Clear existing cache for these types
      realm.delete(realm.objects("ClassCache"));
      realm.delete(realm.objects("QuizCache"));
      realm.delete(realm.objects("GradeCache"));

      // Insert fresh classes
      classesSnap.docs.forEach((doc) => {
        const data = doc.data();
        realm.create("ClassCache", {
          id: doc.id,
          class_name: data.class_name,
          course_subject: data.course_subject,
          room: data.room || "",
          year: data.year || "",
          section_block: data.section_block || "",
          isArchived: data.isArchived || false,
          students: JSON.stringify(data.students || []),
          createdBy: data.createdBy,
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        });
      });

      // Insert fresh exams
      examsWithAK.forEach((item) => {
        const pendingData = updateMap.get(item.id);

        realm.create("QuizCache", {
          id: item.id,
          title: pendingData?.title || item.data.title,
          subject:
            pendingData?.subject ||
            item.data.subject ||
            item.data.className ||
            "",
          status:
            pendingData?.isArchived !== undefined
              ? pendingData.isArchived
                ? "Archived"
                : "Draft"
              : item.data.status || "Draft",
          papersCount: item.data.scanned_papers || 0,
          questionCount: pendingData?.num_items || item.data.num_items || 0,
          answerKey: pendingData?.answers
            ? JSON.stringify({
                ...JSON.parse(item.answerKey || "{}"),
                answers: pendingData.answers,
              })
            : pendingData?.answerKey
              ? JSON.stringify(pendingData.answerKey)
              : item.answerKey,
          createdBy: item.data.createdBy,
          createdAt: item.data.createdAt?.toDate?.() || new Date(),
          updatedAt: item.data.updatedAt?.toDate?.() || new Date(),
          instructorId: item.data.instructorId || "",
          examCode: item.data.examCode || item.data.room || "",
          choicesPerItem:
            pendingData?.choices_per_item || item.data.choices_per_item || 4,
          version: pendingData?.version || item.data.version || 1,
        });
      });

      // Insert fresh grades
      gradesSnap.docs.forEach((doc) => {
        const data = doc.data();
        realm.create("GradeCache", {
          id: doc.id,
          studentId: data.studentId,
          examId: data.examId,
          score: data.score,
          totalPoints: data.totalPoints,
          percentage: data.percentage,
          gradeEquivalent: data.gradeEquivalent,
          dateScanned: data.dateScanned,
          scannedBy: data.scannedBy,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        });
      });
    });

    console.log("Primary Cache Realm updated from Firestore");
  }

  private static async syncStagingGrades(): Promise<void> {
    // This is handled by GradeStorageService.syncOfflineQueue()
    // We can call it here for centralization
    console.log("Syncing staging grades...");
    const { GradeStorageService } = await import("./gradeStorageService");
    await GradeStorageService.syncOfflineQueue();
  }

  private static async syncStagingClasses(): Promise<void> {
    const realm = await RealmService.getStagingRealm();
    const stagingClasses = realm.objects<OfflineClass>("OfflineClass");

    if (stagingClasses.length === 0) return;

    for (const sClass of stagingClasses) {
      try {
        const classData = {
          class_name: sClass.class_name,
          course_subject: sClass.course_subject,
          room: sClass.room,
          section_block: sClass.section_block,
          students: JSON.parse(sClass.students),
          createdBy: sClass.createdBy,
          createdAt: Timestamp.fromDate(sClass.createdAt),
          updatedAt: Timestamp.now(),
        };

        const classId = sClass._id.toHexString();
        await setDoc(doc(db, "classes", classId), classData);

        realm.write(() => {
          realm.delete(sClass);
        });
      } catch (err) {
        console.error("Failed to sync staging class:", err);
      }
    }
  }

  private static async syncStagingExams(): Promise<void> {
    const realm = await RealmService.getStagingRealm();
    const stagingQuizzes = realm.objects<OfflineQuiz>("OfflineQuiz");

    if (stagingQuizzes.length === 0) return;

    for (const sQuiz of stagingQuizzes) {
      try {
        const quizData = {
          title: sQuiz.title,
          subject: sQuiz.subject,
          className: sQuiz.className || "",
          classId: sQuiz.classId || "",
          num_items: sQuiz.questionCount,
          status: sQuiz.status,
          createdBy: sQuiz.createdBy,
          createdAt: Timestamp.fromDate(sQuiz.createdAt),
          updatedAt: Timestamp.now(),
          instructorId: sQuiz.instructorId || "",
          examCode: sQuiz.examCode || "",
        };

        const examId = sQuiz._id.toHexString();
        const examRef = doc(db, "exams", examId);
        await setDoc(examRef, quizData);

        // Also sync answer key if it exists
        if (sQuiz.answerKey) {
          const akData = JSON.parse(sQuiz.answerKey);
          // Use a deterministic ID for the initial answer key to prevent duplicates on retry
          await setDoc(doc(db, "answerKeys", `ak_${examRef.id}_initial`), {
            examId: examRef.id,
            ...akData,
            createdAt: Timestamp.now(),
          });
        }

        // Create initial template for consistency with CreateQuizScreen
        try {
          await setDoc(doc(db, "templates", `temp_${examRef.id}`), {
            name: `${sQuiz.title}_Template`,
            numQuestions: sQuiz.questionCount,
            choicesPerQuestion: sQuiz.choicesPerItem || 4,
            createdBy: sQuiz.createdBy,
            examId: examRef.id,
            examName: sQuiz.title,
            examCode: sQuiz.examCode || "",
            createdAt: Timestamp.now(),
          });
        } catch (templateErr) {
          console.warn(
            "Failed to sync template for staging quiz:",
            templateErr,
          );
        }

        realm.write(() => {
          realm.delete(sQuiz);
        });
      } catch (err) {
        console.error("Failed to sync staging quiz:", err);
      }
    }
  }

  private static async processPendingUpdates(): Promise<void> {
    const pendingUpdates = await OfflineStorageService.getPendingUpdates();
    if (pendingUpdates.length === 0) return;

    for (const update of pendingUpdates) {
      try {
        const conflict = await this.syncUpdate(update);
        if (conflict) {
          // Resolve by merging or using server data to prevent stalls
          await this.resolveConflict(conflict, "use-server");
        }
        await OfflineStorageService.removePendingUpdate(update.id);
      } catch (err) {
        console.error("Failed to process async update:", err);
      }
    }
  }

  /**
   * Sync a single update
   */
  private static async syncUpdate(
    update: PendingUpdate,
  ): Promise<ConflictInfo | null> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("User not authenticated");
    }

    const collectionName = update.collection ?? "exams";
    const targetRef = doc(db, collectionName, update.examId);

    try {
      if (update.action === "create") {
        await setDoc(targetRef, {
          ...update.data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return null;
      }

      if (update.action === "update") {
        if (collectionName === "classes") {
          // Verify ownership before writing
          const classDoc = await getDoc(targetRef);
          if (
            classDoc.exists() &&
            classDoc.data().createdBy !== currentUser.uid
          ) {
            throw Object.assign(new Error("Permission denied: not the owner"), {
              code: "permission-denied",
            });
          }
          await updateDoc(targetRef, {
            ...update.data,
            updatedAt: serverTimestamp(),
          });
          return null;
        }

        // For exams: Check for conflicts
        const serverDoc = await getDoc(targetRef);

        if (serverDoc.exists()) {
          const serverData = serverDoc.data();

          // Verify ownership — check both createdBy and instructorId
          if (
            serverData.createdBy !== currentUser.uid &&
            serverData.instructorId !== currentUser.uid
          ) {
            console.warn(
              `[SyncService] Ownership mismatch for exam ${update.examId}: ` +
                `createdBy="${serverData.createdBy}", instructorId="${serverData.instructorId}", ` +
                `currentUser="${currentUser.uid}"`,
            );
            throw Object.assign(new Error("Permission denied: not the owner"), {
              code: "permission-denied",
            });
          }

          const serverVersion = serverData.version || 1;
          const localVersion = update.data.version || serverVersion;

          if (serverVersion > localVersion) {
            return {
              examId: update.examId,
              localVersion,
              serverVersion,
              localData: update.data,
              serverData,
            };
          }
        }

        await updateDoc(targetRef, {
          ...update.data,
          createdBy: currentUser.uid,
          updatedAt: serverTimestamp(),
          version: update.data.version || 1,
        });
        return null;
      }

      if (update.action === "update-answer-key") {
        const { collection, query, where, getDocs } =
          await import("firebase/firestore");
        const q = query(
          collection(db, "answerKeys"),
          where("examId", "==", update.examId),
        );
        const snap = await getDocs(q);

        let akRef;
        let version = 1;

        if (!snap.empty) {
          akRef = doc(db, "answerKeys", snap.docs[0].id);
          version = (snap.docs[0].data().version || 1) + 1;
        } else {
          akRef = doc(collection(db, "answerKeys"));
        }

        const answers = update.data.answers;
        await setDoc(
          akRef,
          {
            examId: update.examId,
            answers,
            version,
            updatedAt: serverTimestamp(),
            createdBy: currentUser.uid,
            locked: false,
            questionSettings: answers.map((a: string, i: number) => ({
              questionNumber: i + 1,
              correctAnswer: a,
              points: 1,
            })),
          },
          { merge: true },
        );
        return null;
      }

      if (update.action === "delete") {
        await deleteDoc(targetRef);
        return null;
      }

      if (update.action === "audit_log") {
        const { addDoc, collection, serverTimestamp } =
          await import("firebase/firestore");
        await addDoc(collection(db, "audit_logs"), {
          ...update.data,
          timestamp: serverTimestamp(), // Use server time for synced logs
        });
        return null;
      }

      return null;
    } catch (error) {
      console.error(`Error syncing update for exam ${update.examId}:`, error);
      throw error;
    }
  }

  /**
   * Resolve a conflict
   */
  static async resolveConflict(
    conflict: ConflictInfo,
    resolution: ConflictResolution,
  ): Promise<void> {
    const examRef = doc(db, "exams", conflict.examId);

    try {
      if (resolution === "use-local") {
        await updateDoc(examRef, {
          ...conflict.localData,
          updatedAt: serverTimestamp(),
          version: conflict.serverVersion + 1,
        });
      } else if (resolution === "use-server") {
        // Update local storage with server data
        const downloadedExam = await OfflineStorageService.getDownloadedExam(
          conflict.examId,
        );
        if (downloadedExam) {
          await OfflineStorageService.downloadExam({
            ...conflict.serverData,
            id: conflict.examId,
          });
        }
      } else if (resolution === "merge") {
        // Simple merge strategy: combine both
        const merged = {
          ...conflict.serverData,
          ...conflict.localData,
          version: conflict.serverVersion + 1,
        };

        await updateDoc(examRef, {
          ...merged,
          updatedAt: serverTimestamp(),
        });
      }

      console.log(
        `Conflict resolved for exam ${conflict.examId} using ${resolution}`,
      );
    } catch (error) {
      console.error("Error resolving conflict:", error);
      throw error;
    }
  }

  /**
   * Add sync listener
   */
  static addSyncListener(listener: (result: SyncResult) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify all sync listeners
   */
  private static notifyListeners(result: SyncResult): void {
    this.syncListeners.forEach((listener) => listener(result));
  }

  /**
   * Check if sync is in progress
   */
  static isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Force sync now
   */
  static async forceSyncNow(): Promise<SyncResult> {
    console.log("🔄 Force sync triggered");
    return this.syncPendingUpdates();
  }
}
