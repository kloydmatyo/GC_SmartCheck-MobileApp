import { RealmService, QuizCache, OfflinePendingUpdate, SystemKV } from "./realmService";

// Storage keys for SystemKV
const STORAGE_KEYS = {
  LAST_SYNC: "@last_sync",
  OFFLINE_MODE: "@offline_mode",
};

export interface DownloadedExam {
  id: string;
  title: string;
  description: string;
  questions: any[];
  answerKey: any;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  downloadedAt: Date;
  lastSyncedAt: Date;
}

export interface PendingUpdate {
  id: string;
  examId: string;
  action: "create" | "update" | "delete";
  collection?: "exams" | "classes";
  data: any;
  timestamp: Date;
  retryCount: number;
}

export class OfflineStorageService {
  /**
   * Download exam for offline access
   * Migrated to RealmDB: We now rely on the QuizCache populated by SyncService.
   */
  static async downloadExam(exam: any): Promise<void> {
    try {
      // Exams are automatically cached in Realm via examService / syncService.
      // This is left as a no-op to maintain the interface without duplicating data.
      console.log("✅ Exam download mapped to Realm Cache:", exam.id);
    } catch (error) {
      console.error("Error downloading exam:", error);
      throw error;
    }
  }

  /**
   * Get all downloaded exams
   */
  static async getDownloadedExams(): Promise<DownloadedExam[]> {
    try {
      const realm = await RealmService.getCacheRealm();
      const cached = realm.objects<QuizCache>("QuizCache");
      
      return Array.from(cached).map((q) => ({
        id: q.id,
        title: q.title,
        description: q.subject || q.className || "",
        questions: [],
        answerKey: q.answerKey ? JSON.parse(q.answerKey) : null,
        createdBy: q.createdBy,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        version: q.version || 1,
        downloadedAt: q.createdAt,
        lastSyncedAt: q.updatedAt,
      }));
    } catch (error) {
      console.error("Error getting downloaded exams:", error);
      return [];
    }
  }

  /**
   * Get a specific downloaded exam
   */
  static async getDownloadedExam(
    examId: string,
  ): Promise<DownloadedExam | null> {
    try {
      const realm = await RealmService.getCacheRealm();
      const q = realm.objectForPrimaryKey<QuizCache>("QuizCache", examId);
      if (!q) return null;

      return {
        id: q.id,
        title: q.title,
        description: q.subject || q.className || "",
        questions: [],
        answerKey: q.answerKey ? JSON.parse(q.answerKey) : null,
        createdBy: q.createdBy,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        version: q.version || 1,
        downloadedAt: q.createdAt,
        lastSyncedAt: q.updatedAt,
      };
    } catch (error) {
      console.error("Error getting downloaded exam:", error);
      return null;
    }
  }

  /**
   * Check if exam is downloaded
   */
  static async isExamDownloaded(examId: string): Promise<boolean> {
    try {
      const realm = await RealmService.getCacheRealm();
      return !!realm.objectForPrimaryKey<QuizCache>("QuizCache", examId);
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete downloaded exam
   */
  static async deleteDownloadedExam(examId: string): Promise<void> {
    try {
      // Deleting from cache is handled by sync updates.
      console.log("✅ Downloaded exam mapped to Realm Cache:", examId);
    } catch (error) {
      console.error("Error deleting downloaded exam:", error);
      throw error;
    }
  }

  /**
   * Queue an update for later sync
   */
  static async queueUpdate(
    examId: string,
    action: "create" | "update" | "delete" | "audit_log" | "update-answer-key",
    data: any,
    collection: "exams" | "classes" = "exams",
  ): Promise<void> {
    try {
      const pendingUpdates = await this.getPendingUpdates();

      const update: PendingUpdate = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        examId,
        action,
        collection,
        data,
        timestamp: new Date(),
        retryCount: 0,
      };

      pendingUpdates.push(update);

      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_UPDATES,
        JSON.stringify(pendingUpdates),
      );

      console.log("✅ Update queued for sync:", update.id);
    } catch (error) {
      console.error("Error queuing update:", error);
      throw error;
    }
  }

