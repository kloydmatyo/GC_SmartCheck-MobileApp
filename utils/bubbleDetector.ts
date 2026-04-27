/**
 * bubbleDetector — Fixed-grid bubble sampling with CSS-derived coordinates
 *
 * After warp to 800×1131, samples each bubble at its known grid position.
 * Uses RELATIVE scoring: the filled bubble is always darker than its 4 peers,
 * regardless of absolute lighting conditions.
 *
 * Key dimensions (from templatePdfGenerator.ts):
 *   bubble: 3.2mm = 12px diameter
 *   A→B spacing: 4.3mm = 16px center-to-center
 *   row spacing: 3.8mm = 14.5px center-to-center
 */

import { File } from "expo-file-system";
import type { ColumnGroupAnchor } from "./columnMapper";
import { ROW_SPACING_Y, CHOICES, BUBBLE_DIAMETER_PX } from "./columnMapper";
import { WARP_W, WARP_H } from "./perspectiveWarp";

let CV: any = null;
let T: any = null;

const load = () => {
  if (CV) return;
  const o = require("react-native-fast-opencv");
  CV = o.OpenCV;
  T = {
    CC: o.ColorConversionCodes, DT: o.DataTypes, OT: o.ObjectType, TT: o.ThresholdTypes,
  };
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface BubbleScore {
  x: number; y: number;        // center in warped image
  meanBrightness: number;       // 0–255 (lower = darker = more filled)
  fillRatio: number;            // 0–1 (fraction of dark pixels in ROI)
  column: string;               // A/B/C/D/E
  columnIndex: number;          // 0–4
}

export interface QuestionResult {
  questionNumber: number;
  bubbles: BubbleScore[];
  selectedAnswer: string;       // A/B/C/D/E or "" if blank
  confidence: number;           // 0–1
  isBlank: boolean;
  isAmbiguous: boolean;
  colGroup: number;
  band: number;
  rowInBand: number;
}

export interface DetectionResult {
  questions: QuestionResult[];
  emptyBaseline: number;
  sheetQuality: number;         // 0–1
  markersDetected: number;      // how many of 15 markers were found
}

// ── Config ───────────────────────────────────────────────────────────────────

/** ROI radius: slightly smaller than bubble to avoid border pixels */
const ROI_RADIUS = Math.max(3, Math.floor(BUBBLE_DIAMETER_PX / 2) - 1); // ~5px

/** Fill ratio thresholds */
const BLANK_FILL = 0.10;       // below this → definitely empty
const MIN_ANSWER_FILL = 0.18;  // must be above this to count as filled
const AMBIGUITY_RATIO = 0.60;  // if 2nd/1st fill > this → ambiguous

// ── Question numbering ──────────────────────────────────────────────────────

/**
 * Map (colGroup, band, rowInBand) → question number.
 *
 * From templatePdfGenerator.ts:
 *   Band 0: Q1-10,  Q31-40,  Q61-70,  Q91-100,  Q121-130
 *   Band 1: Q11-20, Q41-50,  Q71-80,  Q101-110, Q131-140
 *   Band 2: Q21-30, Q51-60,  Q81-90,  Q111-120, Q141-150
 *
 * So: questionNumber = colGroup * 30 + band * 10 + rowInBand + 1
 */
function questionNumber(colGroup: number, band: number, rowInBand: number): number {
  return colGroup * 30 + band * 10 + rowInBand + 1;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Detect and score all 150 bubbles using fixed-grid sampling.
 */
export async function detectBubbles(
  warpedImageUri: string,
  anchors: ColumnGroupAnchor[],
): Promise<DetectionResult> {
  const mats: any[] = [];
  const markersDetected = anchors.filter(a => a.detected).length;

  try {
    load();
    const { CC, DT, OT, TT } = T;

    const uri = warpedImageUri.startsWith("file://") ? warpedImageUri : `file://${warpedImageUri}`;
    const b64 = await new File(uri).base64();
    const src = CV.base64ToMat(b64); mats.push(src);
    const info = CV.toJSValue(src) as any;
    const W = info.cols, H = info.rows;

    // Grayscale
    const gray = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(gray);
    CV.invoke("cvtColor", src, gray, CC.COLOR_BGR2GRAY);

    // Adaptive threshold for per-region normalization
    const adaptThresh = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(adaptThresh);
    try {
      // ADAPTIVE_THRESH_GAUSSIAN_C = 1, THRESH_BINARY_INV = 1
      CV.invoke("adaptiveThreshold", gray, adaptThresh, 255, 1, 1, 15, 8);
    } catch {
      // Fallback to simple threshold
      CV.invoke("threshold", gray, adaptThresh, 140, 255, TT.THRESH_BINARY_INV);
    }

    /**
     * Sample a bubble ROI and compute fill metrics.
     * Uses a circular mask concept: sample a square ROI but the bubble is round,
     * so we count dark pixels in the central region.
     */
    const sampleBubble = (cx: number, cy: number): { mean: number; fillRatio: number } => {
      const r = ROI_RADIUS;
      const x0 = Math.max(0, Math.round(cx - r));
      const y0 = Math.max(0, Math.round(cy - r));
      const x1 = Math.min(W - 1, Math.round(cx + r));
      const y1 = Math.min(H - 1, Math.round(cy + r));
      const roiW = x1 - x0, roiH = y1 - y0;

      if (roiW < 3 || roiH < 3) return { mean: 255, fillRatio: 0 };

      try {
        const roi = CV.createObject(OT.Rect, x0, y0, roiW, roiH);

        // Sample from adaptive threshold (binary) for fill ratio
        const cropBin = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(cropBin);
        CV.invoke("crop", adaptThresh, cropBin, roi);
        const darkPixels = CV.invoke("countNonZero", cropBin) as any;
        const dpVal = typeof darkPixels === "number" ? darkPixels : darkPixels?.value ?? 0;
        const total = roiW * roiH;
        const fillRatio = dpVal / total;

        // Sample from grayscale for mean brightness
        const cropGray = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(cropGray);
        CV.invoke("crop", gray, cropGray, roi);
        let mean = 255;
        try {
          const s = CV.invoke("sumElems", cropGray) as any;
          const sVal = typeof s === "number" ? s : (s?.value ?? s?.[0] ?? 255 * total);
          mean = sVal / total;
        } catch {
          mean = 255 * (1 - fillRatio);
        }

        return { mean, fillRatio };
      } catch {
        return { mean: 255, fillRatio: 0 };
      }
    };

    // ── Process all 150 questions ────────────────────────────────────────

    const questions: QuestionResult[] = [];
    let emptyFillSum = 0, emptyCount = 0;

    for (const anchor of anchors) {
      for (let row = 0; row < 10; row++) {
        const qNum = questionNumber(anchor.colIndex, anchor.bandIndex, row);
        const cy = anchor.firstRowY + row * ROW_SPACING_Y;

        // Sample all 5 bubbles
        const bubbles: BubbleScore[] = [];
        const labels = ["A", "B", "C", "D", "E"];

        for (let col = 0; col < CHOICES; col++) {
          const cx = anchor.bubbleXs[col];
          const { mean, fillRatio } = sampleBubble(cx, cy);
          bubbles.push({ x: cx, y: cy, meanBrightness: mean, fillRatio, column: labels[col], columnIndex: col });
        }

        // ── Relative scoring ─────────────────────────────────────────
        const sorted = [...bubbles].sort((a, b) => b.fillRatio - a.fillRatio);
        const darkest = sorted[0];
        const second = sorted[1];

        let selectedAnswer = "";
        let confidence = 0;
        let isBlank = false;
        let isAmbiguous = false;

        if (darkest.fillRatio < BLANK_FILL) {
          // All bubbles very light → blank
          isBlank = true;
          confidence = 0.95;
        } else if (darkest.fillRatio < MIN_ANSWER_FILL) {
          // Marginal fill → likely blank or ghost mark
          isBlank = true;
          confidence = 0.5;
        } else {
          selectedAnswer = darkest.column;

          // How much darker is the winner vs runner-up?
          if (second.fillRatio > 0.01) {
            const ratio = second.fillRatio / darkest.fillRatio;
            if (ratio > AMBIGUITY_RATIO) {
              isAmbiguous = true;
              confidence = Math.max(0.1, 1 - ratio);
            } else {
              confidence = Math.min(0.99, 1 - ratio);
            }
          } else {
            confidence = 0.98;
          }

          // Track empty baseline from clearly-empty bubbles
          for (let i = 2; i < sorted.length; i++) {
            emptyFillSum += sorted[i].fillRatio;
            emptyCount++;
          }
        }

        questions.push({
          questionNumber: qNum, bubbles, selectedAnswer, confidence,
          isBlank, isAmbiguous,
          colGroup: anchor.colIndex, band: anchor.bandIndex, rowInBand: row,
        });
      }
    }

    const emptyBaseline = emptyCount > 0 ? emptyFillSum / emptyCount : 0.05;
    const highConf = questions.filter(q => q.confidence > 0.5).length;
    const sheetQuality = highConf / Math.max(1, questions.length);

    console.log(
      `[BubbleDetector] ${questions.length}Q: ` +
      `${questions.filter(q => q.selectedAnswer).length} answered, ` +
      `${questions.filter(q => q.isBlank).length} blank, ` +
      `${questions.filter(q => q.isAmbiguous).length} ambiguous, ` +
      `quality=${(sheetQuality * 100).toFixed(0)}%, markers=${markersDetected}/15`
    );

    return { questions, emptyBaseline, sheetQuality, markersDetected };
  } catch (err) {
    console.error("[BubbleDetector] Error:", err);
    return { questions: [], emptyBaseline: 0.05, sheetQuality: 0, markersDetected: 0 };
  } finally {
    try { for (const m of mats) { try { m?.delete?.(); } catch {} } CV?.clearBuffers?.(); } catch {}
  }
}

/**
 * Post-process: reject fills that are barely above empty baseline (likely erasures).
 */
export function refineResults(result: DetectionResult): DetectionResult {
  const { emptyBaseline } = result;
  const erasureThreshold = emptyBaseline + 0.08;

  for (const q of result.questions) {
    if (q.isBlank || !q.selectedAnswer) continue;
    const darkest = q.bubbles.reduce((a, b) => a.fillRatio > b.fillRatio ? a : b);
    if (darkest.fillRatio < erasureThreshold) {
      q.selectedAnswer = "";
      q.isBlank = true;
      q.confidence = 0.4;
    }
  }
  return result;
}
