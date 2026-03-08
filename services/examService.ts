import { auth, db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ExamPreviewData } from "../types/exam";
import { AuditLogService } from "./auditLogService";

export class ExamService {
  private static isNetworkRelatedError(error: any): boolean {
    const text = [
      error?.message ?? "",
      error?.code ?? "",
      error?.name ?? "",
      String(error ?? ""),
    ]
      .join(" ")
      .toLowerCase();

    return (
      text.includes("network") ||
      text.includes("offline") ||
      text.includes("unavailable") ||
      text.includes("deadline-exceeded") ||
      text.includes("loadbundlefromserverrequesterror") ||
      text.includes("could not load bundle")
    );
  }

  /**
   * Fetch exam configuration by ID from Firebase
   */
  static async getExamById(examId: string): Promise<ExamPreviewData | null> {
    try {
      console.log("[ExamService] ===== FETCHING EXAM =====");
      console.log("[ExamService] Exam ID:", examId);

      // Fetch exam metadata
      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        console.log("[ExamService] Exam document not found");
        return null;
      }

      const examData = examSnap.data();
      console.log("[ExamService] Exam document found");
      console.log("[ExamService] Exam title:", examData.title);
      console.log("[ExamService] Exam num_items:", examData.num_items);
      console.log(
        "[ExamService] Exam createdAt:",
        examData.createdAt?.toMillis(),
      );
      console.log("[ExamService] Exam examId field:", examData.examId);
      console.log("[ExamService] Exam document ID:", examSnap.id);

      // Fetch answer key - prefer the most recently updated answer key for this exam
      let answerKeyData = null;
      let answerKeyId = null;
      const { collection, query, where, getDocs } = await import(
        "firebase/firestore"
      );
      const answerKeysQuery = query(
        collection(db, "answerKeys"),
        where("examId", "==", examId),
      );
      const answerKeysSnapshot = await getDocs(answerKeysQuery);

      if (!answerKeysSnapshot.empty) {
        let selected = answerKeysSnapshot.docs[0];
        let selectedScore =
          Number(selected.data().updatedAt?.toMillis?.() ?? 0) * 1_000_000 +
          Number(selected.data().version ?? 1);

        answerKeysSnapshot.docs.slice(1).forEach((candidate) => {
          const data = candidate.data();
          const score =
            Number(data.updatedAt?.toMillis?.() ?? 0) * 1_000_000 +
            Number(data.version ?? 1);
          if (score > selectedScore) {
            selected = candidate;
            selectedScore = score;
          }
        });

        answerKeyData = selected.data();
        answerKeyId = selected.id;
        console.log("[ExamService] Found latest answer key via query:", answerKeyId);
      } else {
        // Strategy 2: Query for answer key by examId
        console.log(
          "[ExamService] Timestamp-based ID not found, querying by examId:",
          examId,
        );
        const { collection, query, where, getDocs } =
          await import("firebase/firestore");
        const answerKeysQuery = query(
          collection(db, "answerKeys"),
          where("examId", "==", examId),
        );
        const answerKeysSnapshot = await getDocs(answerKeysQuery);

        console.log(
          "[ExamService] Query returned",
          answerKeysSnapshot.size,
          "documents",
        );

        if (!answerKeysSnapshot.empty) {
          const firstDoc = answerKeysSnapshot.docs[0];
          answerKeyData = firstDoc.data();
          answerKeyId = firstDoc.id;
          console.log("[ExamService] Found answer key via query:", answerKeyId);
          console.log("[ExamService] Answer key examId:", answerKeyData.examId);
          console.log(
            "[ExamService] Answer key has questionSettings:",
            !!answerKeyData.questionSettings,
          );
          if (answerKeyData.questionSettings) {
            console.log(
              "[ExamService] questionSettings length:",
              answerKeyData.questionSettings.length,
            );
            console.log(
              "[ExamService] First 3 answers:",
              answerKeyData.questionSettings.slice(0, 3).map((qs: any) => ({
                q: qs.questionNumber,
                a: qs.correctAnswer,
              })),
            );
          }
        } else {
          console.log("[ExamService] No answer key found for exam:", examId);
          console.log("[ExamService] Tried timestamp ID:", timestampBasedId);

          // Strategy 3: Try to find by ID pattern (for web app compatibility)
          console.log("[ExamService] Trying Strategy 3: Search by ID pattern");
          const allAnswerKeysSnapshot = await getDocs(
            collection(db, "answerKeys"),
          );

          console.log(
            "[ExamService] Total answer keys in collection:",
            allAnswerKeysSnapshot.size,
          );

          // Look for answer keys that start with our exam ID
          for (const docSnap of allAnswerKeysSnapshot.docs) {
            if (docSnap.id.startsWith(`ak_${examId}`)) {
              answerKeyData = docSnap.data();
              answerKeyId = docSnap.id;
              console.log(
                "[ExamService] Found answer key by ID pattern:",
                answerKeyId,
              );
              break;
            }
          }

          if (!answerKeyData) {
            console.log(
              "[ExamService] Strategy 3 failed - no matching answer key found",
            );
          }
        }
      }

      // Determine choice format
      const choiceFormat = examData.choices_per_item === 5 ? "A-E" : "A-D";
      const totalQuestions =
        answerKeyData?.questionSettings?.length ||
        answerKeyData?.answers?.length ||
        examData.num_items ||
        20;

      // Extract answers - support both mobile and web formats
      const extractedAnswers: string[] = [];

      if (answerKeyData?.questionSettings) {
        // Mobile app format: questionSettings array
        console.log(
          "[ExamService] Using mobile format (questionSettings):",
          answerKeyData.questionSettings.length,
        );
        for (let i = 0; i < totalQuestions; i++) {
          const setting = answerKeyData.questionSettings.find(
            (qs: any) => qs.questionNumber === i + 1,
          );
          const answer = setting?.correctAnswer || "";
          extractedAnswers.push(answer);
          if (i < 5) {
            console.log(`[ExamService] Q${i + 1}: ${answer}`);
          }
        }
        console.log(
          "[ExamService] Total answers extracted:",
          extractedAnswers.filter((a) => a).length,
        );
      } else if (
        answerKeyData?.answers &&
        Array.isArray(answerKeyData.answers)
      ) {
        // Web app format: answers array
        console.log(
          "[ExamService] Using web format (answers array):",
          answerKeyData.answers.length,
        );
        for (let i = 0; i < totalQuestions; i++) {
          const answer = answerKeyData.answers[i] || "";
          extractedAnswers.push(answer);
          if (i < 5) {
            console.log(`[ExamService] Q${i + 1}: ${answer}`);
          }
        }
        console.log(
          "[ExamService] Total answers extracted:",
          extractedAnswers.filter((a) => a).length,
        );
      } else {
        // No answers found - use empty array
        console.log(
          "[ExamService] No questionSettings or answers array found, using empty answers",
        );
        for (let i = 0; i < totalQuestions; i++) {
          extractedAnswers.push("");
        }
      }

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
              id: answerKeyId || "",
              examId: examData.examId || examSnap.id,
              answers: extractedAnswers, // Use extracted answers
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
              answers: extractedAnswers, // Use extracted answers (empty)
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
        if (this.isNetworkRelatedError(updateError)) {
          throw new Error(
            "Network error: Unable to save changes. Please check your internet connection.",
          );
        }
        throw updateError;
      }
    } catch (error: any) {
      console.error("Error updating exam:", error);

      // Re-throw with more context
      if (this.isNetworkRelatedError(error)) {
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
        if (this.isNetworkRelatedError(updateError)) {
          throw new Error(
            "Network error: Unable to save changes. Please check your internet connection.",
          );
        }
        throw updateError;
      }
    } catch (error: any) {
      console.error("Error updating exam:", error);

      // Re-throw with more context
      if (this.isNetworkRelatedError(error)) {
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
