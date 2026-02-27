import { auth, db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ExamPreviewData } from "../types/exam";
import { AuditLogService } from "./auditLogService";

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
      const answerKeyRef = doc(db, "answerKeys", answerKeyId);
      const answerKeySnap = await getDoc(answerKeyRef);

      let answerKeyData = null;
      if (answerKeySnap.exists()) {
        answerKeyData = answerKeySnap.data();
      }

      // Determine choice format
      const choiceFormat = examData.choices_per_item === 5 ? "A-E" : "A-D";
      const totalQuestions =
        answerKeyData?.answers?.length || examData.num_items || 20;

      // Transform to ExamPreviewData format
      return {
        metadata: {
          examId: examSnap.id,
          title: examData.title || "Untitled Exam",
          subject: examData.subject,
          section: examData.section,
          date: examData.created_at,
          examCode: examData.examCode || examData.room || "N/A",
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

  /**
   * Update exam metadata with version conflict checking
   */
  static async updateExamWithVersionCheck(
    examId: string,
    updateData: {
      title?: string;
      subject?: string | null;
      section?: string | null;
      date?: string | null;
    },
    expectedVersion: number,
  ): Promise<number> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        throw new Error("Exam not found");
      }

      const examData = examSnap.data();

      // Check if user is authorized
      if (examData.createdBy !== currentUser.uid) {
        throw new Error("Not authorized to update this exam");
      }

      // Check if exam is in Draft status
      if (examData.status !== "Draft") {
        throw new Error("Only Draft exams can be edited");
      }

      // Check for version conflicts (optimistic locking)
      const currentVersion = examData.version || 1;

      if (currentVersion !== expectedVersion) {
        throw new Error(
          `Version conflict detected: Expected version ${expectedVersion}, but current version is ${currentVersion}. The exam was modified by another user.`,
        );
      }

      // Prepare update
      const { updateDoc, serverTimestamp } = await import("firebase/firestore");
      const newVersion = currentVersion + 1;

      try {
        await updateDoc(examRef, {
          ...updateData,
          version: newVersion,
          updatedAt: serverTimestamp(),
        });

        return newVersion;
      } catch (updateError: any) {
        // Handle network errors specifically
        if (
          updateError.code === "unavailable" ||
          updateError.message?.includes("network") ||
          updateError.message?.includes("offline")
        ) {
          throw new Error(
            "Network error: Unable to save changes. Please check your internet connection.",
          );
        }
        throw updateError;
      }
    } catch (error: any) {
      console.error("Error updating exam:", error);

      // Re-throw with more context
      if (
        error.message?.includes("network") ||
        error.message?.includes("offline") ||
        error.code === "unavailable"
      ) {
        throw new Error("Network error: " + error.message);
      }

      throw error;
    }
  }

  /**
   * Update exam metadata (legacy method - use updateExamWithVersionCheck for conflict detection)
   */
  static async updateExam(
    examId: string,
    updateData: {
      title?: string;
      subject?: string | null;
      section?: string | null;
      date?: string | null;
    },
  ): Promise<number> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        throw new Error("Exam not found");
      }

      const examData = examSnap.data();

      // Check if user is authorized
      if (examData.createdBy !== currentUser.uid) {
        throw new Error("Not authorized to update this exam");
      }

      // Check if exam is in Draft status
      if (examData.status !== "Draft") {
        throw new Error("Only Draft exams can be edited");
      }

      // Check for version conflicts (optimistic locking)
      const currentVersion = examData.version || 1;

      // Prepare update
      const { updateDoc, serverTimestamp } = await import("firebase/firestore");
      const newVersion = currentVersion + 1;

      try {
        await updateDoc(examRef, {
          ...updateData,
          version: newVersion,
          updatedAt: serverTimestamp(),
        });

        return newVersion;
      } catch (updateError: any) {
        // Handle network errors specifically
        if (
          updateError.code === "unavailable" ||
          updateError.message?.includes("network") ||
          updateError.message?.includes("offline")
        ) {
          throw new Error(
            "Network error: Unable to save changes. Please check your internet connection.",
          );
        }
        throw updateError;
      }
    } catch (error: any) {
      console.error("Error updating exam:", error);

      // Re-throw with more context
      if (
        error.message?.includes("network") ||
        error.message?.includes("offline") ||
        error.code === "unavailable"
      ) {
        throw new Error("Network error: " + error.message);
      }

      throw error;
    }
  }

  /**
   * Check if exam has active scan session
   */
  static async hasActiveScanSession(examId: string): Promise<boolean> {
    try {
      const { collection, query, where, getDocs } =
        await import("firebase/firestore");

      const q = query(
        collection(db, "scanSessions"),
        where("examId", "==", examId),
        where("status", "==", "active"),
      );

      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Error checking scan sessions:", error);
      // Return false if collection doesn't exist or no permissions
      // This allows the edit functionality to continue working
      return false;
    }
  }

  /**
   * Update exam status
   */
  static async updateExamStatus(
    examId: string,
    newStatus: "Draft" | "Scheduled" | "Active" | "Completed",
    scheduleDate?: Date,
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        throw new Error("Exam not found");
      }

      const examData = examSnap.data();

      // Check if user is authorized
      if (examData.createdBy !== currentUser.uid) {
        throw new Error("Not authorized to update this exam");
      }

      // Validate status transitions
      const currentStatus = examData.status || "Draft";
      if (!this.isValidStatusTransition(currentStatus, newStatus)) {
        throw new Error(
          `Cannot change status from ${currentStatus} to ${newStatus}`,
        );
      }

      // Prepare update data
      const { updateDoc, serverTimestamp } = await import("firebase/firestore");
      const updateData: any = {
        status: newStatus,
        updatedAt: serverTimestamp(),
        version: (examData.version || 1) + 1,
      };

      // Add schedule date if provided
      if (scheduleDate && newStatus === "Scheduled") {
        updateData.scheduledDate = scheduleDate.toISOString();
      }

      // Add activation timestamp for Active status
      if (newStatus === "Active") {
        updateData.activatedAt = serverTimestamp();
      }

      // Add completion timestamp for Completed status
      if (newStatus === "Completed") {
        updateData.completedAt = serverTimestamp();
      }

      await updateDoc(examRef, updateData);

      // Log the status change
      await AuditLogService.logExamStatusChange(
        examId,
        currentUser.uid,
        currentStatus,
        newStatus,
        updateData.version,
      );

      console.log(`Exam status updated from ${currentStatus} to ${newStatus}`);
    } catch (error) {
      console.error("Error updating exam status:", error);
      throw error;
    }
  }

  /**
   * Check if status transition is valid
   */
  static isValidStatusTransition(
    currentStatus: string,
    newStatus: string,
  ): boolean {
    const validTransitions: Record<string, string[]> = {
      Draft: ["Scheduled", "Active"],
      Scheduled: ["Active", "Draft"],
      Active: ["Completed"],
      Completed: [], // No transitions from completed
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * Get available status transitions for current status
   */
  static getAvailableStatusTransitions(
    currentStatus: string,
  ): { status: string; label: string; color: string }[] {
    const transitions: Record<
      string,
      { status: string; label: string; color: string }[]
    > = {
      Draft: [
        { status: "Scheduled", label: "Schedule Exam", color: "#ff9800" },
        { status: "Active", label: "Activate Now", color: "#00a550" },
      ],
      Scheduled: [
        { status: "Active", label: "Activate Now", color: "#00a550" },
        { status: "Draft", label: "Back to Draft", color: "#9e9e9e" },
      ],
      Active: [
        { status: "Completed", label: "Complete Exam", color: "#4a90e2" },
      ],
      Completed: [], // No transitions from completed
    };

    return transitions[currentStatus] || [];
  }

  /**
   * Check if exam has been printed
   */
  static async hasBeenPrinted(examId: string): Promise<boolean> {
    try {
      const { collection, query, where, getDocs } =
        await import("firebase/firestore");

      const q = query(
        collection(db, "printJobs"),
        where("examId", "==", examId),
        where("status", "==", "completed"),
      );

      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Error checking print jobs:", error);
      // Return false if collection doesn't exist or no permissions
      // This allows the edit functionality to continue working
      return false;
    }
  }
}
