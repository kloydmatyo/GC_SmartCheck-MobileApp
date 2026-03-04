/**
 * services/gradeExportService.ts
 *
 * Backend service for exporting exam grades to CSV, Excel-compatible CSV,
 * and branded PDF. Fetches scannedResults from Firestore, formats them,
 * writes to local filesystem via expo-file-system, and shares via expo-sharing.
 *
 * Requirements covered (Phase 1):
 *   1. Export API endpoint  (exportExamGrades)
 *   2. Formatted headers    (RFC 4180 CSV escaping)
 *   3. Logo embedding       (base64 GC logo in PDF)
 *   4. File streaming       (expo-file-system write → expo-sharing)
 *   5. Export button wiring  (consumed by exam-stats screen)
 *
 * Requirements covered (Phase 2):
 *   6. Progress indicator   (onProgress callback)
 *   7. Export audit logging  (logExportEvent → audit_logs)
 *   8. Large dataset validation (MAX_ROWS guard, chunked CSV build)
 *   9. Filter-based export  (dateFilter parameter)
 *  10. File naming convention (standardized names)
 */

import { auth, db } from "@/config/firebase";
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
import { GradingService } from "./gradingService";

// ── Types ──────────────────────────────────────────────────────────────────

export type ExportFormat = "csv" | "excel" | "pdf";
export type ExportDateFilter = "all" | "today" | "week";

/** Progress callback: stage description + percentage (0–100). */
export type ExportProgressCallback = (stage: string, percent: number) => void;

export interface ExportableRow {
  studentId: string;
  score: number;
  totalPoints: number;
  percentage: number;
  gradeEquivalent: string;
  isPassing: boolean;
  dateScanned: string;
  status: string;
}

export interface ExportResult {
  success: boolean;
  message: string;
  fileUri?: string;
  recordCount?: number;
}

export interface ExportOptions {
  format: ExportFormat;
  dateFilter?: ExportDateFilter;
  onProgress?: ExportProgressCallback;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SCANNED_RESULTS = "scannedResults";
const EXAMS_COLLECTION = "exams";
const AUDIT_LOGS_COLLECTION = "audit_logs";

/** Safety limit to prevent memory issues on mobile devices. */
const MAX_EXPORT_ROWS = 5000;

/** CSV chunk size — rows per chunk when building large CSV strings. */
const CSV_CHUNK_SIZE = 500;

const CSV_HEADERS = [
  "Student ID",
  "Score",
  "Total Items",
  "Percentage",
  "Grade",
  "Status",
  "Date Scanned",
];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * RFC 4180 compliant CSV field escaping.
 * Wraps fields in double-quotes if they contain commas, quotes, or newlines.
 */
function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Returns the base directory for writing temporary export files.
 */
function getBaseDir(): string {
  return FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
}

/**
 * Converts a Firestore doc into an ExportableRow.
 */
function docToRow(d: Record<string, any>): ExportableRow {
  const score = d.score ?? 0;
  const totalQuestions = d.totalQuestions ?? d.totalPoints ?? 1;
  const percentage =
    d.percentage != null
      ? d.percentage
      : Math.round((score / Math.max(totalQuestions, 1)) * 100);

  let dateScanned = "";
  if (d.scannedAt) {
    dateScanned =
      typeof d.scannedAt === "string"
        ? d.scannedAt
        : (d.scannedAt.toDate?.()?.toISOString() ?? "");
  } else if (d.dateScanned) {
    dateScanned =
      typeof d.dateScanned === "string"
        ? d.dateScanned
        : (d.dateScanned.toDate?.()?.toISOString() ?? "");
  }

  return {
    studentId: d.studentId ?? "",
    score,
    totalPoints: totalQuestions,
    percentage,
    gradeEquivalent:
      d.gradeEquivalent ?? GradingService.computeGradeEquivalent(percentage),
    isPassing: GradingService.isPassing(percentage),
    dateScanned,
    status: d.status ?? "saved",
  };
}

/**
 * Formats an ISO date string into a human-readable form.
 */
function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Loads the Gordon College logo as a base64 data URI for PDF embedding.
 */
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
    console.warn("[GradeExport] Could not load logo:", e);
  }
  return "";
}

