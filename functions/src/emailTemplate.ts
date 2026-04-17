/**
 * GC-branded email template for student score notifications.
 * Ported from Web-Based-for-SIA/src/services/emailTemplateService.ts
 */

// ─── Branding constants ──────────────────────────────────────────────────────
const GC_FULL_NAME = "Gordon College";
const GC_SYSTEM_NAME = "GC SMART CHECK";
const GC_TAGLINE = "Excellence in Education";
const GC_ADDRESS = "Olongapo City, Zambales, Philippines";
const GC_PRIMARY_HEX = "#1a472a";
const GC_GOLD_HEX = "#cca43b";
const GC_GREEN_LIGHT_HEX = "#e8f5e9";
const GC_TEXT_DARK_HEX = "#212529";
const GC_TEXT_MUTED_HEX = "#6b7280";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StudentScoreEmailData {
  studentName: string;
  studentId: string;
  className: string;
  examTitle: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  grade: string;
  date: string;
  passingThreshold: number;
  instructorName?: string;
  subject?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "#15803d";
    case "B+":
    case "B": return "#4d7c0f";
    case "C": return "#a16207";
    case "D": return "#c2410c";
    case "F": return "#dc2626";
    default: return GC_TEXT_MUTED_HEX;
  }
}

function statusLabel(pct: number, threshold: number) {
  return pct >= threshold
    ? { text: "PASSED", color: "#15803d" }
    : { text: "FAILED", color: "#dc2626" };
}

// ─── Base layout ─────────────────────────────────────────────────────────────

function baseLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
  style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="background:${GC_PRIMARY_HEX};padding:28px 32px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${esc(GC_FULL_NAME)}</h1>
    <p style="margin:4px 0 0;color:${GC_GOLD_HEX};font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${esc(GC_TAGLINE)}</p>
  </td></tr>
  <tr><td style="height:3px;background:${GC_GOLD_HEX};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:32px;color:${GC_TEXT_DARK_HEX};font-size:14px;line-height:1.6;">${body}</td></tr>
  <tr><td style="background:${GC_GREEN_LIGHT_HEX};padding:20px 32px;border-top:1px solid #e5e7eb;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="font-size:12px;color:${GC_TEXT_MUTED_HEX};line-height:1.5;">
        <strong style="color:${GC_PRIMARY_HEX};">${esc(GC_SYSTEM_NAME)}</strong><br/>
        ${esc(GC_FULL_NAME)} &bull; ${esc(GC_ADDRESS)}
      </td>
      <td align="right" style="font-size:11px;color:${GC_TEXT_MUTED_HEX};">
        This is an automated message.<br/>Please do not reply to this email.
      </td>
    </tr></table>
  </td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
  <tr><td align="center" style="padding:16px;font-size:11px;color:#9ca3af;">
    &copy; ${new Date().getFullYear()} ${esc(GC_FULL_NAME)}. All rights reserved.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ─── HTML template ────────────────────────────────────────────────────────────

export function studentScoreHtml(data: StudentScoreEmailData): string {
  const { text: statusText, color: statusColor } = statusLabel(data.percentage, data.passingThreshold);

  const body = `
    <p style="margin:0 0 6px;">Dear <strong>${esc(data.studentName)}</strong>,</p>
    <p style="margin:0 0 20px;color:${GC_TEXT_MUTED_HEX};">
      Here are your exam results for <strong>${esc(data.examTitle)}</strong>
      in <strong>${esc(data.className)}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
      style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding-bottom:16px;border-bottom:1px solid #e5e7eb;" colspan="2">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              <td>
                <span style="font-size:36px;font-weight:700;color:${GC_PRIMARY_HEX};">${data.score}</span>
                <span style="font-size:18px;color:${GC_TEXT_MUTED_HEX};">/ ${data.totalQuestions}</span>
              </td>
              <td align="right">
                <span style="display:inline-block;padding:6px 16px;border-radius:20px;font-size:14px;font-weight:700;color:#fff;background:${statusColor};">
                  ${statusText}
                </span>
              </td>
            </tr></table>
          </td></tr>
          <tr>
            <td style="padding-top:16px;" width="50%">
              <span style="display:block;font-size:11px;color:${GC_TEXT_MUTED_HEX};text-transform:uppercase;letter-spacing:0.5px;">Percentage</span>
              <span style="display:block;font-size:20px;font-weight:700;color:${GC_TEXT_DARK_HEX};">${data.percentage}%</span>
            </td>
            <td style="padding-top:16px;" width="50%">
              <span style="display:block;font-size:11px;color:${GC_TEXT_MUTED_HEX};text-transform:uppercase;letter-spacing:0.5px;">Grade</span>
              <span style="display:block;font-size:20px;font-weight:700;color:${gradeColor(data.grade)};">${esc(data.grade)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:12px;" width="50%">
              <span style="display:block;font-size:11px;color:${GC_TEXT_MUTED_HEX};text-transform:uppercase;letter-spacing:0.5px;">Student ID</span>
              <span style="display:block;font-size:14px;color:${GC_TEXT_DARK_HEX};font-family:monospace;">${esc(data.studentId)}</span>
            </td>
            <td style="padding-top:12px;" width="50%">
              <span style="display:block;font-size:11px;color:${GC_TEXT_MUTED_HEX};text-transform:uppercase;letter-spacing:0.5px;">Date</span>
              <span style="display:block;font-size:14px;color:${GC_TEXT_DARK_HEX};">${esc(data.date)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:12px;" width="50%">
              <span style="display:block;font-size:11px;color:${GC_TEXT_MUTED_HEX};text-transform:uppercase;letter-spacing:0.5px;">Passing Score</span>
              <span style="display:block;font-size:14px;color:${GC_TEXT_DARK_HEX};">${data.passingThreshold}%</span>
            </td>
            <td style="padding-top:12px;" width="50%">
              ${data.subject ? `
                <span style="display:block;font-size:11px;color:${GC_TEXT_MUTED_HEX};text-transform:uppercase;letter-spacing:0.5px;">Subject</span>
                <span style="display:block;font-size:14px;color:${GC_TEXT_DARK_HEX};">${esc(data.subject)}</span>
              ` : ""}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    ${data.instructorName ? `<p style="margin:16px 0 0;font-size:13px;color:${GC_TEXT_MUTED_HEX};">— ${esc(data.instructorName)}, Instructor</p>` : ""}`;

  return baseLayout(body);
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

export function studentScoreText(data: StudentScoreEmailData): string {
  const status = data.percentage >= data.passingThreshold ? "PASSED" : "FAILED";
  return [
    GC_SYSTEM_NAME,
    "",
    `Dear ${data.studentName},`,
    "",
    `Here are your exam results for "${data.examTitle}" in ${data.className}:`,
    "",
    `  Score:       ${data.score} / ${data.totalQuestions}`,
    `  Percentage:  ${data.percentage}%`,
    `  Grade:       ${data.grade}`,
    `  Status:      ${status}`,
    `  Date:        ${data.date}`,
    "",
    `Passing threshold: ${data.passingThreshold}%`,
    data.subject ? `Subject: ${data.subject}` : "",
    data.instructorName ? `Instructor: ${data.instructorName}` : "",
    "",
    "---",
    `${GC_FULL_NAME} | ${GC_ADDRESS}`,
    "This is an automated message. Please do not reply.",
  ]
    .filter(Boolean)
    .join("\n");
}
