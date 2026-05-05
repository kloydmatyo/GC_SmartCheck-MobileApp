﻿import { StudentAnswer } from "../types/scanning";
const DEBUG_LOGS = true;

// ─── TYPES ───

interface Markers {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

interface AnswerBlock {
  startQ: number;
  endQ: number;
  firstBubbleNX: number;
  firstBubbleNY: number;
  bubbleSpacingNX: number;
  rowSpacingNY: number;
}

interface TemplateLayout {
  answerBlocks: AnswerBlock[];
  bubbleDiameterNX: number;
  bubbleDiameterNY: number;
}

// ─── COORDINATE MAPPING ───
// Maps normalized coordinates (0-1) to pixel coordinates
// Handles perspective distortion using bilinear interpolation
function mapToPixel(
  markers: Markers,
  nx: number,
  ny: number,
): { px: number; py: number } {
  // Interpolate along top edge
  const topX =
    markers.topLeft.x + nx * (markers.topRight.x - markers.topLeft.x);
  const topY =
    markers.topLeft.y + nx * (markers.topRight.y - markers.topLeft.y);

  // Interpolate along bottom edge
  const botX =
    markers.bottomLeft.x + nx * (markers.bottomRight.x - markers.bottomLeft.x);
  const botY =
    markers.bottomLeft.y + nx * (markers.bottomRight.y - markers.bottomLeft.y);

  // Interpolate vertically
  return {
    px: topX + ny * (botX - topX),
    py: topY + ny * (botY - topY),
  };
}

// ─── BUBBLE SAMPLING ───
// Returns the mean brightness of the bubble interior (0-255)
// Lower value = darker = more likely filled
function sampleBubbleAt(
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
): number {
  // Sample the center of the bubble using an elliptical mask
  // Use inner 50% to safely avoid the printed circle outline
  let sum = 0,
    count = 0;
  const innerRX = radiusX * 0.5;
  const innerRY = radiusY * 0.5;
  const step = Math.max(1, Math.floor(Math.min(innerRX, innerRY) / 4));

  for (let dy = -Math.ceil(innerRY); dy <= Math.ceil(innerRY); dy += step) {
    for (let dx = -Math.ceil(innerRX); dx <= Math.ceil(innerRX); dx += step) {
      if (
        innerRX > 0 &&
        innerRY > 0 &&
        (dx * dx) / (innerRX * innerRX) + (dy * dy) / (innerRY * innerRY) > 1
      )
        continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        const idx = (py * imgW + px) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        sum += 0.299 * r + 0.587 * g + 0.114 * b;
        count++;
      }
    }
  }

  // Also sample the exact center cross pattern for extra precision
  // This catches small-pencil fills that are concentrated at center
  for (let r = 0; r <= Math.floor(innerRX * 0.7); r++) {
    for (const [dx, dy] of [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ]) {
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        const idx = (py * imgW + px) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        sum += 0.299 * r + 0.587 * g + 0.114 * b;
        count++;
      }
    }
  }

  if (count === 0) return 255; // default = bright = unfilled
  return sum / count; // raw brightness: low = dark = filled
}

