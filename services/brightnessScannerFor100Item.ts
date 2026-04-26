﻿/**
 * Brightness-Based Scanner for 100-Item Templates
 *
 * This scanner uses brightness sampling instead of contour detection
 * to achieve >99% accuracy for 100-item answer sheets.
 *
 * Ported from Web-Based-for-SIA/src/components/scanning/OMRScanner.tsx
 *
 * Key differences from contour-based scanning:
 * - Samples pixel brightness at calculated positions
 * - Uses bilinear coordinate mapping for perspective correction
 * - Compares brightness values within each question
 * - More robust to lighting variations and small bubbles
 */

import { StudentAnswer } from "../types/scanning";
const DEBUG_LOGS = false;

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
// 100-question full page A4 (210 × 297 mm)
// Source: drawFullSheet() in templatePdfGenerator.ts
//
// Corner markers: cornerInset=2mm, markerSize=8mm → marker centers at (6,6) and (204,291)
// Frame between marker centers: fw = 198mm, fh = 285mm
//
// Template grid: 5 columns × 2 rows, sequential left-to-right, top-to-bottom:
//   Col 0: Q1-10  (row 0), Q11-20  (row 1)
//   Col 1: Q21-30 (row 0), Q31-40  (row 1)
//   Col 2: Q41-50 (row 0), Q51-60  (row 1)
//   Col 3: Q61-70 (row 0), Q71-80  (row 1)
//   Col 4: Q81-90 (row 0), Q91-100 (row 1)
//
// Physical measurements (drawFullSheet, A4 210×297mm):
//   margin=10, usableW=190, numChoices=5, bubbleGap=5.5, bubbleSize=3.5
//   qBlockW = 10 + (5-1)×5.5 + 3.5 = 35.5mm
//   colGap = (190 - 5×35.5) / 6 = 12.5/6 ≈ 2.0833mm
//   bx[col] = 10 + 2.0833 + col×37.5833
//   firstBubbleX[col] = bx[col] + numW(10)  (A-choice center)
//     Col 0: 22.0833mm → NX = (22.0833-6)/198 = 0.08123
//     Col 1: 59.6667mm → NX = (59.6667-6)/198 = 0.27104
//     Col 2: 97.2500mm → NX = (97.2500-6)/198 = 0.46086
//     Col 3: 134.8333mm → NX = (134.8333-6)/198 = 0.65067
//     Col 4: 172.4167mm → NX = (172.4167-6)/198 = 0.84049
//
//   currentY after header+ID ≈ 81mm from page top
//   drawQBlock adds 5mm header → first bubble row at currentY+5
//   Row 0 first bubble Y: 81+5 = 86mm → NY = (86-6)/285 = 0.28070
//   blockVGap = 10×5.2 + 10 = 62mm
//   Row 1 first bubble Y: 143+5 = 148mm → NY = (148-6)/285 = 0.49825
//
//   bubbleSpacingNX = 5.5 / 198 = 0.027778
//   rowSpacingNY    = 5.2 / 285 = 0.018246
function get100ItemTemplateLayout(): TemplateLayout {
  const fw = 198,
    fh = 285;

  const bSpacingNX = 5.5 / fw;   // 0.027778 — horizontal gap between choice bubbles
  const rSpacingNY = 5.2 / fh;   // 0.018246 — vertical gap between question rows

  // Exact first-bubble NX per column (A-choice center, derived from template source)
  const colNX = [0.08123, 0.27104, 0.46086, 0.65067, 0.84049];
  // Exact first-bubble NY per row (first question row center, derived from template source)
  const rowNY = [0.28070, 0.49825];

  // 10 blocks: 5 cols × 2 rows
  // Reading order: left-to-right across row 0, then row 1
  //   Row 0: Q1-10, Q21-30, Q41-50, Q61-70, Q81-90
  //   Row 1: Q11-20, Q31-40, Q51-60, Q71-80, Q91-100
  const BLOCKS: { startQ: number; col: number; row: number }[] = [
    { startQ: 1,  col: 0, row: 0 },
    { startQ: 21, col: 1, row: 0 },
    { startQ: 41, col: 2, row: 0 },
    { startQ: 61, col: 3, row: 0 },
    { startQ: 81, col: 4, row: 0 },
    { startQ: 11, col: 0, row: 1 },
    { startQ: 31, col: 1, row: 1 },
    { startQ: 51, col: 2, row: 1 },
    { startQ: 71, col: 3, row: 1 },
    { startQ: 91, col: 4, row: 1 },
  ];

  const answerBlocks: AnswerBlock[] = BLOCKS.map((b) => ({
    startQ: b.startQ,
    endQ: b.startQ + 9,
    firstBubbleNX: colNX[b.col],
    firstBubbleNY: rowNY[b.row],
    bubbleSpacingNX: bSpacingNX,
    rowSpacingNY: rSpacingNY,
  }));

  return {
    answerBlocks,
    bubbleDiameterNX: 3.5 / fw,  // slightly wider than physical (3.5mm) to tolerate small offsets
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
      `[100Q-BRIGHTNESS] Frame: ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR: ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px`,
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
          `[100Q-BRIGHTNESS] Block Q${block.startQ}-${block.endQ} auto-align: dx=${blockDx}, dy=${blockDy}`,
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
        `[100Q-BRIGHTNESS] Block Q${block.startQ}-${block.endQ}: firstBubble px=(${Math.round(firstPx.px)},${Math.round(firstPx.py)})`,
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
          `[100Q-BRIGHTNESS] Q${q} all choices: ${fills.map((f) => `${f.choice}=${f.brightness.toFixed(0)}`).join(", ")}`,
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
      } else if (darkRatio < 0.88 && gapRatio > 0.10) {
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
          `[100Q-BRIGHTNESS] Q${q}: ${fills.map((f) => `${f.choice}=${f.brightness.toFixed(0)}`).join(", ")} → ${selectedChoice || "?"} (darkRatio=${darkRatio.toFixed(2)} gapRatio=${gapRatio.toFixed(2)} absGap=${absoluteGap.toFixed(0)} ref=${ref.toFixed(0)})`,
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

// ─── MAIN EXPORT ───
export async function scan100ItemWithBrightness(
  imageUri: string,
  markers: Markers,
  choicesPerQuestion: 4 | 5 = 5,
  enableBlockAutoAlign = false,
): Promise<StudentAnswer[]> {
  console.log("[100Q-BRIGHTNESS] Starting brightness-based scanning with Skia");

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
    console.log(`[100Q-BRIGHTNESS] Image loaded: ${width}x${height}px`);

    // Read pixel data (RGBA format)
    const pixels = image.readPixels();

    if (!pixels) {
      throw new Error("Failed to read pixels from image");
    }

    console.log(
      `[100Q-BRIGHTNESS] Pixel data loaded: ${pixels.length} bytes (${width}x${height}x4)`,
    );

    // Detect answers using brightness sampling
    const layout = get100ItemTemplateLayout();
    const numQuestions = 100;
    const effectiveChoices = choicesPerQuestion === 4 ? 4 : 5;

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
    console.log(`[100Q-BRIGHTNESS] Detected ${detectedCount}/100 answers`);

    return answers;
  } catch (error) {
    console.error("[100Q-BRIGHTNESS] Error:", error);

    // Return empty answers on error
    return Array.from({ length: 100 }, (_, i) => ({
      questionNumber: i + 1,
      selectedAnswer: "",
    }));
  }
}
