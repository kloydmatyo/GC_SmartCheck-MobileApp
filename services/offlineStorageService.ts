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
  action: "create" | "update" | "delete";
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
      const data = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_EXAMS);
      if (!data) return [];

      const exams = JSON.parse(data);

      // Convert date strings back to Date objects
      return exams.map((exam: any) => ({
        ...exam,
        createdAt: new Date(exam.createdAt),
        updatedAt: new Date(exam.updatedAt),
        downloadedAt: new Date(exam.downloadedAt),
        lastSyncedAt: new Date(exam.lastSyncedAt),
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
      const exams = await this.getDownloadedExams();
      const filtered = exams.filter((e) => e.id !== examId);

      await AsyncStorage.setItem(
        STORAGE_KEYS.DOWNLOADED_EXAMS,
        JSON.stringify(filtered),
      );

      console.log("✅ Downloaded exam deleted:", examId);
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
  ): Promise<void> {
    try {
      const pendingUpdates = await this.getPendingUpdates();

      const update: PendingUpdate = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        examId,
        action,
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
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_UPDATES);
      if (!data) return [];

      const updates = JSON.parse(data);

      // Convert date strings back to Date objects
      return updates.map((update: any) => ({
        ...update,
        timestamp: new Date(update.timestamp),
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
      const updates = await this.getPendingUpdates();
      const filtered = updates.filter((u) => u.id !== updateId);

      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_UPDATES,
        JSON.stringify(filtered),
      );
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
      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_UPDATES,
        JSON.stringify([]),
      );
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
      await AsyncStorage.setItem(
        STORAGE_KEYS.LAST_SYNC,
        new Date().toISOString(),
      );
    } catch (error) {
      console.error("Error updating last sync:", error);
    }
  }

  /**
   * Get last sync timestamp
   */
  static async getLastSync(): Promise<Date | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      return data ? new Date(data) : null;
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
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.DOWNLOADED_EXAMS,
        STORAGE_KEYS.PENDING_UPDATES,
        STORAGE_KEYS.LAST_SYNC,
      ]);
      console.log("✅ All offline data cleared");
    } catch (error) {
      console.error("Error clearing offline data:", error);
      throw error;
    }
  }
}
