import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as nodemailer from "nodemailer";
import { studentScoreHtml, studentScoreText, StudentScoreEmailData } from "./emailTemplate";

admin.initializeApp();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreEntry {
  studentName: string;
  studentId: string;
  email: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  grade: string;
  date: string;
  subject?: string;
}

interface SendScoresPayload {
  examLabel: string;
  className: string;
  passingThreshold: number;
  instructorName?: string;
  entries: ScoreEntry[];
}

interface EmailResult {
  email: string;
  success: boolean;
  error?: string;
}

// ─── SMTP transporter (singleton) ────────────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return _transporter;
}

function fromAddress(): string {
  const name = process.env.SMTP_FROM_NAME || "GC SMART CHECK";
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "noreply@gordoncollege.edu.ph";
  return `"${name}" <${email}>`;
}

// ─── Queue with concurrency + retry ──────────────────────────────────────────

const CONCURRENCY = 3;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

async function sendOne(
  transporter: nodemailer.Transporter,
  entry: ScoreEntry,
  examLabel: string,
  className: string,
  passingThreshold: number,
  instructorName?: string,
  attempt = 1,
): Promise<EmailResult> {
  const data: StudentScoreEmailData = {
    studentName: entry.studentName,
    studentId: entry.studentId,
    className,
    examTitle: examLabel,
    score: entry.score,
    totalQuestions: entry.totalQuestions,
    percentage: entry.percentage,
    grade: entry.grade,
    date: entry.date,
    passingThreshold,
    instructorName,
    subject: entry.subject,
  };

  try {
    await transporter.sendMail({
      from: fromAddress(),
      to: entry.email,
      subject: `GC SMART CHECK — Your ${examLabel} Results`,
      html: studentScoreHtml(data),
      text: studentScoreText(data),
    });
    return { email: entry.email, success: true };
  } catch (err: unknown) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return sendOne(transporter, entry, examLabel, className, passingThreshold, instructorName, attempt + 1);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { email: entry.email, success: false, error: msg };
  }
}

async function processQueue(
  transporter: nodemailer.Transporter,
  entries: ScoreEntry[],
  examLabel: string,
  className: string,
  passingThreshold: number,
  instructorName?: string,
): Promise<EmailResult[]> {
  const results: EmailResult[] = [];
  const queue = [...entries];

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((e) => sendOne(transporter, e, examLabel, className, passingThreshold, instructorName)),
    );
    results.push(...batchResults);
  }

  return results;
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

// Store SMTP credentials as Firebase secrets:
//   firebase functions:secrets:set SMTP_USER
//   firebase functions:secrets:set SMTP_PASS
//   firebase functions:secrets:set SMTP_HOST      (optional, defaults to smtp.gmail.com)
//   firebase functions:secrets:set SMTP_FROM_NAME (optional)
export const sendScoreEmails = onCall(
  { timeoutSeconds: 300 },
  async (request: import("firebase-functions/v2/https").CallableRequest<SendScoresPayload>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const { examLabel, className, passingThreshold, instructorName, entries } =
      request.data as SendScoresPayload;

    if (!examLabel || !className || !Array.isArray(entries) || entries.length === 0) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new HttpsError("internal", "SMTP credentials not configured on server.");
    }

    const transporter = getTransporter();
    const validEntries = entries.filter((e) => !!e.email);

    const results = await processQueue(
      transporter,
      validEntries,
      examLabel,
      className,
      passingThreshold ?? 60,
      instructorName,
    );

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { sent, failed, total: validEntries.length, results };
  },
);
