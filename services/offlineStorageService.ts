import {
  OfflinePendingUpdate,
  QuizCache,
  RealmService,
  SystemKV,
} from "./realmService";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Storage keys
const STORAGE_KEYS = {
  DOWNLOADED_EXAMS: "@downloaded_exams",
  PENDING_UPDATES: "@pending_updates",
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
  action: "create" | "update" | "delete" | "update-answer-key" | "audit_log";
  collection?: "exams" | "classes";
  data: any;
  timestamp: Date;
  retryCount: number;
}

export class OfflineStorageService {
  /**
   * Download exam for offline access
   */
  static async downloadExam(exam: any): Promise<void> {
    try {
      const downloadedExams = await this.getDownloadedExams();

      const downloadedExam: DownloadedExam = {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        questions: exam.questions || [],
        answerKey: exam.answerKey || null,
        createdBy: exam.createdBy,
        createdAt: exam.createdAt,
        updatedAt: exam.updatedAt,
        version: exam.version || 1,
        downloadedAt: new Date(),
        lastSyncedAt: new Date(),
      };

      // Check if already downloaded
      const existingIndex = downloadedExams.findIndex((e) => e.id === exam.id);

      if (existingIndex >= 0) {
        downloadedExams[existingIndex] = downloadedExam;
      } else {
        downloadedExams.push(downloadedExam);
      }

      await AsyncStorage.setItem(
        STORAGE_KEYS.DOWNLOADED_EXAMS,
        JSON.stringify(downloadedExams),
      );

      console.log("✅ Exam downloaded for offline access:", exam.id);
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
      const exams = await this.getDownloadedExams();
      return exams.find((e) => e.id === examId) || null;
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
      const exam = await this.getDownloadedExam(examId);
      return exam !== null;
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
      console.log("Downloaded exam mapped to Realm Cache:", examId);
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
    action: "create" | "update" | "delete",
    data: any,
    collection: "exams" | "classes" = "exams",
  ): Promise<void> {
    try {
      const realm = await RealmService.getStagingRealm();
      realm.write(() => {
        realm.create("OfflinePendingUpdate", {
          updateId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          examId,
          action,
          data: JSON.stringify(data),
          timestamp: new Date(),
          retryCount: 0,
          collection,
        });
      });
      console.log("Update queued for sync in Realm");
    } catch (error) {
      console.error("Error queuing update:", error);
      throw error;
    }
  }


  /**
   * Increment retry count for a pending update
   */
  static async incrementRetryCount(updateId: string): Promise<void> {
    try {
      const realm = await RealmService.getStagingRealm();
      const updates = realm.objects<OfflinePendingUpdate>("OfflinePendingUpdate");
      const target = updates.filtered("updateId == bash", updateId)[0];

      if (target) {
        realm.write(() => {
          target.retryCount = (target.retryCount || 0) + 1;
        });
      }
    } catch (error) {
      console.error("Error incrementing retry count:", error);
    }
  }
  /**
   * Get all pending updates
   */
  static async getPendingUpdates(): Promise<PendingUpdate[]> {
    try {
      const realm = await RealmService.getStagingRealm();
      const updates = realm.objects<OfflinePendingUpdate>(
        "OfflinePendingUpdate",
      );

      return Array.from(updates).map((u) => ({
        id: u.updateId,
        examId: u.examId,
        action: u.action as any,
        data: JSON.parse(u.data),
        timestamp: u.timestamp,
        retryCount: u.retryCount,
        collection: u.collection as any,
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
      const updates = realm.objects<OfflinePendingUpdate>(
        "OfflinePendingUpdate",
      );
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
      const updates = realm.objects<OfflinePendingUpdate>(
        "OfflinePendingUpdate",
      );

      realm.write(() => {
        realm.delete(updates);
      });
      console.log("Pending updates cleared");
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
      const existing = realm.objectForPrimaryKey<SystemKV>(
        "SystemKV",
        STORAGE_KEYS.LAST_SYNC,
      );

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
      const entry = realm.objectForPrimaryKey<SystemKV>(
        "SystemKV",
        STORAGE_KEYS.LAST_SYNC,
      );
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
      console.log("All offline data cleared via Realm");
    } catch (error) {
      console.error("Error clearing offline data:", error);
      throw error;
    }
  }
  /**
   * Emergency clear all app data
   */
  static async emergencyClear(): Promise<void> {
    try {
      await RealmService.clearAll();
      const AsyncStorage = (
        await import("@react-native-async-storage/async-storage")
      ).default;
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(keys);
      console.log("Emergency clear complete");
    } catch (error) {
      console.error("Error in emergency clear:", error);
      throw error;
    }
  }
}