/**
 * #10 — File Naming Convention
 *
 * Pattern: GC_{ExamTitle}_{Format}_{DateFilter}_{YYYYMMDD_HHmmss}.{ext}
 * Example: GC_Midterm_Exam_CSV_AllTime_20260303_220500.csv
 */
function buildFileName(
  examTitle: string,
  format: ExportFormat,
  dateFilter: ExportDateFilter,
): string {
  const prefix = "GC";
  const safeTitle = examTitle
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 30);

  const filterLabel =
    dateFilter === "all"
      ? "AllTime"
      : dateFilter === "today"
        ? "Today"
        : "ThisWeek";

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "_",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const formatLabel = format.toUpperCase();
  const ext = format === "pdf" ? "pdf" : "csv";

  return `${prefix}_${safeTitle}_${formatLabel}_${filterLabel}_${timestamp}.${ext}`;
}

/**
 * #9 — Computes the ISO date lower-bound for a given filter.
 */
function getDateFilterBound(filter: ExportDateFilter): string | null {
  if (filter === "all") return null;

  const now = new Date();
  if (filter === "today") {
    now.setHours(0, 0, 0, 0);
  } else if (filter === "week") {
    now.setDate(now.getDate() - 7);
    now.setHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

// ── Core Service ───────────────────────────────────────────────────────────

export class GradeExportService {
  /**
   * Main export API endpoint.
   *
   * Fetches all scannedResults for the given examId (scoped to current
   * authenticated instructor), generates the file in the requested format,
   * writes it to the device, and triggers the OS share sheet.
   *
   * Phase 2 additions:
   * - onProgress callback for UI progress indicator (#6)
   * - Audit log after successful export (#7)
   * - Large dataset validation + guard (#8)
   * - dateFilter parameter (#9)
   * - Standardized file naming (#10)
   */
  static async exportExamGrades(
    examId: string,
    options: ExportOptions,
  ): Promise<ExportResult> {
    const { format, dateFilter = "all", onProgress } = options;

    // ── 1. Auth check ────────────────────────────────────────────────────
    onProgress?.("Checking authentication…", 5);

    const uid = auth.currentUser?.uid;
    if (!uid) {
      return {
        success: false,
        message: "You must be signed in to export grades.",
      };
    }

    // ── 2. Fetch exam metadata ───────────────────────────────────────────
    onProgress?.("Loading exam details…", 10);

    let examTitle = "Exam";
    let examSubject = "";
    try {
      const examSnap = await getDoc(doc(db, EXAMS_COLLECTION, examId));
      if (examSnap.exists()) {
        const data = examSnap.data();
        examTitle = data.title ?? "Exam";
        examSubject = data.subject ?? data.course_subject ?? "";
      }
    } catch {
      // non-blocking — use defaults
    }

    // ── 3. Fetch grade rows ──────────────────────────────────────────────
    onProgress?.("Fetching grade records…", 20);

    const q = query(
      collection(db, SCANNED_RESULTS),
      where("examId", "==", examId),
      where("scannedBy", "==", uid),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      return {
        success: false,
        message: "No grade records found for this exam.",
      };
    }

    let rows: ExportableRow[] = snap.docs.map((d) => docToRow(d.data()));

    // ── 3a. Apply date filter (#9) ───────────────────────────────────────
    const dateBound = getDateFilterBound(dateFilter);
    if (dateBound) {
      rows = rows.filter(
        (r) => typeof r.dateScanned === "string" && r.dateScanned >= dateBound,
      );
      if (rows.length === 0) {
        const label =
          dateFilter === "today" ? "today" : "the past week";
        return {
          success: false,
          message: `No grade records found for ${label}.`,
        };
      }
    }

    onProgress?.(`Processing ${rows.length} records…`, 35);

    // ── 3b. Large dataset validation (#8) ────────────────────────────────
    if (rows.length > MAX_EXPORT_ROWS) {
      return {
        success: false,
        message: `Export limited to ${MAX_EXPORT_ROWS.toLocaleString()} records for device stability. This exam has ${rows.length.toLocaleString()} records. Please apply a date filter to narrow the range.`,
      };
    }

    // Sort by student ID ascending
    rows.sort((a, b) => a.studentId.localeCompare(b.studentId));

    // ── 4. Generate file name (#10) ──────────────────────────────────────
    const fileName = buildFileName(examTitle, format, dateFilter);

    // ── 5. Generate file based on format ─────────────────────────────────
    onProgress?.("Generating file…", 50);

    let result: ExportResult;
    try {
      switch (format) {
        case "csv":
          result = await GradeExportService.generateCSV(
            rows,
            examTitle,
            fileName,
            onProgress,
          );
          break;
        case "excel":
          result = await GradeExportService.generateExcel(
            rows,
            examTitle,
            fileName,
            onProgress,
          );
          break;
        case "pdf":
          result = await GradeExportService.generatePDF(
            rows,
            examTitle,
            examSubject,
            fileName,
            dateFilter,
            onProgress,
          );
          break;
        default:
          return { success: false, message: `Unknown format: ${format}` };
      }
    } catch (err: any) {
      console.error("[GradeExport] Export failed:", err);
      return {
        success: false,
        message: err.message ?? "Export failed. Please try again.",
      };
    }

    // ── 6. Log export event (#7) ─────────────────────────────────────────
    if (result.success) {
      onProgress?.("Logging export…", 95);
      await GradeExportService.logExportEvent(
        examId,
        examTitle,
        format,
        dateFilter,
        rows.length,
        fileName,
      );
      onProgress?.("Done!", 100);
    }

    return result;
  }

  // ── CSV Generation ───────────────────────────────────────────────────────

  /**
   * Generates a properly escaped CSV file (RFC 4180) and triggers sharing.
   * Uses chunked building for large datasets (#8).
   */
  static async generateCSV(
    rows: ExportableRow[],
    examTitle: string,
    fileName: string,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportResult> {
    onProgress?.("Building CSV…", 55);
    const csvContent = GradeExportService.buildCsvString(rows, onProgress);
    const fileUri = getBaseDir() + fileName;

    onProgress?.("Writing file…", 80);
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    onProgress?.("Opening share sheet…", 90);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",
        dialogTitle: `Export ${examTitle} Grades (CSV)`,
        UTI: "public.comma-separated-values-text",
      });
    }

    return {
      success: true,
      message: `CSV exported: ${rows.length} records.`,
      fileUri,
      recordCount: rows.length,
    };
  }

  // ── Excel-compatible CSV Generation ──────────────────────────────────────

  /**
   * Generates an Excel-compatible CSV (UTF-8 BOM) and triggers sharing.
   */
  static async generateExcel(
    rows: ExportableRow[],
    examTitle: string,
    fileName: string,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportResult> {
    onProgress?.("Building Excel file…", 55);
    const BOM = "\uFEFF";
    const csvContent = BOM + GradeExportService.buildCsvString(rows, onProgress);
    const fileUri = getBaseDir() + fileName;

    onProgress?.("Writing file…", 80);
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    onProgress?.("Opening share sheet…", 90);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/vnd.ms-excel",
        dialogTitle: `Export ${examTitle} Grades (Excel)`,
      });
    }

    return {
      success: true,
      message: `Excel export: ${rows.length} records.`,
      fileUri,
      recordCount: rows.length,
    };
  }

  // ── PDF Generation with Logo ─────────────────────────────────────────────

  /**
   * Generates a branded PDF with the Gordon College logo, summary statistics,
   * and a styled grade table. Uses expo-print for HTML → PDF conversion.
   */
  static async generatePDF(
    rows: ExportableRow[],
    examTitle: string,
    examSubject: string,
    fileName: string,
    dateFilter: ExportDateFilter,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportResult> {
    onProgress?.("Loading logo…", 55);
    const logoBase64 = await loadLogoBase64();

    onProgress?.("Computing statistics…", 60);

    // Compute summary stats
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
    const exportDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const filterLabel =
      dateFilter === "all"
        ? "All Time"
        : dateFilter === "today"
          ? "Today"
          : "This Week";

    onProgress?.("Building PDF…", 65);

    // Build table rows
    const tableRows = rows
      .map(
        (r, i) => `
      <tr class="${i % 2 === 0 ? "even" : "odd"}">
        <td>${i + 1}</td>
        <td>${r.studentId}</td>
        <td>${r.score}</td>
        <td>${r.totalPoints}</td>
        <td>${r.percentage}%</td>
        <td><span class="grade grade-${r.gradeEquivalent}">${r.gradeEquivalent}</span></td>
        <td><span class="status ${r.isPassing ? "pass" : "fail"}">${r.isPassing ? "PASS" : "FAIL"}</span></td>
        <td class="date">${formatDate(r.dateScanned)}</td>
      </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      color: #333;
      padding: 20px;
      background: #fff;
    }

    /* ── Header / Branding ─────────────────────────────────────── */
    .header {
      display: flex;
      flex-direction: row;
      align-items: center;
      border-bottom: 2px solid #00a550;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .header img {
      width: 60px;
      height: 60px;
      margin-right: 14px;
    }
    .header-text h1 {
      font-size: 16px;
      color: #00a550;
      margin-bottom: 2px;
    }
    .header-text h2 {
      font-size: 12px;
      color: #555;
      font-weight: 500;
    }
    .header-text p {
      font-size: 9px;
      color: #888;
      margin-top: 2px;
    }

    /* ── Summary Stats ─────────────────────────────────────────── */
    .summary {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .stat-box {
      flex: 1;
      min-width: 100px;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }
    .stat-box .stat-value {
      font-size: 18px;
      font-weight: 800;
      color: #00a550;
    }
    .stat-box .stat-label {
      font-size: 8px;
      color: #888;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .stat-box.fail-box .stat-value { color: #e74c3c; }

    /* ── Grade Table ───────────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    th {
      background: #00a550;
      color: #fff;
      padding: 6px 8px;
      text-align: left;
      font-weight: 700;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      padding: 5px 8px;
      border-bottom: 1px solid #eee;
    }
    tr.even { background: #fafafa; }
    tr.odd  { background: #fff; }

    .grade {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 9px;
    }
    .grade-A { background: #e8f5ee; color: #00a550; }
    .grade-B { background: #e8f0fa; color: #4a90e2; }
    .grade-C { background: #fef7e8; color: #f5a623; }
    .grade-D { background: #fdf0e8; color: #e67e22; }
    .grade-F { background: #fdf0f0; color: #e74c3c; }

    .status {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 8px;
    }
    .status.pass { background: #e8f5ee; color: #00a550; }
    .status.fail { background: #fdf0f0; color: #e74c3c; }

    td.date { font-size: 8px; color: #888; }

    /* ── Footer ────────────────────────────────────────────────── */
    .footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #ddd;
      font-size: 8px;
      color: #aaa;
      text-align: center;
    }

    @media print {
      body { padding: 10px; }
    }
  </style>
</head>
<body>

  <!-- Branded Header -->
  <div class="header">
    ${logoBase64 ? `<img src="${logoBase64}" alt="Gordon College Logo"/>` : ""}
    <div class="header-text">
      <h1>Gordon College</h1>
      <h2>${examTitle}${examSubject ? ` — ${examSubject}` : ""}</h2>
      <p>Grade Report • ${filterLabel} • Generated ${exportDate}</p>
    </div>
  </div>

  <!-- Summary Statistics -->
  <div class="summary">
    <div class="stat-box">
      <div class="stat-value">${totalGraded}</div>
      <div class="stat-label">Total Graded</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${avgScore}%</div>
      <div class="stat-label">Average Score</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${passCount}</div>
      <div class="stat-label">Passed (${passRate}%)</div>
    </div>
    <div class="stat-box fail-box">
      <div class="stat-value">${failCount}</div>
      <div class="stat-label">Failed (${totalGraded > 0 ? 100 - passRate : 0}%)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${highestScore}%</div>
      <div class="stat-label">Highest</div>
    </div>
    <div class="stat-box fail-box">
      <div class="stat-value">${lowestScore}%</div>
      <div class="stat-label">Lowest</div>
    </div>
  </div>

  <!-- Grade Table -->
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Student ID</th>
        <th>Score</th>
        <th>Total</th>
        <th>Percentage</th>
        <th>Grade</th>
        <th>Status</th>
        <th>Date Scanned</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    GC SmartCheck Grade Export &bull; Gordon College &bull; ${filterLabel} &bull; ${exportDate}
  </div>

</body>
</html>`;

    onProgress?.("Rendering PDF…", 75);
    const { uri } = await Print.printToFileAsync({ html });

    onProgress?.("Opening share sheet…", 90);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Export ${examTitle} Grades (PDF)`,
        UTI: "com.adobe.pdf",
      });
    }

    return {
      success: true,
      message: `PDF exported: ${rows.length} records.`,
      fileUri: uri,
      recordCount: rows.length,
    };
  }

  // ── CSV String Builder (shared by CSV & Excel) ───────────────────────────

  /**
   * Builds a properly escaped CSV string from grade rows.
   * Uses chunked processing for large datasets (#8) to avoid
   * building one massive string in a single pass.
   */
  private static buildCsvString(
    rows: ExportableRow[],
    onProgress?: ExportProgressCallback,
  ): string {
    const headerLine = CSV_HEADERS.map(escapeCsvField).join(",");
    const chunks: string[] = [headerLine];

    for (let i = 0; i < rows.length; i += CSV_CHUNK_SIZE) {
      const slice = rows.slice(i, i + CSV_CHUNK_SIZE);
      const chunkLines = slice.map((r) => {
        const fields = [
          r.studentId,
          r.score.toString(),
          r.totalPoints.toString(),
          `${r.percentage}%`,
          r.gradeEquivalent,
          r.isPassing ? "PASS" : "FAIL",
          formatDate(r.dateScanned),
        ];
        return fields.map(escapeCsvField).join(",");
      });
      chunks.push(chunkLines.join("\n"));

      // Report progress during large builds
      if (onProgress && rows.length > CSV_CHUNK_SIZE) {
        const pct = Math.round(55 + (25 * Math.min(i + CSV_CHUNK_SIZE, rows.length)) / rows.length);
        onProgress?.(`Processing rows ${i + 1}–${Math.min(i + CSV_CHUNK_SIZE, rows.length)}…`, pct);
      }
    }

    return chunks.join("\n");
  }

  // ── Audit Logging (#7) ───────────────────────────────────────────────────

  /**
   * Logs a grade export event to the audit_logs Firestore collection.
   * Non-blocking — never throws.
   */
  private static async logExportEvent(
    examId: string,
    examTitle: string,
    format: ExportFormat,
    dateFilter: ExportDateFilter,
    recordCount: number,
    fileName: string,
  ): Promise<void> {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // Resolve user profile for proper audit trail
      let userName = auth.currentUser?.email ?? "Unknown";
      let instructorId = "INSTRUCTOR-000";
      try {
        const profile = await UserService.getUserProfile(uid);
        if (profile) {
          userName = profile.fullName || userName;
          instructorId = profile.instructorId || instructorId;
        }
      } catch {
        // fall through with defaults
      }

      await addDoc(collection(db, AUDIT_LOGS_COLLECTION), {
        examId,
        userId: uid,
        userName,
        instructorId,
        action: "export",
        metadata: {
          examTitle,
          format,
          dateFilter,
          recordCount,
          fileName,
          platform: Platform.OS,
          exportedAt: new Date().toISOString(),
        },
        timestamp: serverTimestamp(),
      });

      console.log(
        `[GradeExport] Audit log: exported ${recordCount} records as ${format} (${dateFilter})`,
      );
    } catch (error) {
      // Audit logging should never block the export
      console.warn("[GradeExport] Failed to write audit log:", error);
    }
  }
}
