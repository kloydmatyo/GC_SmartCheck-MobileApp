/**
 * utils/exportUtils.ts
 *
 * Fixed: import from 'expo-file-system/legacy' to avoid deprecation warning.
 * The new API uses File/Directory classes but legacy is still fully supported.
 *
 * Required packages:
 *   npx expo install expo-file-system expo-sharing expo-print
 */

// Use the legacy import to avoid "writeAsStringAsync is deprecated" warning
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Quiz, StudentResult } from '../types';

function getBaseDir(): string {
  return FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
}

// ── CSV / EXCEL EXPORT ───────────────────────────────────────────

function buildCsvContent(results: StudentResult[], quiz: Quiz): string {
  const headers = [
    'Student ID',
    'Student Name',
    'Score',
    'Total Items',
    'Percentage',
    ...Array.from({ length: quiz.numberOfItems }, (_, i) => `Q${i + 1}`),
  ];

  const rows = results.map((r) => {
    const pct = ((r.score / r.totalItems) * 100).toFixed(1);
    const answerCells = Array.from(
      { length: quiz.numberOfItems },
      (_, i) => r.answers[i] ?? ''
    );
    return [r.studentId, `"${r.studentName}"`, r.score, r.totalItems, `${pct}%`, ...answerCells];
  });

  return [headers, ...rows].map((row) => row.join(',')).join('\n');
}

export async function exportResultsAsCSV(
  results: StudentResult[],
  quiz: Quiz,
  className: string
): Promise<void> {
  const csv      = buildCsvContent(results, quiz);
  const fileName = `${className}_${quiz.name.replace(/\s+/g, '_')}_results.csv`;
  const fileUri  = getBaseDir() + fileName;

  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: `Export ${quiz.name} Results`,
      UTI: 'public.comma-separated-values-text',
    });
  }
}

export async function exportResultsAsExcel(
  results: StudentResult[],
  quiz: Quiz,
  className: string
): Promise<void> {
  const BOM      = '\uFEFF';
  const csv      = BOM + buildCsvContent(results, quiz);
  const fileName = `${className}_${quiz.name.replace(/\s+/g, '_')}_results.csv`;
  const fileUri  = getBaseDir() + fileName;

  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.ms-excel',
      dialogTitle: `Export ${quiz.name} as Excel`,
    });
  }
}

// ── PRINTABLE PDF ANSWER SHEET ───────────────────────────────────

function buildAnswerSheetHTML(params: {
  studentName: string;
  studentId: string;
  numberOfItems: number;
  quizName: string;
  subject: string;
  className: string;
}): string {
  const { studentName, studentId, numberOfItems, quizName, subject, className } = params;

  const idStr  = studentId.padEnd(10, ' ').slice(0, 10);
  const idCols = idStr.split('').map((_, colIdx) =>
    Array.from({ length: 10 }, (__, d) => {
      const filled = parseInt(idStr[colIdx]) === d;
      return `<div class="idb ${filled ? 'f' : ''}">${d}</div>`;
    }).join('')
  ).map((col) => `<div class="idc">${col}</div>`).join('');

  const choices = ['A', 'B', 'C', 'D', 'E'];
  const rows    = Array.from({ length: numberOfItems }, (_, i) => `
    <div class="qrow">
      <span class="qn">${i + 1}.</span>
      <div class="qb">${choices.map((c) => `<div class="bbl">${c}</div>`).join('')}</div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10px;padding:12px;background:#fff}
h2{font-size:13px;text-align:center;margin-bottom:2px}
h3{font-size:10px;text-align:center;color:#555;margin-bottom:8px}
.hr{border:none;border-top:1px dashed #ccc;margin:6px 0}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
.si label{font-weight:bold;display:block;margin-bottom:1px}
.il{border-bottom:1px solid #000;min-width:180px;height:14px;display:block;margin-bottom:4px;font-size:11px}
.ids{display:flex;gap:2px;margin-top:4px}
.idc{display:flex;flex-direction:column;align-items:center;gap:1px}
.idb{width:13px;height:13px;border-radius:50%;border:1px solid #333;display:flex;align-items:center;justify-content:center;font-size:7px}
.idb.f{background:#00a550;color:#fff}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-top:8px}
.qrow{display:flex;align-items:center;gap:2px;padding:1px 0}
.qn{width:16px;text-align:right;font-size:9px}
.qb{display:flex;gap:2px}
.bbl{width:15px;height:15px;border-radius:50%;border:1px solid #333;display:flex;align-items:center;justify-content:center;font-size:7px}
@media print{body{padding:6px}page-break-after:always}
</style></head><body>
<h2>${quizName}</h2>
<h3>${subject} — ${className}</h3>
<hr class="hr"/>
<div class="top">
  <div class="si">
    <label>Name:</label><div class="il">${studentName}</div>
    <label>Student ID:</label><div class="il">${studentId}</div>
    <label>Date: ___________________</label>
  </div>
  <div>
    <div style="font-size:8px;text-align:center;margin-bottom:2px">STUDENT ID</div>
    <div class="ids">${idCols}</div>
  </div>
</div>
<hr class="hr"/>
<div class="grid">${rows}</div>
</body></html>`;
}

export async function generateAnswerSheetPDF(params: {
  students: Array<{ id: string; name: string }>;
  quiz: { name: string; subject: string; numberOfItems: number };
  className: string;
}): Promise<void> {
  const { students, quiz, className } = params;
  const list = students.length > 0 ? students : [{ id: '', name: '' }];

  const pages = list.map((s) =>
    buildAnswerSheetHTML({
      studentName:   s.name,
      studentId:     s.id,
      numberOfItems: quiz.numberOfItems,
      quizName:      quiz.name,
      subject:       quiz.subject,
      className,
    })
  );

  const html    = pages.join('<div style="page-break-after:always"></div>');
  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Answer Sheet — ${quiz.name}`,
      UTI: 'com.adobe.pdf',
    });
  }
}