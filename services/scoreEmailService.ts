/**
 * Score Email Service
 * Handles composing and sending score emails to students via native mail composer.
 */

import { StudentExtended } from "@/types/student";
import * as MailComposer from "expo-mail-composer";
import { ResultsService, UnifiedResultRow } from "./resultsService";
import { StudentDatabaseService } from "./studentDatabaseService";

export interface StudentScoreEntry {
  student: StudentExtended;
  result: UnifiedResultRow;
}

export interface SendScoresResult {
  status: "sent" | "saved" | "cancelled" | "unavailable" | "error";
  message: string;
}

export class ScoreEmailService {
  /**
   * Fetch exam results merged with student email data for a given exam.
   * Only returns students that have a matching result row.
   */
  static async getStudentsWithScores(
    examId: string,
  ): Promise<StudentScoreEntry[]> {
    const rows = await ResultsService.getExamResults(examId);
    await StudentDatabaseService.initializeDatabase();

    const entries: StudentScoreEntry[] = [];

    for (const row of rows) {
      const student = await StudentDatabaseService.getStudentById(
        row.studentId,
      );

      // Fall back to a minimal student built from the result row so roster-only
      // students (not in StudentCache) still appear in the send list.
      const resolved: StudentExtended = student ?? {
        student_id: row.studentId,
        first_name: row.studentName || row.studentId,
        last_name: "",
        is_active: true,
        email: undefined,
      };

      entries.push({ student: resolved, result: row });
    }

    return entries;
  }

  /**
   * Check if the device mail composer is available.
   */
  static async isAvailable(): Promise<boolean> {
    return MailComposer.isAvailableAsync();
  }

  /**
   * Send score emails to the selected students.
   * Opens the native mail composer pre-filled with all recipients and scores.
   */
  static async sendScores(
    entries: StudentScoreEntry[],
    examLabel: string,
  ): Promise<SendScoresResult> {
    const available = await this.isAvailable();
    if (!available) {
      return {
        status: "unavailable",
        message:
          "No mail app is configured on this device. Please set up an email account first.",
      };
    }

    const recipients = entries
      .map((e) => e.student.email)
      .filter((email): email is string => !!email);

    if (recipients.length === 0) {
      return {
        status: "error",
        message: "None of the selected students have an email address on file.",
      };
    }

    const body = this.buildEmailBody(entries, examLabel);

    try {
      const result = await MailComposer.composeAsync({
        recipients,
        subject: `Your Score — ${examLabel}`,
        body,
        isHtml: false,
      });

      switch (result.status) {
        case MailComposer.MailComposerStatus.SENT:
          return { status: "sent", message: "Scores sent successfully." };
        case MailComposer.MailComposerStatus.SAVED:
          return { status: "saved", message: "Email saved as draft." };
        case MailComposer.MailComposerStatus.CANCELLED:
          return { status: "cancelled", message: "Email cancelled." };
        default:
          return { status: "error", message: "Unknown mail composer result." };
      }
    } catch (err: any) {
      return {
        status: "error",
        message: err?.message ?? "Failed to open mail composer.",
      };
    }
  }

  private static buildEmailBody(
    entries: StudentScoreEntry[],
    examLabel: string,
  ): string {
    const lines: string[] = [
      `Exam: ${examLabel}`,
      `Date: ${new Date().toLocaleDateString()}`,
      "",
      "Score Summary:",
      "──────────────────────────────",
    ];

    for (const { student, result } of entries) {
      const name = `${student.first_name} ${student.last_name}`;
      lines.push(
        `${name} (${student.student_id})`,
        `  Score: ${result.score} / ${result.totalQuestions}  (${result.percentage}%)`,
        `  ${result.percentage >= 60 ? "PASSED" : "FAILED"}`,
        "",
      );
    }

    lines.push("──────────────────────────────");
    lines.push("This message was sent via GC SmartCheck.");

    return lines.join("\n");
  }
}
