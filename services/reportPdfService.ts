import { auth, db } from "@/config/firebase";
import { GradingService } from "@/services/gradingService";
import { UserService } from "@/services/userService";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    where,
} from "firebase/firestore";
import { Platform } from "react-native";

// ── Collection names ────────────────────────────────────────────────────────
const REPORT_HISTORY = "reportHistory";
const SCANNED_RESULTS = "scannedResults";
const EXAMS_COLLECTION = "exams";
const CLASSES_COLLECTION = "classes";
const STUDENTS_COLLECTION = "students";

// ── Types ───────────────────────────────────────────────────────────────────

export type ReportType = "class_summary" | "individual";

export interface ReportOptions {
  /** Optional diagonal watermark text, e.g. "DRAFT" or "CONFIDENTIAL". */
  watermarkText?: string;
  /**
   * When true the OS share sheet is opened automatically after the PDF is
   * written to the cache directory.
   */
  autoShare?: boolean;
}

export interface ReportResult {
  success: boolean;
  message: string;
  /** Local URI of the generated PDF file (present only on success). */
  fileUri?: string;
  /**
   * The HTML source used to build the PDF.
   * Pass this to ReportPdfViewer for an inline preview before sharing.
   */
  previewHtml?: string;
}

// ── Internal data shapes ─────────────────────────────────────────────────────

interface ClassSummaryData {
  examTitle: string;
  examSubject: string;
  examSection: string;
  className: string;
  generatedAt: string;
  generatedBy: string;
  totalGraded: number;
  avgScore: number;
  passCount: number;
  failCount: number;
  passRate: number;
  highestScore: number;
  lowestScore: number;
  distribution: Record<"A" | "B" | "C" | "D" | "F", number>;
  rows: Array<{
    studentId: string;
    score: number;
    total: number;
    percentage: number;
    grade: string;
    isPassing: boolean;
    dateScanned: string;
  }>;
}

