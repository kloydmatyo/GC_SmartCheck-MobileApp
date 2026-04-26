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

const SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID || "";
const TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID || "";
const PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY || "";
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

// ─── HTML Email Builder ───────────────────────────────────────────────────────

export function buildEmailHtml(params: {
  to_name: string;
  student_id: string;
  class_name: string;
  exam_title: string;
  score: string;
  total: string;
  percentage: string;
  grade: string;
  status: string;
  passing_threshold: string;
  date: string;
  instructor_name: string;
}): string {
  const isPassing = params.status === "PASSED";
  const statusColor = isPassing ? "#20BE7B" : "#EF4444";
  const statusBg = isPassing ? "#F0FBF6" : "#FEF2F2";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f0f4f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f0;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1a3a2a;padding:28px 32px;text-align:center;border-bottom:3px solid #c9a84c;">
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Gordon College</div>
            <div style="font-size:11px;font-weight:700;color:#c9a84c;letter-spacing:2px;margin-top:4px;text-transform:uppercase;">Excellence in Education</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">

            <!-- Greeting -->
            <p style="margin:0 0 6px;font-size:15px;color:#1F2937;">
              Dear <strong>${params.to_name}</strong>,
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:#6B7280;">
              Here is your exam result for <strong>${params.exam_title}</strong> in <strong>${params.class_name}</strong>.
            </p>

            <!-- Summary Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E8EBF0;border-radius:10px;overflow:hidden;margin-bottom:20px;">
              <tr style="background:#F7F7F8;">
                <td style="padding:14px 18px;border-bottom:1px solid #E8EBF0;" width="50%">
                  <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Student ID</div>
                  <div style="font-size:15px;font-weight:700;color:#1F2937;">${params.student_id}</div>
                </td>
                <td style="padding:14px 18px;border-bottom:1px solid #E8EBF0;border-left:1px solid #E8EBF0;" width="50%">
                  <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Passing Threshold</div>
                  <div style="font-size:15px;font-weight:700;color:#1F2937;">${params.passing_threshold}%</div>
                </td>
              </tr>
              <tr style="background:#F7F7F8;">
                <td style="padding:14px 18px;border-bottom:1px solid #E8EBF0;" width="50%">
                  <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Score</div>
                  <div style="font-size:15px;font-weight:700;color:#1F2937;">${params.score} / ${params.total}</div>
                </td>
                <td style="padding:14px 18px;border-bottom:1px solid #E8EBF0;border-left:1px solid #E8EBF0;" width="50%">
                  <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Percentage</div>
                  <div style="font-size:15px;font-weight:700;color:#1F2937;">${params.percentage}%</div>
                </td>
              </tr>
              <tr style="background:#F7F7F8;">
                <td style="padding:14px 18px;" width="50%">
                  <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Grade</div>
                  <div style="font-size:15px;font-weight:700;color:#1F2937;">${params.grade}</div>
                </td>
                <td style="padding:14px 18px;border-left:1px solid #E8EBF0;" width="50%">
                  <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Status</div>
                  <div style="display:inline-block;padding:3px 12px;border-radius:20px;background:${statusBg};color:${statusColor};font-size:12px;font-weight:800;">${params.status}</div>
                </td>
              </tr>
            </table>

            <!-- Date -->
            <p style="margin:0 0 24px;font-size:12px;color:#9CA3AF;">Date: ${params.date}</p>

            <!-- Instructor -->
            ${params.instructor_name ? `<p style="margin:0 0 8px;font-size:13px;color:#4B5563;">— ${params.instructor_name}, Instructor</p>` : ""}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F0FBF6;padding:18px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:12px;font-weight:800;color:#1a3a2a;">GC SMART CHECK</div>
                  <div style="font-size:11px;color:#6B7280;margin-top:2px;">Gordon College • Olongapo City, Zambales, Philippines</div>
                </td>
                <td align="right" style="vertical-align:top;">
                  <div style="font-size:10px;color:#9CA3AF;text-align:right;line-height:16px;">This is an automated message.<br/>Please do not reply to this email.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
      const student = await StudentDatabaseService.getStudentById(
        row.studentId,
      );

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
        message:
          "EmailJS is not configured. Check EXPO_PUBLIC_EMAILJS_* in .env.local",
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

    const allParams: Record<string, string>[] = validEntries.map(
      ({ student, result }) => {
        const p = {
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
        };
        return { ...p, html_body: buildEmailHtml(p) };
      },
    );

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
