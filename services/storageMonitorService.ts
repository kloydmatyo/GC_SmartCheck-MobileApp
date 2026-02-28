import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

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
  maxSize: number; // in bytes (6MB for Android, 10MB for iOS)
}

export class StorageMonitorService {
  // Storage limits (conservative estimates)
  private static readonly LIMITS: StorageLimit = {
    warningThreshold: 80,
    criticalThreshold: 95,
    maxSize: 6 * 1024 * 1024, // 6MB (Android limit)
  };

  private static listeners: Array<(info: StorageInfo) => void> = [];

  /**
   * Get current storage information
   */
  static async getStorageInfo(): Promise<StorageInfo> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const items = await AsyncStorage.multiGet(keys);

      let totalSize = 0;
      const itemSizes: Array<{ key: string; size: number }> = [];

      items.forEach(([key, value]) => {
        const size = this.getStringSize(value || "");
        totalSize += size;
        itemSizes.push({ key, size });
      });

      // Sort by size descending
      itemSizes.sort((a, b) => b.size - a.size);

      const usagePercentage = (totalSize / this.LIMITS.maxSize) * 100;

      return {
        totalSize: this.LIMITS.maxSize,
        usedSize: totalSize,
        availableSize: this.LIMITS.maxSize - totalSize,
        usagePercentage,
        itemCount: keys.length,
        largestItems: itemSizes.slice(0, 10), // Top 10 largest items
      };
    } catch (error) {
      console.error("Error getting storage info:", error);
      throw error;
    }
  }

  /**
   * Get string size in bytes
   */
  private static getStringSize(str: string): number {
    // UTF-8 encoding: 1-4 bytes per character
    let size = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code <= 0x7f) {
        size += 1;
      } else if (code <= 0x7ff) {
        size += 2;
      } else if (code <= 0xffff) {
        size += 3;
      } else {
        size += 4;
      }
    }
    return size;
  }

  /**
   * Format bytes to human readable
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Check storage and show warnings if needed
   */
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

      // Notify listeners
      this.notifyListeners(info);
    } catch (error) {
      console.error("Error checking storage:", error);
    }
  }

  /**
   * Clear old data (oldest first)
   */
  static async clearOldData(): Promise<void> {
    try {
      // Get all downloaded exams
      const examsData = await AsyncStorage.getItem("@downloaded_exams");
      if (!examsData) return;

      const exams = JSON.parse(examsData);

      // Sort by download date (oldest first)
      exams.sort((a: any, b: any) => {
        const dateA = new Date(a.downloadedAt).getTime();
        const dateB = new Date(b.downloadedAt).getTime();
        return dateA - dateB;
      });

      // Remove oldest 25%
      const toRemove = Math.ceil(exams.length * 0.25);
      const remaining = exams.slice(toRemove);

      await AsyncStorage.setItem(
        "@downloaded_exams",
        JSON.stringify(remaining),
      );

      Alert.alert(
        "Data Cleared",
        `Removed ${toRemove} oldest downloaded exam(s) to free up space.`,
      );

      console.log(`✅ Cleared ${toRemove} old exams`);
    } catch (error) {
      console.error("Error clearing old data:", error);
      Alert.alert("Error", "Failed to clear old data");
    }
  }

  /**
   * Get storage usage by category
   */
  static async getStorageByCategory(): Promise<{
    downloadedExams: number;
    pendingUpdates: number;
    other: number;
  }> {
    try {
      const examsData = await AsyncStorage.getItem("@downloaded_exams");
      const updatesData = await AsyncStorage.getItem("@pending_updates");

      const examsSize = this.getStringSize(examsData || "");
      const updatesSize = this.getStringSize(updatesData || "");

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

  /**
   * Add storage listener
   */
  static addListener(listener: (info: StorageInfo) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify all listeners
   */
  private static notifyListeners(info: StorageInfo): void {
    this.listeners.forEach((listener) => listener(info));
  }

  /**
   * Monitor storage periodically
   */
  static startMonitoring(intervalMs: number = 60000): () => void {
    const interval = setInterval(() => {
      this.checkStorageAndWarn();
    }, intervalMs);

    // Initial check
    this.checkStorageAndWarn();

    return () => clearInterval(interval);
  }

  /**
   * Test storage limits
   */
  static async testStorageLimits(): Promise<{
    canWrite: boolean;
    maxItemSize: number;
    estimatedLimit: number;
  }> {
    try {
      console.log("🧪 Testing storage limits...");

      // Test writing increasingly large items
      const testKey = "@storage_test";
      let maxSize = 0;
      let canWrite = true;

      // Test with 1KB increments up to 10MB
      for (let size = 1024; size <= 10 * 1024 * 1024; size += 1024) {
        const testData = "x".repeat(size);

        try {
          await AsyncStorage.setItem(testKey, testData);
          maxSize = size;
        } catch (error) {
          canWrite = false;
          break;
        }
      }

      // Clean up
      await AsyncStorage.removeItem(testKey);

      const info = await this.getStorageInfo();

      console.log(`✅ Storage test complete:`);
      console.log(`   Max item size: ${this.formatBytes(maxSize)}`);
      console.log(`   Current usage: ${this.formatBytes(info.usedSize)}`);
      console.log(
        `   Estimated limit: ${this.formatBytes(this.LIMITS.maxSize)}`,
      );

      return {
        canWrite,
        maxItemSize: maxSize,
        estimatedLimit: this.LIMITS.maxSize,
      };
    } catch (error) {
      console.error("Error testing storage limits:", error);
      throw error;
    }
  }
}
