/**
 * Student Database Service
 * Handles local SQLite caching, offline support, and sync operations
 * Requirements: 43-51 (Offline Student Caching & Sync)
 */

import { auth, db } from "@/config/firebase";
import { CacheMetadata, StudentExtended, SyncStatus } from "@/types/student";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { Platform } from "react-native";

// Conditional SQLite import (web doesn't support SQLite)
let SQLite: any = null;
if (Platform.OS !== "web") {
  try {
    SQLite = require("expo-sqlite");
  } catch (e) {
    console.warn(
      "[SQLite] Not available on this platform, using Firestore only",
    );
  }
}

// Constants
const CACHE_EXPIRATION_HOURS = 24;
const DB_NAME = "students.db";
const STORAGE_KEYS = {
  CACHE_METADATA: "cache_metadata_sqlite",
  LAST_SYNC: "last_sync_timestamp_sqlite",
};

export class StudentDatabaseService {
  private static db: any = null;
  private static cachedStudents: StudentExtended[] | null = null;
  private static isSQLiteAvailable = Platform.OS !== "web" && SQLite !== null;

  /**
   * Open SQLite database connection
   */
  private static async openDatabase(): Promise<any> {
    if (!this.isSQLiteAvailable) {
      console.log("[SQLite] Not available on web, skipping database open");
      return null;
    }

    if (this.db) {
      return this.db;
    }

    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      console.log("[SQLite] Database opened successfully");
      return this.db;
    } catch (error) {
      console.error("[SQLite] Failed to open database:", error);
      throw error;
    }
  }

  /**
   * Create students table if it doesn't exist
   */
  private static async createTables(): Promise<void> {
    if (!this.isSQLiteAvailable) {
      console.log("[SQLite] Not available, skipping table creation");
      return;
    }

    const database = await this.openDatabase();
    if (!database) return;

    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        student_id TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        grade TEXT,
        email TEXT,
        section TEXT,
        is_active INTEGER DEFAULT 1,
        createdBy TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_student_id ON students(student_id);
      CREATE INDEX IF NOT EXISTS idx_section ON students(section);
      CREATE INDEX IF NOT EXISTS idx_name ON students(last_name, first_name);
    `);

    console.log("[SQLite] Tables created successfully");
  }

  private static async resolveStudentDocId(
    docIdOrStudentId: string,
  ): Promise<string> {
    await this.initializeDatabase();

    // Try SQLite first (if available)
    if (this.isSQLiteAvailable) {
      const database = await this.openDatabase();
      if (database) {
        const result = await database.getFirstAsync<{ id: string }>(
          "SELECT id FROM students WHERE id = ? OR student_id = ? LIMIT 1",
          [docIdOrStudentId, docIdOrStudentId],
        );

        if (result?.id) {
          return result.id;
        }
      }
    }

    // Fallback to Firestore
    // First, try to get document directly by ID (handles Firestore doc IDs)
    const studentsRef = collection(db, "students");
    const directDocRef = doc(studentsRef, docIdOrStudentId);
    const directDoc = await getDoc(directDocRef);

    if (directDoc.exists()) {
      return directDoc.id;
    }

    // If not found by doc ID, search by student_id field
    const snapshot = await getDocs(
      query(studentsRef, where("student_id", "==", docIdOrStudentId)),
    );

    const match = snapshot.docs[0];
    if (!match) {
      throw new Error("Student record not found");
    }

    return match.id;
  }

  /**
   * REQ 43: Initialize SQLite database and tables
   */
  static async initializeDatabase(): Promise<void> {
    try {
      if (this.db && this.cachedStudents) {
        // Check if cache is expired
        const metadata = await this.getCacheMetadata();
        if (metadata.isExpired) {
          console.log("[SQLite] Cache expired, will refresh on next load");
        }
        return;
      }

      if (this.isSQLiteAvailable) {
        await this.openDatabase();
        await this.createTables();

        // Load students into memory cache for fast access
        await this.loadCacheFromSQLite();

        console.log(
          "[SQLite] Database initialized with",
          this.cachedStudents?.length ?? 0,
          "students",
        );
      } else {
        console.log(
          "[Web Mode] SQLite not available, using Firestore-only mode",
        );
        // Only initialize to empty if not already populated
        if (!this.cachedStudents) {
          this.cachedStudents = [];
        }
      }
    } catch (error) {
      console.error("[SQLite] Failed to initialize:", error);
      this.cachedStudents = [];
    }
  }

  /**
   * Load students from SQLite into memory cache
   */
  private static async loadCacheFromSQLite(): Promise<void> {
    if (!this.isSQLiteAvailable) {
      console.log("[SQLite] Not available, skipping cache load");
      this.cachedStudents = [];
      return;
    }

    try {
      const database = await this.openDatabase();
      if (!database) {
        this.cachedStudents = [];
        return;
      }

      const rows = await database.getAllAsync<any>("SELECT * FROM students");

      this.cachedStudents = rows.map((row) => ({
        id: row.id,
        student_id: row.student_id,
        first_name: row.first_name,
        last_name: row.last_name,
        grade: row.grade,
        email: row.email,
        section: row.section,
        is_active: row.is_active === 1,
        createdBy: row.createdBy,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      console.log(
        "[SQLite] Loaded",
        this.cachedStudents.length,
        "students from SQLite into memory",
      );
    } catch (error) {
      console.error("[SQLite] Failed to load cache:", error);
      this.cachedStudents = [];
    }
  }

  /**
   * Auto-refresh cache if expired
   */
  private static async checkAndRefreshCache(): Promise<void> {
    try {
      const metadata = await this.getCacheMetadata();
      if (metadata.isExpired) {
        console.log("[SQLite] Cache expired, auto-refreshing from Firestore");
        await this.downloadStudentDatabase();
      }
    } catch (error) {
      console.warn("[SQLite] Auto-refresh check failed:", error);
    }
  }

  /**
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
   * REQ 44, 47: Download and cache student database from Firestore to SQLite
   */
  static async downloadStudentDatabase(sectionId?: string): Promise<number> {
    try {
      await this.initializeDatabase();

      // Query Firestore for students
      const studentsRef = collection(db, "students");
      const q = sectionId
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
          id: doc.id,
          student_id: studentId,
          first_name: data.first_name || data.firstName || "",
          last_name: data.last_name || data.lastName || "",
          grade: data.grade,
          email: data.email,
          section: data.section,
          is_active: data.is_active !== false,
          createdBy: data.createdBy,
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
      });

      // Update memory cache
      this.cachedStudents = students;

      // Save to SQLite if available (mobile only)
      if (this.isSQLiteAvailable) {
        const database = await this.openDatabase();
        if (database) {
          // Clear existing data and insert new data in transaction
          await database.execAsync("BEGIN TRANSACTION");
          try {
            await database.runAsync("DELETE FROM students");

            // Insert students in batches for better performance
            for (const student of students) {
              await database.runAsync(
                `INSERT OR REPLACE INTO students 
                (id, student_id, first_name, last_name, grade, email, section, is_active, createdBy, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  student.id,
                  student.student_id,
                  student.first_name,
                  student.last_name,
                  student.grade || null,
                  student.email || null,
                  student.section || null,
                  student.is_active ? 1 : 0,
                  student.createdBy || null,
                  student.created_at || null,
                  student.updated_at || null,
                ],
              );
            }

            await database.execAsync("COMMIT");
            console.log(
              `[SQLite] Transaction committed, ${students.length} students saved`,
            );
          } catch (error) {
            await database.execAsync("ROLLBACK");
            console.error("[SQLite] Transaction rolled back:", error);
            throw error;
          }
        }
      }

      // Update cache metadata
      await this.updateCacheMetadata(students.length);
      console.log(`[SQLite] Downloaded and cached ${students.length} students`);

      return students.length;
    } catch (error) {
      console.error("[SQLite] Failed to download student database:", error);
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
    await this.checkAndRefreshCache(); // Auto-refresh if expired

    if (!this.cachedStudents) {
      return null;
    }

    const student = this.cachedStudents.find((s) => s.student_id === studentId);
    return student || null;
  }

  static async createStudent(
    student: Pick<
      StudentExtended,
      "student_id" | "first_name" | "last_name" | "grade" | "email" | "section"
    >,
  ): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("User must be authenticated");
    }

    await this.initializeDatabase();

    const trimmedId = student.student_id.trim();
    if (!trimmedId) {
      throw new Error("Student ID is required");
    }

    const duplicate = this.cachedStudents?.some(
      (item) => item.student_id.toLowerCase() === trimmedId.toLowerCase(),
    );
    if (duplicate) {
      throw new Error("A student with this ID already exists");
    }

    const payload: Omit<StudentExtended, "id"> = {
      student_id: trimmedId,
      first_name: student.first_name.trim(),
      last_name: student.last_name.trim(),
      grade: student.grade?.trim() || undefined,
      email: student.email?.trim() || undefined,
      section: student.section?.trim() || undefined,
      is_active: true,
      createdBy: currentUser.uid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Add to Firestore first
    const docRef = await addDoc(collection(db, "students"), payload);

    // Add to SQLite cache (if available)
    if (this.isSQLiteAvailable) {
      const database = await this.openDatabase();
      if (database) {
        await database.runAsync(
          `INSERT OR REPLACE INTO students 
          (id, student_id, first_name, last_name, grade, email, section, is_active, createdBy, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            docRef.id,
            payload.student_id,
            payload.first_name,
            payload.last_name,
            payload.grade || null,
            payload.email || null,
            payload.section || null,
            1,
            payload.createdBy,
            payload.created_at,
            payload.updated_at,
          ],
        );
      }
    }

    // Update memory cache directly (don't reload from SQLite to avoid stale data)
    const newStudent: StudentExtended = { id: docRef.id, ...payload };
    if (!this.cachedStudents) this.cachedStudents = [];
    this.cachedStudents.push(newStudent);
    
    // Update cache metadata to prevent auto-refresh from wiping this change
    await this.updateCacheMetadata(this.cachedStudents.length);
  }

  /**
   * Add multiple students to local cache (used by bulk import)
   * Note: Students should already be in Firestore before calling this
   */
  static async addStudentsToCache(students: StudentExtended[]): Promise<void> {
    if (!students || students.length === 0) {
      return;
    }

    await this.initializeDatabase();

    // Add to SQLite cache (if available)
    if (this.isSQLiteAvailable) {
      const database = await this.openDatabase();
      if (database) {
        await database.execAsync("BEGIN TRANSACTION");
        try {
          for (const student of students) {
            await database.runAsync(
              `INSERT OR REPLACE INTO students 
              (id, student_id, first_name, last_name, grade, email, section, is_active, createdBy, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                student.id,
                student.student_id,
                student.first_name,
                student.last_name,
                student.grade || null,
                student.email || null,
                student.section || null,
                student.is_active ? 1 : 0,
                student.createdBy || null,
                student.created_at || null,
                student.updated_at || null,
              ],
            );
          }
          await database.execAsync("COMMIT");
          console.log(`[SQLite] Added ${students.length} students to cache`);
        } catch (error) {
          await database.execAsync("ROLLBACK");
          console.error("[SQLite] Failed to add students to cache:", error);
          throw error;
        }
      }
    }

    // Add to memory cache (deduplicate first)
    if (!this.cachedStudents) this.cachedStudents = [];
    
    // Create a Set of existing student IDs for fast lookup
    const existingIds = new Set(this.cachedStudents.map(s => s.student_id));
    
    // Only add students that don't already exist in cache
    const newStudents = students.filter(s => !existingIds.has(s.student_id));
    
    if (newStudents.length > 0) {
      this.cachedStudents.push(...newStudents);
      console.log(`[Cache] Added ${newStudents.length} new students to memory cache (${students.length - newStudents.length} already existed)`);
    } else {
      console.log(`[Cache] All ${students.length} students already exist in cache, skipping`);
    }
    
    // Update cache metadata
    await this.updateCacheMetadata(this.cachedStudents.length);
  }

  static async updateStudent(
    docIdOrStudentId: string,
    updates: Partial<
      Pick<
        StudentExtended,
        "first_name" | "last_name" | "grade" | "email" | "section" | "is_active"
      >
    >,
  ): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("User must be authenticated");
    }

    const payload = {
      ...updates,
      first_name: updates.first_name?.trim(),
      last_name: updates.last_name?.trim(),
      grade: updates.grade?.trim(),
      email: updates.email?.trim() || undefined,
      section: updates.section?.trim() || undefined,
      updated_at: new Date().toISOString(),
    };

    const docId = await this.resolveStudentDocId(docIdOrStudentId);

    // Update Firestore
    await updateDoc(doc(db, "students", docId), payload);

    // Update SQLite cache (if available)
    if (this.isSQLiteAvailable) {
      const database = await this.openDatabase();
      if (database) {
        const updateParts: string[] = [];
        const updateValues: any[] = [];

        if (payload.first_name) {
          updateParts.push("first_name = ?");
          updateValues.push(payload.first_name);
        }
        if (payload.last_name) {
          updateParts.push("last_name = ?");
          updateValues.push(payload.last_name);
        }
        if (payload.grade !== undefined) {
          updateParts.push("grade = ?");
          updateValues.push(payload.grade);
        }
        if (payload.email !== undefined) {
          updateParts.push("email = ?");
          updateValues.push(payload.email || null);
        }
        if (payload.section !== undefined) {
          updateParts.push("section = ?");
          updateValues.push(payload.section || null);
        }
        if (payload.is_active !== undefined) {
          updateParts.push("is_active = ?");
          updateValues.push(payload.is_active ? 1 : 0);
        }
        updateParts.push("updated_at = ?");
        updateValues.push(payload.updated_at);

        updateValues.push(docId);

        await database.runAsync(
          `UPDATE students SET ${updateParts.join(", ")} WHERE id = ?`,
          updateValues,
        );
      }
    }

    // Update memory cache directly (don't reload from SQLite to avoid stale data)
    if (this.cachedStudents) {
      const index = this.cachedStudents.findIndex((s) => s.id === docId);
      if (index !== -1) {
        this.cachedStudents[index] = {
          ...this.cachedStudents[index],
          ...payload,
        };
      }
    }
    
    // Update cache metadata to prevent auto-refresh from wiping this change
    if (this.cachedStudents) {
      await this.updateCacheMetadata(this.cachedStudents.length);
    }
  }

  static async deleteStudent(docIdOrStudentId: string): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("User must be authenticated");
    }

    await this.initializeDatabase();
    
    const docId = await this.resolveStudentDocId(docIdOrStudentId);
    console.log(`[Delete] Attempting to delete student with docId: ${docId}`);

    try {
      // Delete from Firestore FIRST (source of truth)
      await deleteDoc(doc(db, "students", docId));
      console.log(`[Delete] Successfully deleted from Firestore: ${docId}`);

      // Delete from SQLite cache (if available)
      if (this.isSQLiteAvailable) {
        const database = await this.openDatabase();
        if (database) {
          await database.runAsync("DELETE FROM students WHERE id = ?", [docId]);
          console.log(`[Delete] Successfully deleted from SQLite: ${docId}`);
        }
      }

      // Update memory cache directly (don't reload from SQLite to avoid stale data)
      if (this.cachedStudents) {
        const beforeCount = this.cachedStudents.length;
        this.cachedStudents = this.cachedStudents.filter((s) => s.id !== docId);
        const afterCount = this.cachedStudents.length;
        console.log(`[Delete] Memory cache updated: ${beforeCount} -> ${afterCount} students`);
      }
      
      // Update cache metadata to prevent auto-refresh from wiping this change
      if (this.cachedStudents) {
        await this.updateCacheMetadata(this.cachedStudents.length);
      }
      
      console.log(`[Delete] Student deletion completed successfully: ${docId}`);
    } catch (error) {
      console.error(`[Delete] Failed to delete student ${docId}:`, error);
      throw error;
    }
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
    await this.checkAndRefreshCache(); // Auto-refresh if expired

    if (!this.cachedStudents) {
      return { students: [], total: 0 };
    }

    // Deduplicate students by student_id before processing (safety measure)
    const uniqueStudents = Array.from(
      new Map(this.cachedStudents.map(s => [s.student_id, s])).values()
    );
    
    if (uniqueStudents.length !== this.cachedStudents.length) {
      console.warn(`[Cache] Removed ${this.cachedStudents.length - uniqueStudents.length} duplicate students from cache`);
      this.cachedStudents = uniqueStudents;
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

      // Estimate size from SQLite (rough calculation)
      const sizeInBytes = studentCount * 300; // Approximate 300 bytes per student

      const metadata: CacheMetadata = {
        lastSyncAt: now.toISOString(),
        studentCount,
        expiresAt: expiresAt.toISOString(),
        isExpired: false,
        sizeInBytes,
        encryptionEnabled: false, // SQLite has its own encryption
      };

      await AsyncStorage.setItem(
        STORAGE_KEYS.CACHE_METADATA,
        JSON.stringify(metadata),
      );
    } catch (error) {
      console.error("[SQLite] Failed to update metadata:", error);
    }
  }

  /**
   * REQ 50: Clear cache to optimize storage
   */
  static async clearCache(): Promise<void> {
    try {
      this.cachedStudents = [];

      // Clear SQLite database (if available)
      if (this.isSQLiteAvailable) {
        const database = await this.openDatabase();
        if (database) {
          await database.runAsync("DELETE FROM students");
        }
      }

      // Clear metadata
      await AsyncStorage.removeItem(STORAGE_KEYS.CACHE_METADATA);
      await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC);

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
          .filter((s): s is string => Boolean(s)),
      ),
    ].sort();
    return sections;
  }
}