// ─── TEMPLATE LAYOUT ───
// 50-question mini sheet (210 × 148.5 mm) — HALF A4 PAGE
// Source: drawMiniSheet() in answerSheetGenerator.ts
//
// Physical dimensions:
//   pageWidth = 210mm, pageHeight = 297mm
//   sheetWidth = 210mm, sheetHeight = 148.5mm (half page)
//   margin = 10mm
//   cornerInset = 2mm
//   markerSize = 8mm (8×8mm squares)
//
// Corner marker centers:
//   Top-left: (2+4, 2+4) = (6, 6)
//   Top-right: (210-8-2+4, 2+4) = (204, 6)
//   Bottom-left: (6, 148.5-8-2+4) = (6, 142.5)
//   Bottom-right: (204, 142.5)
//
// Frame between marker centers:
//   fw = 204 - 6 = 198mm
//   fh = 142.5 - 6 = 136.5mm
//
// Template grid: 5 columns × 1 row, sequential left-to-right:
//   Col 0: Q1-10
//   Col 1: Q11-20
//   Col 2: Q21-30
//   Col 3: Q31-40
//   Col 4: Q41-50
//
// Physical measurements (drawMiniSheet, 210×148.5mm):
//   margin=10, width=210, height=148.5
//   usableW = 210 - 2×10 = 190mm
//   blockWidth = 190 / 5 = 38mm
//   bubbleSpacing=5.5, ansRowH=5.2, numW=10, bubbleSize=3.5, regMarkSize=2.0
//
//   Block positions:
//   bx[col] = 10 + col×38
//   firstBubbleX[col] = bx[col] + numW = 10 + col×38 + 10
//     Col 0: 20.0mm → NX = (20.0-6)/198 = 0.07071
//     Col 1: 58.0mm → NX = (58.0-6)/198 = 0.26263
//     Col 2: 96.0mm → NX = (96.0-6)/198 = 0.45455
//     Col 3: 134.0mm → NX = (134.0-6)/198 = 0.64646
//     Col 4: 172.0mm → NX = (172.0-6)/198 = 0.83838
//
//   Y-position flow (traced from drawMiniSheet):
//   startY=0 + cornerInset(2) + 3 = 5mm
//   + logo/header: 8+2 = 15mm (no logo) or 10+2 = 17mm (with logo)
//   + examCode(4) = 19mm (if present)
//   + name/date line = 19mm
//   + spacing(4) = 23mm
//   + ID label(4.5) = 27.5mm
//   + ID boxes(4) + spacing(2) = 33.5mm
//   + ID bubbles: 10 rows × 4.0mm = 73.5mm
//   + idBottomYMini + spacing(3) = 77.5mm ← answer blocks start (by parameter)
//   + regMark(2mm) = 77.5-79.5mm
//   + header "A B C D E" text at 80mm
//   + qY += 5 → first question row at 82.5mm
//   + bubble drawn at 82.5mm (top), CENTER at 84.25mm
//
//   First answer bubble Y: 84.25mm → NY = (84.25-6)/136.5 = 0.57326
//
//   bubbleSpacingNX = 5.5 / 198 = 0.02778
//   rowSpacingNY    = 5.2 / 136.5 = 0.03810
function get50ItemTemplateLayout(physicalChoices: 4 | 5 = 5): TemplateLayout {
  const fw = 198,
    fh = 136.5;

  const bSpacingNX = 5.5 / fw; // 0.02778 — horizontal gap between choice bubbles
  const rSpacingNY = 5.2 / fh; // 0.03810 — vertical gap between question rows

  // Exact first-bubble NX per column (A-choice center)
  const blockWidth = 38;
  const numW = 10;
  const colNX = Array.from({ length: 5 }, (_, col) => {
    const bx = 10 + col * blockWidth;
    const firstBubbleX = bx + numW;
    return (firstBubbleX - 6) / fw;
  });

  // First answer bubble Y position
  // Traced from drawMiniSheet():
  // - currentY starts at 77.5mm (after ID section)
  // - Registration mark: 77.5mm (2mm tall)
  // - Header "A B C D E": text at 80mm
  // - qY += 5 → first question row at 82.5mm
  // - Bubble drawn at 82.5mm (top edge), CENTER at 82.5 + bubbleSize/2 = 84.25mm
  const firstAnswerY = 84.25; // mm from top (center of first answer bubble)
  const firstAnswerNY = (firstAnswerY - 6) / fh; // 0.57326

  // 5 blocks: 1 row × 5 columns
  // You can manually adjust X and Y offsets per block here:
  const BLOCKS: {
    startQ: number;
    col: number;
    xOffsetMM?: number; // Optional X offset in mm (positive = right, negative = left)
    yOffsetMM?: number; // Optional Y offset in mm (positive = down, negative = up)
  }[] = [
    { startQ: 1, col: 0, xOffsetMM: 0, yOffsetMM: 0 }, // Block 1 (Q1-10)
    { startQ: 11, col: 1, xOffsetMM: 0, yOffsetMM: 0 }, // Block 2 (Q11-20)
    { startQ: 21, col: 2, xOffsetMM: 0, yOffsetMM: 0 }, // Block 3 (Q21-30)
    { startQ: 31, col: 3, xOffsetMM: 0, yOffsetMM: -1 }, // Block 4 (Q31-40)
    { startQ: 41, col: 4, xOffsetMM: 0, yOffsetMM: 0 }, // Block 5 (Q41-50)
  ];

  const answerBlocks: AnswerBlock[] = BLOCKS.map((b) => ({
    startQ: b.startQ,
    endQ: b.startQ + 9,
    firstBubbleNX: colNX[b.col] + (b.xOffsetMM || 0) / fw,
    firstBubbleNY: firstAnswerNY + (b.yOffsetMM || 0) / fh,
    bubbleSpacingNX: bSpacingNX,
    rowSpacingNY: rSpacingNY,
  }));

  return {
    answerBlocks,
    bubbleDiameterNX: 3.5 / fw,
    bubbleDiameterNY: 3.5 / fh,
  };
}

