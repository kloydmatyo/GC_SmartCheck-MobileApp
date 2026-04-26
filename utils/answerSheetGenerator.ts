import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { jsPDF } from "jspdf";

export interface AnswerSheetTemplateData {
  name: string;
  description?: string;
  numQuestions: 20 | 50 | 100 | 150 | 200;
  choicesPerQuestion: 4 | 5;
  examName?: string;
  className?: string;
  examCode?: string;
  courseCode?: string;
  answerKey?: string[];
  institutionName?: string;
  logoBase64?: string;
}

function drawBubble(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  filled = false,
) {
  doc.setDrawColor(0, 0, 0);
  if (filled) {
    doc.setFillColor(0, 0, 0);
    doc.circle(x, y, size * 0.5, "FD");
  } else {
    doc.setFillColor(255, 255, 255);
    doc.circle(x, y, size * 0.5, "FD");
  }
}

function drawShadingGuide(
  doc: jsPDF,
  px: number,
  py: number,
  panelW: number,
  bubbleSize: number,
) {
  const labelW = Math.min(24, panelW * 0.45);
  const bStartX = px + labelW;
  const remaining = panelW - labelW;
  const bSpacing = Math.min(4.5, remaining / 5.5);
  const bR = Math.min(bubbleSize * 0.5, bSpacing * 0.42);
  const lineH = bR * 2 + 1.8;

  const colLabels = ["A", "B", "C", "D", "E"];

  const items: Array<{
    label: string;
    bubbles: Array<{ filled: boolean; partial?: boolean }>;
  }> = [
    {
      label: "Correct",
      bubbles: [
        { filled: false },
        { filled: true },
        { filled: false },
        { filled: false },
        { filled: false },
      ],
    },
    {
      label: "Wrong",
      bubbles: [
        { filled: false },
        { filled: false, partial: true },
        { filled: false },
        { filled: false },
        { filled: false },
      ],
    },
    {
      label: "Wrong",
      bubbles: [
        { filled: true },
        { filled: true },
        { filled: false },
        { filled: false },
        { filled: false },
      ],
    },
    {
      label: "Erase OK",
      bubbles: [
        { filled: false },
        { filled: false },
        { filled: false },
        { filled: true },
        { filled: false },
      ],
    },
  ];

  const reminders = [
    "Use No. 2 pencil or dark pen.",
    "Fill bubble completely.",
    "Erase stray marks fully.",
  ];

  let gy = py;

  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.text("SHADING GUIDE", px + panelW / 2, gy, { align: "center" });
  gy += 4;

  doc.setLineWidth(0.15);
  doc.setDrawColor(0);
  doc.line(px, gy, px + panelW, gy);
  gy += 2;

  doc.setFontSize(5);
  doc.setFont("helvetica", "bold");
  for (let i = 0; i < 5; i++) {
    doc.text(colLabels[i], bStartX + i * bSpacing, gy + 1.5, {
      align: "center",
    });
  }
  gy += 3.5;

  for (const item of items) {
    doc.setFontSize(4.8);
    doc.setFont("helvetica", "normal");
    doc.text(item.label, px, gy + bR + 0.3, { baseline: "middle" });

    for (let i = 0; i < item.bubbles.length; i++) {
      const bx = bStartX + i * bSpacing;
      const by = gy + bR;
      const b = item.bubbles[i];

      doc.setDrawColor(0);
      if (b.filled) {
        doc.setFillColor(0, 0, 0);
        doc.circle(bx, by, bR, "FD");
      } else if (b.partial) {
        doc.setFillColor(255, 255, 255);
        doc.circle(bx, by, bR, "FD");
        doc.setFillColor(170, 170, 170);
        doc.circle(bx, by, bR * 0.55, "F");
      } else {
        doc.setFillColor(255, 255, 255);
        doc.circle(bx, by, bR, "FD");
      }
    }
    gy += lineH;
  }

  gy += 1;
  doc.setLineWidth(0.15);
  doc.line(px, gy, px + panelW, gy);
  gy += 2;

  doc.setFontSize(4.5);
  doc.setFont("helvetica", "normal");
  for (const r of reminders) {
    doc.text(`\u2022 ${r}`, px, gy);
    gy += 3.2;
  }
}