  /**
   * Get all pending updates
   */
  static async getPendingUpdates(): Promise<PendingUpdate[]> {
    try {
      const realm = await RealmService.getStagingRealm();
      const updates = realm.objects<OfflinePendingUpdate>("OfflinePendingUpdate");
      
      return Array.from(updates).map((u) => ({
        id: u.updateId,
        examId: u.examId,
        action: u.action as any,
        data: JSON.parse(u.data),
        timestamp: u.timestamp,
        retryCount: u.retryCount,
      }));
    } catch (error) {
      console.error("Error getting pending updates:", error);
      return [];
    }
  }

  /**
   * Remove a pending update
   */
  static async removePendingUpdate(updateId: string): Promise<void> {
    try {
      const realm = await RealmService.getStagingRealm();
      const updates = realm.objects<OfflinePendingUpdate>("OfflinePendingUpdate");
      const target = updates.filtered("updateId == $0", updateId)[0];
      
      if (target) {
        realm.write(() => {
          realm.delete(target);
        });
      }
    } catch (error) {
      console.error("Error removing pending update:", error);
      throw error;
    }
  }

  /**
   * Clear all pending updates
   */
  static async clearPendingUpdates(): Promise<void> {
    try {
      const realm = await RealmService.getStagingRealm();
      const updates = realm.objects<OfflinePendingUpdate>("OfflinePendingUpdate");
      
      realm.write(() => {
        realm.delete(updates);
      });
      console.log("✅ Pending updates cleared");
    } catch (error) {
      console.error("Error clearing pending updates:", error);
      throw error;
    }
  }

  /**
   * Update last sync timestamp
   */
  static async updateLastSync(): Promise<void> {
    try {
      const realm = await RealmService.getStagingRealm();
      const existing = realm.objectForPrimaryKey<SystemKV>("SystemKV", STORAGE_KEYS.LAST_SYNC);
      
      realm.write(() => {
        if (existing) {
          existing.value = new Date().toISOString();
        } else {
          realm.create("SystemKV", {
            key: STORAGE_KEYS.LAST_SYNC,
            value: new Date().toISOString(),
          });
        }
      });
    } catch (error) {
      console.error("Error updating last sync:", error);
    }
  }

  /**
   * Get last sync timestamp
   */
  static async getLastSync(): Promise<Date | null> {
    try {
      const realm = await RealmService.getStagingRealm();
      const entry = realm.objectForPrimaryKey<SystemKV>("SystemKV", STORAGE_KEYS.LAST_SYNC);
      return entry ? new Date(entry.value) : null;
    } catch (error) {
      console.error("Error getting last sync:", error);
      return null;
    }
  }

  /**
   * Get storage statistics
   */
  static async getStorageStats(): Promise<{
    downloadedExamsCount: number;
    pendingUpdatesCount: number;
    lastSync: Date | null;
  }> {
    try {
      const exams = await this.getDownloadedExams();
      const updates = await this.getPendingUpdates();
      const lastSync = await this.getLastSync();

      return {
        downloadedExamsCount: exams.length,
        pendingUpdatesCount: updates.length,
        lastSync,
      };
    } catch (error) {
      console.error("Error getting storage stats:", error);
      return {
        downloadedExamsCount: 0,
        pendingUpdatesCount: 0,
        lastSync: null,
      };
    }
  }

  /**
   * Clear all offline data
   */
  static async clearAllData(): Promise<void> {
    try {
      // Clearing Cache and Staging is fully handled by RealmService.clearAll()
      // We just call that to ensure full cleanup.
      await RealmService.clearAll();
      console.log("✅ All offline data cleared via Realm");
    } catch (error) {
      console.error("Error clearing offline data:", error);
      throw error;
    }
  }
}
