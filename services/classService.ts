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

      const isOnline = await NetworkService.isOnline();

      if (!isOnline) {
        console.log("[ClassService] Offline. Queueing class to staging...");
        const stagingRealm = await RealmService.getStagingRealm();
        stagingRealm.write(() => {
          stagingRealm.create("OfflineClass", {
            class_name: classData.class_name,
            course_subject: classData.course_subject,
            room: classData.room,
            section_block: classData.section_block,
            students: JSON.stringify(classData.students || []),
            status: "pending",
            createdBy: currentUser.uid,
            createdAt: new Date(),
          });
        });
        return "offline_pending";
      }

      const newClass = {
        ...classData,
        students: classData.students || [],
        createdBy: currentUser.uid,
        created_at: new Date().toISOString(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(collection(db, this.COLLECTION), newClass);

      // Update local cache manually for immediate UI response
      const cacheRealm = await RealmService.getCacheRealm();
      cacheRealm.write(() => {
        cacheRealm.create("ClassCache", {
          id: docRef.id,
          class_name: classData.class_name,
          course_subject: classData.course_subject,
          room: classData.room,
          section_block: classData.section_block,
          students: JSON.stringify(classData.students || []),
          createdBy: currentUser.uid,
          updatedAt: new Date(),
        }, Realm.UpdateMode.Modified);
      });

      return docRef.id;
    } catch (error) {
      console.error("Error creating class:", error);
      throw error;
    }
  }

  /**
   * Get all classes for the current user
   */
  static async getClassesByUser(): Promise<Class[]> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("User must be authenticated");

      const isOnline = await NetworkService.isOnline();

      if (isOnline) {
        console.log("[ClassService] Online. Fetching from Firestore...");
        const q = query(
          collection(db, this.COLLECTION),
          where("createdBy", "==", currentUser.uid),
        );
        const querySnapshot = await getDocs(q);
        const classes: Class[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          classes.push({
            id: doc.id,
            class_name: data.class_name,
            course_subject: data.course_subject,
            room: data.room,
            section_block: data.section_block,
            students: data.students || [],
            createdBy: data.createdBy,
            created_at: data.created_at,
            createdAt: data.createdAt?.toDate(),
            updatedAt: data.updatedAt?.toDate(),
          });
        });
        return classes;
      }

      // Offline Fallback: Load from Cache + Staging
      console.log("[ClassService] Offline. Falling back to Realm Cache...");
      const cacheRealm = await RealmService.getCacheRealm();
      const cached = cacheRealm.objects<ClassCache>("ClassCache");

      const stagingRealm = await RealmService.getStagingRealm();
      const staging = stagingRealm.objects<OfflineClass>("OfflineClass");

      const localClasses: Class[] = [];

      cached.forEach(c => {
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

      staging.forEach(s => {
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

      return localClasses;
    } catch (error) {
      console.error("Error fetching classes:", error);
      throw error;
    }
  }

  /**
   * Get a single class by ID
   */
  static async getClassById(classId: string): Promise<Class | null> {
    try {
      const docRef = doc(db, this.COLLECTION, classId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        class_name: data.class_name,
        course_subject: data.course_subject,
        room: data.room,
        section_block: data.section_block,
        students: data.students || [],
        createdBy: data.createdBy,
        created_at: data.created_at,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      };
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