function drawMiniSheet(
  doc: jsPDF,
  startX: number,
  startY: number,
  width: number,
  height: number,
  template: AnswerSheetTemplateData,
  questionsPerSheet: number,
  logoData: string,
) {
  const margin = 10;
  const bubbleSize = 3.5;
  const idBubbleSize = 3.0;
  const markerSize = 8;
  const regMarkSize = 2.0;
  const cornerInset = 2;

  let currentY = startY + cornerInset + 3;

  if (logoData) {
    const logoSize = 10;
    const hx = startX + (width - 55) / 2;
    doc.addImage(logoData, "PNG", hx, currentY, logoSize, logoSize);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(
      template.institutionName || "Gordon College",
      hx + logoSize + 3,
      currentY + 6,
    );
    currentY += logoSize + 2;
  } else {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const centerX = startX + width / 2;
    doc.text(
      template.institutionName || "Gordon College",
      centerX,
      currentY + 5,
      {
        align: "center",
      },
    );
    currentY += markerSize + 2;
  }

  if (template.examCode) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const centerX = startX + width / 2;
    doc.text(`Exam Code: ${template.examCode}`, centerX, currentY, {
      align: "center",
    });
    currentY += 4;
  }

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");

  const fieldStartX = startX + margin;
  const fieldEndX = startX + width - margin;
  const usableW = fieldEndX - fieldStartX;

  if (questionsPerSheet === 50) {
    const nameEnd50 = fieldStartX + usableW * 0.4;
    const dateEnd50 = nameEnd50 + usableW * 0.22;
    doc.text("Name:", fieldStartX, currentY);
    doc.line(fieldStartX + 11, currentY, nameEnd50, currentY);
    doc.text("Date:", nameEnd50 + 3, currentY);
    doc.line(nameEnd50 + 13, currentY, dateEnd50, currentY);
    doc.text("Course Code:", dateEnd50 + 3, currentY);
    doc.line(dateEnd50 + 24, currentY, fieldEndX, currentY);
  } else {
    const nameEnd = fieldStartX + usableW * 0.65;
    doc.text("Name:", fieldStartX, currentY);
    doc.line(fieldStartX + 11, currentY, nameEnd, currentY);
    doc.text("Date:", nameEnd + 3, currentY);
    doc.line(nameEnd + 13, currentY, fieldEndX, currentY);
  }

  currentY += 4;

  const idTopY = currentY - 1;
  const idPadMini = 2;
  const idLabelWMini = 6;
  const idColSpacing = 4.8;
  const idContentWMini = idLabelWMini + 9 * idColSpacing;
  const idBorderWMini = idContentWMini + idPadMini * 2;
  const idBorderXMini = startX + margin;
  const idContentXMini = idBorderXMini + idPadMini;
  const idStartX = idContentXMini + idLabelWMini;

  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("Student ZipGrade ID", idContentXMini + 1, currentY + 2);
  doc.setFontSize(5.2);
  doc.setFont("helvetica", "normal");
  doc.text("e.g. 202300109", idBorderXMini + idBorderWMini - 1.5, currentY + 2, {
    align: "right",
  });
  currentY += 4.5;

  const idBoxWidth = 4.2;
  const idBoxHeight = 4.0;

  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.5);
  for (let i = 0; i < 9; i++) {
    const idBoxX = idStartX + i * idColSpacing - idBoxWidth / 2;
    doc.rect(idBoxX, currentY, idBoxWidth, idBoxHeight);
  }
  doc.setLineWidth(0.2);

  currentY += idBoxHeight + 2;

  const idRowSpacing = 4.0;
  const rowLabels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

  doc.setFontSize(5.5);

  for (let col = 0; col < 9; col++) {
    const x = idStartX + col * idColSpacing;

    for (let row = 0; row < 10; row++) {
      const y = currentY + row * idRowSpacing;

      if (col === 0) {
        doc.setFont("helvetica", "bold");
        doc.text(rowLabels[row], idContentXMini + 1.5, y + 1.2);
      }

      drawBubble(doc, x, y, idBubbleSize);
    }
  }

  const idBottomYMini = currentY + 10 * idRowSpacing + 1;

  doc.setLineWidth(0.5);
  doc.rect(idBorderXMini, idTopY, idBorderWMini, idBottomYMini - idTopY + 1);
  doc.setLineWidth(0.2);

  const miniGuideX = idBorderXMini + idBorderWMini + 4;
  const miniGuideW = startX + width - margin - miniGuideX;
  if (miniGuideW >= 20) {
    let guideStartY = idTopY + 4;
    if (questionsPerSheet !== 50) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      const ccLabelW = doc.getTextWidth("Course Code:");
      doc.text("Course Code:", miniGuideX, idTopY + 4);
      doc.setLineWidth(0.2);
      doc.line(
        miniGuideX + ccLabelW + 1,
        idTopY + 4,
        miniGuideX + miniGuideW,
        idTopY + 4,
      );
      guideStartY = idTopY + 8;
    }

    drawShadingGuide(doc, miniGuideX, guideStartY, miniGuideW, 2.5);
  }

  currentY = idBottomYMini + 3;

  const choices = ["A", "B", "C", "D", "E"].slice(
    0,
    template.choicesPerQuestion,
  );
  const bubbleSpacing = 5.5;
  const ansRowH = 5.2;
  const numW = 10;

  function drawMiniQBlock(
    bx: number,
    by: number,
    startQ: number,
    endQ: number,
  ) {
    let qY = by;

    doc.setFillColor(0, 0, 0);
    doc.rect(bx, qY, regMarkSize, regMarkSize, "F");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    for (let i = 0; i < choices.length; i++) {
      doc.text(choices[i], bx + numW + i * bubbleSpacing, qY + 2.5, {
        align: "center",
      });
    }
    qY += 5;

    for (let q = startQ; q <= endQ; q++) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(q.toString(), bx + numW - 3, qY + 1.5, { align: "right" });
      doc.setFont("helvetica", "normal");
      const correctLetter = template.answerKey?.[q - 1]?.toUpperCase();
      for (let i = 0; i < choices.length; i++) {
        const isFilled = correctLetter ? choices[i] === correctLetter : false;
        drawBubble(
          doc,
          bx + numW + i * bubbleSpacing,
          qY,
          bubbleSize,
          isFilled,
        );
      }
      qY += ansRowH;
    }
    return qY;
  }

  if (questionsPerSheet === 50) {
    const blocks = [
      { startQ: 1, endQ: 10 },
      { startQ: 11, endQ: 20 },
      { startQ: 21, endQ: 30 },
      { startQ: 31, endQ: 40 },
      { startQ: 41, endQ: 50 },
    ];

    const blockWidth = (width - 2 * margin) / 5;

    for (let i = 0; i < 5; i++) {
      const bx = startX + margin + i * blockWidth;
      drawMiniQBlock(bx, currentY, blocks[i].startQ, blocks[i].endQ);
    }
  } else {
    const colWidth = (width - 2 * margin) / 2;

    for (let col = 0; col < 2; col++) {
      const startQ = col * 10 + 1;
      const endQ = Math.min((col + 1) * 10, questionsPerSheet);
      const bx = startX + margin + col * colWidth;
      drawMiniQBlock(bx, currentY, startQ, endQ);
    }
  }

  doc.setFillColor(0, 0, 0);
  const topMarkerY = startY + cornerInset;
  const bottomMarkerY = startY + height - markerSize - cornerInset;

  doc.rect(startX + cornerInset, topMarkerY, markerSize, markerSize, "F");
  doc.rect(
    startX + width - markerSize - cornerInset,
    topMarkerY,
    markerSize,
    markerSize,
    "F",
  );
  doc.rect(startX + cornerInset, bottomMarkerY, markerSize, markerSize, "F");
  doc.rect(
    startX + width - markerSize - cornerInset,
    bottomMarkerY,
    markerSize,
    markerSize,
    "F",
  );

  doc.rect(startX, startY, width, height);
}

