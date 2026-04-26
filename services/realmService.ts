// @ts-ignore
import Realm from "realm";

// --- STAGING SCHEMAS (Offline writes) ---

export class OfflineGrade extends Realm.Object<OfflineGrade> {
  _id!: Realm.BSON.ObjectId;
  studentId!: string;
  examId!: string;
  score!: number;
  totalPoints!: number;
  percentage!: number;
  gradeEquivalent!: string;
  correctAnswers!: number;
  totalQuestions!: number;
  dateScanned!: string;
  status!: string;
  scannedBy!: string;
  createdAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: "OfflineGrade",
    primaryKey: "_id",
    properties: {
      _id: { type: "objectId", default: () => new Realm.BSON.ObjectId() },
      studentId: "string",
      examId: "string",
      score: "int",
      totalPoints: "int",
      percentage: "double",
      gradeEquivalent: "string",
      correctAnswers: "int",
      totalQuestions: "int",
      dateScanned: "string",
      status: "string",
      scannedBy: "string",
      createdAt: "date",
    },
  };
}

export class OfflineClass extends Realm.Object<OfflineClass> {
  _id!: Realm.BSON.ObjectId;
  class_name!: string;
  course_subject!: string;
  room?: string;
  section_block?: string;
  students!: string;
  status!: string;
  createdBy!: string;
  createdAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: "OfflineClass",
    primaryKey: "_id",
    properties: {
      _id: { type: "objectId", default: () => new Realm.BSON.ObjectId() },
      class_name: "string",
      course_subject: "string",
      room: "string?",
      section_block: "string?",
      students: "string",
      status: "string",
      createdBy: "string",
      createdAt: "date",
    },
  };
}

export class OfflineQuiz extends Realm.Object<OfflineQuiz> {
  _id!: Realm.BSON.ObjectId;
  title!: string;
  subject!: string;
  className?: string;
  classId?: string;
  examId!: string;
  templateId!: string;
  questionCount!: number;
  answerKey!: string; // JSON string
  status!: string;
  createdBy!: string;
  createdAt!: Date;
  instructorId?: string;
  examCode?: string;
  choicesPerItem?: number;

  static schema: Realm.ObjectSchema = {
    name: "OfflineQuiz",
    primaryKey: "_id",
    properties: {
      _id: { type: "objectId", default: () => new Realm.BSON.ObjectId() },
      title: "string",
      subject: "string",
      className: "string?",
      classId: "string?",
      examId: "string?",
      templateId: "string?",
      questionCount: "int",
      answerKey: "string",
      status: "string",
      createdBy: "string",
      createdAt: "date",
      instructorId: "string?",
      examCode: "string?",
      choicesPerItem: { type: "int", default: 4 },
    },
  };
}

export class OfflinePendingUpdate extends Realm.Object<OfflinePendingUpdate> {
  _id!: Realm.BSON.ObjectId;
  updateId!: string;
  examId!: string;
  action!: string;
  data!: string; // JSON string
  timestamp!: Date;
  retryCount!: number;
  collection?: string;

  static schema: Realm.ObjectSchema = {
    name: "OfflinePendingUpdate",
    primaryKey: "_id",
    properties: {
      _id: { type: "objectId", default: () => new Realm.BSON.ObjectId() },
      updateId: "string",
      examId: "string",
      action: "string",
      data: "string",
      timestamp: "date",
      retryCount: { type: "int", default: 0 },
      collection: "string?",
    },
  };
}

export class ScanHistory extends Realm.Object<ScanHistory> {
  _id!: Realm.BSON.ObjectId;
  timestamp!: number;
  data!: string; // JSON string of GradingResult
  studentId!: string;
  examId!: string;

  static schema: Realm.ObjectSchema = {
    name: "ScanHistory",
    primaryKey: "_id",
    properties: {
      _id: { type: "objectId", default: () => new Realm.BSON.ObjectId() },
      timestamp: { type: "int", indexed: true },
      data: "string",
      studentId: "string",
      examId: "string",
    },
  };
}

export class SystemKV extends Realm.Object<SystemKV> {
  key!: string;
  value!: string;

  static schema: Realm.ObjectSchema = {
    name: "SystemKV",
    primaryKey: "key",
    properties: {
      key: "string",
      value: "string",
    },
  };
}

// --- CACHE SCHEMAS (Local Firestore Mirror) ---

export class ClassCache extends Realm.Object<ClassCache> {
  id!: string;
  class_name!: string;
  course_subject!: string;
  room?: string;
  year?: string;
  section_block?: string;
  isArchived?: boolean;
  students!: string;
  createdBy!: string;
  updatedAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: "ClassCache",
    primaryKey: "id",
    properties: {
      id: "string",
      class_name: "string",
      course_subject: "string",
      room: "string?",
      year: "string?",
      section_block: "string?",
      isArchived: { type: "bool", default: false },
      students: "string",
      createdBy: "string",
      updatedAt: "date",
    },
  };
}

export class QuizCache extends Realm.Object<QuizCache> {
    id!: string;
    title!: string;
    subject!: string;
    className?: string;
    classId?: string;
    isArchived?: boolean;
    status!: string;
    structureLocked?: boolean;
    papersCount!: number;
    questionCount!: number;
    answerKey?: string;
    createdBy!: string;
    createdAt!: Date;
    updatedAt!: Date;
    version?: number;
    instructorId?: string;
    examCode?: string;
    choicesPerItem?: number;