// ─── ANSWER DETECTION ───
// Detects answers using brightness sampling
function detectAnswersFromImage(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout,
  numQuestions: number,
  choicesPerQuestion: number,
  enableBlockAutoAlign: boolean,
): StudentAnswer[] {
  const answers: StudentAnswer[] = [];
  const choiceLabels = "ABCDE".slice(0, choicesPerQuestion).split("");

  const frameW = markers.topRight.x - markers.topLeft.x;
  const frameH = markers.bottomLeft.y - markers.topLeft.y;
  const bubbleRX = (layout.bubbleDiameterNX * frameW) / 2;
  const bubbleRY = (layout.bubbleDiameterNY * frameH) / 2;

  if (DEBUG_LOGS) {
    console.log(
      `[50Q-BRIGHTNESS] Frame: ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR: ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px`,
    );
  }

  for (const block of layout.answerBlocks) {
    let blockDx = 0;
    let blockDy = 0;

    // Auto-align each 10-question block using local brightness contrast.
    // This helps when each block has slight local shift despite correct corners.
    if (enableBlockAutoAlign) {
      const probeRows = Math.min(3, block.endQ - block.startQ + 1);
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let dy = -8; dy <= 8; dy += 2) {
        for (let dx = -8; dx <= 8; dx += 2) {
          let score = 0;
          for (let row = 0; row < probeRows; row++) {
            const rowFills: number[] = [];
            for (let c = 0; c < choicesPerQuestion; c++) {
              const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
              const ny = block.firstBubbleNY + row * block.rowSpacingNY;
              const { px, py } = mapToPixel(markers, nx, ny);
              const b = sampleBubbleAt(
                pixels,
                width,
                height,
                px + dx,
                py + dy,
                bubbleRX,
                bubbleRY,
              );
              rowFills.push(b);
            }
            const darkest = Math.min(...rowFills);
            const brightest = Math.max(...rowFills);
            const spread = brightest - darkest;
            score += spread + (255 - darkest) * 0.35;
          }

          if (score > bestScore) {
            bestScore = score;
            blockDx = dx;
            blockDy = dy;
          }
        }
      }

      if (DEBUG_LOGS) {
        console.log(
          `[50Q-BRIGHTNESS] Block Q${block.startQ}-${block.endQ} auto-align: dx=${blockDx}, dy=${blockDy}`,
        );
      }
    }

    if (DEBUG_LOGS) {
      const firstPx = mapToPixel(
        markers,
        block.firstBubbleNX,
        block.firstBubbleNY,
      );
      console.log(
        `[50Q-BRIGHTNESS] Block Q${block.startQ}-${block.endQ}: firstBubble px=(${Math.round(firstPx.px)},${Math.round(firstPx.py)})`,
      );
    }

    for (let q = block.startQ; q <= block.endQ && q <= numQuestions; q++) {
      const rowInBlock = q - block.startQ;
      const fills: { choice: string; brightness: number }[] = [];

      // Sample all choices for this question
      for (let c = 0; c < choicesPerQuestion; c++) {
        const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
        const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
        const { px, py } = mapToPixel(markers, nx, ny);
        const brightness = sampleBubbleAt(
          pixels,
          width,
          height,
          px + blockDx,
          py + blockDy,
          bubbleRX,
          bubbleRY,
        );
        fills.push({ choice: choiceLabels[c], brightness });
      }

      // Debug: Log all brightness values for first question in each block
      if (DEBUG_LOGS && q === block.startQ) {
        console.log(
          `[50Q-BRIGHTNESS] Q${q} all choices: ${fills.map((f) => `${f.choice}=${f.brightness.toFixed(0)}`).join(", ")}`,
        );
      }

      // Sort ascending by brightness — darkest (most filled) first
      const sorted = [...fills].sort((a, b) => a.brightness - b.brightness);
      const darkest = sorted[0].brightness;
      const secondDark = sorted.length >= 2 ? sorted[1].brightness : 255;
      const thirdDark = sorted.length >= 3 ? sorted[2].brightness : 255;
      const brightest = sorted[sorted.length - 1].brightness;

      let selectedChoice = "";

      // Use the brightest bubble as the "unfilled" reference
      const ref = brightest;
      const darkRatio = ref > 20 ? darkest / ref : 1;
      const gapFromSecond = secondDark - darkest;
      const gapRatio = ref > 20 ? gapFromSecond / ref : 0;
      const absoluteGap = secondDark - darkest;
      const gapFromThird = thirdDark - darkest;

      const median = sorted[Math.floor(sorted.length / 2)].brightness;
      const spread = brightest - darkest;

      // Tier 1: clearly filled (strong contrast)
      if (darkRatio < 0.68) {
        selectedChoice = sorted[0].choice;
        // Tier 2: moderately filled
      } else if (darkRatio < 0.88 && gapRatio > 0.1) {
        selectedChoice = sorted[0].choice;
        // Tier 3: lightly filled but gap is clear
      } else if (darkRatio < 0.95 && absoluteGap >= 8) {
        selectedChoice = sorted[0].choice;
        // Tier 4: very light fill — darkest is meaningfully darker than the rest
      } else if (absoluteGap >= 5 && darkest < median - 1) {
        selectedChoice = sorted[0].choice;
        // Tier 5: minimal signal — only pick if there's any spread at all
      } else if (spread >= 4 && absoluteGap >= 3) {
        selectedChoice = sorted[0].choice;
      }

      // Log first few questions per block for debugging
      if (
        DEBUG_LOGS &&
        (q <= block.startQ + 2 || q === block.endQ || !selectedChoice)
      ) {
        console.log(
          `[50Q-BRIGHTNESS] Q${q}: ${fills.map((f) => `${f.choice}=${f.brightness.toFixed(0)}`).join(", ")} → ${selectedChoice || "?"} (darkRatio=${darkRatio.toFixed(2)} gapRatio=${gapRatio.toFixed(2)} absGap=${absoluteGap.toFixed(0)} ref=${ref.toFixed(0)})`,
        );
      }

      answers.push({
        questionNumber: q,
        selectedAnswer: selectedChoice,
      });
    }
  }

  // Sort by question number
  answers.sort((a, b) => a.questionNumber - b.questionNumber);

  return answers;
}