function drawFullSheet(
  doc: jsPDF,
  startX: number,
  startY: number,
  width: number,
  height: number,
  template: AnswerSheetTemplateData,
  logoData: string,
  questionOffset = 0,
  blocksPerCol = 2,
) {
  const margin = 10;
  const markerSize = 8;
  const regMarkSize = 2.0;
  const cornerInset = 2;
  const numChoices = template.choicesPerQuestion;
  const choices = ["A", "B", "C", "D", "E"].slice(0, numChoices);

  const bubbleSize = 3.5;
  const bubbleGap = 5.5;
  const rowH = 5.2;

  const idBubbleSize = 3.0;
  const idColGap = 4.8;
  const idRowH = 4.0;

  let currentY = startY + cornerInset + 3;
  const lx = startX + margin;
  const rx = startX + width - margin;
  const usableW = rx - lx;

  function drawQBlock(bx: number, by: number, startQ: number, endQ: number) {
    const numW = 10;
    let qY = by;

    doc.setFillColor(0, 0, 0);
    doc.rect(bx, qY, regMarkSize, regMarkSize, "F");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    for (let i = 0; i < choices.length; i++) {
      doc.text(choices[i], bx + numW + i * bubbleGap, qY + 2.5, {
        align: "center",
      });
    }
    qY += 5;

    for (let q = startQ; q <= endQ; q++) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(q.toString(), bx + numW - 3, qY + 1.5, { align: "right" });
      doc.setFont("helvetica", "normal");
      const correctLetter = template.answerKey?.[q - 1]?.toUpperCase();
      for (let i = 0; i < choices.length; i++) {
        const isFilled = correctLetter ? choices[i] === correctLetter : false;
        drawBubble(doc, bx + numW + i * bubbleGap, qY, bubbleSize, isFilled);
      }
      qY += rowH;
    }
    return qY;
  }

  const qBlockW = 10 + (numChoices - 1) * bubbleGap + bubbleSize;

  doc.setFillColor(0, 0, 0);
  doc.rect(
    startX + cornerInset,
    startY + cornerInset,
    markerSize,
    markerSize,
    "F",
  );
  doc.rect(
    startX + width - markerSize - cornerInset,
    startY + cornerInset,
    markerSize,
    markerSize,
    "F",
  );

  if (logoData) {
    const logoSize = 10;
    const hx = startX + (width - 55) / 2;
    doc.addImage(logoData, "PNG", hx, currentY, logoSize, logoSize);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(
      template.institutionName || "Gordon College",
      hx + logoSize + 3,
      currentY + 6,
    );
    currentY += logoSize + 2;
  } else {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(
      template.institutionName || "Gordon College",
      startX + width / 2,
      currentY + 5,
      { align: "center" },
    );
    currentY += markerSize + 2;
  }

  if (template.examCode) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`Exam Code: ${template.examCode}`, startX + width / 2, currentY, {
      align: "center",
    });
    currentY += 4;
  }

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  const nameEnd = lx + usableW * 0.4;
  const dateEnd = nameEnd + usableW * 0.22;
  doc.text("Name:", lx, currentY);
  doc.line(lx + 11, currentY, nameEnd, currentY);
  doc.text("Date:", nameEnd + 3, currentY);
  doc.line(nameEnd + 13, currentY, dateEnd, currentY);
  doc.text("Course Code:", dateEnd + 3, currentY);
  doc.line(dateEnd + 23, currentY, rx, currentY);
  currentY += 4;

  const idLabelW = 6;
  const idPad = 2;
  const idContentW = idLabelW + 9 * idColGap;
  const idBorderW = idContentW + idPad * 2;

  const idBorderX = lx;
  const idContentX = idBorderX + idPad;
  const idStartX = idContentX + idLabelW;

  const idTopY = currentY;
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.text("Student ZipGrade ID", idContentX + 1, currentY + 3);
  doc.setFontSize(5.2);
  doc.setFont("helvetica", "normal");
  doc.text("e.g. 202300109", idBorderX + idBorderW - 1.5, currentY + 3, {
    align: "right",
  });
  currentY += 5.5;

  const idBoxW = 4.2;
  const idBoxH = 4.0;
  doc.setFont("helvetica", "normal");
  for (let i = 0; i < 9; i++) {
    doc.rect(idStartX + i * idColGap - idBoxW / 2, currentY, idBoxW, idBoxH);
  }
  currentY += idBoxH + 2;

  const rowLabels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  doc.setFontSize(5.5);
  for (let row = 0; row < 10; row++) {
    const y = currentY + row * idRowH;
    doc.setFont("helvetica", "bold");
    doc.text(rowLabels[row], idContentX + 1.5, y + 1);
    doc.setFont("helvetica", "normal");
    for (let col = 0; col < 9; col++) {
      drawBubble(doc, idStartX + col * idColGap, y, idBubbleSize);
    }
  }

  const idBottomY = currentY + 10 * idRowH + 1.5;
  doc.setLineWidth(0.4);
  doc.rect(idBorderX, idTopY - 1, idBorderW, idBottomY - idTopY + 2);
  doc.setLineWidth(0.2);

  const guideX = idBorderX + idBorderW + 4;
  const guideW = rx - guideX;
  drawShadingGuide(
    doc,
    guideX,
    idTopY + (blocksPerCol === 3 ? 9 : 8),
    guideW,
    3.0,
  );

  currentY = idBottomY + 3;

  const totalGridW = 5 * qBlockW;
  const colGap = (usableW - totalGridW) / 6;
  const blockVGap = 10 * rowH + 10;

  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < blocksPerCol; row++) {
      const startQ = questionOffset + col * blocksPerCol * 10 + row * 10 + 1;
      const endQ = startQ + 9;
      const bx = lx + colGap + col * (qBlockW + colGap);
      const by = currentY + row * blockVGap;
      drawQBlock(bx, by, startQ, endQ);
    }
  }

  doc.setFillColor(0, 0, 0);
  const bmY = startY + height - markerSize - cornerInset;
  doc.rect(startX + cornerInset, bmY, markerSize, markerSize, "F");
  doc.rect(
    startX + width - markerSize - cornerInset,
    bmY,
    markerSize,
    markerSize,
    "F",
  );

  doc.setFontSize(5);
  doc.setFont("helvetica", "italic");
  doc.text(
    "Do not fold, staple, or tear this answer sheet.",
    startX + width / 2,
    startY + height - 4,
    { align: "center" },
  );
}

