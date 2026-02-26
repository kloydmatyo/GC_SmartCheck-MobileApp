import { auth, db } from "@/config/firebase";
import { UserService } from "@/services/userService";
import {
    addDoc,
    collection,
    getDocs,
    query,
    serverTimestamp,
    where,
} from "firebase/firestore";

export interface AuditLog {
  id: string;
  examId: string;
  userId: string;
  userName: string;
  instructorId?: string; // Add instructor ID
  action:
    | "create"
    | "edit"
    | "delete"
    | "activate"
    | "complete"
    | "print"
    | "scan"
    | "status_change"; // Add status change action
  changes?: Record<string, { old: any; new: any }>;
  metadata?: Record<string, any>;
  timestamp: Date;
  version?: number;
  ipAddress?: string;
  deviceInfo?: string;
}

export class AuditLogService {
  /**
   * Log exam edit action
   */
  static async logExamEdit(
    examId: string,
    userId: string,
    changes: Record<string, { old: any; new: any }>,
    version: number,
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn("User not authenticated for audit logging");
        return;
      }

      // Get user profile for proper name and instructor ID
      let userName = "Unknown User";
      let instructorId = "INSTRUCTOR-000";

      try {
        const userProfile = await UserService.getUserProfile(userId);
        userName =
          userProfile?.fullName ||
          currentUser.displayName ||
          currentUser.email ||
          "Unknown User";
        instructorId = userProfile?.instructorId || "INSTRUCTOR-000";
      } catch {
        console.warn(
          "Could not fetch user profile for audit log, using fallback",
        );
        userName =
          currentUser.displayName || currentUser.email || "Unknown User";
      }

      // Sanitize changes to handle null/undefined values
      const sanitizedChanges: Record<string, { old: any; new: any }> = {};
      for (const [key, value] of Object.entries(changes)) {
        sanitizedChanges[key] = {
          old: value.old ?? null,
          new: value.new ?? null,
        };
      }

      // Create audit log entry
      await addDoc(collection(db, "audit_logs"), {
        examId,
        userId,
        userName,
        instructorId,
        action: "edit",
        changes: sanitizedChanges,
        version,
        timestamp: serverTimestamp(),
        deviceInfo: this.getDeviceInfo(),
      });