    static schema: Realm.ObjectSchema = {
        name: "QuizCache",
        primaryKey: "id",
        properties: {
            id: "string",
            title: "string",
            subject: "string",
            className: "string?",
            classId: "string?",
            isArchived: { type: "bool", default: false },
            status: "string",
            structureLocked: { type: "bool", default: false },
            papersCount: { type: "int", default: 0 },
            questionCount: "int",
            answerKey: "string?",
            createdBy: "string",
            createdAt: "date",
            updatedAt: "date",
            version: { type: "int", default: 1 },
            instructorId: "string?",
            examCode: "string?",
            choicesPerItem: { type: "int", default: 4 },
        },
    };
}

export class GradeCache extends Realm.Object<GradeCache> {
  id!: string; // Firestore ID
  studentId!: string;
  examId!: string;
  score!: number;
  totalPoints!: number;
  percentage!: number;
  gradeEquivalent!: string;
  dateScanned!: string;
  scannedBy!: string;
  createdAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: "GradeCache",
    primaryKey: "id",
    properties: {
      id: "string",
      studentId: "string",
      examId: "string",
      score: "int",
      totalPoints: "int",
      percentage: "double",
      gradeEquivalent: "string",
      dateScanned: "string",
      scannedBy: "string",
      createdAt: "date",
    },
  };
}

export class StudentCache extends Realm.Object<StudentCache> {
  id!: string;
  student_id!: string;
  first_name!: string;
  last_name!: string;
  grade?: string;
  email?: string;
  section?: string;
  is_active!: boolean;
  createdBy!: string;
  created_at!: string;
  updated_at!: string;

  static schema: Realm.ObjectSchema = {
    name: "StudentCache",
    primaryKey: "id",
    properties: {
      id: "string",
      student_id: { type: "string", indexed: true },
      first_name: "string",
      last_name: "string",
      grade: "string?",
      email: "string?",
      section: "string?",
      is_active: { type: "bool", default: true },
      createdBy: "string",
      created_at: "string",
      updated_at: "string",
    },
  };
}

// --- REALM INSTANCE MANAGEMENT ---

let stagingRealm: Realm | null = null;
let cacheRealm: Realm | null = null;

const STAGING_CONFIG: Realm.Configuration = {
  path: "staging.realm",
  schema: [
    OfflineGrade,
    OfflineClass,
    OfflineQuiz,
    OfflinePendingUpdate,
    SystemKV,
    ScanHistory,
  ],
  schemaVersion: 13,
  onMigration: (oldRealm: any, newRealm: any) => {
    if (oldRealm.schemaVersion < 8) {
      const oldObjects = oldRealm.objects("OfflineClass");
      const newObjects = newRealm.objects("OfflineClass");
      for (let i = 0; i < oldObjects.length; i++) {
        newObjects[i].room = oldObjects[i].room ?? "";
        newObjects[i].section_block = oldObjects[i].section_block ?? "";
      }
    }
  },
};

const CACHE_CONFIG: Realm.Configuration = {
  path: "cache.realm",
  schema: [ClassCache, QuizCache, GradeCache, StudentCache],
  schemaVersion: 12,
  deleteRealmIfMigrationNeeded: true, // Safe for cache as it can be re-downloaded
};

export class RealmService {
  /**
   * Get the staging Realm (where offline edits are stored before resync)
   */
  static async getStagingRealm(): Promise<Realm> {
    if (!stagingRealm || stagingRealm.isClosed) {
      try {
        stagingRealm = await Realm.open(STAGING_CONFIG);
      } catch (error: any) {
        // If already open with a different schema version, close and reopen
        if (
          error?.message?.includes(
            "already opened with different schema version",
          )
        ) {
          if (stagingRealm && !stagingRealm.isClosed) {
            stagingRealm.close();
          }
          stagingRealm = null;
          stagingRealm = await Realm.open(STAGING_CONFIG);
        } else {
          throw error;
        }
      }
    }
    return stagingRealm;
  }

  /**
   * Get the primary cache Realm (local mirror of Firestore)
   */
  static async getCacheRealm(): Promise<Realm> {
    if (!cacheRealm || cacheRealm.isClosed) {
      try {
        cacheRealm = await Realm.open(CACHE_CONFIG);
      } catch (error: any) {
        if (
          error?.message?.includes(
            "already opened with different schema version",
          )
        ) {
          if (cacheRealm && !cacheRealm.isClosed) {
            cacheRealm.close();
          }
          cacheRealm = null;
          cacheRealm = await Realm.open(CACHE_CONFIG);
        } else {
          throw error;
        }
      }
    }
    return cacheRealm;
  }

  /**
   * Clear the primary cache database (e.g., on logout)
   */
  static async clearCache(): Promise<void> {
    try {
      const realm = await this.getCacheRealm();
      realm.write(() => {
        realm.deleteAll();
      });
      console.log("Cache Realm cleared");
    } catch (error) {
      console.error("Error clearing cache realm:", error);
      // If it's a version mismatch that deleteRealmIfMigrationNeeded didn't catch (rare)
      // we might want to be even more aggressive, but this should suffice.
      throw error;
    }
  }

  /**
   * Clear everything (Full Reset)
   */
  static async clearAll(): Promise<void> {
    const sRealm = await this.getStagingRealm();
    const cRealm = await this.getCacheRealm();

    sRealm.write(() => sRealm.deleteAll());
    cRealm.write(() => cRealm.deleteAll());
    console.log("All Realms cleared");
  }
}