async function loadLogoBase64(
  template: AnswerSheetTemplateData,
): Promise<string> {
  if (template.logoBase64) return template.logoBase64;

  try {
    const asset = Asset.fromModule(
      require("@/assets/images/gordon-college-logo.png"),
    );
    await asset.downloadAsync();
    if (!asset.localUri) return "";
    const raw = await FileSystem.readAsStringAsync(asset.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/png;base64,${raw}`;
  } catch (err) {
    console.warn("[AnswerSheetGenerator] Could not load logo:", err);
    return "";
  }
}

async function buildTemplateDoc(
  template: AnswerSheetTemplateData,
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const logoData = await loadLogoBase64(template);

  if (template.numQuestions === 20) {
    const pageWidth = 210;
    const pageHeight = 297;
    const sheetWidth = pageWidth / 2;
    const sheetHeight = pageHeight / 2;
    drawMiniSheet(doc, 0, 0, sheetWidth, sheetHeight, template, 20, logoData);
    drawMiniSheet(
      doc,
      sheetWidth,
      0,
      sheetWidth,
      sheetHeight,
      template,
      20,
      logoData,
    );
    drawMiniSheet(
      doc,
      0,
      sheetHeight,
      sheetWidth,
      sheetHeight,
      template,
      20,
      logoData,
    );
    drawMiniSheet(
      doc,
      sheetWidth,
      sheetHeight,
      sheetWidth,
      sheetHeight,
      template,
      20,
      logoData,
    );
  } else if (template.numQuestions === 50) {
    const pageWidth = 210;
    const pageHeight = 297;
    const sheetWidth = pageWidth;
    const sheetHeight = pageHeight / 2;
    drawMiniSheet(doc, 0, 0, sheetWidth, sheetHeight, template, 50, logoData);
    drawMiniSheet(
      doc,
      0,
      sheetHeight,
      sheetWidth,
      sheetHeight,
      template,
      50,
      logoData,
    );
  } else if (template.numQuestions === 100) {
    drawFullSheet(doc, 0, 0, 210, 297, template, logoData, 0, 2);
  } else if (template.numQuestions === 150) {
    drawFullSheet(doc, 0, 0, 210, 297, template, logoData, 0, 3);
  } else {
    drawFullSheet(doc, 0, 0, 210, 297, template, logoData, 0, 2);
    doc.addPage();
    drawFullSheet(doc, 0, 0, 210, 297, template, logoData, 100, 2);
  }

  return doc;
}

export async function generateAnswerSheetPDF(
  template: AnswerSheetTemplateData,
): Promise<string> {
  const doc = await buildTemplateDoc(template);
  const dataUri = doc.output("datauristring");
  const base64 = dataUri.split(",")[1] || "";

  const safeName = template.name.replace(/[^a-z0-9]/gi, "_");
  const dest = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ""}${safeName}_Answer_Sheet.pdf`;

  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: "application/pdf",
      dialogTitle: "Download Answer Sheet",
      UTI: "com.adobe.pdf",
    });
  }

  return dest;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function previewChoices(count: 4 | 5): string[] {
  return ["A", "B", "C", "D", "E"].slice(0, count);
}