// ─── STUDENT ID DETECTION ───
// Detects the 9-digit student ID from the ID bubble grid
// Grid layout: 9 columns × 10 rows (digits 0-9 for each position)
function detectStudentId(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
): string {
  const fw = 198,
    fh = 136.5;

  // ID section physical measurements (from drawMiniSheet in answerSheetGenerator.ts):
  // For Mini Sheets (50-item exams):
  // margin = 10mm (for 50-item mini sheet, full width 210mm)
  // idLabelWMini = 6mm
  // idPadMini = 2mm
  // idColSpacing = 4.8mm
  // idRowSpacing = 4.0mm
  // idBubbleSize = 3.0mm
  //
  // ID section starts at: startX + margin = 0 + 10 = 10mm
  // idBorderXMini = 10mm
  // idContentXMini = idBorderXMini + idPadMini = 10 + 2 = 12mm
  // idStartX = idContentXMini + idLabelWMini = 12 + 6 = 18mm (first bubble column center)
  //
  // Normalized coordinates (relative to marker frame):
  // Corner markers at (6,6) and (204,142.5), so frame offset is 6mm
  const idColGap = 4.8 / fw; // 0.02424
  const idRowH = 4.0 / fh; // 0.02930
  const idBubbleSize = 3.0 / fw; // bubble diameter

  // First ID bubble position (column 0, row 0 = digit "0")
  const firstIdNX = (18 - 6) / fw; // (18mm - marker offset) / frame width ≈ 0.06061

  // Y-position flow for 50-item mini sheet:
  // startY=0 + cornerInset(2) + 3 = 5mm
  // + logo/header ≈ 12mm (if logo) or 10mm (no logo) = 17mm
  // + examCode(4) = 21mm (if present)
  // + name/date(4) = 25mm
  // + ID label(4.5) = 29.5mm
  // + ID boxes(4.0) + spacing(2) = 35.5mm ← Row 0 bubble center
  // Using 36mm as the first ID bubble row center (based on template flow)
  const firstIdNY = (36 - 6) / fh; // (36mm - marker offset) / frame height ≈ 0.21978

  const frameW = markers.topRight.x - markers.topLeft.x;
  const frameH = markers.bottomLeft.y - markers.topLeft.y;
  const bubbleRX = (idBubbleSize * frameW) / 2;
  const bubbleRY = (idBubbleSize * frameH) / 2;

  if (DEBUG_LOGS) {
    console.log(
      `[50Q-BRIGHTNESS] ID Detection: Frame ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px`,
    );
  }

  const digits: string[] = [];

  // For each of the 9 ID digit columns
  for (let col = 0; col < 9; col++) {
    const fills: { digit: string; brightness: number }[] = [];

    // Sample all 10 digit rows (0-9)
    for (let row = 0; row < 10; row++) {
      const nx = firstIdNX + col * idColGap;
      const ny = firstIdNY + row * idRowH;
      const { px, py } = mapToPixel(markers, nx, ny);

      const brightness = sampleBubbleAt(
        pixels,
        width,
        height,
        px,
        py,
        bubbleRX,
        bubbleRY,
      );

      fills.push({ digit: row.toString(), brightness });
    }

    // Find darkest (most filled) bubble in this column
    const sorted = [...fills].sort((a, b) => a.brightness - b.brightness);
    const darkest = sorted[0].brightness;
    const secondDark = sorted[1]?.brightness ?? 255;
    const brightest = sorted[sorted.length - 1].brightness;

    // Use similar detection logic as answers but with more relaxed thresholds
    // ID bubbles tend to be filled more lightly than answer bubbles
    const ref = brightest;
    const darkRatio = ref > 20 ? darkest / ref : 1;
    const absoluteGap = secondDark - darkest;

    // More lenient thresholds for ID detection
    let selectedDigit = "0";
    if (darkRatio < 0.88 && absoluteGap >= 5) {
      // Accept if reasonably darker and has some gap
      selectedDigit = sorted[0].digit;
    } else if (absoluteGap >= 8) {
      // Or if gap is clear regardless of ratio
      selectedDigit = sorted[0].digit;
    }

    digits.push(selectedDigit);

    if (DEBUG_LOGS && col < 3) {
      // Log first 3 columns for debugging
      console.log(
        `[50Q-BRIGHTNESS] ID Col ${col}: darkest=${darkest.toFixed(0)} (digit ${sorted[0].digit}), gap=${absoluteGap.toFixed(0)}, ratio=${darkRatio.toFixed(2)} → ${selectedDigit}`,
      );
    }
  }

  const studentId = digits.join("");

  if (DEBUG_LOGS) {
    console.log(`[50Q-BRIGHTNESS] Detected Student ID: ${studentId}`);
  }

  return studentId;
}

