import { auth, db } from "@/config/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import {
  BatchDuplicateWarning,
  BatchHistoryFilter,
  BatchVersionMismatch,
  ExamBatch,
} from "../types/batch";
import { AuditLogService } from "./auditLogService";

export class BatchHistoryService {
  /**
   * Generate unique batch ID
   */
  static generateBatchId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `BATCH_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * Create new batch record
   */
  static async createBatch(
    examId: string,
    examTitle: string,
    examCode: string,
    templateName: string,
    version: "A" | "B" | "C" | "D",
    sheetsGenerated: number,
    templateVersion: number,
    metadata?: {
      totalQuestions: number;
      columns: number;
      studentIdLength: number;
    },
  ): Promise<string> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const batchId = this.generateBatchId();

      const batchData = {
        batchId,
        examId,
        examTitle,
        examCode,
        templateName,
        version,
        sheetsGenerated,
        createdAt: serverTimestamp(),
        clientCreatedAt: Date.now(),
        createdBy: currentUser.uid,
        status: "generated",
        templateVersion,
        metadata: metadata || null,
      };

      await addDoc(collection(db, "examBatches"), batchData);

      // Log batch creation
      await AuditLogService.logBatchCreation(
        batchId,
        examId,
        currentUser.uid,
        sheetsGenerated,
      );

      return batchId;
    } catch (error) {
      console.error("Error creating batch:", error);
      throw error;
    }
  }

  /**
   * Get batch history with optional filters
   */
  static async getBatchHistory(
    filter?: BatchHistoryFilter,
  ): Promise<ExamBatch[]> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Simple query without orderBy to avoid index requirement
      // We'll sort client-side instead
      let q = query(
        collection(db, "examBatches"),
        where("createdBy", "==", currentUser.uid),
      );

      const querySnapshot = await getDocs(q);
      const batches: ExamBatch[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        batches.push({
          batchId: data.batchId,
          examId: data.examId,
          examTitle: data.examTitle,
          examCode: data.examCode,
          templateName: data.templateName,
          version: data.version,
          sheetsGenerated: data.sheetsGenerated,
          createdAt:
            data.createdAt?.toDate?.() ||
            (data.clientCreatedAt
              ? new Date(data.clientCreatedAt)
              : new Date()),
          createdBy: data.createdBy,
          status: data.status,
          templateVersion: data.templateVersion,
          metadata: data.metadata,
        });
      });

      // Sort by createdAt descending (client-side)
      batches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Apply client-side filters
      let filteredBatches = batches;

      // Filter by examId
      if (filter?.examId) {
        filteredBatches = filteredBatches.filter(
          (batch) => batch.examId === filter.examId,
        );
      }

      // Filter by status
      if (filter?.status) {
        filteredBatches = filteredBatches.filter(
          (batch) => batch.status === filter.status,
        );
      }

      if (filter?.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        filteredBatches = filteredBatches.filter(
          (batch) =>
            batch.examTitle.toLowerCase().includes(query) ||
            batch.examCode.toLowerCase().includes(query) ||
            batch.batchId.toLowerCase().includes(query),
        );
      }

      if (filter?.startDate) {
        filteredBatches = filteredBatches.filter(
          (batch) => batch.createdAt >= filter.startDate!,
        );
      }

      if (filter?.endDate) {
        filteredBatches = filteredBatches.filter(
          (batch) => batch.createdAt <= filter.endDate!,
        );
      }

      return filteredBatches;
    } catch (error) {
      console.error("Error fetching batch history:", error);
      throw error;
    }
  }

  /**
   * Check for duplicate batch generation
   */
  static async checkDuplicateBatch(
    examId: string,
    version: "A" | "B" | "C" | "D",
    timeWindowMinutes: number = 5,
  ): Promise<BatchDuplicateWarning> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { isDuplicate: false };
      }

      const recentTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

      // Simplified query without complex indexes
      const q = query(
        collection(db, "examBatches"),
        where("createdBy", "==", currentUser.uid),
      );

      const querySnapshot = await getDocs(q);

      // Filter client-side to avoid index requirements
      const matchingBatches = querySnapshot.docs
        .map((doc) => doc.data())
        .filter(
          (data) =>
            data.examId === examId &&
            data.version === version &&
            data.status !== "deleted",
        )
        .sort((a, b) => {
          const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
          const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
          return timeB - timeA;
        });

      if (matchingBatches.length > 0) {
        const latestBatch = matchingBatches[0];
        const batchTime = latestBatch.createdAt?.toDate() || new Date(0);

        if (batchTime >= recentTime) {
          return {
            isDuplicate: true,
            existingBatch: {
              batchId: latestBatch.batchId,
              examId: latestBatch.examId,
              examTitle: latestBatch.examTitle,
              examCode: latestBatch.examCode,
              templateName: latestBatch.templateName,
              version: latestBatch.version,
              sheetsGenerated: latestBatch.sheetsGenerated,
              createdAt: batchTime,
              createdBy: latestBatch.createdBy,
              status: latestBatch.status,
              templateVersion: latestBatch.templateVersion,
              metadata: latestBatch.metadata,
            },
            message: `A batch was generated ${Math.round((Date.now() - batchTime.getTime()) / 60000)} minutes ago. Generate again?`,
          };
        }
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error("Error checking duplicate batch:", error);
      return { isDuplicate: false };
    }
  }

  /**
   * Check for version mismatch
   */
  static async checkVersionMismatch(
    examId: string,
    currentVersion: number,
  ): Promise<BatchVersionMismatch> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { hasMismatch: false, currentVersion, batchVersion: 0 };
      }

      // Simplified query without complex indexes
      const q = query(
        collection(db, "examBatches"),
        where("createdBy", "==", currentUser.uid),
      );

      const querySnapshot = await getDocs(q);

      // Filter client-side to avoid index requirements
      const matchingBatches = querySnapshot.docs
        .map((doc) => doc.data())
        .filter((data) => data.examId === examId && data.status !== "deleted")
        .sort((a, b) => {
          const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
          const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
          return timeB - timeA;
        });

      if (matchingBatches.length > 0) {
        const latestBatch = matchingBatches[0];
        const batchVersion = latestBatch.templateVersion || 1;

        if (batchVersion !== currentVersion) {
          return {
            hasMismatch: true,
            currentVersion,
            batchVersion,
            message: `Template version mismatch! Current: v${currentVersion}, Last batch: v${batchVersion}`,
          };
        }
      }

      return {
        hasMismatch: false,
        currentVersion,
        batchVersion: currentVersion,
      };
    } catch (error) {
      console.error("Error checking version mismatch:", error);
      return { hasMismatch: false, currentVersion, batchVersion: 0 };
    }
  }

  /**
   * Update batch status
   */
  static async updateBatchStatus(
    batchId: string,
    status: "generated" | "printed" | "deleted",
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const q = query(
        collection(db, "examBatches"),
        where("batchId", "==", batchId),
        where("createdBy", "==", currentUser.uid),
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error("Batch not found");
      }

      const batchDoc = querySnapshot.docs[0];
      await updateDoc(doc(db, "examBatches", batchDoc.id), {
        status,
        updatedAt: serverTimestamp(),
      });

      // Log status change
      await AuditLogService.logBatchStatusChange(
        batchId,
        currentUser.uid,
        batchDoc.data().status,
        status,
      );
    } catch (error) {
      console.error("Error updating batch status:", error);
      throw error;
    }
  }

  /**
   * Delete batch (soft delete - marks as deleted)
   */
  static async deleteBatch(batchId: string): Promise<void> {
    try {
      await this.updateBatchStatus(batchId, "deleted");
    } catch (error) {
      console.error("Error deleting batch:", error);
      throw error;
    }
  }

  /**
   * Get batch by ID
   */
  static async getBatchById(batchId: string): Promise<ExamBatch | null> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const q = query(
        collection(db, "examBatches"),
        where("batchId", "==", batchId),
        where("createdBy", "==", currentUser.uid),
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return null;
      }

      const data = querySnapshot.docs[0].data();
      return {
        batchId: data.batchId,
        examId: data.examId,
        examTitle: data.examTitle,
        examCode: data.examCode,
        templateName: data.templateName,
        version: data.version,
        sheetsGenerated: data.sheetsGenerated,
        createdAt: data.createdAt?.toDate() || new Date(),
        createdBy: data.createdBy,
        status: data.status,
        templateVersion: data.templateVersion,
        metadata: data.metadata,
      };
    } catch (error) {
      console.error("Error fetching batch:", error);
      return null;
    }
  }

  /**
   * Format date for display
   */
  static formatDate(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  /**
   * Get batch statistics
   */
  static async getBatchStatistics(examId?: string): Promise<{
    totalBatches: number;
    totalSheets: number;
    generatedBatches: number;
    printedBatches: number;
    deletedBatches: number;
  }> {
    try {
      const batches = await this.getBatchHistory(
        examId ? { examId } : undefined,
      );

      return {
        totalBatches: batches.filter((b) => b.status !== "deleted").length,
        totalSheets: batches
          .filter((b) => b.status !== "deleted")
          .reduce((sum, b) => sum + b.sheetsGenerated, 0),
        generatedBatches: batches.filter((b) => b.status === "generated")
          .length,
        printedBatches: batches.filter((b) => b.status === "printed").length,
        deletedBatches: batches.filter((b) => b.status === "deleted").length,
      };
    } catch (error) {
      console.error("Error fetching batch statistics:", error);
      return {
        totalBatches: 0,
        totalSheets: 0,
        generatedBatches: 0,
        printedBatches: 0,
        deletedBatches: 0,
      };
    }
  }
}