function svgText(
  value: string,
  x: number,
  y: number,
  size: number,
  weight: "normal" | "bold" | "italic" = "normal",
  anchor: "start" | "middle" | "end" = "start",
): string {
  return `<text x="${x}" y="${y}" font-size="${size}" font-family="Arial, Helvetica, sans-serif" font-weight="${weight}" text-anchor="${anchor}" fill="#000">${escapeHtml(value)}</text>`;
}

function svgCircle(x: number, y: number, r: number, filled = false): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" stroke="#000" stroke-width="0.25" fill="${filled ? "#000" : "#fff"}"/>`;
}

function svgRect(
  x: number,
  y: number,
  w: number,
  h: number,
  filled = false,
  strokeWidth = 0.25,
): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="#000" stroke-width="${strokeWidth}" fill="${filled ? "#000" : "none"}"/>`;
}

function renderQuestionBlockSvg(
  startQ: number,
  endQ: number,
  x: number,
  y: number,
  choices: string[],
  bubbleSize: number,
  bubbleSpacing: number,
  rowH: number,
  numW: number,
): string {
  const parts: string[] = [];
  const regMarkSize = 2;
  parts.push(svgRect(x, y, regMarkSize, regMarkSize, true, 0));

  for (let i = 0; i < choices.length; i++) {
    parts.push(
      svgText(
        choices[i],
        x + numW + i * bubbleSpacing,
        y + 2.5,
        2.8,
        "bold",
        "middle",
      ),
    );
  }

  let qY = y + 5;
  const bubbleRadius = bubbleSize * 0.5;
  for (let q = startQ; q <= endQ; q++) {
    parts.push(svgText(String(q), x + numW - 3, qY + 1.5, 2.8, "bold", "end"));
    for (let i = 0; i < choices.length; i++) {
      parts.push(
        svgCircle(x + numW + i * bubbleSpacing, qY, bubbleRadius, false),
      );
    }
    qY += rowH;
  }

  return parts.join("");
}

function renderShadingGuideSvg(px: number, py: number, panelW: number): string {
  const parts: string[] = [];
  const labelW = Math.min(24, panelW * 0.45);
  const bStartX = px + labelW;
  const remaining = panelW - labelW;
  const bSpacing = Math.min(4.5, remaining / 5.5);
  const bR = Math.min(1.2, bSpacing * 0.42);
  const lineH = bR * 2 + 1.8;
  const colLabels = ["A", "B", "C", "D", "E"];

  const items: Array<{
    label: string;
    bubbles: Array<{ filled: boolean; partial?: boolean }>;
  }> = [
    {
      label: "Correct",
      bubbles: [
        { filled: false },
        { filled: true },
        { filled: false },
        { filled: false },
        { filled: false },
      ],
    },
    {
      label: "Wrong",
      bubbles: [
        { filled: false },
        { filled: false, partial: true },
        { filled: false },
        { filled: false },
        { filled: false },
      ],
    },
    {
      label: "Wrong",
      bubbles: [
        { filled: true },
        { filled: true },
        { filled: false },
        { filled: false },
        { filled: false },
      ],
    },
    {
      label: "Erase OK",
      bubbles: [
        { filled: false },
        { filled: false },
        { filled: false },
        { filled: true },
        { filled: false },
      ],
    },
  ];

  let gy = py;
  parts.push(
    svgText("SHADING GUIDE", px + panelW / 2, gy, 2.3, "bold", "middle"),
  );
  gy += 4;
  parts.push(
    `<line x1="${px}" y1="${gy}" x2="${px + panelW}" y2="${gy}" stroke="#000" stroke-width="0.2"/>`,
  );
  gy += 2;

  for (let i = 0; i < 5; i++) {
    parts.push(
      svgText(
        colLabels[i],
        bStartX + i * bSpacing,
        gy + 1.5,
        2.2,
        "bold",
        "middle",
      ),
    );
  }
  gy += 3.5;

  for (const item of items) {
    parts.push(svgText(item.label, px, gy + bR + 0.3, 2.1, "normal", "start"));
    for (let i = 0; i < item.bubbles.length; i++) {
      const bx = bStartX + i * bSpacing;
      const by = gy + bR;
      const bubble = item.bubbles[i];
      if (bubble.partial) {
        parts.push(svgCircle(bx, by, bR, false));
        parts.push(
          `<circle cx="${bx}" cy="${by}" r="${bR * 0.55}" fill="#aaa" stroke="none"/>`,
        );
      } else {
        parts.push(svgCircle(bx, by, bR, bubble.filled));
      }
    }
    gy += lineH;
  }

  gy += 1;
  parts.push(
    `<line x1="${px}" y1="${gy}" x2="${px + panelW}" y2="${gy}" stroke="#000" stroke-width="0.2"/>`,
  );
  gy += 2;

  parts.push(svgText("- Use No. 2 pencil or dark pen.", px, gy, 2.0));
  gy += 3.2;
  parts.push(svgText("- Fill bubble completely.", px, gy, 2.0));
  gy += 3.2;
  parts.push(svgText("- Erase stray marks fully.", px, gy, 2.0));

  return parts.join("");
}

