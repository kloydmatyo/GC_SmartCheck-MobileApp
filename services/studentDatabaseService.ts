/**
 * Student Database Service
 * Handles local Realm caching, offline support, and sync operations
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
import { RealmService, StudentCache } from "./realmService";
import Realm from "realm";

// Constants
const CACHE_EXPIRATION_HOURS = 24;
const STORAGE_KEYS = {
  CACHE_METADATA: "cache_metadata_realm",
  LAST_SYNC: "last_sync_timestamp_realm",
};

export class StudentDatabaseService {
  private static cachedStudents: StudentExtended[] | null = null;

  /**
   * REQ 43: Initialize local cache from Realm
   */
  static async initializeDatabase(): Promise<void> {
    try {
      if (this.cachedStudents) {
        // Check if cache is expired in background
        this.checkAndRefreshCache().catch(err => console.warn("[StudentDatabase] BG Refresh fail:", err));
        return;
      }

      await this.loadCacheFromRealm();
      
      // Initial check for expiration
      await this.checkAndRefreshCache();
    } catch (error) {
      console.error("[StudentDatabase] Failed to initialize:", error);
      this.cachedStudents = [];
    }
  }

  /**
   * Load students from Realm into memory cache
   */
  private static async loadCacheFromRealm(): Promise<void> {
    try {
      const cacheRealm = await RealmService.getCacheRealm();
      const students = cacheRealm.objects<StudentCache>("StudentCache");

      this.cachedStudents = Array.from(students).map((s) => ({
        id: s.id,
        student_id: s.student_id,
        first_name: s.first_name,
        last_name: s.last_name,
        grade: s.grade ?? undefined,
        email: s.email ?? undefined,
        section: s.section ?? undefined,
        is_active: s.is_active,
        createdBy: s.createdBy ?? "",
        created_at: s.created_at ?? "",
        updated_at: s.updated_at ?? "",
      }));

      console.log(`[StudentDatabase] Loaded ${this.cachedStudents.length} students from Realm mirror`);
    } catch (error) {
      console.error("[StudentDatabase] Failed to load cache from Realm:", error);
      this.cachedStudents = [];
    }
  }

  /**
   * Auto-refresh cache if expired (Optimized: Only if online)
   */
  private static async checkAndRefreshCache(): Promise<void> {
    try {
      const metadata = await this.getCacheMetadata();
      if (metadata.isExpired) {
        const { NetworkService } = await import("./networkService");
        if (await NetworkService.isOnline()) {
           console.log("[StudentDatabase] Cache expired. Auto-refreshing from Firestore...");
           await this.downloadStudentDatabase();
        }
      }
    } catch (error) {
      console.warn("[StudentDatabase] Auto-refresh check failed:", error);
    }
  }

  private static async resolveStudentDocId(docIdOrStudentId: string): Promise<string> {
    await this.initializeDatabase();

    // Try memory cache first
    const matchInMemory = this.cachedStudents?.find(s => s.id === docIdOrStudentId || s.student_id === docIdOrStudentId);
    if (matchInMemory) return matchInMemory.id || matchInMemory.student_id;

    // Fallback to Firestore
    const studentsRef = collection(db, "students");
    const directDocRef = doc(studentsRef, docIdOrStudentId);
    const directDoc = await getDoc(directDocRef);

    if (directDoc.exists()) {
      return directDoc.id;
    }

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
   * REQ 44, 47: Download and cache student database from Firestore to Realm
   */
  static async downloadStudentDatabase(sectionId?: string): Promise<number> {
    try {
      // Query Firestore for students
      const studentsRef = collection(db, "students");
      const q = sectionId
        ? query(studentsRef, where("section", "==", sectionId))
        : query(studentsRef);

      const querySnapshot = await getDocs(q);
      const students: StudentExtended[] = [];
      const seenIds = new Set<string>();

      querySnapshot.forEach((docSnap: any) => {
        const data = docSnap.data();
        const studentId = data.student_id || docSnap.id;
        if (seenIds.has(studentId)) return; 
        seenIds.add(studentId);
        students.push({
          id: docSnap.id,
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

      // Save to Realm mirror
      const cacheRealm = await RealmService.getCacheRealm();
      
      // Perform write in transaction
      cacheRealm.write(() => {
        // If full sync (no sectionId), clear old cache to remove deleted Firestore records
        if (!sectionId) {
            const allCached = cacheRealm.objects("StudentCache");
            cacheRealm.delete(allCached);
        }

        students.forEach((s) => {
          cacheRealm.create("StudentCache", {
            id: s.id,
            student_id: s.student_id,
            first_name: s.first_name,
            last_name: s.last_name,
            grade: s.grade || null,
            email: s.email || null,
            section: s.section || null,
            is_active: s.is_active,
            createdBy: s.createdBy || "",
            created_at: s.created_at || "",
            updated_at: s.updated_at || "",
          }, Realm.UpdateMode.Modified);
        });
      });

      // Update cache metadata
      await this.updateCacheMetadata(students.length);
      console.log(`[StudentDatabase] Downloaded and cached ${students.length} students in Realm`);

      return students.length;
    } catch (error) {
      console.error("[StudentDatabase] Failed to download student database:", error);
      throw error;
    }
  }

  /**
   * REQ 46: Get student by ID (offline validation logic)
   */
  static async getStudentById(studentId: string): Promise<StudentExtended | null> {
    await this.initializeDatabase();

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

    // Add to Realm mirror
    const cacheRealm = await RealmService.getCacheRealm();
    cacheRealm.write(() => {
      cacheRealm.create("StudentCache", {
        id: docRef.id,
        student_id: payload.student_id,
        first_name: payload.first_name,
        last_name: payload.last_name,
        grade: payload.grade || null,
        email: payload.email || null,
        section: payload.section || null,
        is_active: true,
        createdBy: payload.createdBy,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      }, Realm.UpdateMode.Modified);
    });

    // Update memory cache
    const newStudent: StudentExtended = { id: docRef.id, ...payload };
    if (!this.cachedStudents) this.cachedStudents = [];
    this.cachedStudents.push(newStudent);
    await this.updateCacheMetadata(this.cachedStudents.length);
  }

  static async addStudentsToCache(students: StudentExtended[]): Promise<void> {
    if (!students || students.length === 0) return;
    await this.initializeDatabase();

    const cacheRealm = await RealmService.getCacheRealm();
    cacheRealm.write(() => {
      students.forEach((s) => {
        cacheRealm.create("StudentCache", {
          id: s.id,
          student_id: s.student_id,
          first_name: s.first_name,
          last_name: s.last_name,
          grade: s.grade || null,
          email: s.email || null,
          section: s.section || null,
          is_active: s.is_active,
          createdBy: s.createdBy || "",
          created_at: s.created_at || "",
          updated_at: s.updated_at || "",
        }, Realm.UpdateMode.Modified);
      });
    });

    // Update memory cache
    if (!this.cachedStudents) this.cachedStudents = [];
    const existingIds = new Set(this.cachedStudents.map(s => s.student_id));
    const newOnes = students.filter(s => !existingIds.has(s.student_id));
    this.cachedStudents.push(...newOnes);
    await this.updateCacheMetadata(this.cachedStudents.length);
  }

  static async updateStudent(
    docIdOrStudentId: string,
    updates: Partial<Pick<StudentExtended, "first_name" | "last_name" | "grade" | "email" | "section" | "is_active">>
  ): Promise<void> {
    const docId = await this.resolveStudentDocId(docIdOrStudentId);
    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Update Firestore
    await updateDoc(doc(db, "students", docId), payload);

    // Update Realm mirror
    const cacheRealm = await RealmService.getCacheRealm();
    cacheRealm.write(() => {
      const existing = cacheRealm.objectForPrimaryKey<StudentCache>("StudentCache", docId);
      if (existing) {
        if (updates.first_name) existing.first_name = updates.first_name;
        if (updates.last_name) existing.last_name = updates.last_name;
        if (updates.grade !== undefined) existing.grade = updates.grade;
        if (updates.email !== undefined) existing.email = updates.email;
        if (updates.section !== undefined) existing.section = updates.section;
        if (updates.is_active !== undefined) existing.is_active = updates.is_active;
        existing.updated_at = payload.updated_at;
      }
    });

    // Update memory cache
    if (this.cachedStudents) {
      const index = this.cachedStudents.findIndex((s) => s.id === docId);
      if (index !== -1) {
        this.cachedStudents[index] = { ...this.cachedStudents[index], ...payload } as StudentExtended;
      }
    }
  }

  static async deleteStudent(docIdOrStudentId: string): Promise<void> {
    const docId = await this.resolveStudentDocId(docIdOrStudentId);

    // Delete from Firestore
    await deleteDoc(doc(db, "students", docId));

    // Delete from Realm
    const cacheRealm = await RealmService.getCacheRealm();
    cacheRealm.write(() => {
      const existing = cacheRealm.objectForPrimaryKey<StudentCache>("StudentCache", docId);
      if (existing) cacheRealm.delete(existing);
    });

    // Update memory cache
    if (this.cachedStudents) {
      this.cachedStudents = this.cachedStudents.filter((s) => s.id !== docId);
      await this.updateCacheMetadata(this.cachedStudents.length);
    }
  }

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

    let filtered = [...this.cachedStudents];

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.first_name.toLowerCase().includes(lowerQuery) ||
          s.last_name.toLowerCase().includes(lowerQuery) ||
          s.student_id.toLowerCase().includes(lowerQuery),
      );
    }

    if (section) filtered = filtered.filter((s) => s.section === section);
    if (isActive !== undefined) filtered = filtered.filter((s) => s.is_active === isActive);

    // Sort
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
      return sortOrder === "asc" ? compareA.localeCompare(compareB) : compareB.localeCompare(compareA);
    });

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    return { students: paginated, total };
  }

  static async getUniqueSections(): Promise<string[]> {
    await this.initializeDatabase();
    if (!this.cachedStudents) return [];

    const sections = new Set<string>();
    this.cachedStudents.forEach((s) => {
      if (s.section) sections.add(s.section);
    });

    return Array.from(sections).sort();
  }

  static async syncWithFirestore(): Promise<SyncStatus> {
    try {
      const count = await this.downloadStudentDatabase();
      const lastSyncAt = new Date().toISOString();
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, lastSyncAt);
      return { isSyncing: false, pendingChanges: 0, syncErrors: [], lastSyncAt };
    } catch (error) {
      return { 
        isSyncing: false, 
        pendingChanges: 0, 
        syncErrors: [error instanceof Error ? error.message : "Sync failed"] 
      };
    }
  }

  static async getCacheMetadata(): Promise<CacheMetadata> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_METADATA);
      if (!json) return this.getEmptyCacheMetadata();
      const metadata: CacheMetadata = JSON.parse(json);
      metadata.isExpired = new Date(metadata.expiresAt) < new Date();
      return metadata;
    } catch {
      return this.getEmptyCacheMetadata();
    }
  }

  private static async updateCacheMetadata(count: number): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_EXPIRATION_HOURS);

    const metadata: CacheMetadata = {
      lastSyncAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      studentCount: count,
      isExpired: false,
      sizeInBytes: count * 200, // Estimation
      encryptionEnabled: false,
    };

    await AsyncStorage.setItem(STORAGE_KEYS.CACHE_METADATA, JSON.stringify(metadata));
  }

  private static getEmptyCacheMetadata(): CacheMetadata {
    return {
      lastSyncAt: "",
      expiresAt: new Date(0).toISOString(),
      studentCount: 0,
      isExpired: true,
      sizeInBytes: 0,
      encryptionEnabled: false,
    };
  }
}
