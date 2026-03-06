import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { GradingResult } from "../types/scanning";

const STORAGE_KEY = "@scans_history";

export class StorageService {
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
        // Extract base64 without the prefix
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

      // 3. Save to AsyncStorage
      let history: GradingResult[] = [];
      try {
        const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
        history = historyStr ? JSON.parse(historyStr) : [];
      } catch (readError) {
        // If storage is corrupted, clear it and start fresh
        if (
          readError instanceof Error &&
          readError.message.includes("CursorWindow")
        ) {
          console.warn(
            "[StorageService] Corrupted storage detected, clearing...",
          );
          await AsyncStorage.removeItem(STORAGE_KEY);
          history = [];
        } else {
          throw readError;
        }
      }

      history.unshift(scanWithMeta); // Add to the top

      // Limit history to 100 items to prevent CursorWindow overflow
      const trimmedHistory = history.slice(0, 100);

      // Delete images for removed items
      if (history.length > 100) {
        for (let i = 100; i < history.length; i++) {
          const item = history[i];
          if (item.metadata?.imageUri) {
            try {
              const fileInfo = await FileSystem.getInfoAsync(
                item.metadata.imageUri,
              );
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(item.metadata.imageUri);
              }
            } catch (err) {
              console.warn("Failed to delete old image:", err);
            }
          }
        }
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));

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
      const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
      if (!historyStr) return;

      let history: GradingResult[] = JSON.parse(historyStr);
      let found = false;

      history = history.map((item) => {
        if (item.metadata?.timestamp === timestamp) {
          found = true;
          return { ...item, studentId: newStudentId };
        }
        return item;
      });

      if (found) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        console.log(
          `[StorageService] Updated student ID to ${newStudentId} for scan at ${timestamp}`,
        );
      }
    } catch (error) {
      console.error("Failed to update student ID in history:", error);
      throw error;
    }
  }

  /**
   * Get all scan history (with safety limit to prevent CursorWindow overflow)
   */
  static async getHistory(): Promise<GradingResult[]> {
    try {
      const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
      if (!historyStr) return [];

      const history: GradingResult[] = JSON.parse(historyStr);

      // Safety limit: only return most recent 100 scans to prevent CursorWindow overflow
      // If you need older scans, use pagination methods
      return history.slice(0, 100);
    } catch (error) {
      console.error("Failed to load history:", error);

      // If error is due to data being too large, clear it completely
      if (error instanceof Error && error.message.includes("CursorWindow")) {
        console.warn(
          "[StorageService] History corrupted (too large), clearing storage...",
        );
        try {
          // Nuclear option: clear without reading
          await AsyncStorage.removeItem(STORAGE_KEY);
          console.log("[StorageService] Storage cleared successfully");
          return [];
        } catch (clearError) {
          console.error("Failed to clear corrupted storage:", clearError);
          return [];
        }
      }

      return [];
    }
  }

  /**
   * Get recent scans (limited count)
   */
  static async getRecentScans(limit: number = 50): Promise<GradingResult[]> {
    try {
      const history = await this.getHistory();
      return history.slice(0, limit);
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
          const fileInfo = await FileSystem.getInfoAsync(
            item.metadata.imageUri,
          );
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(item.metadata.imageUri);
          }
        }
      }

      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear history:", error);
      throw error;
    }
  }

  /**
   * Trim history to keep only the most recent N items
   * Used for recovery when storage gets too large
   */
  static async trimHistory(keepCount: number = 50): Promise<void> {
    try {
      const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
      if (!historyStr) return;

      const history: GradingResult[] = JSON.parse(historyStr);

      if (history.length <= keepCount) return;

      // Keep only the most recent items
      const trimmed = history.slice(0, keepCount);
      const removed = history.slice(keepCount);

      // Delete images for removed items
      for (const item of removed) {
        if (item.metadata?.imageUri) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(
              item.metadata.imageUri,
            );
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(item.metadata.imageUri);
            }
          } catch (err) {
            console.warn("Failed to delete old image:", err);
          }
        }
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      console.log(
        `[StorageService] Trimmed history from ${history.length} to ${keepCount} items`,
      );
    } catch (error) {
      console.error("Failed to trim history:", error);
      throw error;
    }
  }
}
