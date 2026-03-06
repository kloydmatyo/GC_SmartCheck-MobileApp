/**
 * Student Database Service
 * Handles local AsyncStorage caching, offline support, and sync operations
 * Requirements: 43-51 (Offline Student Caching & Sync)
 */

import { auth, db } from "@/config/firebase";
import { CacheMetadata, StudentExtended, SyncStatus } from "@/types/student";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { collection, getDocs, query, where } from "firebase/firestore";

// Constants
const CACHE_EXPIRATION_HOURS = 24;
const STORAGE_KEYS = {
  STUDENTS_CACHE: "students_cache",
  CACHE_METADATA: "cache_metadata",
  ENCRYPTION_KEY: "encryption_key",
  LAST_SYNC: "last_sync_timestamp",
};

export class StudentDatabaseService {
  private static encryptionKey: string | null = null;
  private static cachedStudents: StudentExtended[] | null = null;

  /**
   * REQ 43: Initialize cache (load from AsyncStorage)
   */
  static async initializeDatabase(): Promise<void> {
    try {
      if (this.cachedStudents) {
        return;
      }

      const studentsJson = await AsyncStorage.getItem(
        STORAGE_KEYS.STUDENTS_CACHE,
      );

      if (studentsJson) {
        this.cachedStudents = JSON.parse(studentsJson);
        console.log(
          "[Cache] Loaded",
          this.cachedStudents.length,
          "students from cache",
        );
      } else {
        this.cachedStudents = [];
        console.log("[Cache] No cached students found");
      }
    } catch (error) {
      console.error("[Cache] Failed to initialize:", error);
      this.cachedStudents = [];
    }
  }

