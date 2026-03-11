import { auth, db } from "@/config/firebase";
import {
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { NetworkService } from "./networkService";
import { OfflineStorageService, PendingUpdate } from "./offlineStorageService";

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
  private static syncListeners: Array<(result: SyncResult) => void> = [];

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
      const pendingUpdates = await OfflineStorageService.getPendingUpdates();

      if (pendingUpdates.length === 0) {
        console.log("✅ No pending updates to sync");
        return {
          success: true,
          syncedCount: 0,
          failedCount: 0,
          conflicts: [],
        };
      }

      console.log(`🔄 Syncing ${pendingUpdates.length} pending updates...`);

      for (const update of pendingUpdates) {
        try {
          const conflict = await this.syncUpdate(update);

          if (conflict) {
            conflicts.push(conflict);
            failedCount++;
          } else {
            await OfflineStorageService.removePendingUpdate(update.id);
            syncedCount++;
          }
        } catch (error) {
          console.error(`Error syncing update ${update.id}:`, error);
          failedCount++;
        }
      }

      await OfflineStorageService.updateLastSync();

      const result: SyncResult = {
        success: conflicts.length === 0,
        syncedCount,
        failedCount,
        conflicts,
      };

      console.log(
        `✅ Sync complete: ${syncedCount} synced, ${failedCount} failed, ${conflicts.length} conflicts`,
      );

      // Notify listeners
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
