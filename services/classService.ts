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

      const newClass = {
        ...classData,
        students: classData.students || [],
        createdBy: currentUser.uid,
        created_at: new Date().toISOString(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(collection(db, this.COLLECTION), newClass);
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
      if (!currentUser) {
        throw new Error("User must be authenticated");
      }

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
          schedule_day: data.schedule_day,
          schedule_time: data.schedule_time,
          school_year: data.school_year,
          section_block: data.section_block,
          semester: data.semester,
          students: data.students || [],
          createdBy: data.createdBy,
          created_at: data.created_at,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        });
      });

      return classes;
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
        schedule_day: data.schedule_day,
        schedule_time: data.schedule_time,
        school_year: data.school_year,
        section_block: data.section_block,
        semester: data.semester,
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