function renderMiniSheetSvg(
  template: AnswerSheetTemplateData,
  originX: number,
  originY: number,
  width: number,
  height: number,
  questionsPerSheet: 20 | 50,
): string {
  const parts: string[] = [];
  const margin = 10;
  const bubbleSize = 3.5;
  const idBubbleSize = 3.0;
  const markerSize = 8;
  const cornerInset = 2;
  const choices = previewChoices(template.choicesPerQuestion);

  let currentY = originY + cornerInset + 3;

  if (template.logoBase64) {
    const logoSize = 10;
    const hx = originX + (width - 55) / 2;
    parts.push(
      `<image href="${template.logoBase64}" x="${hx}" y="${currentY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`,
    );
    parts.push(
      svgText(
        template.institutionName || "Gordon College",
        hx + logoSize + 3,
        currentY + 6,
        4.2,
        "bold",
      ),
    );
    currentY += logoSize + 2;
  } else {
    parts.push(
      svgText(
        template.institutionName || "Gordon College",
        originX + width / 2,
        currentY + 5,
        4.2,
        "bold",
        "middle",
      ),
    );
    currentY += markerSize + 2;
  }

  parts.push(
    svgText(
      `Exam Code: ${template.examCode || "EX-XXXXXX"}`,
      originX + width / 2,
      currentY,
      2.5,
      "normal",
      "middle",
    ),
  );
  currentY += 4;

  const fieldStartX = originX + margin;
  const fieldEndX = originX + width - margin;
  const usableW = fieldEndX - fieldStartX;
  const nameEnd50 = fieldStartX + usableW * 0.4;
  const dateEnd50 = nameEnd50 + usableW * 0.22;

  parts.push(svgText("Name:", fieldStartX, currentY, 2.6, "bold"));
  parts.push(
    `<line x1="${fieldStartX + 11}" y1="${currentY}" x2="${nameEnd50}" y2="${currentY}" stroke="#000" stroke-width="0.2"/>`,
  );
  parts.push(svgText("Date:", nameEnd50 + 3, currentY, 2.6, "bold"));
  parts.push(
    `<line x1="${nameEnd50 + 13}" y1="${currentY}" x2="${dateEnd50}" y2="${currentY}" stroke="#000" stroke-width="0.2"/>`,
  );
  parts.push(
    svgText(
      questionsPerSheet === 50 ? "Course Code:" : "Course:",
      dateEnd50 + 3,
      currentY,
      2.6,
      "bold",
    ),
  );
  parts.push(
    `<line x1="${dateEnd50 + (questionsPerSheet === 50 ? 24 : 15)}" y1="${currentY}" x2="${fieldEndX}" y2="${currentY}" stroke="#000" stroke-width="0.2"/>`,
  );
  currentY += 4;

  const idTopY = currentY - 1;
  const idPadMini = 2;
  const idLabelWMini = 6;
  const idColSpacing = 4.8;
  const idContentWMini = idLabelWMini + 9 * idColSpacing;
  const idBorderWMini = idContentWMini + idPadMini * 2;
  const idBorderXMini = originX + margin;
  const idContentXMini = idBorderXMini + idPadMini;
  const idStartX = idContentXMini + idLabelWMini;

  parts.push(
    svgText(
      "Student ZipGrade ID",
      idContentXMini + 1,
      currentY + 2,
      2.1,
      "bold",
    ),
  );
  parts.push(
    svgText(
      "e.g. 202300109",
      idBorderXMini + idBorderWMini - 1.5,
      currentY + 2,
      2.0,
      "normal",
      "end",
    ),
  );
  currentY += 4.5;

  const idBoxWidth = 4.2;
  const idBoxHeight = 4.0;
  for (let i = 0; i < 9; i++) {
    const idBoxX = idStartX + i * idColSpacing - idBoxWidth / 2;
    parts.push(svgRect(idBoxX, currentY, idBoxWidth, idBoxHeight, false, 0.4));
  }
  currentY += idBoxHeight + 2;

  const idRowSpacing = 4.0;
  const rowLabels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let col = 0; col < 9; col++) {
    const x = idStartX + col * idColSpacing;
    for (let row = 0; row < 10; row++) {
      const y = currentY + row * idRowSpacing;
      if (col === 0) {
        parts.push(
          svgText(rowLabels[row], idContentXMini + 1.5, y + 1.2, 2.1, "bold"),
        );
      }
      parts.push(svgCircle(x, y, idBubbleSize * 0.5, false));
    }
  }

  const idBottomYMini = currentY + 10 * idRowSpacing + 1;
  parts.push(
    svgRect(
      idBorderXMini,
      idTopY,
      idBorderWMini,
      idBottomYMini - idTopY + 1,
      false,
      0.5,
    ),
  );

  const miniGuideX = idBorderXMini + idBorderWMini + 4;
  const miniGuideW = originX + width - margin - miniGuideX;
  if (miniGuideW >= 20) {
    let guideStartY = idTopY + 4;
    if (questionsPerSheet !== 50) {
      parts.push(svgText("Course Code:", miniGuideX, idTopY + 4, 2.5, "bold"));
      parts.push(
        `<line x1="${miniGuideX + 15}" y1="${idTopY + 4}" x2="${miniGuideX + miniGuideW}" y2="${idTopY + 4}" stroke="#000" stroke-width="0.2"/>`,
      );
      guideStartY = idTopY + 8;
    }
    parts.push(renderShadingGuideSvg(miniGuideX, guideStartY, miniGuideW));
  }

  currentY = idBottomYMini + 3;
  const numW = 10;
  const bubbleSpacing = 5.5;
  const ansRowH = 5.2;

  if (questionsPerSheet === 50) {
    const blocks = [
      { startQ: 1, endQ: 10 },
      { startQ: 11, endQ: 20 },
      { startQ: 21, endQ: 30 },
      { startQ: 31, endQ: 40 },
      { startQ: 41, endQ: 50 },
    ];
    const blockWidth = (width - 2 * margin) / 5;
    for (let i = 0; i < 5; i++) {
      const bx = originX + margin + i * blockWidth;
      parts.push(
        renderQuestionBlockSvg(
          blocks[i].startQ,
          blocks[i].endQ,
          bx,
          currentY,
          choices,
          bubbleSize,
          bubbleSpacing,
          ansRowH,
          numW,
        ),
      );
    }
  } else {
    const colWidth = (width - 2 * margin) / 2;
    for (let col = 0; col < 2; col++) {
      const startQ = col * 10 + 1;
      const endQ = Math.min((col + 1) * 10, questionsPerSheet);
      const bx = originX + margin + col * colWidth;
      parts.push(
        renderQuestionBlockSvg(
          startQ,
          endQ,
          bx,
          currentY,
          choices,
          bubbleSize,
          bubbleSpacing,
          ansRowH,
          numW,
        ),
      );
    }
  }

  const topMarkerY = originY + cornerInset;
  const bottomMarkerY = originY + height - markerSize - cornerInset;
  parts.push(
    svgRect(originX + cornerInset, topMarkerY, markerSize, markerSize, true, 0),
  );
  parts.push(
    svgRect(
      originX + width - markerSize - cornerInset,
      topMarkerY,
      markerSize,
      markerSize,
      true,
      0,
    ),
  );
  parts.push(
    svgRect(
      originX + cornerInset,
      bottomMarkerY,
      markerSize,
      markerSize,
      true,
      0,
    ),
  );
  parts.push(
    svgRect(
      originX + width - markerSize - cornerInset,
      bottomMarkerY,
      markerSize,
      markerSize,
      true,
      0,
    ),
  );

  parts.push(svgRect(originX, originY, width, height, false, 0.25));
  return parts.join("");
}

