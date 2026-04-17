/**
 * Score Email Service
 *
 * Sends score emails via the EmailJS REST API directly (no browser SDK).
 * The @emailjs/browser package uses browser globals that break in React Native,
 * so we call the API with fetch instead.
 */

import { StudentExtended } from "@/types/student";
import { ResultsService, UnifiedResultRow } from "./resultsService";
import { StudentDatabaseService } from "./studentDatabaseService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentScoreEntry {
  student: StudentExtended;
  result: UnifiedResultRow;
}

export interface SendScoresResult {
  status: "sent" | "partial" | "error";
  message: string;
  sent?: number;
  failed?: number;
}

// ─── EmailJS config ───────────────────────────────────────────────────────────

const SERVICE_ID  = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID  || "";
const TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID || "";
const PUBLIC_KEY  = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY  || "";
const PRIVATE_KEY = process.env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY || "";

if (__DEV__) {
  console.log("[EmailJS] SERVICE_ID:", SERVICE_ID || "MISSING");
  console.log("[EmailJS] TEMPLATE_ID:", TEMPLATE_ID || "MISSING");
  console.log("[EmailJS] PUBLIC_KEY:", PUBLIC_KEY ? "SET" : "MISSING");
  console.log("[EmailJS] PRIVATE_KEY:", PRIVATE_KEY ? "SET" : "NOT SET");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveGrade(percentage: number): string {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B+";
  if (percentage >= 75) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

const CONCURRENCY = 3;
const RETRY_DELAY_MS = 2_000;
const MAX_RETRIES = 2;

async function sendOneViaApi(
  params: Record<string, string>,
  attempt = 1,
): Promise<{ success: boolean; error?: string }> {
  try {
    const body = JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      accessToken: PRIVATE_KEY,
      template_params: params,
    });

    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[EmailJS] attempt ${attempt} failed:`, msg);
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return sendOneViaApi(params, attempt + 1);
    }
    return { success: false, error: msg };
  }
}

async function processQueue(
  allParams: Record<string, string>[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const queue = [...allParams];

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.all(batch.map((p) => sendOneViaApi(p)));
    for (const r of results) {
      r.success ? sent++ : failed++;
    }
  }

  return { sent, failed };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ScoreEmailService {
  static async getStudentsWithScores(
    examId: string,
  ): Promise<StudentScoreEntry[]> {
    const rows = await ResultsService.getExamResults(examId);
    await StudentDatabaseService.initializeDatabase();

    const entries: StudentScoreEntry[] = [];

    for (const row of rows) {
      const student = await StudentDatabaseService.getStudentById(row.studentId);

      const resolved: StudentExtended = student ?? {
        student_id: row.studentId,
        first_name: row.studentName || row.studentId,
        last_name: "",
        is_active: true,
        email: undefined,
      };

      if (!resolved.email && resolved.student_id) {
        resolved.email = `${resolved.student_id}@gordoncollege.edu.ph`;
      }

      entries.push({ student: resolved, result: row });
    }

    return entries;
  }

  static async sendScores(
    entries: StudentScoreEntry[],
    examLabel: string,
    options?: {
      className?: string;
      passingThreshold?: number;
      instructorName?: string;
    },
  ): Promise<SendScoresResult> {
    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
      return {
        status: "error",
        message: "EmailJS is not configured. Check EXPO_PUBLIC_EMAILJS_* in .env.local",
      };
    }

    const validEntries = entries.filter((e) => !!e.student.email);

    if (validEntries.length === 0) {
      return {
        status: "error",
        message: "None of the selected students have an email address on file.",
      };
    }

    const threshold = options?.passingThreshold ?? 60;
    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const allParams: Record<string, string>[] = validEntries.map(({ student, result }) => ({
      to_email: student.email!,
      to_name: `${student.first_name} ${student.last_name}`.trim(),
      student_id: student.student_id,
      exam_title: examLabel,
      class_name: options?.className ?? examLabel,
      score: String(result.score),
      total: String(result.totalQuestions),
      percentage: String(result.percentage),
      grade: deriveGrade(result.percentage),
      status: result.percentage >= threshold ? "PASSED" : "FAILED",
      passing_threshold: String(threshold),
      date: today,
      instructor_name: options?.instructorName ?? "",
    }));

    const { sent, failed } = await processQueue(allParams);

    return {
      status: failed === 0 ? "sent" : sent > 0 ? "partial" : "error",
      message:
        failed === 0
          ? `Scores sent to ${sent} student${sent !== 1 ? "s" : ""}.`
          : `${sent} sent, ${failed} failed.`,
      sent,
      failed,
    };
  }
}
