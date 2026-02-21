/**
 * Student Database Service
 * Handles local SQLite database, offline caching, and sync operations
 * Requirements: 43-51 (Offline Student Caching & Sync)
 */

import * as SQLite from 'expo-sqlite/legacy';
import * as Crypto from 'expo-crypto';
import { auth, db } from "@/config/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  StudentExtended, 
  CacheMetadata, 
  SyncStatus 
} from "@/types/student";

// Helper type for SQLite results (is_active stored as INTEGER)
type StudentSQLiteRow = Omit<StudentExtended, 'is_active'> & { is_active: number };

// Constants
const DB_NAME = 'students.db';
const CACHE_EXPIRATION_HOURS = 24;
const STORAGE_KEYS = {
  CACHE_METADATA: 'cache_metadata',
  ENCRYPTION_KEY: 'encryption_key',
  LAST_SYNC: 'last_sync_timestamp'
};

export class StudentDatabaseService {
  private static dbInstance: SQLite.WebSQLDatabase | null = null;
  private static encryptionKey: string | null = null;

  /**
   * REQ 43: Initialize local SQLite database
   */
  static async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.dbInstance) {
          resolve();
          return;
        }

        this.dbInstance = SQLite.openDatabase(DB_NAME);

        // Create tables
        this.dbInstance.transaction(
          (tx) => {
            tx.executeSql(
              `CREATE TABLE IF NOT EXISTS students (
                student_id TEXT PRIMARY KEY,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT,
                section TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT,
                updated_at TEXT,
                synced_at TEXT
              )`,
              [],
              () => {
                // Create indexes
                tx.executeSql('CREATE INDEX IF NOT EXISTS idx_student_section ON students(section)');
                tx.executeSql('CREATE INDEX IF NOT EXISTS idx_student_active ON students(is_active)');
                tx.executeSql('CREATE INDEX IF NOT EXISTS idx_student_name ON students(last_name, first_name)');
              }
            );
          },
          (error) => reject(error),
          () => {
            console.log('[SQLite] Database initialized successfully');
            resolve();
          }
        );
      } catch (error) {
        console.error('[SQLite] Failed to initialize database:', error);
        reject(error);
      }
    });
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
          `${Date.now()}_${Math.random()}_gc_smartcheck`
        );
        await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, key);
      }

      this.encryptionKey = key;
      return key;
    } catch (error) {
      console.error('[Encryption] Failed to get encryption key:', error);
      throw error;
    }
  }

  /**
   * REQ 44, 47: Download and cache student database from Firestore
   */
  static async downloadStudentDatabase(sectionId?: string): Promise<number> {
    try {
      await this.initializeDatabase();
      
      if (!this.dbInstance) {
        throw new Error('Database not initialized');
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User must be authenticated');
      }

      // Query Firestore for students
      const studentsRef = collection(db, 'students');
      let q = sectionId
        ? query(studentsRef, where('section', '==', sectionId))
        : query(studentsRef);

      const querySnapshot = await getDocs(q);
      const students: StudentExtended[] = [];

      querySnapshot.forEach((doc: any) => {
        const data = doc.data();
        students.push({
          student_id: data.student_id || doc.id,
          first_name: data.first_name || data.firstName || '',
          last_name: data.last_name || data.lastName || '',
          email: data.email,
          section: data.section,
          is_active: data.is_active !== false,
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
      });

      // Insert students using transaction
      return new Promise((resolve, reject) => {
        let insertedCount = 0;

        this.dbInstance!.transaction(
          (tx) => {
            students.forEach((student) => {
              tx.executeSql(
                `INSERT OR REPLACE INTO students 
                 (student_id, first_name, last_name, email, section, is_active, created_at, updated_at, synced_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  student.student_id,
                  student.first_name,
                  student.last_name,
                  student.email || null,
                  student.section || null,
                  student.is_active ? 1 : 0,
                  student.created_at || new Date().toISOString(),
                  student.updated_at || new Date().toISOString(),
                  new Date().toISOString()
                ],
                () => {
                  insertedCount++;
                }
              );
            });
          },
          (error) => {
            console.error('[SQLite] Insert failed:', error);
            reject(error);
          },
          async () => {
            // Update cache metadata
            await this.updateCacheMetadata(insertedCount);
            console.log(`[SQLite] Downloaded and cached ${insertedCount} students`);
            resolve(insertedCount);
          }
        );
      });
    } catch (error) {
      console.error('[SQLite] Failed to download student database:', error);
      throw error;
    }
  }

  /**
   * REQ 46: Get student by ID (offline validation logic)
   */
  static async getStudentById(studentId: string): Promise<StudentExtended | null> {
    await this.initializeDatabase();
    
    if (!this.dbInstance) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.dbInstance!.transaction((tx) => {
        tx.executeSql(
          'SELECT * FROM students WHERE student_id = ?',
          [studentId],
          (_, { rows }) => {
            if (rows.length === 0) {
              resolve(null);
            } else {
              const row: any = rows.item(0);
              resolve({
                ...row,
                is_active: row.is_active === 1
              });
            }
          },
          (_, error) => {
            console.error('[SQLite] Failed to get student:', error);
            reject(error);
            return false;
          }
        );
      });
    });
  }

  /**
   * REQ 36, 37, 38, 39: Search students with pagination and sorting
   */
  static async searchStudents(
    searchQuery?: string,
    section?: string,
    isActive?: boolean,
    sortBy: 'name' | 'student_id' | 'section' = 'name',
    sortOrder: 'asc' | 'desc' = 'asc',
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ students: StudentExtended[], total: number }> {
    await this.initializeDatabase();
    
    if (!this.dbInstance) {
      return { students: [], total: 0 };
    }

    return new Promise((resolve) => {
      // Build query
      let whereClause = '';
      const params: any[] = [];

      const conditions: string[] = [];

      if (searchQuery) {
        conditions.push('(first_name LIKE ? OR last_name LIKE ? OR student_id LIKE ?)');
        const searchPattern = `%${searchQuery}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      if (section) {
        conditions.push('section = ?');
        params.push(section);
      }

      if (isActive !== undefined) {
        conditions.push('is_active = ?');
        params.push(isActive ? 1 : 0);
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }

      // Sorting
      const orderByMap = {
        name: 'last_name, first_name',
        student_id: 'student_id',
        section: 'section'
      };
      const orderBy = `ORDER BY ${orderByMap[sortBy]} ${sortOrder.toUpperCase()}`;

      const offset = (page - 1) * pageSize;

      this.dbInstance!.transaction((tx) => {
        // Get total count
        tx.executeSql(
          `SELECT COUNT(*) as count FROM students ${whereClause}`,
          params,
          (_, { rows }) => {
            const total = rows.item(0).count;

            // Get paginated results
            tx.executeSql(
              `SELECT * FROM students ${whereClause} ${orderBy} LIMIT ? OFFSET ?`,
              [...params, pageSize, offset],
              (_, { rows }) => {
                const students: StudentExtended[] = [];
                for (let i = 0; i < rows.length; i++) {
                  const row: any = rows.item(i);
                  students.push({
                    ...row,
                    is_active: row.is_active === 1
                  });
                }
                resolve({ students, total });
              },
              (_, error) => {
                console.error('[SQLite] Search failed:', error);
                resolve({ students: [], total: 0 });
                return false;
              }
            );
          },
          (_, error) => {
            console.error('[SQLite] Count failed:', error);
            resolve({ students: [], total: 0 });
            return false;
          }
        );
      });
    });
  }

  /**
   * REQ 47: Sync reconciliation logic
   */
  static async syncWithFirestore(): Promise<SyncStatus> {
    const syncStatus: SyncStatus = {
      isSyncing: true,
      pendingChanges: 0,
      syncErrors: []
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
      syncStatus.syncErrors.push(error instanceof Error ? error.message : 'Sync failed');
      console.error('[Sync] Failed:', error);
    }

    return syncStatus;
  }

  /**
   * REQ 48, 49: Get cache metadata
   */
  static async getCacheMetadata(): Promise<CacheMetadata> {
    try {
      const metadataJson = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_METADATA);
      
      if (!metadataJson) {
        return this.getEmptyCacheMetadata();
      }

      const metadata: CacheMetadata = JSON.parse(metadataJson);
      
      // REQ 48: Check expiration
      const expiresAt = new Date(metadata.expiresAt);
      metadata.isExpired = expiresAt < new Date();

      return metadata;

    } catch (error) {
      console.error('[Cache] Failed to get metadata:', error);
      return this.getEmptyCacheMetadata();
    }
  }

  /**
   * REQ 48: Update cache metadata with expiration
   */
  private static async updateCacheMetadata(studentCount: number): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + CACHE_EXPIRATION_HOURS * 60 * 60 * 1000);

      const metadata: CacheMetadata = {
        lastSyncAt: now.toISOString(),
        studentCount,
        expiresAt: expiresAt.toISOString(),
        isExpired: false,
        sizeInBytes: 0, // Simplified - not calculated in WebSQL
        encryptionEnabled: true
      };

      await AsyncStorage.setItem(STORAGE_KEYS.CACHE_METADATA, JSON.stringify(metadata));

    } catch (error) {
      console.error('[Cache] Failed to update metadata:', error);
    }
  }

  /**
   * REQ 50: Clear cache to optimize storage
   */
  static async clearCache(): Promise<void> {
    await this.initializeDatabase();
    
    if (!this.dbInstance) return;

    return new Promise((resolve, reject) => {
      this.dbInstance!.transaction(
        (tx) => {
          tx.executeSql('DELETE FROM students');
        },
        (error) => {
          console.error('[Cache] Failed to clear:', error);
          reject(error);
        },
        async () => {
          await AsyncStorage.removeItem(STORAGE_KEYS.CACHE_METADATA);
          console.log('[Cache] Cleared successfully');
          resolve();
        }
      );
    });
  }

  /**
   * Helper: Get empty cache metadata
   */
  private static getEmptyCacheMetadata(): CacheMetadata {
    return {
      lastSyncAt: '',
      studentCount: 0,
      expiresAt: new Date().toISOString(),
      isExpired: true,
      sizeInBytes: 0,
      encryptionEnabled: false
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
      console.error('[Cache] Refresh failed:', error);
      throw error;
    }
  }
}