function renderFullSheetSvg(
  template: AnswerSheetTemplateData,
  questionOffset = 0,
  blocksPerCol: 2 | 3 = 2,
): string {
  const startX = 0;
  const startY = 0;
  const width = 210;
  const height = 297;
  const margin = 10;
  const markerSize = 8;
  const regMarkSize = 2;
  const cornerInset = 2;
  const choices = previewChoices(template.choicesPerQuestion);
  const numChoices = choices.length;

  const bubbleSize = 3.5;
  const bubbleGap = 5.5;
  const rowH = 5.2;
  const idBubbleSize = 3.0;
  const idColGap = 4.8;
  const idRowH = 4.0;

  const parts: string[] = [];
  let currentY = startY + cornerInset + 3;
  const lx = startX + margin;
  const rx = startX + width - margin;
  const usableW = rx - lx;

  parts.push(
    svgRect(
      startX + cornerInset,
      startY + cornerInset,
      markerSize,
      markerSize,
      true,
      0,
    ),
  );
  parts.push(
    svgRect(
      startX + width - markerSize - cornerInset,
      startY + cornerInset,
      markerSize,
      markerSize,
      true,
      0,
    ),
  );

  if (template.logoBase64) {
    const logoSize = 10;
    const hx = startX + (width - 55) / 2;
    parts.push(
      `<image href="${template.logoBase64}" x="${hx}" y="${currentY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`,
    );
    parts.push(
      svgText(
        template.institutionName || "Gordon College",
        hx + logoSize + 3,
        currentY + 6,
        4.2,
        "bold",
      ),
    );
    currentY += logoSize + 2;
  } else {
    parts.push(
      svgText(
        template.institutionName || "Gordon College",
        startX + width / 2,
        currentY + 5,
        4.2,
        "bold",
        "middle",
      ),
    );
    currentY += markerSize + 2;
  }

  parts.push(
    svgText(
      `Exam Code: ${template.examCode || "EX-XXXXXX"}`,
      startX + width / 2,
      currentY,
      2.5,
      "normal",
      "middle",
    ),
  );
  currentY += 4;

  const nameEnd = lx + usableW * 0.4;
  const dateEnd = nameEnd + usableW * 0.22;
  parts.push(svgText("Name:", lx, currentY, 2.6, "bold"));
  parts.push(
    `<line x1="${lx + 11}" y1="${currentY}" x2="${nameEnd}" y2="${currentY}" stroke="#000" stroke-width="0.2"/>`,
  );
  parts.push(svgText("Date:", nameEnd + 3, currentY, 2.6, "bold"));
  parts.push(
    `<line x1="${nameEnd + 13}" y1="${currentY}" x2="${dateEnd}" y2="${currentY}" stroke="#000" stroke-width="0.2"/>`,
  );
  parts.push(svgText("Course Code:", dateEnd + 3, currentY, 2.6, "bold"));
  parts.push(
    `<line x1="${dateEnd + 23}" y1="${currentY}" x2="${rx}" y2="${currentY}" stroke="#000" stroke-width="0.2"/>`,
  );
  currentY += 4;

  const idLabelW = 6;
  const idPad = 2;
  const idContentW = idLabelW + 9 * idColGap;
  const idBorderW = idContentW + idPad * 2;
  const idBorderX = lx;
  const idContentX = idBorderX + idPad;
  const idStartX = idContentX + idLabelW;

  const idTopY = currentY;
  parts.push(
    svgText("Student ZipGrade ID", idContentX + 1, currentY + 3, 2.2, "bold"),
  );
  parts.push(
    svgText(
      "e.g. 202300109",
      idBorderX + idBorderW - 1.5,
      currentY + 3,
      2.0,
      "normal",
      "end",
    ),
  );
  currentY += 5.5;

  const idBoxW = 4.2;
  const idBoxH = 4.0;
  for (let i = 0; i < 9; i++) {
    parts.push(
      svgRect(
        idStartX + i * idColGap - idBoxW * 0.5,
        currentY,
        idBoxW,
        idBoxH,
        false,
        0.25,
      ),
    );
  }
  currentY += idBoxH + 2;

  const rowLabels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let row = 0; row < 10; row++) {
    const y = currentY + row * idRowH;
    parts.push(svgText(rowLabels[row], idContentX + 1.5, y + 1, 2.1, "bold"));
    for (let col = 0; col < 9; col++) {
      parts.push(
        svgCircle(idStartX + col * idColGap, y, idBubbleSize * 0.5, false),
      );
    }
  }

  const idBottomY = currentY + 10 * idRowH + 1.5;
  parts.push(
    svgRect(
      idBorderX,
      idTopY - 1,
      idBorderW,
      idBottomY - idTopY + 2,
      false,
      0.4,
    ),
  );

  const guideX = idBorderX + idBorderW + 4;
  const guideW = rx - guideX;
  parts.push(
    renderShadingGuideSvg(
      guideX,
      idTopY + (blocksPerCol === 3 ? 9 : 8),
      guideW,
    ),
  );

  currentY = idBottomY + 3;
  const qBlockW = 10 + (numChoices - 1) * bubbleGap + bubbleSize;
  const totalGridW = 5 * qBlockW;
  const colGap = (usableW - totalGridW) / 6;
  const blockVGap = 10 * rowH + 10;

  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < blocksPerCol; row++) {
      const startQ = questionOffset + col * blocksPerCol * 10 + row * 10 + 1;
      const endQ = startQ + 9;
      const bx = lx + colGap + col * (qBlockW + colGap);
      const by = currentY + row * blockVGap;
      parts.push(
        renderQuestionBlockSvg(
          startQ,
          endQ,
          bx,
          by,
          choices,
          bubbleSize,
          bubbleGap,
          rowH,
          10,
        ),
      );
      parts.push(svgRect(bx, by, regMarkSize, regMarkSize, true, 0));
    }
  }

  const bmY = startY + height - markerSize - cornerInset;
  parts.push(
    svgRect(startX + cornerInset, bmY, markerSize, markerSize, true, 0),
  );
  parts.push(
    svgRect(
      startX + width - markerSize - cornerInset,
      bmY,
      markerSize,
      markerSize,
      true,
      0,
    ),
  );
  parts.push(
    svgText(
      "Do not fold, staple, or tear this answer sheet.",
      startX + width / 2,
      startY + height - 4,
      2.0,
      "italic",
      "middle",
    ),
  );
  parts.push(svgRect(startX, startY, width, height, false, 0.25));

  return parts.join("");
}

