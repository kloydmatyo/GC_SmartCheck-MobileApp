import { auth, db } from "@/config/firebase";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { Class, CreateClassData, Student } from "../types/class";
import { NetworkService } from "./networkService";
import { ClassCache, OfflineClass, RealmService } from "./realmService";
import { UserService } from "./userService";

function getClassSortTime(item: {
  createdAt?: Date;
  updatedAt?: Date;
  created_at?: string;
}) {
  if (
    item.createdAt instanceof Date &&
    !Number.isNaN(item.createdAt.getTime())
  ) {
    return item.createdAt.getTime();
  }

  if (
    item.updatedAt instanceof Date &&
    !Number.isNaN(item.updatedAt.getTime())
  ) {
    return item.updatedAt.getTime();
  }

  if (item.created_at) {
    const parsed = new Date(item.created_at);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return 0;
}

export class ClassService {
  private static COLLECTION = "classes";

  /**
   * Create a new class
   */
  static async createClass(classData: CreateClassData): Promise<string> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User must be authenticated to create a class");
      }

      // Get instructor ID from user profile
      const instructorId = await UserService.getCurrentUserInstructorId();

      const isOnline = await NetworkService.isOnline();

      if (!isOnline) {
        console.log("[ClassService] Offline. Queueing class to staging...");
        const stagingRealm = await RealmService.getStagingRealm();
        stagingRealm.write(() => {
          stagingRealm.create("OfflineClass", {
            class_name: classData.class_name,
            course_subject: classData.course_subject,
            room: classData.room ?? "",
            section_block: classData.section_block ?? "",
            students: JSON.stringify(classData.students || []),
            status: "pending",
            createdBy: currentUser.uid,
            createdAt: new Date(),
          });
        });
        return "offline_pending";
      }

      const newClass = Object.fromEntries(
        Object.entries({
          ...classData,
          students: classData.students || [],
          isArchived: classData.isArchived || false,
          instructorId,
          createdBy: currentUser.uid,
          created_at: new Date().toISOString(),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }).filter(([, v]) => v !== undefined)
      );

      const docRef = await addDoc(collection(db, this.COLLECTION), newClass);

      // Update local cache manually for immediate UI response
      const cacheRealm = await RealmService.getCacheRealm();
      cacheRealm.write(() => {
        cacheRealm.create(
          "ClassCache",
          {
            id: docRef.id,
            class_name: classData.class_name,
            course_subject: classData.course_subject,
            ...(classData.room ? { room: classData.room } : {}),
            ...(classData.section_block ? { section_block: classData.section_block } : {}),
            students: JSON.stringify(classData.students || []),
            createdBy: currentUser.uid,
            updatedAt: new Date(),
          },
          Realm.UpdateMode.Modified,
        );
      });

      return docRef.id;
    } catch (error) {
      console.error("Error creating class:", error);
      throw error;
    }
  }

  /**
   * Get all classes for the current user (Local-First: Cache + Staging)
   */
  static async getClassesByUser(): Promise<Class[]> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return [];

      // 1. Load from Staging & Cache Realm - FASTEST
      const cacheRealm = await RealmService.getCacheRealm();
      const cached = cacheRealm.objects<ClassCache>("ClassCache");

      const stagingRealm = await RealmService.getStagingRealm();
      const staging = stagingRealm.objects<OfflineClass>("OfflineClass");

      const localClasses: Class[] = [];

      cached.forEach((c) => {
        localClasses.push({
          id: c.id,
          class_name: c.class_name,
          course_subject: c.course_subject,
          room: c.room,
          section_block: c.section_block,
          students: JSON.parse(c.students || "[]"),
          createdBy: c.createdBy,
          created_at: c.updatedAt.toISOString(),
          createdAt: c.updatedAt,
          updatedAt: c.updatedAt,
        });
      });

      staging.forEach((s) => {
        localClasses.push({
          id: `staging_${s._id.toHexString()}`,
          class_name: s.class_name,
          course_subject: s.course_subject,
          room: s.room,
          section_block: s.section_block,
          students: JSON.parse(s.students || "[]"),
          createdBy: s.createdBy,
          created_at: s.createdAt.toISOString(),
          createdAt: s.createdAt,
          updatedAt: s.createdAt,
        });
      });

      // --- LOCAL-FIRST OPTIMIZATION ---
      // If we have local data, return it IMMEDIATELY for instant UI responsiveness.
      // We only fetch from Firestore if we're online AND (we have no local data OR we want to background-sync).
      
      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      if (localClasses.length > 0) {
        console.log(`[ClassService] Returning ${localClasses.length} local classes instantly.`);
        
        // Optional: Trigger background refresh if online without awaiting it
        if (isOnline) {
          this.backgroundSyncClasses(currentUser.uid).catch(err => 
            console.error("[ClassService] Background sync failed:", err)
          );
        }
        
        return localClasses.sort((a, b) => getClassSortTime(b) - getClassSortTime(a));
      }

      if (isOnline) {
        console.log("[ClassService] No local classes, fetching from Firestore...");
        const q = query(
          collection(db, this.COLLECTION),
          where("createdBy", "==", currentUser.uid),
        );
        const querySnapshot = await getDocs(q);
        const firestoreClasses: Class[] = [];
        
        // Update Cache Realm with fresh data
        cacheRealm.write(() => {
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const createdAt = data.createdAt?.toDate?.() ?? (data.created_at ? new Date(data.created_at) : new Date());
            const updatedAt = data.updatedAt?.toDate?.() ?? (data.updated_at ? new Date(data.updated_at) : new Date());

            const cls: Class = {
              id: docSnap.id,
              class_name: data.class_name,
              course_subject: data.course_subject,
              room: data.room,
              section_block: data.section_block,
              students: data.students || [],
              instructorId: data.instructorId,
              createdBy: data.createdBy,
              created_at: data.created_at,
              createdAt,
              updatedAt,
            };
            firestoreClasses.push(cls);

            cacheRealm.create("ClassCache", {
              id: docSnap.id,
              class_name: data.class_name,
              course_subject: data.course_subject,
              room: data.room ?? "",
              section_block: data.section_block ?? "",
              students: JSON.stringify(data.students || []),
              createdBy: data.createdBy,
              updatedAt: updatedAt,
            }, Realm.UpdateMode.Modified);
          });
        });

        // Combine with staging (not yet synced)
        const combined = [...firestoreClasses];
        staging.forEach((s) => {
          combined.push({
            id: `staging_${s._id.toHexString()}`,
            class_name: s.class_name,
            course_subject: s.course_subject,
            room: s.room,
            section_block: s.section_block,
            students: JSON.parse(s.students || "[]"),
            createdBy: s.createdBy,
            created_at: s.createdAt.toISOString(),
            createdAt: s.createdAt,
            updatedAt: s.createdAt,
          });
        });

        return combined;
      }

      return localClasses;
    } catch (error) {
      console.error("Error fetching classes:", error);
      throw error;
    }
  }

  /**
   * Get a single class by ID (Local-First)
   */
  /**
   * Background sync classes from Firestore to Realm Cache
   */
  private static async backgroundSyncClasses(userId: string): Promise<void> {
    try {
      const cacheRealm = await RealmService.getCacheRealm();
      const q = query(
        collection(db, this.COLLECTION),
        where("createdBy", "==", userId),
      );
      const querySnapshot = await getDocs(q);

      const firestoreIds = new Set<string>();

      cacheRealm.write(() => {
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const updatedAt =
            data.updatedAt?.toDate?.() ??
            (data.updated_at ? new Date(data.updated_at) : new Date());

          firestoreIds.add(docSnap.id);

          cacheRealm.create(
            "ClassCache",
            {
              id: docSnap.id,
              class_name: data.class_name,
              course_subject: data.course_subject,
              room: data.room ?? undefined,
              section_block: data.section_block ?? undefined,
              students: JSON.stringify(data.students || []),
              createdBy: data.createdBy,
              updatedAt: updatedAt,
            },
            Realm.UpdateMode.Modified,
          );
        });

        // Remove cached entries that no longer exist in Firestore
        const allCached = cacheRealm.objects<ClassCache>("ClassCache").filtered("createdBy == $0", userId);
        const toDelete = allCached.filter((c) => !firestoreIds.has(c.id));
        toDelete.forEach((c) => cacheRealm.delete(c));
      });

      console.log("[ClassService] Background sync complete.");
    } catch (error) {
      console.warn("[ClassService] Background sync failed:", error);
    }
  }

  static async getClassById(classId: string): Promise<Class | null> {
    try {
      // 0. Handle Staging IDs
      if (classId.startsWith("staging_")) {
        const stagingRealm = await RealmService.getStagingRealm();
        const hexId = classId.replace("staging_", "");
        const sClass = stagingRealm.objectForPrimaryKey<OfflineClass>(
          "OfflineClass", 
          new Realm.BSON.ObjectId(hexId)
        );
        
        if (sClass) {
          return {
            id: classId,
            class_name: sClass.class_name,
            course_subject: sClass.course_subject,
            room: sClass.room,
            section_block: sClass.section_block,
            students: JSON.parse(sClass.students || "[]"),
            createdBy: sClass.createdBy,
            created_at: sClass.createdAt.toISOString(),
            createdAt: sClass.createdAt,
            updatedAt: sClass.createdAt,
          };
        }
      }

      // 1. Check Cache Realm - FAST
      const cacheRealm = await RealmService.getCacheRealm();
      const cached = cacheRealm.objectForPrimaryKey<ClassCache>("ClassCache", classId);
      
      if (cached) {
        return {
          id: cached.id,
          class_name: cached.class_name,
          course_subject: cached.course_subject,
          room: cached.room,
          section_block: cached.section_block,
          students: JSON.parse(cached.students || "[]"),
          createdBy: cached.createdBy,
          created_at: cached.updatedAt.toISOString(),
          createdAt: cached.updatedAt,
          updatedAt: cached.updatedAt,
        };
      }

      // 2. Fallback to Firebase if online
      const { NetworkService } = await import("./networkService");
      if (await NetworkService.isOnline()) {
        const docRef = doc(db, this.COLLECTION, classId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const cls = {
            id: docSnap.id,
            class_name: data.class_name,
            course_subject: data.course_subject,
            room: data.room,
            section_block: data.section_block,
            students: data.students || [],
            instructorId: data.instructorId,
            isArchived: data.isArchived || false,
            createdBy: data.createdBy,
            created_at: data.created_at,
            createdAt: data.createdAt?.toDate(),
            updatedAt: data.updatedAt?.toDate(),
          };

          // Update cache
          cacheRealm.write(() => {
            cacheRealm.create("ClassCache", {
              id: docSnap.id,
              class_name: data.class_name,
              course_subject: data.course_subject,
              room: data.room ?? "",
              section_block: data.section_block ?? "",
              students: JSON.stringify(data.students || []),
              createdBy: data.createdBy,
              updatedAt: cls.updatedAt || new Date(),
            }, Realm.UpdateMode.Modified);
          });

          return cls;
        }
      }

      return null;
    } catch (error) {
      console.error("Error fetching class:", error);
      throw error;
    }
  }

  /**
   * Update a class
   */
  static async updateClass(
    classId: string,
    updates: Partial<CreateClassData>,
  ): Promise<void> {
    try {
      const docRef = doc(db, this.COLLECTION, classId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("Error updating class:", error);
      throw error;
    }
  }

  /**
   * Delete a class
   */
  static async deleteClass(classId: string): Promise<void> {
    try {
      const docRef = doc(db, this.COLLECTION, classId);
      await deleteDoc(docRef);

      // Remove from Realm cache
      const cacheRealm = await RealmService.getCacheRealm();
      const cached = cacheRealm.objectForPrimaryKey<ClassCache>("ClassCache", classId);
      if (cached) {
        cacheRealm.write(() => {
          cacheRealm.delete(cached);
        });
      }
    } catch (error) {
      console.error("Error deleting class:", error);
      throw error;
    }
  }

  /**
   * Add student to class
   */
  static async addStudent(classId: string, student: Student): Promise<void> {
    try {
      const classData = await this.getClassById(classId);
      if (!classData) {
        throw new Error("Class not found");
      }

      // Check if student with same ID already exists in this class
      const existingStudent = classData.students.find(
        (s) => s.student_id === student.student_id
      );

      if (existingStudent) {
        throw new Error(
          `Student with ID "${student.student_id}" already exists in this class. ` +
          `Existing student: ${existingStudent.first_name} ${existingStudent.last_name}`
        );
      }

      const updatedStudents = [...classData.students, student];
      await this.updateClass(classId, { students: updatedStudents });
    } catch (error) {
      console.error("Error adding student:", error);
      throw error;
    }
  }

  /**
   * Remove student from class
   */
  static async removeStudent(
    classId: string,
    studentId: string,
  ): Promise<void> {
    try {
      const classData = await this.getClassById(classId);
      if (!classData) {
        throw new Error("Class not found");
      }

      const updatedStudents = classData.students.filter(
        (s) => s.student_id !== studentId,
      );
      await this.updateClass(classId, { students: updatedStudents });
    } catch (error) {
      console.error("Error removing student:", error);
      throw error;
    }
  }
}