interface IndividualReportData {
  studentId: string;
  studentName: string;
  examTitle: string;
  examSubject: string;
  examSection: string;
  score: number;
  total: number;
  percentage: number;
  grade: string;
  isPassing: boolean;
  dateScanned: string;
  generatedAt: string;
  generatedBy: string;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

async function loadLogoBase64(): Promise<string> {
  try {
    const asset = Asset.fromModule(
      require("@/assets/images/gordon-college-logo.png"),
    );
    await asset.downloadAsync();
    if (asset.localUri) {
      const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/png;base64,${base64}`;
    }
  } catch (e) {
    console.warn("[ReportPdf] Could not load logo:", e);
  }
  return "";
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function buildFileName(type: ReportType, title: string): string {
  const prefix =
    type === "class_summary" ? "GC_ClassReport" : "GC_StudentReport";
  const safeTitle = title
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 30);
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "_",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${prefix}_${safeTitle}_${ts}.pdf`;
}

// ── Shared CSS ───────────────────────────────────────────────────────────────

const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    color: #333;
    padding: 20px;
    background: #fff;
  }
  .header {
    display: flex;
    flex-direction: row;
    align-items: center;
    border-bottom: 3px solid #00a550;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }
  .header img  { width: 56px; height: 56px; margin-right: 14px; }
  .header-text h1 { font-size: 17px; color: #00a550; margin-bottom: 2px; }
  .header-text h2 { font-size: 13px; color: #444; font-weight: 500; }
  .header-text p  { font-size: 9px; color: #888; margin-top: 3px; }
  .footer {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    font-size: 8px;
    color: #aaa;
    text-align: center;
  }
  .badge {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 9px;
  }
  .badge-pass { background: #e8f5ee; color: #00a550; }
  .badge-fail { background: #fdf0f0; color: #e74c3c; }
  .badge-A { background: #e8f5ee; color: #00a550; }
  .badge-B { background: #e8f0fa; color: #4a90e2; }
  .badge-C { background: #fef7e8; color: #f5a623; }
  .badge-D { background: #fdf0e8; color: #e67e22; }
  .badge-F { background: #fdf0f0; color: #e74c3c; }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: #24362f;
    margin: 16px 0 8px;
    border-left: 3px solid #00a550;
    padding-left: 8px;
  }
`;

function watermarkHtml(text?: string): string {
  if (!text) return "";
  const safe = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 72px;
    font-weight: 900;
    color: rgba(0,0,0,0.06);
    white-space: nowrap;
    pointer-events: none;
    z-index: 9999;
    letter-spacing: 8px;
    text-transform: uppercase;
  ">${safe}</div>`;
}

// ── HTML builders ────────────────────────────────────────────────────────────

function buildClassSummaryHtml(
  data: ClassSummaryData,
  logo: string,
  options: ReportOptions,
): string {
  const tableRows = data.rows
    .map(
      (r, i) => `
    <tr style="background:${i % 2 === 0 ? "#fafafa" : "#fff"}">
      <td style="padding:5px 8px;border-bottom:1px solid #eee;">${i + 1}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.studentId}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;">${r.score}/${r.total}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;">${r.percentage}%</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;"><span class="badge badge-${r.grade}">${r.grade}</span></td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;"><span class="badge ${r.isPassing ? "badge-pass" : "badge-fail"}">${r.isPassing ? "PASS" : "FAIL"}</span></td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;color:#888;">${formatDate(r.dateScanned)}</td>
    </tr>`,
    )
    .join("");

  type GradeKey = "A" | "B" | "C" | "D" | "F";
  const distEntries: Array<{ label: string; key: GradeKey; color: string }> = [
    { label: "A (≥90%)", key: "A", color: "#00a550" },
    { label: "B (80–89%)", key: "B", color: "#4a90e2" },
    { label: "C (70–79%)", key: "C", color: "#f5a623" },
    { label: "D (60–69%)", key: "D", color: "#e67e22" },
    { label: "F (<60%)", key: "F", color: "#e74c3c" },
  ];

  const maxDist = Math.max(
    ...distEntries.map((e) => data.distribution[e.key]),
    1,
  );

  const distRows = distEntries
    .map(
      (e) => `
    <tr>
      <td style="width:80px;font-size:9px;padding:4px 8px 4px 0;">${e.label}</td>
      <td style="padding:4px 8px;">
        <div style="background:#eee;border-radius:3px;height:12px;">
          <div style="background:${e.color};border-radius:3px;height:12px;width:${Math.round((data.distribution[e.key] / maxDist) * 100)}%;"></div>
        </div>
      </td>
      <td style="width:70px;text-align:right;font-size:9px;padding:4px 0 4px 8px;color:#555;">${data.distribution[e.key]} students</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    ${SHARED_CSS}
    table { width:100%; border-collapse:collapse; font-size:9px; }
    th { background:#00a550; color:#fff; padding:6px 8px; text-align:left;
         font-size:8px; text-transform:uppercase; letter-spacing:0.5px; }
    .summary-grid { display:flex; flex-direction:row; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
    .stat-box { flex:1; min-width:90px; border:1px solid #ddd; border-radius:6px;
                padding:8px 10px; text-align:center; }
    .stat-value { font-size:20px; font-weight:800; color:#00a550; }
    .stat-label { font-size:8px; color:#888; text-transform:uppercase; margin-top:2px; }
    .stat-box.fail .stat-value { color:#e74c3c; }
  </style>
</head>
<body>
  ${watermarkHtml(options.watermarkText)}

  <div class="header">
    ${logo ? `<img src="${logo}" alt="Gordon College"/>` : ""}
    <div class="header-text">
      <h1>Gordon College — Class Summary Report</h1>
      <h2>${data.examTitle}${data.examSubject ? ` · ${data.examSubject}` : ""}${data.examSection ? ` · ${data.examSection}` : ""}</h2>
      <p>${data.className ? `Class: ${data.className} · ` : ""}Generated ${data.generatedAt} by ${data.generatedBy}</p>
    </div>
  </div>

  <div class="summary-grid">
    <div class="stat-box">
      <div class="stat-value">${data.totalGraded}</div>
      <div class="stat-label">Total Graded</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${data.avgScore}%</div>
      <div class="stat-label">Class Average</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${data.passCount}</div>
      <div class="stat-label">Passed (${data.passRate}%)</div>
    </div>
    <div class="stat-box fail">
      <div class="stat-value">${data.failCount}</div>
      <div class="stat-label">Failed (${data.totalGraded > 0 ? 100 - data.passRate : 0}%)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${data.highestScore}%</div>
      <div class="stat-label">Highest</div>
    </div>
    <div class="stat-box fail">
      <div class="stat-value">${data.lowestScore}%</div>
      <div class="stat-label">Lowest</div>
    </div>
  </div>

  <p class="section-title">Score Distribution</p>
  <table style="margin-bottom:18px;">
    <tbody>${distRows}</tbody>
  </table>

  <p class="section-title">Student Results</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Student ID</th>
        <th>Score</th>
        <th>Percentage</th>
        <th>Grade</th>
        <th>Status</th>
        <th>Date Scanned</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="footer">
    GC SmartCheck &bull; Class Summary Report &bull; ${data.examTitle} &bull; ${data.generatedAt}
  </div>
</body>
</html>`;
}

function buildIndividualReportHtml(
  data: IndividualReportData,
  logo: string,
  options: ReportOptions,
): string {
  const pct = data.percentage;
  const barColor =
    pct >= 90
      ? "#00a550"
      : pct >= 80
        ? "#4a90e2"
        : pct >= 70
          ? "#f5a623"
          : pct >= 60
            ? "#e67e22"
            : "#e74c3c";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    ${SHARED_CSS}
    .info-table { width:100%; border-collapse:collapse; margin-bottom:18px; }
    .info-table td { padding:6px 10px; border-bottom:1px solid #f0f0f0; font-size:10px; }
    .info-table td:first-child { font-weight:700; color:#555; width:140px; }
    .score-banner {
      border-radius:10px;
      background:${barColor}18;
      border:2px solid ${barColor};
      padding:18px 24px;
      margin-bottom:20px;
      text-align:center;
    }
    .score-banner .big { font-size:48px; font-weight:900; color:${barColor}; line-height:1; }
    .score-banner .label { font-size:10px; color:#888; margin-top:4px; text-transform:uppercase; letter-spacing:1px; }
    .score-banner .row { margin-top:10px; display:flex; justify-content:center; gap:24px; }
    .score-banner .item { text-align:center; }
    .score-banner .item .val { font-size:18px; font-weight:800; color:${barColor}; }
    .score-banner .item .lbl { font-size:8px; color:#888; text-transform:uppercase; }
    .bar-outer { background:#eee; border-radius:6px; height:16px; margin:10px 0; }
    .bar-inner { background:${barColor}; border-radius:6px; height:16px; width:${pct}%; }
  </style>
</head>
<body>
  ${watermarkHtml(options.watermarkText)}

  <div class="header">
    ${logo ? `<img src="${logo}" alt="Gordon College"/>` : ""}
    <div class="header-text">
      <h1>Gordon College — Individual Score Report</h1>
      <h2>${data.examTitle}${data.examSubject ? ` · ${data.examSubject}` : ""}${data.examSection ? ` · ${data.examSection}` : ""}</h2>
      <p>Generated ${data.generatedAt} by ${data.generatedBy}</p>
    </div>
  </div>

  <table class="info-table">
    <tr><td>Student ID</td><td>${data.studentId}</td></tr>
    ${data.studentName ? `<tr><td>Student Name</td><td>${data.studentName}</td></tr>` : ""}
    <tr><td>Exam</td><td>${data.examTitle}</td></tr>
    ${data.examSubject ? `<tr><td>Subject</td><td>${data.examSubject}</td></tr>` : ""}
    ${data.examSection ? `<tr><td>Section</td><td>${data.examSection}</td></tr>` : ""}
    <tr><td>Date Scanned</td><td>${formatDate(data.dateScanned)}</td></tr>
  </table>

  <div class="score-banner">
    <div class="big">${data.percentage}%</div>
    <div class="label">Overall Score</div>
    <div class="bar-outer"><div class="bar-inner"></div></div>
    <div class="row">
      <div class="item">
        <div class="val">${data.score}/${data.total}</div>
        <div class="lbl">Score</div>
      </div>
      <div class="item">
        <div class="val">${data.grade}</div>
        <div class="lbl">Grade</div>
      </div>
      <div class="item">
        <div class="val">${data.isPassing ? "PASS" : "FAIL"}</div>
        <div class="lbl">Status</div>
      </div>
    </div>
  </div>

  <div class="footer">
    GC SmartCheck &bull; Individual Score Report &bull; ${data.examTitle} &bull; ${data.generatedAt}
  </div>
</body>
</html>`;
}

// ── Main service ─────────────────────────────────────────────────────────────

export class ReportPdfService {
  /**
   * Generates a class summary PDF report for the given exam.
   *
   * Fetches all scannedResults for examId (scoped to the authenticated
   * instructor), computes statistics, renders the branded HTML template,
   * converts to PDF via expo-print, writes to the cache directory, and
   * optionally opens the OS share sheet.
   *
   * The `previewHtml` field in the returned result can be passed directly to
   * `ReportPdfViewer` so the user can preview before sharing.
   */
  static async generateClassSummaryReport(
    examId: string,
    options: ReportOptions = {},
  ): Promise<ReportResult> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return {
        success: false,
        message: "Sign in required to generate reports.",
      };
    }

    let examTitle = "Exam";
    let examSubject = "";
    let examSection = "";
    let classId = "";
    let className = "";
    let generatedBy = auth.currentUser?.email ?? "Instructor";

    try {
      // Resolve instructor display name
      try {
        const profile = await UserService.getUserProfile(uid);
        if (profile?.fullName) generatedBy = profile.fullName;
      } catch {
        /* fall through with email default */
      }

      // Fetch exam metadata
      try {
        const examSnap = await getDoc(doc(db, EXAMS_COLLECTION, examId));
        if (examSnap.exists()) {
          const d = examSnap.data();
          examTitle = d.title ?? examTitle;
          examSubject = d.subject ?? d.course_subject ?? "";
          examSection = d.section ?? d.section_block ?? "";
          classId = d.classId ?? d.class_id ?? "";
        }
      } catch {
        /* use defaults */
      }

      // Fetch class name when classId is available
      if (classId) {
        try {
          const classSnap = await getDoc(doc(db, CLASSES_COLLECTION, classId));
          if (classSnap.exists()) {
            className = classSnap.data().class_name ?? "";
          }
        } catch {
          /* non-blocking */
        }
      }

      // Fetch scanned results
      const q = query(
        collection(db, SCANNED_RESULTS),
        where("examId", "==", examId),
        where("scannedBy", "==", uid),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        return {
          success: false,
          message: "No graded results found for this exam.",
        };
      }

      const rows = snap.docs.map((d) => {
        const raw = d.data();
        const score = raw.score ?? 0;
        const total = raw.totalQuestions ?? raw.totalPoints ?? 1;
        const percentage =
          raw.percentage != null
            ? raw.percentage
            : Math.round((score / Math.max(total, 1)) * 100);
        const grade =
          raw.gradeEquivalent ??
          GradingService.computeGradeEquivalent(percentage);
        const isPassing = GradingService.isPassing(percentage);
        const dateScanned =
          typeof raw.scannedAt === "string"
            ? raw.scannedAt
            : (raw.scannedAt?.toDate?.()?.toISOString() ?? "");
        return {
          studentId: raw.studentId ?? raw.student_id ?? "",
          score,
          total,
          percentage,
          grade,
          isPassing,
          dateScanned,
        };
      });

      rows.sort((a, b) => a.studentId.localeCompare(b.studentId));

      const totalGraded = rows.length;
      const percentages = rows.map((r) => r.percentage);
      const avgScore =
        totalGraded > 0
          ? Math.round(percentages.reduce((s, p) => s + p, 0) / totalGraded)
          : 0;
      const highestScore = totalGraded > 0 ? Math.max(...percentages) : 0;
      const lowestScore = totalGraded > 0 ? Math.min(...percentages) : 0;
      const passCount = rows.filter((r) => r.isPassing).length;
      const failCount = totalGraded - passCount;
      const passRate =
        totalGraded > 0 ? Math.round((passCount / totalGraded) * 100) : 0;

      const distribution: Record<"A" | "B" | "C" | "D" | "F", number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        F: 0,
      };
      rows.forEach((r) => {
        const g = r.grade as "A" | "B" | "C" | "D" | "F";
        if (g in distribution) distribution[g]++;
      });

      const generatedAt = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const logo = await loadLogoBase64();

      const data: ClassSummaryData = {
        examTitle,
        examSubject,
        examSection,
        className,
        generatedAt,
        generatedBy,
        totalGraded,
        avgScore,
        passCount,
        failCount,
        passRate,
        highestScore,
        lowestScore,
        distribution,
        rows,
      };

      const html = buildClassSummaryHtml(data, logo, options);

      // ── #5 PDF compression: provide exact letter-sized dimensions so
      //      expo-print doesn't inflate the canvas unnecessarily.
      const { uri } = await Print.printToFileAsync({
        html,
        width: 612,
        height: 792,
      });

      // Move to a named file in the cache directory
      const fileName = buildFileName("class_summary", examTitle);
      const dest = `${FileSystem.cacheDirectory ?? ""}${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: dest });

      // ── #10 Log to reportHistory
      await ReportPdfService.logReportEvent({
        reportType: "class_summary",
        examId,
        classId,
        fileName,
        recordCount: totalGraded,
      });

      // ── #7 Auto-share
      if (options.autoShare && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(dest, {
          mimeType: "application/pdf",
          dialogTitle: `${examTitle} — Class Summary Report`,
          UTI: "com.adobe.pdf",
        });
      }

      return {
        success: true,
        message: `Report generated: ${totalGraded} students.`,
        fileUri: dest,
        previewHtml: html,
      };
    } catch (err: any) {
      console.error("[ReportPdf] Class summary failed:", err);
      return {
        success: false,
        message: err.message ?? "Failed to generate report. Please try again.",
      };
    }
  }

  /**
   * Generates an individual student score report.
   *
   * Looks up the most recent scannedResult for studentId + examId,
   * renders the branded single-student HTML template, and converts to PDF.
   */
  static async generateIndividualReport(
    studentId: string,
    examId: string,
    options: ReportOptions = {},
  ): Promise<ReportResult> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return {
        success: false,
        message: "Sign in required to generate reports.",
      };
    }

    let generatedBy = auth.currentUser?.email ?? "Instructor";
    let examTitle = "Exam";
    let examSubject = "";
    let examSection = "";
    let studentName = "";

    try {
      // Resolve instructor display name
      try {
        const profile = await UserService.getUserProfile(uid);
        if (profile?.fullName) generatedBy = profile.fullName;
      } catch {
        /* fall through */
      }

      // Fetch exam metadata
      try {
        const examSnap = await getDoc(doc(db, EXAMS_COLLECTION, examId));
        if (examSnap.exists()) {
          const d = examSnap.data();
          examTitle = d.title ?? examTitle;
          examSubject = d.subject ?? d.course_subject ?? "";
          examSection = d.section ?? d.section_block ?? "";
        }
      } catch {
        /* use defaults */
      }

      // Fetch student name (best-effort)
      try {
        const sq = query(
          collection(db, STUDENTS_COLLECTION),
          where("student_id", "==", studentId),
        );
        const sSnap = await getDocs(sq);
        if (!sSnap.empty) {
          const sd = sSnap.docs[0].data();
          studentName = `${sd.first_name ?? ""} ${sd.last_name ?? ""}`.trim();
        }
      } catch {
        /* non-blocking */
      }

      // Fetch scanned result
      const rq = query(
        collection(db, SCANNED_RESULTS),
        where("examId", "==", examId),
        where("studentId", "==", studentId),
        where("scannedBy", "==", uid),
      );
      const rSnap = await getDocs(rq);
      if (rSnap.empty) {
        return {
          success: false,
          message: `No graded result found for student ${studentId} in this exam.`,
        };
      }

      // Take the most recent result
      const resultDocs = rSnap.docs
        .map((d) => d.data())
        .sort((a, b) => {
          const ta = a.scannedAt?.toDate?.()?.getTime() ?? 0;
          const tb = b.scannedAt?.toDate?.()?.getTime() ?? 0;
          return tb - ta;
        });
      const rd = resultDocs[0];

      const score = rd.score ?? 0;
      const total = rd.totalQuestions ?? rd.totalPoints ?? 1;
      const percentage =
        rd.percentage != null
          ? rd.percentage
          : Math.round((score / Math.max(total, 1)) * 100);
      const grade =
        rd.gradeEquivalent ?? GradingService.computeGradeEquivalent(percentage);
      const isPassing = GradingService.isPassing(percentage);
      const dateScanned =
        typeof rd.scannedAt === "string"
          ? rd.scannedAt
          : (rd.scannedAt?.toDate?.()?.toISOString() ?? "");

      const generatedAt = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const logo = await loadLogoBase64();

      const data: IndividualReportData = {
        studentId,
        studentName,
        examTitle,
        examSubject,
        examSection,
        score,
        total,
        percentage,
        grade,
        isPassing,
        dateScanned,
        generatedAt,
        generatedBy,
      };

      const html = buildIndividualReportHtml(data, logo, options);

      const { uri } = await Print.printToFileAsync({
        html,
        width: 612,
        height: 792,
      });

      const fileName = buildFileName("individual", `${examTitle}_${studentId}`);
      const dest = `${FileSystem.cacheDirectory ?? ""}${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: dest });

      await ReportPdfService.logReportEvent({
        reportType: "individual",
        examId,
        studentId,
        fileName,
        recordCount: 1,
      });

      if (options.autoShare && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(dest, {
          mimeType: "application/pdf",
          dialogTitle: `${examTitle} — Student Report (${studentId})`,
          UTI: "com.adobe.pdf",
        });
      }

      return {
        success: true,
        message: "Individual report generated.",
        fileUri: dest,
        previewHtml: html,
      };
    } catch (err: any) {
      console.error("[ReportPdf] Individual report failed:", err);
      return {
        success: false,
        message: err.message ?? "Failed to generate report. Please try again.",
      };
    }
  }

  // ── #10 Audit logging ───────────────────────────────────────────────────────

  private static async logReportEvent(params: {
    reportType: ReportType;
    examId: string;
    classId?: string;
    studentId?: string;
    fileName: string;
    recordCount: number;
  }): Promise<void> {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      await addDoc(collection(db, REPORT_HISTORY), {
        report_type: params.reportType,
        generated_by: uid,
        exam_id: params.examId,
        class_id: params.classId ?? null,
        student_id: params.studentId ?? null,
        file_name: params.fileName,
        record_count: params.recordCount,
        platform: Platform.OS,
        generated_at: serverTimestamp(),
      });
    } catch (err) {
      // Logging must never block report generation
      console.warn("[ReportPdf] Failed to write reportHistory:", err);
    }
  }
}