function renderPageSvg(content: string): string {
  return `<div class="page-wrap"><svg class="sheet" viewBox="0 0 210 297" xmlns="http://www.w3.org/2000/svg">${content}</svg></div>`;
}

export function buildAnswerSheetHtml(
  template: AnswerSheetTemplateData,
): string {
  const pages: string[] = [];

  if (template.numQuestions === 20) {
    pages.push(
      renderPageSvg(
        [
          renderMiniSheetSvg(template, 0, 0, 105, 148.5, 20),
          renderMiniSheetSvg(template, 105, 0, 105, 148.5, 20),
          renderMiniSheetSvg(template, 0, 148.5, 105, 148.5, 20),
          renderMiniSheetSvg(template, 105, 148.5, 105, 148.5, 20),
        ].join(""),
      ),
    );
  } else if (template.numQuestions === 50) {
    pages.push(
      renderPageSvg(
        [
          renderMiniSheetSvg(template, 0, 0, 210, 148.5, 50),
          renderMiniSheetSvg(template, 0, 148.5, 210, 148.5, 50),
        ].join(""),
      ),
    );
  } else if (template.numQuestions === 100) {
    pages.push(renderPageSvg(renderFullSheetSvg(template, 0, 2)));
  } else if (template.numQuestions === 150) {
    pages.push(renderPageSvg(renderFullSheetSvg(template, 0, 3)));
  } else {
    pages.push(renderPageSvg(renderFullSheetSvg(template, 0, 2)));
    pages.push(renderPageSvg(renderFullSheetSvg(template, 100, 2)));
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3,user-scalable=yes"/>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#edf1f5;padding:10px;font-family:Arial,sans-serif}
    .page-wrap{width:100%;max-width:794px;margin:0 auto 12px;background:#fff;border:1px solid #d1d5db;box-shadow:0 8px 20px rgba(0,0,0,0.08)}
    .sheet{display:block;width:100%;height:auto}
  </style></head><body>${pages.join("")}</body></html>`;
}
