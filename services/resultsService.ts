import { auth, db } from "@/config/firebase";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

type StudentNameMap = Map<string, string>;
type ExamMeta = {
  id: string;
  title: string;
  classId: string;
  classLabel: string;
  subject: string;
};

export type UnifiedResultRow = {
  id: string;
  source: "scan" | "grade";
  studentId: string;
  studentName: string;
  examId: string;
  examLabel: string;
  classId: string;
  classLabel: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  dateValue: string;
  correctLabel: string;
  sortValue: number;
};

type UnifiedResultsPayload = {
  rows: UnifiedResultRow[];
  classFilters: string[];
};

const EXAM_CHUNK_SIZE = 10;
const CLASS_CHUNK_SIZE = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toIsoDate(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value?.toDate) return value.toDate().toISOString();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function safeNumber(value: any, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatStudentName(student: any): string {
  const first = String(student?.first_name || "").trim();
  const last = String(student?.last_name || "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

async function fetchScannedResults(examIds: string[]) {
  if (!examIds.length) return [];

  const snapshots = await Promise.all(
    chunk(examIds, EXAM_CHUNK_SIZE).map((ids) =>
      getDocs(query(collection(db, "scannedResults"), where("examId", "in", ids))),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      data: docSnap.data(),
    })),
  );
}

async function fetchStudentGrades(classIds: string[]) {
  if (!classIds.length) return [];

  const snapshots = await Promise.all(
    chunk(classIds, CLASS_CHUNK_SIZE).map((ids) =>
      getDocs(query(collection(db, "studentGrades"), where("class_id", "in", ids))),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      data: docSnap.data(),
    })),
  );
}

export class ResultsService {
  static async getUnifiedResults(): Promise<UnifiedResultsPayload> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { rows: [], classFilters: ["All Classes"] };
    }

    const [classSnapshot, examSnapshot] = await Promise.all([
      getDocs(query(collection(db, "classes"), where("createdBy", "==", currentUser.uid))),
      getDocs(query(collection(db, "exams"), where("createdBy", "==", currentUser.uid))),
    ]);

    const classDocs = classSnapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      .filter((item) => !item.isArchived);

    const examDocs = examSnapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      .filter((item) => !item.isArchived);

    const studentNames: StudentNameMap = new Map();
    classDocs.forEach((classItem) => {
      const students = Array.isArray(classItem.students) ? classItem.students : [];
      students.forEach((student: any) => {
        const name = formatStudentName(student);
        if (student?.student_id && name) {
          studentNames.set(String(student.student_id), name);
        }
      });
    });

    const classLabelById = new Map<string, string>();
    classDocs.forEach((classItem) => {
      classLabelById.set(
        classItem.id,
        String(classItem.class_name || classItem.section_block || "Unassigned Class"),
      );
    });

    const examMetaById = new Map<string, ExamMeta>();
    examDocs.forEach((exam) => {
      const classId = String(exam.classId || "");
      const className = String(exam.className || "").trim();
      const classLabel =
        classLabelById.get(classId) ||
        className ||
        String(exam.subject || exam.section_block || "Unassigned Class");

      examMetaById.set(exam.id, {
        id: exam.id,
        title: String(exam.title || "Untitled Exam"),
        classId,
        classLabel,
        subject: String(exam.subject || ""),
      });
    });

    const [scanDocs, gradeDocs] = await Promise.all([
      fetchScannedResults(examDocs.map((exam) => exam.id)),
      fetchStudentGrades(classDocs.map((classItem) => classItem.id)),
    ]);

    const rows: UnifiedResultRow[] = [];
    const seenKeys = new Set<string>();

    scanDocs.forEach(({ id, data }) => {
      if (data.isNullId) return;

      const examId = String(data.examId || "").trim();
      const examMeta = examMetaById.get(examId);
      if (!examMeta) return;

      const totalQuestions = Math.max(
        1,
        safeNumber(data.totalQuestions, safeNumber(data.totalPoints, 1)),
      );
      const score = safeNumber(data.score);
      const percentage =
        typeof data.percentage === "number"
          ? Math.round(data.percentage)
          : Math.round((score / totalQuestions) * 100);
      const dateValue = toIsoDate(data.scannedAt || data.dateScanned);
      const studentId = String(data.studentId || "").trim();

      rows.push({
        id,
        source: "scan",
        studentId,
        studentName: studentNames.get(studentId) || studentId || "Unknown Student",
        examId,
        examLabel: examMeta.title,
        classId: examMeta.classId,
        classLabel: examMeta.classLabel,
        score,
        totalQuestions,
        percentage,
        dateValue,
        correctLabel: `${score}/${totalQuestions} correct`,
        sortValue: dateValue ? new Date(dateValue).getTime() : 0,
      });

      seenKeys.add(`scan:${studentId}:${examId}`);
      seenKeys.add(`grade:${studentId}:${examId}`);
    });

    gradeDocs.forEach(({ id, data }) => {
      const classId = String(data.class_id || "").trim();
      const examId = String(data.exam_id || data.examId || "").trim();
      const studentId = String(data.student_id || data.studentId || "").trim();
      const dedupeKey = `grade:${studentId}:${examId}`;

      if (!classId || !studentId || seenKeys.has(dedupeKey)) {
        return;
      }

      const examMeta = examMetaById.get(examId);
      const score = safeNumber(data.score);
      const totalQuestions = Math.max(1, safeNumber(data.max_score, 1));
      const percentage =
        typeof data.percentage === "number"
          ? Math.round(data.percentage)
          : Math.round((score / totalQuestions) * 100);
      const dateValue = toIsoDate(data.graded_at || data.createdAt || data.updatedAt);

      rows.push({
        id,
        source: "grade",
        studentId,
        studentName: studentNames.get(studentId) || studentId || "Unknown Student",
        examId,
        examLabel: examMeta?.title || "Untitled Exam",
        classId: examMeta?.classId || classId,
        classLabel:
          examMeta?.classLabel || classLabelById.get(classId) || "Unassigned Class",
        score,
        totalQuestions,
        percentage,
        dateValue,
        correctLabel: `${score}/${totalQuestions} correct`,
        sortValue: dateValue ? new Date(dateValue).getTime() : 0,
      });
    });

    rows.sort((a, b) => b.sortValue - a.sortValue);

    return {
      rows,
      classFilters: [
        "All Classes",
        ...Array.from(new Set(rows.map((row) => row.classLabel).filter(Boolean))),
      ],
    };
  }

  static async getExamResults(examId: string): Promise<UnifiedResultRow[]> {
    const payload = await ResultsService.getUnifiedResults();
    return payload.rows.filter((row) => row.examId === examId);
  }
}