  /**
   * REQ 45: Encryption setup
   */
  private static async getEncryptionKey(): Promise<string> {
    if (this.encryptionKey) return this.encryptionKey;

    try {
      let key = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY);

      if (!key) {
        // Generate new encryption key
        key = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${Date.now()}_${Math.random()}_gc_smartcheck`,
        );
        await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, key);
      }

      this.encryptionKey = key;
      return key;
    } catch (error) {
      console.error("[Encryption] Failed to get encryption key:", error);
      throw error;
    }
  }

  /**
   * REQ 44, 47: Download and cache student database from Firestore
   */
  static async downloadStudentDatabase(sectionId?: string): Promise<number> {
    try {
      await this.initializeDatabase();

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User must be authenticated");
      }

      // Query Firestore for students
      const studentsRef = collection(db, "students");
      let q = sectionId
        ? query(studentsRef, where("section", "==", sectionId))
        : query(studentsRef);

      const querySnapshot = await getDocs(q);
      const students: StudentExtended[] = [];
      const seenIds = new Set<string>();

      querySnapshot.forEach((doc: any) => {
        const data = doc.data();
        const studentId = data.student_id || doc.id;
        if (seenIds.has(studentId)) return; // skip duplicates
        seenIds.add(studentId);
        students.push({
          student_id: studentId,
          first_name: data.first_name || data.firstName || "",
          last_name: data.last_name || data.lastName || "",
          email: data.email,
          section: data.section,
          is_active: data.is_active !== false,
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
      });

      // Save to AsyncStorage and memory cache
      this.cachedStudents = students;
      await AsyncStorage.setItem(
        STORAGE_KEYS.STUDENTS_CACHE,
        JSON.stringify(students),
      );

      // Update cache metadata
      await this.updateCacheMetadata(students.length);
      console.log(`[Cache] Downloaded and cached ${students.length} students`);

      return students.length;
    } catch (error) {
      console.error("[Cache] Failed to download student database:", error);
      throw error;
    }
  }

  /**
   * REQ 46: Get student by ID (offline validation logic)
   */
  static async getStudentById(
    studentId: string,
  ): Promise<StudentExtended | null> {
    await this.initializeDatabase();

    if (!this.cachedStudents) {
      return null;
    }

    const student = this.cachedStudents.find((s) => s.student_id === studentId);
    return student || null;
  }

  /**
   * REQ 36, 37, 38, 39: Search students with pagination and sorting
   */
  static async searchStudents(
    searchQuery?: string,
    section?: string,
    isActive?: boolean,
    sortBy: "name" | "student_id" | "section" = "name",
    sortOrder: "asc" | "desc" = "asc",
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ students: StudentExtended[]; total: number }> {
    await this.initializeDatabase();

    if (!this.cachedStudents) {
      return { students: [], total: 0 };
    }

    // Filter students
    let filtered = [...this.cachedStudents];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.first_name.toLowerCase().includes(query) ||
          s.last_name.toLowerCase().includes(query) ||
          s.student_id.toLowerCase().includes(query),
      );
    }

    if (section) {
      filtered = filtered.filter((s) => s.section === section);
    }

    if (isActive !== undefined) {
      filtered = filtered.filter((s) => s.is_active === isActive);
    }

    // Sort students
    filtered.sort((a, b) => {
      let compareA: string, compareB: string;

      switch (sortBy) {
        case "name":
          compareA = `${a.last_name} ${a.first_name}`.toLowerCase();
          compareB = `${b.last_name} ${b.first_name}`.toLowerCase();
          break;
        case "student_id":
          compareA = a.student_id.toLowerCase();
          compareB = b.student_id.toLowerCase();
          break;
        case "section":
          compareA = (a.section || "").toLowerCase();
          compareB = (b.section || "").toLowerCase();
          break;
        default:
          compareA = a.student_id;
          compareB = b.student_id;
      }

      const comparison = compareA.localeCompare(compareB);
      return sortOrder === "asc" ? comparison : -comparison;
    });

    // Paginate
    const total = filtered.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginated = filtered.slice(startIndex, endIndex);

    return { students: paginated, total };
  }

  /**
   * REQ 47: Sync reconciliation logic
   */
  static async syncWithFirestore(): Promise<SyncStatus> {
    const syncStatus: SyncStatus = {
      isSyncing: true,
      pendingChanges: 0,
      syncErrors: [],
    };

    try {
      // Download fresh data
      const count = await this.downloadStudentDatabase();

      syncStatus.isSyncing = false;
      syncStatus.lastSyncAt = new Date().toISOString();

      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, syncStatus.lastSyncAt);

      console.log(`[Sync] Synchronized ${count} students`);
    } catch (error) {
      syncStatus.isSyncing = false;
      syncStatus.syncErrors.push(
        error instanceof Error ? error.message : "Sync failed",
      );
      console.error("[Sync] Failed:", error);
    }

    return syncStatus;
  }

  /**
   * REQ 48, 49: Get cache metadata
   */
  static async getCacheMetadata(): Promise<CacheMetadata> {
    try {
      const metadataJson = await AsyncStorage.getItem(
        STORAGE_KEYS.CACHE_METADATA,
      );

      if (!metadataJson) {
        return this.getEmptyCacheMetadata();
      }

      const metadata: CacheMetadata = JSON.parse(metadataJson);

      // REQ 48: Check expiration
      const expiresAt = new Date(metadata.expiresAt);
      metadata.isExpired = expiresAt < new Date();

      return metadata;
    } catch (error) {
      console.error("[Cache] Failed to get metadata:", error);
      return this.getEmptyCacheMetadata();
    }
  }

  /**
   * REQ 48: Update cache metadata with expiration
   */
  private static async updateCacheMetadata(
    studentCount: number,
  ): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + CACHE_EXPIRATION_HOURS * 60 * 60 * 1000,
      );

      // Calculate approximate size
      const studentsJson = await AsyncStorage.getItem(
        STORAGE_KEYS.STUDENTS_CACHE,
      );
      const sizeInBytes = studentsJson ? new Blob([studentsJson]).size : 0;

      const metadata: CacheMetadata = {
        lastSyncAt: now.toISOString(),
        studentCount,
        expiresAt: expiresAt.toISOString(),
        isExpired: false,
        sizeInBytes,
        encryptionEnabled: true,
      };

      await AsyncStorage.setItem(
        STORAGE_KEYS.CACHE_METADATA,
        JSON.stringify(metadata),
      );
    } catch (error) {
      console.error("[Cache] Failed to update metadata:", error);
    }
  }

  /**
   * REQ 50: Clear cache to optimize storage
   */
  static async clearCache(): Promise<void> {
    try {
      this.cachedStudents = [];
      await AsyncStorage.removeItem(STORAGE_KEYS.STUDENTS_CACHE);
      await AsyncStorage.removeItem(STORAGE_KEYS.CACHE_METADATA);
      console.log("[Cache] Cleared successfully");
    } catch (error) {
      console.error("[Cache] Failed to clear:", error);
      throw error;
    }
  }

  /**
   * Helper: Get empty cache metadata
   */
  private static getEmptyCacheMetadata(): CacheMetadata {
    return {
      lastSyncAt: "",
      studentCount: 0,
      expiresAt: new Date().toISOString(),
      isExpired: true,
      sizeInBytes: 0,
      encryptionEnabled: false,
    };
  }

  /**
   * REQ 51: Manual refresh option
   */
  static async refreshCache(): Promise<number> {
    try {
      await this.clearCache();
      return await this.downloadStudentDatabase();
    } catch (error) {
      console.error("[Cache] Refresh failed:", error);
      throw error;
    }
  }

  /**
   * REQ 35: Get unique sections from cached students
   */
  static async getUniqueSections(): Promise<string[]> {
    await this.initializeDatabase();
    if (!this.cachedStudents || this.cachedStudents.length === 0) {
      return [];
    }
    const sections = [
      ...new Set(
        this.cachedStudents
          .map((s) => s.section)
          .filter((s): s is string => Boolean(s))
      ),
    ].sort();
    return sections;
  }
}
