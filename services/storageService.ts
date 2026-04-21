import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { GradingResult } from "../types/scanning";
import { RealmService, ScanHistory } from "./realmService";

const STORAGE_KEY = "@scans_history";
const MIGRATION_KEY = "@scans_history_migrated_to_realm";

export class StorageService {
  /**
   * Helper to ensure data is migrated from AsyncStorage to Realm
   */
  private static async ensureMigrated(): Promise<void> {
    try {
      const migrated = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrated === "true") return;

      console.log("[StorageService] Migrating history from AsyncStorage to Realm...");
      const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
      if (historyStr) {
        const history: GradingResult[] = JSON.parse(historyStr);
        const realm = await RealmService.getStagingRealm();
        
        realm.write(() => {
          for (const item of history) {
            realm.create("ScanHistory", {
              timestamp: item.metadata?.timestamp || Date.now(),
              data: JSON.stringify(item),
              studentId: item.studentId || "unknown",
              examId: item.examId || "unknown",
            });
          }
        });
      }

      await AsyncStorage.setItem(MIGRATION_KEY, "true");
      console.log("[StorageService] Migration complete.");
    } catch (err) {
      console.error("[StorageService] Migration failed:", err);
    }
  }

  /**
   * Save a grading result to local storage and move the image to the app's document directory
   */
  static async saveScanResult(
    result: GradingResult,
    imageUri: string,
  ): Promise<GradingResult> {
    try {
      // 1. Move image to permanent storage so it persists
      const filename = `scan_${Date.now()}.jpg`;
      // @ts-ignore
      const newPath = `${FileSystem.documentDirectory}${filename}`;

      if (imageUri.startsWith("data:")) {
        const base64Data = imageUri.split(",")[1];
        await FileSystem.writeAsStringAsync(newPath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        await FileSystem.copyAsync({
          from: imageUri,
          to: newPath,
        });
      }

      // 2. Attach metadata
      const deviceId =
        Constants.installationId || Constants.deviceId || "unknown_device";
      const scanWithMeta: GradingResult = {
        ...result,
        metadata: {
          ...result.metadata,
          timestamp: Date.now(),
          deviceId,
          imageUri: newPath,
        },
      };

      // 3. Save to Realm
      const realm = await RealmService.getStagingRealm();
      realm.write(() => {
        realm.create("ScanHistory", {
          timestamp: scanWithMeta.metadata?.timestamp || Date.now(),
          data: JSON.stringify(scanWithMeta),
          studentId: scanWithMeta.studentId || "unknown",
          examId: scanWithMeta.examId || "unknown",
        });
      });

      // 4. Limit history to 100 items (Realm is efficient, but we want to keep it tidy)
      await this.trimHistory(100);

      return scanWithMeta;
    } catch (error) {
      console.error("Failed to save scan result:", error);
      throw error;
    }
  }

  /**
   * Update the student ID of a specific scan in history
   */
  static async updateStudentId(
    timestamp: number,
    newStudentId: string,
  ): Promise<void> {
    try {
      await this.ensureMigrated();
      const realm = await RealmService.getStagingRealm();
      const records = realm.objects<ScanHistory>("ScanHistory").filtered("timestamp == $0", timestamp);

      if (records.length > 0) {
        realm.write(() => {
          for (const record of records) {
            const data = JSON.parse(record.data);
            data.studentId = newStudentId;
            record.data = JSON.stringify(data);
            record.studentId = newStudentId;
          }
        });
        console.log(`[StorageService] Updated student ID to ${newStudentId} in Realm`);
      }
    } catch (error) {
      console.error("Failed to update student ID in history:", error);
      throw error;
    }
  }

  /**
   * Get all scan history
   */
  static async getHistory(): Promise<GradingResult[]> {
    try {
      await this.ensureMigrated();
      const realm = await RealmService.getStagingRealm();
      const history = realm.objects<ScanHistory>("ScanHistory").sorted("timestamp", true);

      return Array.from(history).map(record => JSON.parse(record.data));
    } catch (error) {
      console.error("Failed to load history:", error);
      return [];
    }
  }

  /**
   * Get recent scans (limited count)
   */
  static async getRecentScans(limit: number = 50): Promise<GradingResult[]> {
    try {
      await this.ensureMigrated();
      const realm = await RealmService.getStagingRealm();
      const history = realm.objects<ScanHistory>("ScanHistory").sorted("timestamp", true).slice(0, limit);

      return Array.from(history).map(record => JSON.parse(record.data));
    } catch (error) {
      console.error("Failed to load recent scans:", error);
      return [];
    }
  }

  /**
   * Clear all history and stored images
   */
  static async clearHistory(): Promise<void> {
    try {
      const history = await this.getHistory();

      // Delete images
      for (const item of history) {
        if (item.metadata?.imageUri) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(item.metadata.imageUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(item.metadata.imageUri);
            }
          } catch (e) {
            console.warn("Failed to delete image:", e);
          }
        }
      }

      const realm = await RealmService.getStagingRealm();
      realm.write(() => {
        realm.delete(realm.objects("ScanHistory"));
      });

      // Also clear legacy storage
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear history:", error);
      throw error;
    }
  }

  /**
   * Trim history to keep only the most recent N items
   */
  static async trimHistory(keepCount: number = 50): Promise<void> {
    try {
      const realm = await RealmService.getStagingRealm();
      const history = realm.objects<ScanHistory>("ScanHistory").sorted("timestamp", true);

      if (history.length <= keepCount) return;

      const toDelete = history.slice(keepCount);
      
      // Delete images for removed items
      for (const record of toDelete) {
        try {
          const data = JSON.parse(record.data);
          if (data.metadata?.imageUri) {
            const fileInfo = await FileSystem.getInfoAsync(data.metadata.imageUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(data.metadata.imageUri);
            }
          }
        } catch (err) {
          console.warn("Failed to delete old image during trim:", err);
        }
      }

      realm.write(() => {
        realm.delete(toDelete);
      });

      console.log(`[StorageService] Trimmed history to ${keepCount} items in Realm`);
    } catch (error) {
      console.error("Failed to trim history:", error);
    }
  }
}
