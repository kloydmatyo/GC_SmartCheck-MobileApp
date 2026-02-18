import { auth, db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ExamPreviewData } from "../types/exam";

export class ExamService {
  /**
   * Fetch exam configuration by ID from Firebase
   */
  static async getExamById(examId: string): Promise<ExamPreviewData | null> {
    try {
      // Fetch exam metadata
      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        return null;
      }

      const examData = examSnap.data();

      // Fetch answer key
      const answerKeyId = `ak_${examId}_${examData.createdAt?.toMillis() || Date.now()}`;
      const answerKeyRef = doc(db, "answer_keys", answerKeyId);
      const answerKeySnap = await getDoc(answerKeyRef);

      let answerKeyData = null;
      if (answerKeySnap.exists()) {
        answerKeyData = answerKeySnap.data();
      }

      // Determine choice format
      const choiceFormat = examData.choice_per_items === 5 ? "A-E" : "A-D";
      const totalQuestions =
        answerKeyData?.answers?.length || examData.num_items || 20;

      // Transform to ExamPreviewData format
      return {
        metadata: {
          examId: examSnap.id,
          title: examData.title || "Untitled Exam",
          subject: examData.course_subject,
          section: examData.section_block,
          date: examData.created_at,
          examCode: examData.room || examData.exam_code || "N/A",
          status: examData.status || "Draft",
          createdAt: examData.createdAt?.toDate() || new Date(),
          updatedAt: examData.updatedAt?.toDate() || new Date(),
          createdBy: examData.createdBy || "",
          version: examData.version || 1,
        },
        answerKey: answerKeyData
          ? {
              id: answerKeySnap.id,
              examId: examData.examId || examSnap.id,
              answers: answerKeyData.answers || [],
              questionSettings: answerKeyData.questionSettings || [],
              locked: answerKeyData.locked || false,
              createdAt: answerKeyData.createdAt?.toDate() || new Date(),
              updatedAt: answerKeyData.updatedAt?.toDate() || new Date(),
              createdBy: answerKeyData.createdBy || "",
              version: answerKeyData.version || 1,
            }
          : {
              id: "",
              examId: examSnap.id,
              answers: [],
              questionSettings: [],
              locked: false,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: "",
              version: 1,
            },
        templateLayout: {
          name: "Standard Template",
          totalQuestions: totalQuestions,
          choiceFormat: choiceFormat,
          columns: 2,
          questionsPerColumn: Math.ceil(totalQuestions / 2),
        },
        totalQuestions: totalQuestions,
        choiceFormat: choiceFormat,
        lastModified:
          examData.updatedAt?.toDate() ||
          examData.createdAt?.toDate() ||
          new Date(),
      };
    } catch (error) {
      console.error("Error fetching exam:", error);
      return null;
    }
  }

  /**
   * Check if user is authorized to view exam
   */
  static async isAuthorized(userId: string, examId: string): Promise<boolean> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return false;
      }

      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        return false;
      }

      const examData = examSnap.data();
      return examData.createdBy === currentUser.uid;
    } catch (error) {
      console.error("Error checking authorization:", error);
      return false;
    }
  }

  /**
   * Format date for display
   */
  static formatDate(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  /**
   * Get status color
   */
  static getStatusColor(status: string): string {
    switch (status) {
      case "Draft":
        return "#9e9e9e";
      case "Scheduled":
        return "#ff9800";
      case "Active":
        return "#00a550";
      case "Completed":
        return "#4a90e2";
      default:
        return "#666";
    }
  }
}
