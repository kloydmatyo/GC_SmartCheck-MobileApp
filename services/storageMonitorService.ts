import { Alert } from "react-native";
import { RealmService, QuizCache, OfflineQuiz, OfflinePendingUpdate } from "./realmService";

export interface StorageInfo {
  totalSize: number; // in bytes
  usedSize: number; // in bytes
  availableSize: number; // in bytes
  usagePercentage: number;
  itemCount: number;
  largestItems: Array<{ key: string; size: number }>;
}

export interface StorageLimit {
  warningThreshold: number; // percentage (e.g., 80)
  criticalThreshold: number; // percentage (e.g., 95)
  maxSize: number; // in bytes (60MB for Realm)
}

export class StorageMonitorService {
  // Storage limits (Realm can handle much more than AsyncStorage)
  private static readonly LIMITS: StorageLimit = {
    warningThreshold: 80,
    criticalThreshold: 95,
    maxSize: 60 * 1024 * 1024, // 60MB
  };

  private static listeners: Array<(info: StorageInfo) => void> = [];

  static async getStorageInfo(): Promise<StorageInfo> {
    try {
      const cacheRealm = await RealmService.getCacheRealm();
      const stagingRealm = await RealmService.getStagingRealm();
      
      const cachedExams = cacheRealm.objects("QuizCache");
      const offlineExams = stagingRealm.objects("OfflineQuiz");
      const pendingUpdates = stagingRealm.objects("OfflinePendingUpdate");
      const cachedStudents = cacheRealm.objects("StudentCache");

      // Estimate sizes based on document count
      const usedSize = 
        (cachedExams.length * 2500) + 
        (offlineExams.length * 3000) + 
        (pendingUpdates.length * 1500) +
        (cachedStudents.length * 200);

      const usagePercentage = (usedSize / this.LIMITS.maxSize) * 100;
      const itemCount = cachedExams.length + offlineExams.length + pendingUpdates.length + cachedStudents.length;

      return {
        totalSize: this.LIMITS.maxSize,
        usedSize: usedSize,
        availableSize: this.LIMITS.maxSize - usedSize,
        usagePercentage,
        itemCount,
        largestItems: [
          { key: "Cached Exams", size: cachedExams.length * 2500 },
          { key: "Offline Exams", size: offlineExams.length * 3000 },
          { key: "Pending Updates", size: pendingUpdates.length * 1500 },
          { key: "Cached Students", size: cachedStudents.length * 200 },
        ].sort((a, b) => b.size - a.size),
      };
    } catch (error) {
      console.error("Error getting storage info:", error);
      throw error;
    }
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  static async checkStorageAndWarn(): Promise<void> {
    try {
      const info = await this.getStorageInfo();

      if (info.usagePercentage >= this.LIMITS.criticalThreshold) {
        Alert.alert(
          "Storage Critical",
          `Storage is ${info.usagePercentage.toFixed(1)}% full (${this.formatBytes(info.usedSize)} / ${this.formatBytes(info.totalSize)}). Please clear some offline data.`,
          [
            { text: "OK" },
            {
              text: "Clear Old Data",
              onPress: () => this.clearOldData(),
            },
          ],
        );
      } else if (info.usagePercentage >= this.LIMITS.warningThreshold) {
        Alert.alert(
          "Storage Warning",
          `Storage is ${info.usagePercentage.toFixed(1)}% full (${this.formatBytes(info.usedSize)} / ${this.formatBytes(info.totalSize)}). Consider clearing some offline data.`,
          [{ text: "OK" }],
        );
      }

      this.notifyListeners(info);
    } catch (error) {
      console.error("Error checking storage:", error);
    }
  }

  static async clearOldData(): Promise<void> {
    try {
      const cacheRealm = await RealmService.getCacheRealm();
      
      let cleared = 0;
      cacheRealm.write(() => {
        const exams = cacheRealm.objects("QuizCache").sorted("updatedAt", false);
        const toRemove = Math.ceil(exams.length * 0.25);
        
        for(let i=0; i<toRemove; i++) {
            if(exams[i]) {
                cacheRealm.delete(exams[i]);
                cleared++;
            }
        }
      });

      if (cleared > 0) {
        Alert.alert(
            "Data Cleared",
            `Removed ${cleared} oldest downloaded exam(s) to free up space.`,
        );
      } else {
        Alert.alert("Notice", "No old exams to clear.");
      }
    } catch (error) {
      console.error("Error clearing old data:", error);
      Alert.alert("Error", "Failed to clear old data");
    }
  }

  static async getStorageByCategory(): Promise<{
    downloadedExams: number;
    pendingUpdates: number;
    other: number;
  }> {
    try {
      const cacheRealm = await RealmService.getCacheRealm();
      const stagingRealm = await RealmService.getStagingRealm();
      
      const examsSize = (cacheRealm.objects("QuizCache").length * 2500) + (stagingRealm.objects("OfflineQuiz").length * 3000);
      const updatesSize = stagingRealm.objects("OfflinePendingUpdate").length * 1500;
      
      const info = await this.getStorageInfo();
      const otherSize = info.usedSize - examsSize - updatesSize;

      return {
        downloadedExams: examsSize,
        pendingUpdates: updatesSize,
        other: Math.max(0, otherSize),
      };
    } catch (error) {
      console.error("Error getting storage by category:", error);
      return {
        downloadedExams: 0,
        pendingUpdates: 0,
        other: 0,
      };
    }
  }

  static addListener(listener: (info: StorageInfo) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyListeners(info: StorageInfo): void {
    this.listeners.forEach((listener) => listener(info));
  }

  static startMonitoring(intervalMs: number = 60000): () => void {
    const interval = setInterval(() => {
      this.checkStorageAndWarn();
    }, intervalMs);

    this.checkStorageAndWarn();

    return () => clearInterval(interval);
  }

  static async testStorageLimits(): Promise<{
    canWrite: boolean;
    maxItemSize: number;
    estimatedLimit: number;
  }> {
    try {
      console.log("🧪 Testing storage limits...");
      // For Realm, we just return the theoretical limits since actually filling it up is very slow
      return {
        canWrite: true,
        maxItemSize: 2 * 1024 * 1024, // 2MB arbitrary
        estimatedLimit: this.LIMITS.maxSize,
      };
    } catch (error) {
      console.error("Error testing storage limits:", error);
      throw error;
    }
  }
}
