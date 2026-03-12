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
    room!: string;
    section_block!: string;
    students!: string; // JSON string because Realm arrays of objects are complex to sync 1:1 with Firestore easily without sub-schemas
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
            room: "string",
            section_block: "string",
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

// --- CACHE SCHEMAS (Local Firestore Mirror) ---

export class ClassCache extends Realm.Object<ClassCache> {
    id!: string; // Firestore ID
    class_name!: string;
    course_subject!: string;
    room!: string;
    section_block!: string;
    students!: string; // JSON string
    createdBy!: string;
    updatedAt!: Date;

    static schema: Realm.ObjectSchema = {
        name: "ClassCache",
        primaryKey: "id",
        properties: {
            id: "string",
            class_name: "string",
            course_subject: "string",
            room: "string",
            section_block: "string",
            students: "string",
            createdBy: "string",
            updatedAt: "date",
        },
    };
}

export class QuizCache extends Realm.Object<QuizCache> {
    id!: string; // Firestore ID
    title!: string;
    subject!: string;
    className?: string; // Cache the linked class name for faster UI
    status!: string;
    papersCount!: number;
    questionCount!: number;
    answerKey?: string; // JSON
    createdBy!: string;
    createdAt!: Date;
    updatedAt!: Date;
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
            status: "string",
            papersCount: { type: "int", default: 0 },
            questionCount: "int",
            answerKey: "string?",
            createdBy: "string",
            createdAt: "date",
            updatedAt: "date",
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

// --- REALM INSTANCE MANAGEMENT ---

let stagingRealm: Realm | null = null;
let cacheRealm: Realm | null = null;

const STAGING_CONFIG: Realm.Configuration = {
    path: "staging.realm",
    schema: [OfflineGrade, OfflineClass, OfflineQuiz],
    schemaVersion: 7,
};

const CACHE_CONFIG: Realm.Configuration = {
    path: "cache.realm",
    schema: [ClassCache, QuizCache, GradeCache],
    schemaVersion: 7,
    deleteRealmIfMigrationNeeded: true, // Safe for cache as it can be re-downloaded
};

export class RealmService {
    /**
     * Get the staging Realm (where offline edits are stored before resync)
     */
    static async getStagingRealm(): Promise<Realm> {
        if (!stagingRealm || stagingRealm.isClosed) {
            stagingRealm = await Realm.open(STAGING_CONFIG);
        }
        return stagingRealm;
    }

    /**
     * Get the primary cache Realm (local mirror of Firestore)
     */
    static async getCacheRealm(): Promise<Realm> {
        if (!cacheRealm || cacheRealm.isClosed) {
            cacheRealm = await Realm.open(CACHE_CONFIG);
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
            console.log("✅ Cache Realm cleared");
        } catch (error) {
            console.error("❌ Error clearing cache realm:", error);
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
        console.log("✅ All Realms cleared");
    }
}