// ─── MAIN EXPORT ───
export async function scan50ItemWithBrightness(
  imageUri: string,
  markers: Markers,
  choicesPerQuestion: 4 | 5 = 5,
  enableBlockAutoAlign = false,
): Promise<{ studentId: string; answers: StudentAnswer[] }> {
  console.log("[50Q-BRIGHTNESS] Starting brightness-based scanning with Skia");

  try {
    // Import Skia and FileSystem (using legacy API for compatibility)
    const { Skia } = require("@shopify/react-native-skia");
    const FileSystem = require("expo-file-system/legacy");

    // Load image with Skia
    const normalizedUri = imageUri.startsWith("file://")
      ? imageUri
      : `file://${imageUri}`;
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: "base64",
    });

    const imageData = Skia.Data.fromBase64(base64);
    const image = Skia.Image.MakeImageFromEncoded(imageData);

    if (!image) {
      throw new Error("Failed to load image with Skia");
    }

    const width = image.width();
    const height = image.height();
    console.log(`[50Q-BRIGHTNESS] Image loaded: ${width}x${height}px`);

    // Read pixel data (RGBA format)
    const pixels = image.readPixels();

    if (!pixels) {
      throw new Error("Failed to read pixels from image");
    }

    console.log(
      `[50Q-BRIGHTNESS] Pixel data loaded: ${pixels.length} bytes (${width}x${height}x4)`,
    );

    // Detect answers using brightness sampling
    const numQuestions = 50;
    const effectiveChoices = choicesPerQuestion === 4 ? 4 : 5;
    const layout = get50ItemTemplateLayout(effectiveChoices);

    const answers = detectAnswersFromImage(
      pixels,
      width,
      height,
      markers,
      layout,
      numQuestions,
      effectiveChoices,
      enableBlockAutoAlign,
    );

    const detectedCount = answers.filter((a) => a.selectedAnswer).length;
    console.log(`[50Q-BRIGHTNESS] Detected ${detectedCount}/50 answers`);

    // Detect student ID
    let studentId = "000000000";
    try {
      studentId = detectStudentId(pixels, width, height, markers);
    } catch (idError) {
      console.error("[50Q-BRIGHTNESS] Error detecting student ID:", idError);
      studentId = "000000000";
    }

    return { studentId, answers };
  } catch (error) {
    console.error("[50Q-BRIGHTNESS] Error:", error);

    // Return empty result on error
    return {
      studentId: "000000000",
      answers: Array.from({ length: 50 }, (_, i) => ({
        questionNumber: i + 1,
        selectedAnswer: "",
      })),
    };
  }
}
