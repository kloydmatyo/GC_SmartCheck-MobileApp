import { auth, db } from "@/config/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs, query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { NetworkService } from "./networkService";
import { OfflineStorageService, PendingUpdate } from "./offlineStorageService";
import { OfflineClass, OfflineQuiz, RealmService } from "./realmService";

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
  private static syncListeners: Array<(result: SyncResult) => void> = [];

  /**
   * Initialize sync service
   */
  static initialize(): void {
    // Listen for network changes
    NetworkService.addListener((isConnected) => {
      if (isConnected) {
        console.log("📡 Network restored, triggering auto-sync...");
        this.syncPendingUpdates();
      }
    });
  }

  /**
   * Sync all pending updates
   */
  static async syncPendingUpdates(): Promise<SyncResult> {
    if (this.isSyncing) {
      console.log("⏳ Sync already in progress");
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        conflicts: [],
      };
    }

    const isOnline = await NetworkService.isOnline();
    if (!isOnline) {
      console.log("📡 Device is offline, skipping sync");
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
      try { await this.syncStagingGrades(); syncedCount++; } catch (e) { console.error("Flush Grades Error", e); failedCount++; }

      // 2. Flush Classes from Staging
      try { await this.syncStagingClasses(); syncedCount++; } catch (e) { console.error("Flush Classes Error", e); failedCount++; }

      // 3. Flush Exams from Staging
      try { await this.syncStagingExams(); syncedCount++; } catch (e) { console.error("Flush Exams Error", e); failedCount++; }

      // 4. Update the Cache Realm from Firestore
      try { await this.syncFirestoreToCache(); syncedCount++; } catch (e) { console.error("Refresh Cache Error", e); failedCount++; }

      const result: SyncResult = {
        success: failedCount === 0,
        syncedCount,
        failedCount,
        conflicts: [],
      };

      console.log(`✅ Full sync complete. Synced: ${syncedCount}, Failed: ${failedCount}`);
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
    const classesQuery = query(collection(db, "classes"), where("createdBy", "==", currentUser.uid));
    const classesSnap = await getDocs(classesQuery);

    // Sync Exams + their latest answer keys
    const examsQuery = query(collection(db, "exams"), where("createdBy", "==", currentUser.uid));
    const examsSnap = await getDocs(examsQuery);
    const examsWithAK: any[] = [];

    for (const examDoc of examsSnap.docs) {
      const akQuery = query(collection(db, "answerKeys"), where("examId", "==", examDoc.id));
      const akSnap = await getDocs(akQuery);
      let answerKeyJson = "";
      if (!akSnap.empty) {
        const latestAk = akSnap.docs.sort((a, b) => (b.data().version || 0) - (a.data().version || 0))[0];
        answerKeyJson = JSON.stringify(latestAk.data());
      }
      examsWithAK.push({ id: examDoc.id, data: examDoc.data(), answerKey: answerKeyJson });
    }

    // Sync Grades (limit to 100 recent?)
    const gradesQuery = query(collection(db, "scannedResults"), where("scannedBy", "==", currentUser.uid));
    const gradesSnap = await getDocs(gradesQuery);

    realm.write(() => {
      // Clear existing cache for these types
      realm.delete(realm.objects("ClassCache"));
      realm.delete(realm.objects("QuizCache"));
      realm.delete(realm.objects("GradeCache"));

      // Insert fresh classes
      classesSnap.docs.forEach(doc => {
        const data = doc.data();
        realm.create("ClassCache", {
          id: doc.id,
          class_name: data.class_name,
          course_subject: data.course_subject,
          room: data.room,
          section_block: data.section_block,
          students: JSON.stringify(data.students || []),
          createdBy: data.createdBy,
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      });

      // Insert fresh exams
      examsWithAK.forEach(item => {
        realm.create("QuizCache", {
          id: item.id,
          title: item.data.title,
          subject: item.data.subject || item.data.className || "",
          status: item.data.status || "Draft",
          papersCount: item.data.scanned_papers || 0,
          questionCount: item.data.num_items || 0,
          answerKey: item.answerKey,
          createdBy: item.data.createdBy,
          createdAt: item.data.createdAt?.toDate() || new Date(),
          updatedAt: item.data.updatedAt?.toDate() || new Date(),
          instructorId: item.data.instructorId || "",
          examCode: item.data.examCode || item.data.room || "",
          choicesPerItem: item.data.choices_per_item || 4,
        });
      });

      // Insert fresh grades
      gradesSnap.docs.forEach(doc => {
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
          createdAt: data.createdAt?.toDate() || new Date(),
        });
      });
    });

    console.log("✅ Primary Cache Realm updated from Firestore");
  }

  private static async syncStagingGrades(): Promise<void> {
    // This is handled by GradeStorageService.syncOfflineQueue()
    // We can call it here for centralization
    console.log("🔄 Syncing staging grades...");
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

        await setDoc(doc(collection(db, "classes")), classData);

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
          num_items: sQuiz.questionCount,
          status: sQuiz.status,
          createdBy: sQuiz.createdBy,
          createdAt: Timestamp.fromDate(sQuiz.createdAt),
          updatedAt: Timestamp.now(),
          instructorId: sQuiz.instructorId || "",
          examCode: sQuiz.examCode || "",
        };

        const examRef = doc(collection(db, "exams"));
        await setDoc(examRef, quizData);

        // Also sync answer key if it exists
        if (sQuiz.answerKey) {
          const akData = JSON.parse(sQuiz.answerKey);
          await setDoc(doc(db, "answerKeys", `ak_${examRef.id}_${Date.now()}`), {
            examId: examRef.id,
            ...akData,
            createdAt: Timestamp.now(),
          });
        }

        realm.write(() => {
          realm.delete(sQuiz);
        });
      } catch (err) {
        console.error("Failed to sync staging quiz:", err);
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

    const examRef = doc(db, "exams", update.examId);

    try {
      if (update.action === "create") {
        await setDoc(examRef, {
          ...update.data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return null;
      }

      if (update.action === "update") {
        // Check for conflicts
        const serverDoc = await getDoc(examRef);

        if (serverDoc.exists()) {
          const serverData = serverDoc.data();
          const serverVersion = serverData.version || 1;
          const localVersion = update.data.version || 1;

          // Conflict detected
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

        await updateDoc(examRef, {
          ...update.data,
          updatedAt: serverTimestamp(),
          version: (update.data.version || 1) + 1,
        });
        return null;
      }

      if (update.action === "delete") {
        await deleteDoc(examRef);
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
        `✅ Conflict resolved for exam ${conflict.examId} using ${resolution}`,
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