      console.log("✅ Audit log created for exam edit:", examId);
    } catch (error) {
      console.error("❌ Error creating audit log:", error);
      // Don't throw error - audit logging should not block the main operation
    }
  }

  /**
   * Log exam status change
   */
  static async logExamStatusChange(
    examId: string,
    userId: string,
    oldStatus: string,
    newStatus: string,
    version: number,
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn("User not authenticated for audit logging");
        return; // Don't throw error, just skip logging
      }

      // Get user profile for proper name and instructor ID
      let userName = "Unknown User";
      let instructorId = "INSTRUCTOR-000";

      try {
        const userProfile = await UserService.getUserProfile(userId);
        userName =
          userProfile?.fullName ||
          currentUser.displayName ||
          currentUser.email ||
          "Unknown User";
        instructorId = userProfile?.instructorId || "INSTRUCTOR-000";
      } catch {
        console.warn(
          "Could not fetch user profile for audit log, using fallback:",
        );
        userName =
          currentUser.displayName || currentUser.email || "Unknown User";
      }

      // Create audit log entry with retry logic
      const auditData = {
        examId,
        userId,
        userName,
        instructorId,
        action: "status_change" as const,
        changes: {
          status: { old: oldStatus, new: newStatus },
        },
        version,
        timestamp: serverTimestamp(),
        deviceInfo: this.getDeviceInfo(),
      };

      // Try to create audit log with retry
      let retries = 3;
      while (retries > 0) {
        try {
          await addDoc(collection(db, "audit_logs"), auditData);
          console.log(
            `✅ Audit log created for status change: ${oldStatus} → ${newStatus}`,
          );
          return; // Success, exit
        } catch (error: any) {
          retries--;
          console.warn(
            `⚠️ Audit log attempt failed (${3 - retries}/3):`,
            error.message,
          );

          if (retries === 0) {
            // Last attempt failed, log error but don't throw
            console.error(
              "❌ Failed to create audit log after 3 attempts:",
              error,
            );
            return; // Don't throw error
          }

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error("❌ Error in audit logging system:", error);
      // Don't throw error - audit logging should not block the main operation
    }
  }
  static async logExamCreate(
    examId: string,
    userId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Get user profile for proper name and instructor ID
      const userProfile = await UserService.getUserProfile(userId);
      const userName =
        userProfile?.fullName ||
        currentUser.displayName ||
        currentUser.email ||
        "Unknown User";
      const instructorId = userProfile?.instructorId || "INSTRUCTOR-000";

      await addDoc(collection(db, "audit_logs"), {
        examId,
        userId,
        userName,
        instructorId, // Add instructor ID
        action: "create",
        metadata,
        timestamp: serverTimestamp(),
        deviceInfo: this.getDeviceInfo(),
      });

      console.log("Audit log created for exam creation:", examId);
    } catch (error) {
      console.error("Error creating audit log:", error);
    }
  }

  /**
   * Log exam activation
   */
  static async logExamActivate(examId: string, userId: string): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const userName =
        currentUser.displayName || currentUser.email || "Unknown User";

      await addDoc(collection(db, "audit_logs"), {
        examId,
        userId,
        userName,
        action: "activate",
        timestamp: serverTimestamp(),
        deviceInfo: this.getDeviceInfo(),
      });

      console.log("Audit log created for exam activation:", examId);
    } catch (error) {
      console.error("Error creating audit log:", error);
    }
  }

  /**
   * Log exam deletion
   */
  static async logExamDelete(
    examId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const userName =
        currentUser.displayName || currentUser.email || "Unknown User";

      await addDoc(collection(db, "audit_logs"), {
        examId,
        userId,
        userName,
        action: "delete",
        metadata: { reason },
        timestamp: serverTimestamp(),
        deviceInfo: this.getDeviceInfo(),
      });

      console.log("Audit log created for exam deletion:", examId);
    } catch (error) {
      console.error("Error creating audit log:", error);
    }
  }

  /**
   * Get audit logs for an exam
   */
  static async getExamAuditLogs(examId: string): Promise<AuditLog[]> {
    try {
      const q = query(
        collection(db, "audit_logs"),
        where("examId", "==", examId),
      );
      const querySnapshot = await getDocs(q);

      const logs: AuditLog[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        logs.push({
          id: doc.id,
          examId: data.examId,
          userId: data.userId,
          userName: data.userName,
          action: data.action,
          changes: data.changes,
          metadata: data.metadata,
          timestamp: data.timestamp?.toDate() || new Date(),
          version: data.version,
          ipAddress: data.ipAddress,
          deviceInfo: data.deviceInfo,
        });
      });

      // Sort by timestamp descending
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return logs;
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      return [];
    }
  }

  /**
   * Get device information
   */
  private static getDeviceInfo(): string {
    // In a real app, you would get actual device info
    // For now, return a placeholder
    return "Mobile App";
  }

  /**
   * Format audit log for display
   */
  static formatAuditLog(log: AuditLog): string {
    const timestamp = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(log.timestamp);

    let message = `${log.userName} ${log.action}d the exam`;

    if (log.changes && Object.keys(log.changes).length > 0) {
      const changesList = Object.entries(log.changes)
        .map(
          ([field, { old, new: newVal }]) => `${field}: "${old}" → "${newVal}"`,
        )
        .join(", ");
      message += ` (${changesList})`;
    }

    if (log.version) {
      message += ` [v${log.version}]`;
    }

    return `${timestamp} - ${message}`;
  }
}
