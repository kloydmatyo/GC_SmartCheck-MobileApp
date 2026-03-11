import { File } from "expo-file-system";
import { ScanResult, StudentAnswer } from "../types/scanning";
import { ZipgradeGenerator } from "./zipgradeGenerator";

// ═════════════════════════════════════════════════════════════════════════════
// ZIPGRADE SCANNER SERVICE
// ═════════════════════════════════════════════════════════════════════════════
//
// This service processes Zipgrade answer sheets using OpenCV for bubble detection
// and optical mark recognition (OMR).
//
// PHYSICAL SHEET SPECIFICATIONS & SCANNING AREAS:
// ────────────────────────────────────────────────────────────────────────────
// Each template has DIFFERENT physical dimensions and scanning regions:
//
// 20-ITEM SHEET:
//   Physical: 91 × 107 mm (aspect ratio ~0.85, nearly square)
//   Markers: TL(7,19) BR(98,126)
//   Layout: 2 columns side-by-side (Q1-10 left, Q11-20 right)
//   Scanning area: Full width, Y: 28%-95%
//   Student ID: Y: 18%-38%, 10 digits (full ZipGrade ID)
//
// 50-ITEM SHEET:
//   Physical: 91 × 211 mm (aspect ratio ~0.43, very tall/narrow)
//   Markers: TL(7,19) BR(98,230)
//   Layout: Vertical stacking with 3 columns top, 2 columns bottom
//   Scanning areas:
//     - Student ID: Y: 9%-18%
//     - Top section (Q1-30): Y: 20%-52%, 3 columns
//     - Bottom section (Q31-50): Y: 54%-86%, 2 columns
//   TWICE the height of 20-item, same width
//
// 100-ITEM SHEET:
//   Physical: 197 × 215.5 mm (aspect ratio ~0.91, nearly square but wider)
//   Markers: TL(6.5,6.5) BR(203.5,222)
//   Layout: 4 columns across (Q1-25, Q26-50, Q51-75, Q76-100)
//   Scanning area: Full width in 4 columns, Y: 15%-95%
//   TWICE the width of 50-item, similar height to 20-item
//
// Registration markers are square black boxes at the top-left and bottom-right
// corners used for perspective correction and paper boundary detection.
//
// MEMORY MANAGEMENT:
// ────────────────────────────────────────────────────────────────────────────
// All OpenCV Mat objects are tracked in matsToCleanup array and explicitly
// deleted in the finally block to prevent memory leaks across multiple scans.
//
// ═════════════════════════════════════════════════════════════════════════════

// Lazy load OpenCV to avoid import errors in Expo Go
let OpenCV: any = null;
let OpenCVTypes: any = null;

const loadOpenCV = () => {
  if (OpenCV) return OpenCV;

  try {
    const opencv = require("react-native-fast-opencv");
    OpenCV = opencv.OpenCV;
    OpenCVTypes = {
      AdaptiveThresholdTypes: opencv.AdaptiveThresholdTypes,
      BorderTypes: opencv.BorderTypes,
      ColorConversionCodes: opencv.ColorConversionCodes,
      ContourApproximationModes: opencv.ContourApproximationModes,
      DataTypes: opencv.DataTypes,
      ObjectType: opencv.ObjectType,
      RetrievalModes: opencv.RetrievalModes,
      ThresholdTypes: opencv.ThresholdTypes,
    };
    return OpenCV;
  } catch (error) {
    throw new Error(
      "OpenCV not available. Please build a development build to use the scanner.",
    );
  }
};

// ─────────────────────────────────────────────
// Types & Physical Specifications
// ─────────────────────────────────────────────

type Bubble = {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  extent: number;
  fill: number;
};

// Physical dimensions of Zipgrade answer sheets (in mm)
// These are used to validate detected registration marks and paper aspect ratio
const SHEET_SPECS = {
  "20": {
    frameWidth: 91,
    frameHeight: 107,
    markerTL: { x: 7, y: 19 },
    markerBR: { x: 98, y: 126 },
    aspectRatio: 91 / 107, // ~0.85
  },
  "50": {
    frameWidth: 91,
    frameHeight: 211,
    markerTL: { x: 7, y: 19 },
    markerBR: { x: 98, y: 230 },
    aspectRatio: 91 / 211, // ~0.43
  },
  "100": {
    frameWidth: 197,
    frameHeight: 215.5,
    markerTL: { x: 6.5, y: 6.5 },
    markerBR: { x: 203.5, y: 222 },
    aspectRatio: 197 / 215.5, // ~0.91
  },
} as const;

// Layout profile: defines how to slice the paper into answer groups
type AnswerRegion = {
  // All fractions of paper width/height (0..1)
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  startQ: number;
  numQ: number;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function clusterByY<T extends { y: number }>(
  bubbles: T[],
  maxGap: number,
): T[][] {
  if (bubbles.length === 0) return [];
  const sorted = [...bubbles].sort((a, b) => a.y - b.y);
  const rows: T[][] = [];
  let currentRow = [sorted[0]];
  let rowMeanY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - rowMeanY < maxGap) {
      currentRow.push(sorted[i]);
      rowMeanY = currentRow.reduce((s, b) => s + b.y, 0) / currentRow.length;
    } else {
      rows.push(currentRow);
      currentRow = [sorted[i]];
      rowMeanY = sorted[i].y;
    }
  }
  rows.push(currentRow);
  return rows;
}

function deriveColumnCentroids(rows: Bubble[][], targetCols: number): number[] {
  if (rows.length === 0) return [];
  const fullRows = rows.filter(
    (r) => r.length >= targetCols - 1 && r.length <= targetCols + 1,
  );
  if (fullRows.length === 0) return [];
  const sortedRows = fullRows.map((r) => [...r].sort((a, b) => a.x - b.x));
  const spans = sortedRows.map((r) => r[r.length - 1].x - r[0].x);
  const medianSpan = [...spans].sort((a, b) => a - b)[
    Math.floor(spans.length / 2)
  ];
  const cleanRows = sortedRows.filter(
    (_, i) => spans[i] >= medianSpan * 0.8 && spans[i] <= medianSpan * 1.2,
  );
  if (cleanRows.length === 0) return [];
  const centroids: number[] = [];
  for (let col = 0; col < targetCols; col++) {
    const xs = cleanRows.filter((r) => r.length > col).map((r) => r[col].x);
    if (xs.length > 0)
      centroids.push(xs.reduce((a, b) => a + b, 0) / xs.length);
  }
  return centroids.sort((a, b) => a - b);
}

function findModalClusterMedian(values: number[], windowRatio = 0.4): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let bestMedian = sorted[Math.floor(sorted.length / 2)];
  let bestCount = 0;
  for (const ref of sorted) {
    const inWin = sorted.filter(
      (v) => v >= ref * (1 - windowRatio) && v <= ref * (1 + windowRatio),
    );
    if (inWin.length > bestCount) {
      bestCount = inWin.length;
      bestMedian = inWin[Math.floor(inWin.length / 2)];
    }
  }
  return bestMedian;
}

function extractAnswersFromRegion(
  bubbles: Bubble[],
  region: AnswerRegion,
  paperW: number,
  paperH: number,
  medianH: number,
): StudentAnswer[] {
  const { xMin, xMax, yMin, yMax, startQ, numQ } = region;
  const empty = Array.from({ length: numQ }, (_, i) => ({
    questionNumber: startQ + i,
    selectedAnswer: "",
  }));

  const regionBubbles = bubbles.filter(
    (b) =>
      b.x >= xMin * paperW &&
      b.x <= xMax * paperW &&
      b.y >= yMin * paperH &&
      b.y <= yMax * paperH,
  );

  if (regionBubbles.length < 5) {
    console.log(
      `[OMR] Q${startQ}: only ${regionBubbles.length} bubbles in region`,
    );
    return empty;
  }

  const rowGap = medianH * 0.65;
  const rows = clusterByY(regionBubbles, rowGap);

  // Rows with 4-6 bubbles are "full rows" — used to derive reliable column centroids.
  // Rows with 1-3 bubbles are "sparse rows" — only the filled bubble detected (empty ones
  // may be missing because their fill is too low). We still answer these using centroids.
  const fullRows = rows.filter((r) => r.length >= 4 && r.length <= 7);
  const allRows = rows.filter((r) => r.length >= 1); // every detected row

  console.log(
    `[OMR] Q${startQ}+${numQ}: ${regionBubbles.length} bubbles, ${rows.length} rows (${fullRows.length} full)`,
  );

  // Derive centroids from full rows only (reliable A-E positions)
  const colCentroids = deriveColumnCentroids(fullRows, 5);
  console.log(
    `[OMR] Q${startQ}+ centroids(A-E):`,
    colCentroids.map((c) => Math.round(c)),
  );

  if (colCentroids.length < 3) {
    // Fallback: if not enough full rows, evenly space centroids across region X span
    const regionXMin = xMin * paperW;
    const regionXMax = xMax * paperW;
    const allXs = regionBubbles.map((b) => b.x).sort((a, b) => a - b);
    const xSpanMin = allXs[0];
    const xSpanMax = allXs[allXs.length - 1];
    const step = (xSpanMax - xSpanMin) / 4;
    const fallbackCentroids = [0, 1, 2, 3, 4].map((i) => xSpanMin + step * i);
    console.warn(
      `[OMR] Q${startQ}+ using fallback centroids:`,
      fallbackCentroids.map((c) => Math.round(c)),
    );
    return extractWithCentroids(
      allRows,
      colCentroids.length >= 1 ? colCentroids : fallbackCentroids,
      startQ,
      numQ,
    );
  }

  // CRITICAL FIX: For sparse rows (only filled bubbles detected), centroids may be wrong
  // Verify centroids are evenly spaced, otherwise use fallback
  if (colCentroids.length === 5) {
    const gaps = [
      colCentroids[1] - colCentroids[0],
      colCentroids[2] - colCentroids[1],
      colCentroids[3] - colCentroids[2],
      colCentroids[4] - colCentroids[3],
    ];
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - avgGap)));

    // If gaps vary by more than 40%, centroids are unreliable
    if (maxDeviation > avgGap * 0.4) {
      console.warn(
        `[OMR] Q${startQ}+ centroid gaps inconsistent (max deviation: ${maxDeviation.toFixed(1)}px vs avg: ${avgGap.toFixed(1)}px), using fallback`,
      );
      const allXs = regionBubbles.map((b) => b.x).sort((a, b) => a - b);
      const xSpanMin = allXs[0];
      const xSpanMax = allXs[allXs.length - 1];
      const step = (xSpanMax - xSpanMin) / 4;
      const fallbackCentroids = [0, 1, 2, 3, 4].map((i) => xSpanMin + step * i);
      console.log(
        `[OMR] Q${startQ}+ fallback centroids:`,
        fallbackCentroids.map((c) => Math.round(c)),
      );
      return extractWithCentroids(allRows, fallbackCentroids, startQ, numQ);
    }
  }

  return extractWithCentroids(allRows, colCentroids, startQ, numQ);
}

function extractWithCentroids(
  rows: Bubble[][],
  colCentroids: number[],
  startQ: number,
  numQ: number,
): StudentAnswer[] {
  const options = ["A", "B", "C", "D", "E"] as const;

  // Sort rows top-to-bottom by mean Y
  const sortedRows = [...rows].sort((a, b) => {
    const ay = a.reduce((s, b) => s + b.y, 0) / a.length;
    const by = b.reduce((s, b) => s + b.y, 0) / b.length;
    return ay - by;
  });

  // CRITICAL FIX: Filter out rows with bubbles far from centroids (artifacts/timing marks)
  // A valid answer row should have bubbles near the expected column positions
  const maxDistanceFromCentroid =
    colCentroids.length > 1
      ? Math.abs(colCentroids[1] - colCentroids[0]) * 0.6 // 60% of column spacing
      : 100; // fallback if centroids are unreliable

  const validRows = sortedRows.filter((row) => {
    // Check if at least one bubble in this row is near a centroid
    return row.some((bubble) => {
      const nearestCentroidDist = Math.min(
        ...colCentroids.map((c) => Math.abs(bubble.x - c)),
      );
      return nearestCentroidDist <= maxDistanceFromCentroid;
    });
  });

  console.log(
    `[OMR] Q${startQ}+: Filtered ${sortedRows.length} rows → ${validRows.length} valid rows (removed ${sortedRows.length - validRows.length} outliers)`,
  );

  // Take exactly numQ rows (the actual question rows)
  const qRows = validRows.slice(0, numQ);
  const answers: StudentAnswer[] = [];

  qRows.forEach((row, rowIdx) => {
    const qNum = startQ + rowIdx;

    // Log all bubbles in this row for debugging
    const rowBubbles = row
      .map((b) => `x=${Math.round(b.x)} fill=${b.fill.toFixed(2)}`)
      .join(", ");
    console.log(`[OMR] Q${qNum} row bubbles: ${rowBubbles}`);

    // Find the highest-fill bubble in this row
    let best: Bubble | null = null;
    for (const b of row) {
      if (!best || b.fill > best.fill) best = b;
    }

    // Lower threshold for 100q templates (0.35 vs 0.38)
    const fillThreshold = 0.35;
    if (!best || best.fill < fillThreshold) {
      answers.push({ questionNumber: qNum, selectedAnswer: "" });
      return;
    }

    // Snap to nearest centroid
    const colIdx = colCentroids.reduce(
      (bst, c, i) =>
        Math.abs(best!.x - c) < Math.abs(best!.x - colCentroids[bst]) ? i : bst,
      0,
    );
    const safeIdx = Math.min(colIdx, options.length - 1);
    console.log(
      `[OMR] Q${qNum}: x=${Math.round(best.x)} → ${options[safeIdx]} fill=${best.fill.toFixed(2)}`,
    );
    answers.push({ questionNumber: qNum, selectedAnswer: options[safeIdx] });
  });

  while (answers.length < numQ) {
    answers.push({
      questionNumber: startQ + answers.length,
      selectedAnswer: "",
    });
  }
  return answers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Profiles - Scanning Regions for Each Template
// ─────────────────────────────────────────────────────────────────────────────
//
// These define the answer regions for each sheet type based on EXACT PHYSICAL
// MEASUREMENTS from actual Zipgrade templates. All coordinates are converted
// from millimeters to fractions (0.0 to 1.0) of paper dimensions.
//
// PHYSICAL SPECIFICATIONS:
// ────────────────────────────────────────────────────────────────────────────
// 20-item: Frame 91 × 107 mm (markers at TL: 7,19 and BR: 98,126)
//   - Student ID (10 digits): Y: 19-41mm (18%-38% of paper height)
//   - Block 1 (Q1-10):  X: 13-40mm,    Y: 58-103mm
//   - Block 2 (Q11-20): X: 55.5-82.5mm, Y: 58-103mm
//   - Bubble diameter: 3.2mm, spacing: 4.5mm
//
// 50-item: Frame 91 × 211 mm (markers at TL: 7,19 and BR: 98,230)
//   - LEFT column (Q1-30): X: 13-40mm, 3 vertical blocks
//     * Block 1 (Q1-10):   Y: 58-103mm
//     * Block 2 (Q11-20):  Y: 112-157mm
//     * Block 3 (Q21-30):  Y: 166-211mm
//   - RIGHT column (Q31-50): X: 55.5-82.5mm, 2 vertical blocks
//     * Block 4 (Q31-40):  Y: 58-103mm
//     * Block 5 (Q41-50):  Y: 112-157mm
//   - Bubble diameter: 3.2mm, spacing: 4.5mm
//
// 100-item: Frame 197 × 215.5 mm (markers at TL: 6.5,6.5 and BR: 203.5,222)
//   - 10 blocks in 2 rows × 5 columns grid
//   - Top row (Q1-50): Y: 58-103mm
//   - Bottom row (Q51-100): Y: 112-157mm
//   - Column positions: 13mm, 42.5mm, 72mm, 101.5mm, 131mm (each ~27mm wide)
//   - Bubble diameter: 3.8mm, spacing: 4.5mm
//
// COORDINATE SYSTEM:
// ────────────────────────────────────────────────────────────────────────────
// All coordinates are fractions (0.0 to 1.0) of the detected paper dimensions.
// xMin, xMax: Horizontal position (0=left edge, 1=right edge)
// yMin, yMax: Vertical position (0=top edge, 1=bottom edge)
//
// ─────────────────────────────────────────────────────────────────────────────
function getLayoutRegions(questionCount: number): AnswerRegion[] {
  if (questionCount <= 20) {
    // ── 20-question layout ──────────────────────────────────────────────────
    // Physical frame: 91 × 107 mm
    //
    // ADJUSTED based on visual debugger alignment:
    // Looking at actual sheet photos, bubbles are wider and more centered
    // Block 1 (Q1-10):  LEFT column, wider coverage
    // Block 2 (Q11-20): RIGHT column, wider coverage
    //
    // Both columns are at the same Y position (side-by-side layout)
    // Bubble density shows answers concentrated at y40-70%
    return [
      { xMin: 0.26, xMax: 0.5, yMin: 0.38, yMax: 0.95, startQ: 1, numQ: 10 },
      { xMin: 0.54, xMax: 0.84, yMin: 0.38, yMax: 0.95, startQ: 11, numQ: 10 },
    ];
  } else if (questionCount <= 30) {
    // ── 30-question layout (3 groups side by side, no Y split) ─────────────
    // Similar to 20q but with 3 columns instead of 2
    return [
      { xMin: 0.1, xMax: 0.36, yMin: 0.28, yMax: 0.96, startQ: 1, numQ: 10 },
      { xMin: 0.38, xMax: 0.64, yMin: 0.28, yMax: 0.96, startQ: 11, numQ: 10 },
      { xMin: 0.66, xMax: 0.92, yMin: 0.28, yMax: 0.96, startQ: 21, numQ: 10 },
    ];
  } else if (questionCount <= 50) {
    // ── 50-question layout ──────────────────────────────────────────────────
    // Physical frame: 91 × 211 mm
    //
    // CORRECTED based on detailed bubble density analysis from actual scans:
    // The sheet has LEFT and RIGHT columns, each with 3 vertical blocks
    //
    // Actual bubble positions from density grid show:
    // LEFT column (x30-50%):
    //   y20-30%: 10 bubbles (Q1-Q2, 2 rows)
    //   y30-40%: 80 bubbles (Q3-Q10, 8 rows)
    //   y40-50%: 71 bubbles (Q11-Q17, 7 rows)
    //   y50-60%: 67 bubbles (Q18-Q24, 7 rows)
    //   y60-70%: 56 bubbles (Q25-Q30, 6 rows)
    //
    // Therefore regions must be:
    // - Q1-10:  LEFT,  Y: 20%-40.5% (extends to 40.5% to capture Q10, avoid overlap)
    // - Q11-20: LEFT,  Y: 40.5%-56% (starts at 40.5% to catch Q11, avoid artifact)
    // - Q21-30: LEFT,  Y: 55.5%-71% (starts at 55.5% to catch Q21)
    // - Q31-40: RIGHT, Y: 20%-40.5% (extends to 40.5% to capture Q40)
    // - Q41-50: RIGHT, Y: 41%-56% (starts at 41%, working perfectly)
    //
    // Student ID is at top (Y: 0%-18%), skip it
    return [
      { xMin: 0.25, xMax: 0.52, yMin: 0.2, yMax: 0.41, startQ: 1, numQ: 10 },
      { xMin: 0.25, xMax: 0.52, yMin: 0.405, yMax: 0.56, startQ: 11, numQ: 10 },
      { xMin: 0.25, xMax: 0.52, yMin: 0.55, yMax: 0.71, startQ: 21, numQ: 10 },
      { xMin: 0.48, xMax: 0.72, yMin: 0.2, yMax: 0.405, startQ: 31, numQ: 10 },
      { xMin: 0.48, xMax: 0.72, yMin: 0.41, yMax: 0.56, startQ: 41, numQ: 10 },
    ];
  } else {
    // ── 100-question layout ─────────────────────────────────────────────────
    // Gordon College 100q template - 10 blocks in a grid layout
    //
    // From bubble density analysis, the template has:
    // - 10 blocks total (Q1-10, Q11-20, ..., Q91-100)
    // - Arranged in 2 rows × 5 columns
    // - Each block has 10 questions × 5 choices = 50 bubbles
    // - Block markers (black squares) beside each block
    //
    // Bubble density shows blocks at:
    // Row 1 (top): y10-40%
    //   - Column 1: x20-40% (Q41-50 or Q1-10)
    //   - Column 2: x40-60% (Q51-60 or Q11-20)
    //   - Column 3: x60-80% (Q61-70 or Q21-30)
    //   - Column 4: x80-100% (Q71-80 or Q31-40)
    //
    // Row 2 (bottom): y40-90%
    //   - Column 1: x20-40% (Q1-10 or Q41-50)
    //   - Column 2: x40-60% (Q11-20 or Q51-60)
    //   - Column 3: x60-80% (Q21-30 or Q61-70)
    //   - Column 4: x80-100% (Q31-40 or Q71-80)
    //
    // STRATEGY: Define all 10 blocks, let block markers refine positions
    return [
      // Top row (y: 10-40%)
      { xMin: 0.18, xMax: 0.42, yMin: 0.1, yMax: 0.4, startQ: 41, numQ: 10 },
      { xMin: 0.38, xMax: 0.62, yMin: 0.1, yMax: 0.4, startQ: 51, numQ: 10 },
      { xMin: 0.58, xMax: 0.82, yMin: 0.1, yMax: 0.4, startQ: 61, numQ: 10 },
      { xMin: 0.78, xMax: 0.98, yMin: 0.1, yMax: 0.4, startQ: 71, numQ: 10 },

      // Bottom row (y: 40-90%)
      { xMin: 0.18, xMax: 0.42, yMin: 0.4, yMax: 0.9, startQ: 1, numQ: 10 },
      { xMin: 0.38, xMax: 0.62, yMin: 0.4, yMax: 0.9, startQ: 11, numQ: 10 },
      { xMin: 0.58, xMax: 0.82, yMin: 0.4, yMax: 0.9, startQ: 21, numQ: 10 },
      { xMin: 0.78, xMax: 0.98, yMin: 0.4, yMax: 0.9, startQ: 31, numQ: 10 },

      // Additional blocks (if needed)
      { xMin: 0.05, xMax: 0.25, yMin: 0.1, yMax: 0.4, startQ: 81, numQ: 10 },
      { xMin: 0.05, xMax: 0.25, yMin: 0.4, yMax: 0.9, startQ: 91, numQ: 10 },
    ];
  }
}

// ─────────────────────────────────────────────
// Main Scanner
// ─────────────────────────────────────────────

export class ZipgradeScanner {
  static async processZipgradeSheet(
    imageUri: string,
    questionCount: number | string = 20,
    templateName: keyof ReturnType<
      typeof ZipgradeGenerator.getTemplates
    > = "standard20",
  ): Promise<ScanResult> {
    // Track all Mat objects for cleanup
    const matsToCleanup: any[] = [];

    try {
      // Load OpenCV
      loadOpenCV();
      const {
        AdaptiveThresholdTypes,
        BorderTypes,
        ColorConversionCodes,
        ContourApproximationModes,
        DataTypes,
        ObjectType,
        RetrievalModes,
        ThresholdTypes,
      } = OpenCVTypes;

      // Normalize questionCount — caller may pass template name string or number
      const rawQ =
        typeof questionCount === "number"
          ? questionCount
          : Number(String(questionCount).replace(/[^0-9]/g, "")) || 20;
      const qCount = rawQ > 0 ? rawQ : 20;

      // ── 1. Load image ──────────────────────────────────────────────────────
      const normalizedUri = imageUri.startsWith("file://")
        ? imageUri
        : `file://${imageUri}`;
      let base64Image: string;
      try {
        const fileObj = new File(normalizedUri);
        base64Image = await fileObj.base64();
      } catch (e) {
        console.error("[OMR] Failed to read image file:", e);
        throw new Error("Could not read image file");
      }

      console.log(
        `[OMR] base64 length: ${base64Image.length}, qCount: ${qCount}`,
      );
      const srcMat = OpenCV.base64ToMat(base64Image);
      const srcJs = OpenCV.toJSValue(srcMat, "jpeg") as any;
      console.log(`[OMR] srcMat: ${srcJs.cols}x${srcJs.rows}`);
      if (!srcJs.cols || srcJs.cols === 0) {
        return {
          studentId: "00000000",
          answers: [],
          confidence: 0,
          processedImageUri: "",
        };
      }

      // ── 1.5. Auto-rotate image based on expected sheet orientation ────────
      // Only for 50q sheets - 20q and 100q sheets should NOT be rotated
      // 50q sheets should be portrait (tall), but camera may capture landscape
      // 100q sheets are A4 portrait (210×297mm, aspect ~0.707) - same as 20q
      let workingMat = srcMat;

      if (qCount === 50) {
        const imgAspect = srcJs.cols / srcJs.rows;
        const isLandscape = imgAspect > 1.0;

        // 50q sheets are very tall (aspect ~0.43), should be portrait
        // If we have a 50q exam but image is landscape, rotate 90° clockwise
        if (isLandscape) {
          console.log(
            `[OMR] Image is landscape (${srcJs.cols}x${srcJs.rows}, aspect=${imgAspect.toFixed(2)}) but 50q sheet should be portrait. Rotating 90° clockwise...`,
          );
          const rotatedMat = OpenCV.createObject(
            ObjectType.Mat,
            0,
            0,
            DataTypes.CV_8U,
          );
          matsToCleanup.push(rotatedMat);

          // Rotate 90° clockwise (ROTATE_90_CLOCKWISE = 0)
          OpenCV.invoke("rotate", srcMat, rotatedMat, 0);

          const rotatedJs = OpenCV.toJSValue(rotatedMat, "jpeg") as any;
          console.log(
            `[OMR] After rotation: ${rotatedJs.cols}x${rotatedJs.rows}`,
          );
          workingMat = rotatedMat;
        }
      }

      const IMG_W: number = (OpenCV.toJSValue(workingMat) as any).cols;

      // ── 2. Grayscale + Blur ───────────────────────────────────────────────
      let grayMat = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8U);
      matsToCleanup.push(grayMat);
      try {
        OpenCV.invoke(
          "cvtColor",
          workingMat,
          grayMat,
          ColorConversionCodes.COLOR_BGR2GRAY,
        );
      } catch (e) {
        grayMat = workingMat;
      }

      const blurMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      OpenCV.invoke(
        "GaussianBlur",
        grayMat,
        blurMat,
        OpenCV.createObject(ObjectType.Size, 5, 5),
        0,
        0,
        BorderTypes.BORDER_DEFAULT,
      );

      // ── 3. Best threshold ─────────────────────────────────────────────────
      const threshCandidates: { mat: any; label: string }[] = [];
      // Add already created Mats to cleanup list
      matsToCleanup.push(srcMat, grayMat, blurMat);

      const tOtsuInv = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      OpenCV.invoke(
        "threshold",
        blurMat,
        tOtsuInv,
        0,
        255,
        ThresholdTypes.THRESH_BINARY_INV | ThresholdTypes.THRESH_OTSU,
      );
      threshCandidates.push({ mat: tOtsuInv, label: "Otsu-INV" });
      matsToCleanup.push(tOtsuInv);

      const tOtsu = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8U);
      OpenCV.invoke(
        "threshold",
        blurMat,
        tOtsu,
        0,
        255,
        ThresholdTypes.THRESH_BINARY | ThresholdTypes.THRESH_OTSU,
      );
      threshCandidates.push({ mat: tOtsu, label: "Otsu" });
      matsToCleanup.push(tOtsu);

      const tAdapt = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8U);
      try {
        const bs = Math.round(IMG_W / 15) | 1;
        OpenCV.invoke(
          "adaptiveThreshold",
          blurMat,
          tAdapt,
          255,
          AdaptiveThresholdTypes.ADAPTIVE_THRESH_GAUSSIAN_C,
          ThresholdTypes.THRESH_BINARY_INV,
          bs < 3 ? 3 : bs,
          12,
        );
        threshCandidates.push({ mat: tAdapt, label: `Adaptive-${bs}` });
        matsToCleanup.push(tAdapt);
      } catch (_) {}

      const scoringMin = Math.pow(IMG_W * 0.02, 2);
      const scoringMax = Math.pow(IMG_W * 0.12, 2);
      const scoreThresh = (mat: any): number => {
        const cv = OpenCV.createObject(ObjectType.MatVector);
        const hi = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_32S);
        OpenCV.invoke(
          "findContoursWithHierarchy",
          mat,
          cv,
          hi,
          RetrievalModes.RETR_EXTERNAL,
          ContourApproximationModes.CHAIN_APPROX_SIMPLE,
        );
        let count = 0;
        const data = OpenCV.toJSValue(cv) as any;
        for (let i = 0; i < data.array.length; i++) {
          const c = OpenCV.copyObjectFromVector(cv, i);
          const r = OpenCV.toJSValue(OpenCV.invoke("boundingRect", c)) as any;
          const a = r.width * r.height;
          const asp = r.width / r.height;
          if (a >= scoringMin && a <= scoringMax && asp >= 0.5 && asp <= 2.0)
            count++;
        }
        return count;
      };

      let bestScore = -1,
        bestThreshMat = threshCandidates[0].mat,
        bestLabel = threshCandidates[0].label;
      for (const cand of threshCandidates) {
        const score = scoreThresh(cand.mat);
        console.log(`[OMR] thresh "${cand.label}": score=${score}`);
        if (score > bestScore) {
          bestScore = score;
          bestThreshMat = cand.mat;
          bestLabel = cand.label;
        }
      }
      console.log(`[OMR] using: ${bestLabel}`);

      const threshJs = OpenCV.toJSValue(bestThreshMat, "jpeg") as any;
      const imgWidth: number = threshJs.cols;
      const imgHeight: number = threshJs.rows;
      const imgArea = imgWidth * imgHeight;
      const processedImageUri = `data:image/jpeg;base64,${threshJs.base64}`;

      // ── 4. Find contours ───────────────────────────────────────────────────
      const contoursVec = OpenCV.createObject(ObjectType.MatVector);
      const hierMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_32S,
      );
      matsToCleanup.push(contoursVec, hierMat);

      OpenCV.invoke(
        "findContoursWithHierarchy",
        bestThreshMat,
        contoursVec,
        hierMat,
        RetrievalModes.RETR_EXTERNAL,
        ContourApproximationModes.CHAIN_APPROX_SIMPLE,
      );
      const numContours: number = (OpenCV.toJSValue(contoursVec) as any).array
        .length;
      console.log(`[OMR] numContours: ${numContours}`);
      if (numContours === 0) {
        return {
          studentId: "00000000",
          answers: [],
          confidence: 0,
          processedImageUri,
        };
      }

      // ── 5. Collect bubble candidates ───────────────────────────────────────
      // Different filtering criteria for each template type
      // 100q has smaller bubbles (3.8mm) and needs more lenient filtering
      let minShapeArea: number;
      let maxShapeArea: number;
      let minAspect: number;
      let maxAspect: number;
      let minExtent: number;

      if (qCount <= 20) {
        // 20q: moderate filtering
        minShapeArea = Math.pow(imgWidth / 100, 2);
        maxShapeArea = imgArea * 0.05;
        minAspect = 0.4;
        maxAspect = 2.5;
        minExtent = 0.1;
      } else if (qCount <= 50) {
        // 50q: relaxed filtering
        minShapeArea = Math.pow(imgWidth / 120, 2);
        maxShapeArea = imgArea * 0.1;
        minAspect = 0.25;
        maxAspect = 4.0;
        minExtent = 0.03;
      } else {
        // 100q: EXTREMELY relaxed filtering (smallest bubbles, most of them)
        minShapeArea = Math.pow(imgWidth / 200, 2); // Very small minimum
        maxShapeArea = imgArea * 0.15; // Very large maximum
        minAspect = 0.1; // Accept almost any aspect ratio
        maxAspect = 10.0;
        minExtent = 0.01; // Accept almost any extent
      }

      const rawShapes: Bubble[] = [];

      for (let i = 0; i < numContours; i++) {
        const contour = OpenCV.copyObjectFromVector(contoursVec, i);
        const rect = OpenCV.invoke("boundingRect", contour);
        const rectJs = OpenCV.toJSValue(rect) as any;
        const { x, y, width: w, height: h } = rectJs;
        const area = w * h;
        const aspect = w / h;
        const extent =
          area > 0
            ? (OpenCV.invoke("contourArea", contour) as any).value / area
            : 0;

        // Apply template-specific filtering
        if (area < minShapeArea || area > maxShapeArea) continue;
        if (aspect < minAspect || aspect > maxAspect) continue;
        if (extent < minExtent) continue;

        let fill = 0;
        try {
          const crop = OpenCV.createObject(
            ObjectType.Mat,
            0,
            0,
            DataTypes.CV_8U,
          );
          OpenCV.invoke(
            "crop",
            bestThreshMat,
            crop,
            OpenCV.createObject(ObjectType.Rect, x, y, w, h),
          );
          fill = (OpenCV.invoke("countNonZero", crop) as any).value / area;
        } catch (_) {}

        rawShapes.push({
          x: x + w / 2,
          y: y + h / 2,
          w,
          h,
          area,
          extent,
          fill,
        });
      }

      console.log(
        `[OMR] rawShapes: ${rawShapes.length} (from ${numContours} contours)`,
      );
      if (rawShapes.length === 0) {
        return {
          studentId: "00000000",
          answers: [],
          confidence: 0,
          processedImageUri,
        };
      }

      // ── 6. Bubble detection ────────────────────────────────────────────────
      // The adaptive threshold renders:
      //   Filled bubbles  → large solid blobs (high fill ~0.6-0.99)
      //   Empty circles   → thin rings / outlines (lower fill ~0.1-0.4, smaller area)
      //
      // Using a single modal cluster locks onto ONE size and misses the other.
      // Instead: find BOTH clusters and merge them.
      //
      // Step 1: find the filled bubble modal area
      const filledShapes = rawShapes.filter((s) => s.fill >= 0.45);
      const emptyShapes = rawShapes.filter(
        (s) => s.fill < 0.45 && s.fill >= 0.08,
      );
      const filledRefArea =
        filledShapes.length > 5
          ? findModalClusterMedian(
              filledShapes.map((s) => s.area),
              0.5,
            )
          : 0;
      const emptyRefArea =
        emptyShapes.length > 5
          ? findModalClusterMedian(
              emptyShapes.map((s) => s.area),
              0.5,
            )
          : 0;

      // Merge both groups using their respective reference areas
      const allBubbles: typeof rawShapes = [];
      const seen = new Set<number>();
      const addBubble = (s: (typeof rawShapes)[0], refArea: number) => {
        const key = Math.round(s.x) * 10000 + Math.round(s.y);
        if (
          !seen.has(key) &&
          s.area >= refArea * 0.4 &&
          s.area <= refArea * 2.2
        ) {
          seen.add(key);
          allBubbles.push(s);
        }
      };
      if (filledRefArea > 0)
        filledShapes.forEach((s) => addBubble(s, filledRefArea));
      if (emptyRefArea > 0)
        emptyShapes.forEach((s) => addBubble(s, emptyRefArea));
      // Also include anything close to either reference area that was missed
      rawShapes.forEach((s) => {
        const key = Math.round(s.x) * 10000 + Math.round(s.y);
        if (seen.has(key)) return;
        const nearFilled =
          filledRefArea > 0 &&
          s.area >= filledRefArea * 0.4 &&
          s.area <= filledRefArea * 2.2;
        const nearEmpty =
          emptyRefArea > 0 &&
          s.area >= emptyRefArea * 0.4 &&
          s.area <= emptyRefArea * 2.2;
        if (nearFilled || nearEmpty) {
          seen.add(key);
          allBubbles.push(s);
        }
      });

      const bubbleRefArea = filledRefArea || emptyRefArea;
      console.log(
        `[OMR] filledRef: ${Math.round(filledRefArea)}, emptyRef: ${Math.round(emptyRefArea)}, allBubbles: ${allBubbles.length}`,
      );
      if (allBubbles.length < 10) {
        return {
          studentId: "00000000",
          answers: [],
          confidence: 0,
          processedImageUri,
        };
      }

      const medianH =
        allBubbles.map((b) => b.h).sort((a, b) => a - b)[
          Math.floor(allBubbles.length / 2)
        ] || 20;
      const medianW =
        allBubbles.map((b) => b.w).sort((a, b) => a - b)[
          Math.floor(allBubbles.length / 2)
        ] || 20;
      console.log(`[OMR] medianH: ${medianH}, medianW: ${medianW}`);

      // ── 7. Detect timing marks (block markers) ────────────────────────────
      // Only use timing marks for 50q/100q sheets
      // 20q sheets use fixed regions (like Main)
      // For 100q: block markers are smaller squares beside each question block
      const timingMarks =
        qCount > 20
          ? rawShapes.filter((s) => {
              const isBlockMarker =
                qCount === 100
                  ? s.area >= bubbleRefArea * 1.3 && // Even more relaxed for 100q
                    s.area <= bubbleRefArea * 12 &&
                    s.extent >= 0.55 && // More lenient
                    s.fill >= 0.6 && // More lenient
                    s.w / s.h >= 0.3 && // More lenient aspect ratio
                    s.w / s.h <= 3.0
                  : s.area >= bubbleRefArea * 1.5 &&
                    s.area <= bubbleRefArea * 10 &&
                    s.extent >= 0.6 &&
                    s.fill >= 0.65 &&
                    s.w / s.h >= 0.4 &&
                    s.w / s.h <= 2.5;
              return isBlockMarker;
            })
          : [];

      if (qCount > 20) {
        console.log(
          `[OMR] Timing marks detected: ${timingMarks.length} (bubbleRefArea=${Math.round(bubbleRefArea)})`,
        );

        // Debug: log timing mark details
        if (timingMarks.length > 0) {
          timingMarks.forEach((m, idx) => {
            console.log(
              `[OMR] Timing mark ${idx + 1}: x=${Math.round(m.x)}, y=${Math.round(m.y)}, ` +
                `area=${Math.round(m.area)} (${(m.area / bubbleRefArea).toFixed(1)}x bubble), ` +
                `fill=${m.fill.toFixed(2)}, extent=${m.extent.toFixed(2)}, aspect=${(m.w / m.h).toFixed(2)}`,
            );
          });
        }
      }

      // ── 8. Paper crop via registration marks ──────────────────────────────
      // Registration marks are square black markers at corners
      // They should be significantly larger than bubbles (3-25x bubble area)
      // and have high extent (filled ratio) and square aspect ratio
      const regMarks = rawShapes.filter(
        (s) =>
          s.area >= bubbleRefArea * 3 &&
          s.area <= bubbleRefArea * 25 &&
          s.extent >= 0.7 &&
          s.w / s.h >= 0.6 &&
          s.w / s.h <= 1.6,
      );
      console.log(`[OMR] regMarks: ${regMarks.length}`);

      let paperLeft = imgWidth * 0.03,
        paperRight = imgWidth * 0.97;
      let paperTop = imgHeight * 0.03,
        paperBottom = imgHeight * 0.97;
      let detectedSheetType: "20" | "50" | "100" | null = null;

      // Use registration marks for cropping when available (like Main)
      if (regMarks.length >= 3) {
        const mxs = regMarks.map((m) => m.x).sort((a, b) => a - b);
        const mys = regMarks.map((m) => m.y).sort((a, b) => a - b);
        paperLeft = Math.max(0, mxs[0] - medianW * 2);
        paperRight = Math.min(imgWidth, mxs[mxs.length - 1] + medianW * 2);
        paperTop = Math.max(0, mys[0] - medianH * 2);
        paperBottom = Math.min(imgHeight, mys[mys.length - 1] + medianH * 2);
        console.log(
          `[OMR] crop from marks: [${Math.round(paperLeft)},${Math.round(paperTop)}] → [${Math.round(paperRight)},${Math.round(paperBottom)}]`,
        );
      } else {
        console.log(`[OMR] crop: using default margins`);
      }

      const paperW = paperRight - paperLeft;
      const paperH = paperBottom - paperTop;

      // Translate bubble coordinates to paper space
      const bubbles = allBubbles
        .map((b) => ({
          ...b,
          x: b.x - paperLeft,
          y: b.y - paperTop,
        }))
        .filter((b) => b.x >= 0 && b.x <= paperW && b.y >= 0 && b.y <= paperH);

      console.log(
        `[OMR] bubbles in paper space: ${bubbles.length}, paper: ${Math.round(paperW)}x${Math.round(paperH)}`,
      );

      // ── DIAGNOSTIC: dump all bubble positions as % of paper ────────────────
      // Group into 10% X bands × 10% Y bands and log density
      const xBands = 10,
        yBands = 10;
      const grid: number[][] = Array.from({ length: yBands }, () =>
        new Array(xBands).fill(0),
      );
      for (const b of bubbles) {
        const xi = Math.min(Math.floor((b.x / paperW) * xBands), xBands - 1);
        const yi = Math.min(Math.floor((b.y / paperH) * yBands), yBands - 1);
        grid[yi][xi]++;
      }
      console.log(`[OMR] bubble density grid (rows=Y 0-100%, cols=X 0-100%):`);
      grid.forEach((row, yi) => {
        const label = `y${yi * 10}-${yi * 10 + 10}%`;
        const cells = row
          .map((v, xi) => (v > 0 ? `x${xi * 10}:${v}` : ""))
          .filter(Boolean)
          .join(" ");
        if (cells) console.log(`  ${label}: ${cells}`);
      });

      // ── 8. Auto-detect sheet type if not explicitly set ──────────────────
      // For 20q: use simple bubble count heuristic (like Main)
      // For 50q/100q: trust the exam-specified question count
      let detectedQ = qCount;

      if (qCount <= 20) {
        // A 20-question sheet has exactly 100 bubbles (20 * 5).
        // A 50-question sheet has 250 answer bubbles + 50 ID bubbles = 300 bubbles.
        // Therefore, any sheet with > 160 bubbles is definitively a 50+ question sheet.
        const looksLike50q = bubbles.length > 160;

        if (looksLike50q) {
          detectedQ = 50;
          console.log(
            `[OMR] AUTO-DETECTED 50q sheet (totalBubbles=${bubbles.length}) — overriding qCount from ${qCount} to 50`,
          );
        } else {
          console.log(
            `[OMR] Confirmed 20q sheet (totalBubbles=${bubbles.length})`,
          );
        }
      } else {
        // For 50q/100q, always trust the exam-specified question count
        console.log(
          `[OMR] Using exam-specified question count: ${qCount}q (bubbles=${bubbles.length})`,
        );
      }

      // ── 9. Extract answers using timing mark-based or fallback regions ────
      // For 20q: use fixed regions (like Main)
      // For 50q: try to use timing marks to dynamically locate question blocks
      // For 100q: use fixed regions (timing marks are unreliable)
      let regions = getLayoutRegions(detectedQ);

      // DISABLED: Timing mark adjustment for 50q sheets
      // The fixed regions are already calibrated correctly based on physical measurements
      // Timing marks were causing misalignment (Q21-30 region was being incorrectly adjusted)
      if (false && detectedQ === 50 && timingMarks.length >= 3) {
      } else if (detectedQ === 100) {
        // ── 100q: Use bubble density to automatically identify question blocks ────
        console.log(
          `[OMR] Using bubble density analysis to identify regions for 100q`,
        );

        // Analyze bubble density to find question blocks
        // Each block has ~50 bubbles (10 questions × 5 choices)
        // Blocks are arranged in a grid pattern

        // Group bubbles by X position (columns) and Y position (rows)
        const xBands = 10;
        const yBands = 10;
        const densityGrid: number[][] = Array.from({ length: yBands }, () =>
          new Array(xBands).fill(0),
        );

        for (const b of bubbles) {
          const xi = Math.min(Math.floor((b.x / paperW) * xBands), xBands - 1);
          const yi = Math.min(Math.floor((b.y / paperH) * yBands), yBands - 1);
          densityGrid[yi][xi]++;
        }

        // Find dense regions (blocks with many bubbles)
        const denseRegions: Array<{
          xMin: number;
          xMax: number;
          yMin: number;
          yMax: number;
          density: number;
        }> = [];

        for (let yi = 0; yi < yBands - 1; yi++) {
          for (let xi = 0; xi < xBands - 2; xi++) {
            // Check if this 3×2 grid cell has high bubble density
            const density =
              densityGrid[yi][xi] +
              densityGrid[yi][xi + 1] +
              densityGrid[yi][xi + 2] +
              (yi + 1 < yBands
                ? densityGrid[yi + 1][xi] +
                  densityGrid[yi + 1][xi + 1] +
                  densityGrid[yi + 1][xi + 2]
                : 0);

            if (density >= 15) {
              // At least 15 bubbles in this region
              denseRegions.push({
                xMin: xi / xBands,
                xMax: (xi + 3) / xBands,
                yMin: yi / yBands,
                yMax: (yi + 2) / yBands,
                density,
              });
            }
          }
        }

        // Sort regions by position (top-to-bottom, left-to-right)
        denseRegions.sort((a, b) => {
          const rowDiff = Math.floor(a.yMin * 5) - Math.floor(b.yMin * 5);
          if (rowDiff !== 0) return rowDiff;
          return a.xMin - b.xMin;
        });

        // Merge overlapping regions
        const mergedRegions: typeof denseRegions = [];
        for (const region of denseRegions) {
          const overlapping = mergedRegions.find(
            (r) =>
              Math.abs(r.xMin - region.xMin) < 0.2 &&
              Math.abs(r.yMin - region.yMin) < 0.2,
          );
          if (overlapping) {
            // Merge by expanding bounds
            overlapping.xMin = Math.min(overlapping.xMin, region.xMin);
            overlapping.xMax = Math.max(overlapping.xMax, region.xMax);
            overlapping.yMin = Math.min(overlapping.yMin, region.yMin);
            overlapping.yMax = Math.max(overlapping.yMax, region.yMax);
            overlapping.density += region.density;
          } else {
            mergedRegions.push({ ...region });
          }
        }

        console.log(
          `[OMR] Found ${mergedRegions.length} dense regions via bubble density`,
        );
        mergedRegions.forEach((r, idx) => {
          console.log(
            `[OMR] Dense region ${idx + 1}: X[${(r.xMin * 100).toFixed(0)}%-${(r.xMax * 100).toFixed(0)}%] ` +
              `Y[${(r.yMin * 100).toFixed(0)}%-${(r.yMax * 100).toFixed(0)}%] density=${r.density}`,
          );
        });

        // Use detected regions if we found at least 2
        if (mergedRegions.length >= 2) {
          regions = mergedRegions.slice(0, 10).map((r, idx) => ({
            xMin: Math.max(0, r.xMin - 0.02),
            xMax: Math.min(1, r.xMax + 0.02),
            yMin: Math.max(0, r.yMin - 0.02),
            yMax: Math.min(1, r.yMax + 0.02),
            startQ: idx * 10 + 1,
            numQ: 10,
          }));
          console.log(`[OMR] Using ${regions.length} density-based regions`);
        }
      } else {
        console.log(
          `[OMR] Using fixed layout regions (timing marks: ${timingMarks.length})`,
        );
      }

      console.log(`[OMR] layout: ${detectedQ}q → ${regions.length} regions`);

      // ── 9. Extract answers ────────────────────────────────────────────────
      let allAnswers: StudentAnswer[] = [];

      // For 100-item templates, use brightness-based scanning (Skia)
      if (detectedQ === 100 && regMarks.length >= 3) {
        console.log(
          "[OMR] Using BRIGHTNESS scanning for 100-item template (Skia pixel sampling)",
        );

        // Import the brightness scanner
        const {
          scan100ItemWithBrightness,
        } = require("./brightnessScannerFor100Item");

        // Extract corner markers (sorted by position)
        const sortedMarks = [...regMarks].sort(
          (a, b) => a.y - b.y || a.x - b.x,
        );

        let markers;
        if (regMarks.length >= 4) {
          // Use all 4 corners
          const topMarks = sortedMarks.slice(0, 2).sort((a, b) => a.x - b.x);
          const bottomMarks = sortedMarks.slice(-2).sort((a, b) => a.x - b.x);

          markers = {
            topLeft: { x: topMarks[0].x, y: topMarks[0].y },
            topRight: { x: topMarks[1].x, y: topMarks[1].y },
            bottomLeft: { x: bottomMarks[0].x, y: bottomMarks[0].y },
            bottomRight: { x: bottomMarks[1].x, y: bottomMarks[1].y },
          };
        } else {
          // Only 3 markers: estimate the missing corner
          // Identify which corner is missing by analyzing the 3 detected markers
          const marks = [...sortedMarks];

          // Find the two markers with similar Y coordinates (top or bottom edge)
          const yDiffs = [
            { idx: [0, 1], diff: Math.abs(marks[0].y - marks[1].y) },
            { idx: [0, 2], diff: Math.abs(marks[0].y - marks[2].y) },
            { idx: [1, 2], diff: Math.abs(marks[1].y - marks[2].y) },
          ];
          yDiffs.sort((a, b) => a.diff - b.diff);

          const edgePair = yDiffs[0].idx;
          const loneIdx = [0, 1, 2].find((i) => !edgePair.includes(i))!;

          const edge1 = marks[edgePair[0]];
          const edge2 = marks[edgePair[1]];
          const lone = marks[loneIdx];

          // Sort edge markers by X
          const [edgeLeft, edgeRight] =
            edge1.x < edge2.x ? [edge1, edge2] : [edge2, edge1];

          // Determine if edge is top or bottom based on Y comparison with lone marker
          const edgeIsTop = (edgeLeft.y + edgeRight.y) / 2 < lone.y;

          if (edgeIsTop) {
            // We have TR, TL, and one bottom corner - estimate the other bottom
            const paperWidth = edgeRight.x - edgeLeft.x;
            const missingX =
              lone.x < (edgeLeft.x + edgeRight.x) / 2
                ? edgeRight.x // lone is BL, missing BR
                : edgeLeft.x; // lone is BR, missing BL

            markers = {
              topLeft: { x: edgeLeft.x, y: edgeLeft.y },
              topRight: { x: edgeRight.x, y: edgeRight.y },
              bottomLeft:
                lone.x < (edgeLeft.x + edgeRight.x) / 2
                  ? { x: lone.x, y: lone.y }
                  : { x: missingX, y: lone.y },
              bottomRight:
                lone.x >= (edgeLeft.x + edgeRight.x) / 2
                  ? { x: lone.x, y: lone.y }
                  : { x: missingX, y: lone.y },
            };
          } else {
            // We have BL, BR, and one top corner - estimate the other top
            const paperWidth = edgeRight.x - edgeLeft.x;
            const missingX =
              lone.x < (edgeLeft.x + edgeRight.x) / 2
                ? edgeRight.x // lone is TL, missing TR
                : edgeLeft.x; // lone is TR, missing TL

            markers = {
              topLeft:
                lone.x < (edgeLeft.x + edgeRight.x) / 2
                  ? { x: lone.x, y: lone.y }
                  : { x: missingX, y: lone.y },
              topRight:
                lone.x >= (edgeLeft.x + edgeRight.x) / 2
                  ? { x: lone.x, y: lone.y }
                  : { x: missingX, y: lone.y },
              bottomLeft: { x: edgeLeft.x, y: edgeLeft.y },
              bottomRight: { x: edgeRight.x, y: edgeRight.y },
            };
          }

          console.log("[OMR] Only 3 markers detected, estimating 4th corner");
        }

        console.log(
          "[OMR] Corner markers:",
          `TL=(${Math.round(markers.topLeft.x)},${Math.round(markers.topLeft.y)})`,
          `TR=(${Math.round(markers.topRight.x)},${Math.round(markers.topRight.y)})`,
          `BL=(${Math.round(markers.bottomLeft.x)},${Math.round(markers.bottomLeft.y)})`,
          `BR=(${Math.round(markers.bottomRight.x)},${Math.round(markers.bottomRight.y)})`,
        );

        // Call brightness scanner with image URI and markers
        allAnswers = await scan100ItemWithBrightness(imageUri, markers);

        console.log(
          `[OMR] Brightness scanner detected ${allAnswers.filter((a) => a.selectedAnswer).length}/100 answers`,
        );
      } else if (detectedQ === 100) {
        // Fallback: not enough markers for hybrid scanning
        console.warn(
          "[OMR] Not enough corner markers for hybrid scanning, falling back to region-based detection",
        );

        // Use region-based contour detection (existing code)
        for (const region of regions) {
          const regionAnswers = extractAnswersFromRegion(
            bubbles,
            region,
            paperW,
            paperH,
            medianH,
          );
          allAnswers.push(...regionAnswers);
        }
      } else {
        // 20q/50q templates: use existing region-based detection (UNCHANGED)
        for (const region of regions) {
          const regionAnswers = extractAnswersFromRegion(
            bubbles,
            region,
            paperW,
            paperH,
            medianH,
          );
          allAnswers.push(...regionAnswers);
        }
      }

      // Log detailed region information for debugging
      regions.forEach((r, idx) => {
        const xMinPx = Math.round(r.xMin * paperW);
        const xMaxPx = Math.round(r.xMax * paperW);
        const yMinPx = Math.round(r.yMin * paperH);
        const yMaxPx = Math.round(r.yMax * paperH);
        console.log(
          `[OMR] Region ${idx + 1} (Q${r.startQ}-${r.startQ + r.numQ - 1}): ` +
            `X[${(r.xMin * 100).toFixed(1)}%-${(r.xMax * 100).toFixed(1)}%] (${xMinPx}-${xMaxPx}px) ` +
            `Y[${(r.yMin * 100).toFixed(1)}%-${(r.yMax * 100).toFixed(1)}%] (${yMinPx}-${yMaxPx}px)`,
        );
      });

      // Sort by question number
      allAnswers.sort((a, b) => a.questionNumber - b.questionNumber);

      // Pad any missing questions
      const answerMap = new Map(allAnswers.map((a) => [a.questionNumber, a]));
      const finalAnswers: StudentAnswer[] = [];
      for (let q = 1; q <= detectedQ; q++) {
        finalAnswers.push(
          answerMap.get(q) ?? { questionNumber: q, selectedAnswer: "" },
        );
      }

      // ── 9. Extract Student ID ──────────────────────────────────────────────
      //
      // Student ID grid location varies by template:
      //   20q: y ∈ [20%, 32%] of paper height, 10 digit columns × 10 digit rows (0-9)
      //   50q: y ∈ [9%, 18%] of paper height, 10 digit columns × 10 digit rows (0-9)
      //   100q: Has ID section but not currently scanned
      //
      // APPROACH: Brightness-based sampling (synchronized with web version)
      // - For each expected bubble position (10 rows × 10 columns), sample brightness
      // - Compare darkest vs. brightest bubbles to detect filled digit
      // - Uses tiered thresholds: strong fill (< 68% of reference) or light fill (< 82% + gap > 12%)
      // - Detects double-shading (2nd darkest also quite dark)
      //
      let studentId = "00000000";

      if (detectedQ === 20 || detectedQ === 50) {
        // idRegionYMin/YMax define the declared section for diagnostic bubble
        // filtering. Row spacing is computed from the ORIGINAL calibrated
        // 20q section height (20%→32% / 9 = 45.7 px) regardless of filter bounds.
        const idRegion =
          detectedQ === 20
            ? { yMin: 0.2, yMax: 0.37, numDigits: 10 }
            : { yMin: 0.09, yMax: 0.18, numDigits: 10 };

        // Fixed row-spacing based on the physical ZipGrade bubble pitch.
        //   20q: (0.32 - 0.20) × paperH / 9  ≈ 45.7 px per row
        //   50q: (0.18 - 0.09) × paperH / 9  ≈ 34.3 px per row
        const idRowSpacing =
          detectedQ === 20
            ? ((0.32 - 0.2) * paperH) / 9 // ≈ 45.7 px
            : ((0.18 - 0.09) * paperH) / 9; // ≈ 34.3 px

        // ── Row spacing and corrected start position ────────────────────────
        // Empirically verified (20q): digit rows 0-9 begin 3 row-spacings below
        // the box top. The header/border area occupies ~3 row heights.
        // Row 0 lands at ≈ 823 px; row 2 at ≈ 914 px (matches filled-bubble data).
        // The 50q offset has not been re-calibrated; keep at 2.0 until verified.
        const rowHeaderOffsetFactor = detectedQ === 20 ? 3.0 : 2.0;
        const idRowStart =
          idRegion.yMin * paperH + rowHeaderOffsetFactor * idRowSpacing;
        const digitYPositions = Array.from(
          { length: 10 },
          (_, i) => idRowStart + i * idRowSpacing,
        );

        // ── Column detection: cluster actual ID bubbles ───────────────
        // The student ID has 10 digit columns with smaller, tighter bubbles than
        // the answer section. We cluster the actual detected ID bubbles by X position
        // to find the column centroids.
        //
        // Filter bubbles in the ID region
        const idBubbles = bubbles.filter(
          (b) =>
            b.y >= idRegion.yMin * paperH &&
            b.y <= idRegion.yMax * paperH &&
            b.x >= 0.15 * paperW &&
            b.x <= 0.55 * paperW, // ID section is in left half only
        );
        
        console.log(
          `[OMR] Student ID region (${detectedQ}q): ${idBubbles.length} bubbles in y[${(idRegion.yMin * 100).toFixed(0)}%-${(idRegion.yMax * 100).toFixed(0)}%]`,
        );
        
        let finalColCentroids: number[];
        
        // Cluster ID bubbles by X to find column positions
        if (idBubbles.length >= 5) {
          const xSorted = [...idBubbles].sort((a, b) => a.x - b.x);
          const xClusters = clusterByY(
            xSorted.map(b => ({ y: b.x, data: b })),
            medianW * 0.5, // Tighter clustering for smaller ID bubbles
          );
          
          const detectedCols = xClusters
            .map(cluster => {
              const xVals = cluster.map(item => item.data.x);
              return xVals.reduce((sum, x) => sum + x, 0) / xVals.length;
            })
            .sort((a, b) => a - b);
          
          // If we have 8-10 columns detected, use them
          if (detectedCols.length >= 8 && detectedCols.length <= 12) {
            // Take the first 10 or interpolate to get exactly 10
            if (detectedCols.length === 10) {
              finalColCentroids = detectedCols;
            } else {
              // Interpolate to get 10 evenly-spaced columns
              const firstCol = detectedCols[0];
              const lastCol = detectedCols[Math.min(9, detectedCols.length - 1)];
              const spacing = (lastCol - firstCol) / 9;
              finalColCentroids = Array.from(
                { length: 10 },
                (_, i) => firstCol + i * spacing,
              );
            }
          }
          // If we have fewer columns, use answer region as reference
          else {
            // Get answer columns from left region
            const leftRegion = regions[0];
            const leftAnswerBubbles = bubbles.filter(
              (b) =>
                b.x >= leftRegion.xMin * paperW &&
                b.x <= leftRegion.xMax * paperW &&
                b.y >= leftRegion.yMin * paperH &&
                b.y <= leftRegion.yMax * paperH,
            );
            
            const ansXSorted = [...leftAnswerBubbles].sort((a, b) => a.x - b.x);
            const ansXClusters = clusterByY(
              ansXSorted.map(b => ({ y: b.x, data: b })),
              medianW * 0.6,
            );
            
            const answerColCentroids = ansXClusters
              .map(cluster => {
                const xVals = cluster.map(item => item.data.x);
                return xVals.reduce((sum, x) => sum + x, 0) / xVals.length;
              })
              .sort((a, b) => a - b);
            
            if (answerColCentroids.length >= 5) {
              // ID columns are narrower: they fit within the first 3 answer columns
              // Empirically: ID section spans ~60% of answer section width
              const answerSpan = answerColCentroids[4] - answerColCentroids[0];
              const idSpan = answerSpan * 0.6;
              const idColSpacing = idSpan / 9;
              const idFirstCol = answerColCentroids[0];
              
              finalColCentroids = Array.from(
                { length: 10 },
                (_, i) => idFirstCol + i * idColSpacing,
              );
            } else {
              // Last resort fallback
              const leftRegionWidth = (leftRegion.xMax - leftRegion.xMin) * paperW;
              const colSpacing = (leftRegionWidth * 0.6) / 9;
              const firstColX = leftRegion.xMin * paperW;
              finalColCentroids = Array.from(
                { length: 10 },
                (_, i) => firstColX + i * colSpacing,
              );
            }
          }
        } else {
          // Not enough ID bubbles, use answer region reference
          const leftRegion = regions[0];
          const leftAnswerBubbles = bubbles.filter(
            (b) =>
              b.x >= leftRegion.xMin * paperW &&
              b.x <= leftRegion.xMax * paperW &&
              b.y >= leftRegion.yMin * paperH &&
              b.y <= leftRegion.yMax * paperH,
          );
          
          const ansXSorted = [...leftAnswerBubbles].sort((a, b) => a.x - b.x);
          const ansXClusters = clusterByY(
            ansXSorted.map(b => ({ y: b.x, data: b })),
            medianW * 0.6,
          );
          
          const answerColCentroids = ansXClusters
            .map(cluster => {
              const xVals = cluster.map(item => item.data.x);
              return xVals.reduce((sum, x) => sum + x, 0) / xVals.length;
            })
            .sort((a, b) => a - b);
          
          if (answerColCentroids.length >= 5) {
            const answerSpan = answerColCentroids[4] - answerColCentroids[0];
            const idSpan = answerSpan * 0.6;
            const idColSpacing = idSpan / 9;
            const idFirstCol = answerColCentroids[0];
            
            finalColCentroids = Array.from(
              { length: 10 },
              (_, i) => idFirstCol + i * idColSpacing,
            );
          } else {
            const leftRegionWidth = (leftRegion.xMax - leftRegion.xMin) * paperW;
            const colSpacing = (leftRegionWidth * 0.6) / 9;
            const firstColX = leftRegion.xMin * paperW;
            finalColCentroids = Array.from(
              { length: 10 },
              (_, i) => firstColX + i * colSpacing,
            );
          }
        }

        console.log(
          `[OMR] Student ID: row start=${Math.round(idRowStart)}px spacing=${Math.round(idRowSpacing)}px → digit positions: ${digitYPositions.map((y) => Math.round(y)).join(",")}`,
        );
        console.log(
          `[OMR] Student ID: detected ${idBubbles.length} bubbles, derived columns at x=${finalColCentroids.map((c) => Math.round(c)).join(",")}`,
        );

        if (finalColCentroids.length >= 1) {
          // ── Direct pixel sampling from bestThreshMat ──────────────────────
          // Instead of looking up pre-detected bubbles (unreliable for small ID
          // bubbles), we directly crop bestThreshMat at each expected (col, row)
          // position and use countNonZero to compute fill — the exact same method
          // used to compute bubble.fill during contour detection.
          //
          // In the adaptive-inverted threshold image:
          //   Filled (dark) bubbles → mostly white → high countNonZero → high fill
          //   Empty bubbles → thin ring → low countNonZero → low fill
          //
          // brightness = (1 - fill) * 255  → low brightness = filled = marked

          const sampleW = Math.round(medianW * 0.85); // slightly narrower for precision
          const sampleH = medianH; // full bubble height → zero dead-zones

          const digits: string[] = [];
          const numCols = Math.min(
            finalColCentroids.length,
            idRegion.numDigits,
          );
          const doubleShadeColumns: number[] = [];

          for (let col = 0; col < numCols; col++) {
            const colX = finalColCentroids[col];
            const fills: number[] = [];

            for (let row = 0; row < 10; row++) {
              const centerY = digitYPositions[row];

              // Convert paper-space coords → original image coords (+paperLeft/Top)
              const imgX = Math.round(colX + paperLeft - sampleW / 2);
              const imgY = Math.round(centerY + paperTop - sampleH / 2);
              const cW = Math.min(sampleW, Math.max(0, imgWidth - imgX));
              const cH = Math.min(sampleH, Math.max(0, imgHeight - imgY));

              if (imgX < 0 || imgY < 0 || cW <= 0 || cH <= 0) {
                fills.push(255);
                continue;
              }

              try {
                const crop = OpenCV.createObject(
                  ObjectType.Mat,
                  0,
                  0,
                  DataTypes.CV_8U,
                );
                OpenCV.invoke(
                  "crop",
                  bestThreshMat,
                  crop,
                  OpenCV.createObject(ObjectType.Rect, imgX, imgY, cW, cH),
                );
                const nonZero = (OpenCV.invoke("countNonZero", crop) as any)
                  .value;
                const fill = nonZero / (cW * cH);
                fills.push((1 - fill) * 255); // brightness: low = filled
              } catch (_) {
                fills.push(255);
              }
            }

            // Sort to find darkest and brightest
            const sorted = [...fills].sort((a, b) => a - b);
            const darkest = sorted[0]; // most filled (lowest brightness)
            const secondDark = sorted[1]; // second most filled
            const upperQ = sorted[7]; // upper quartile (unfilled reference)

            let detectedDigit: number | null = null;
            let hasDetection = false;

            // Tiered detection thresholds (synchronized with web version)
            const darkRatio = upperQ > 20 ? darkest / upperQ : 1;
            const gapFromSecond = secondDark - darkest;
            const gapRatio = upperQ > 20 ? gapFromSecond / upperQ : 0;

            // Tier 1: Strong fill (clear dark mark)
            if (darkRatio < 0.68) {
              detectedDigit = fills.indexOf(darkest);
              hasDetection = true;
            }
            // Tier 2: Light fill (light pencil / faded ink)
            else if (darkRatio < 0.82 && gapRatio > 0.12) {
              detectedDigit = fills.indexOf(darkest);
              hasDetection = true;
            }

            // Check for double-shading
            if (hasDetection && detectedDigit !== null) {
              const secondRatio = upperQ > 20 ? secondDark / upperQ : 1;
              const gapBetweenTopTwo = upperQ > 20 ? gapFromSecond / upperQ : 1;
              if (secondRatio < 0.76 && gapBetweenTopTwo < 0.09) {
                doubleShadeColumns.push(col + 1);
                console.log(
                  `[OMR] Student ID col ${col + 1}: ⚠️ DOUBLE SHADE (darkest=${darkest.toFixed(0)} 2nd=${secondDark.toFixed(0)} upperQ=${upperQ.toFixed(0)})`,
                );
                digits.push("?");
                continue;
              }
            }

            if (hasDetection && detectedDigit !== null) {
              digits.push(String(detectedDigit));
              console.log(
                `[OMR] Student ID col ${col + 1}: digit=${detectedDigit} (darkest=${darkest.toFixed(0)} upperQ=${upperQ.toFixed(0)} ratio=${darkRatio.toFixed(2)} gap=${gapRatio.toFixed(2)})`,
              );
            } else {
              digits.push("_");
              console.log(
                `[OMR] Student ID col ${col + 1}: unshaded (darkest=${darkest.toFixed(0)} upperQ=${upperQ.toFixed(0)} ratio=${darkRatio.toFixed(2)})`,
              );
            }
          }

          // Convert to final ID, excluding unshaded (_) and double-shaded (?) columns
          const cleanDigits = digits.filter((d) => d !== "_" && d !== "?");
          // Preserve full ID — GC student IDs are 9 digits; do not truncate.
          const rawJoined = cleanDigits.join("");
          studentId =
            rawJoined.length >= 9
              ? rawJoined.slice(0, 10) // cap at 10 (template max)
              : rawJoined.padEnd(8, "0"); // short IDs: pad to 8

          console.log(`[OMR] Student ID raw: ${digits.join("")}`);
          console.log(
            `[OMR] Student ID extracted: ${studentId} (from ${cleanDigits.length} clean digits)`,
          );
          if (doubleShadeColumns.length > 0) {
            console.log(
              `[OMR] Student ID double-shaded columns: ${doubleShadeColumns.join(",")}`,
            );
          }
        } else {
          console.log(
            `[OMR] Student ID: insufficient columns (${finalColCentroids.length}/1 minimum)`,
          );
        }
      } else {
        console.log(
          `[OMR] Student ID: Not scanning for ${detectedQ}q template (manual edit available)`,
        );
      }

      // Ensure numeric — preserve full length (up to 10 digits).
      const numericId = studentId.replace(/[^0-9]/g, "").padStart(8, "0"); // guarantee at least 8 digits; longer IDs kept as-is
      console.log(`[OMR] Final studentId: ${numericId}`);
      console.log("--- OPENCV EXTRACTED ANSWERS ---");
      console.log(JSON.stringify(finalAnswers, null, 2));

      return {
        studentId: numericId,
        answers: finalAnswers,
        confidence: 0.95,
        processedImageUri,
      };
    } catch (error) {
      console.error("[OMR] Fatal error:", error);
      throw new Error("Failed to process Zipgrade answer sheet");
    } finally {
      // Explicitly clear all OpenCV buffers and release memory
      try {
        // Delete all tracked Mat objects
        for (const mat of matsToCleanup) {
          try {
            if (mat && typeof mat.delete === "function") {
              mat.delete();
            }
          } catch (e) {
            // Ignore individual deletion errors
          }
        }

        // Clear OpenCV internal buffers
        OpenCV.clearBuffers();

        console.log(
          `[OMR] Cleanup: Released ${matsToCleanup.length} Mat objects`,
        );
      } catch (e) {
        console.warn("[OMR] Cleanup warning:", e);
      }
    }
  }

  static async validateZipgradeSheet(imageUri: string): Promise<{
    isValid: boolean;
    issues: string[];
    confidence: number;
    detectedTemplate?: keyof ReturnType<typeof ZipgradeGenerator.getTemplates>;
  }> {
    const issues: string[] = [];
    const matsToCleanup: any[] = [];

    try {
      // Load OpenCV
      loadOpenCV();
      const { ColorConversionCodes, DataTypes, ObjectType } = OpenCVTypes;

      // Load Image
      const normalizedUri = imageUri.startsWith("file://")
        ? imageUri
        : `file://${imageUri}`;
      const fileObj = new File(normalizedUri);
      const base64Image = await fileObj.base64();

      const srcMat = OpenCV.base64ToMat(base64Image);
      matsToCleanup.push(srcMat);

      const grayMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      matsToCleanup.push(grayMat);

      OpenCV.invoke(
        "cvtColor",
        srcMat,
        grayMat,
        ColorConversionCodes.COLOR_BGR2GRAY,
      );

      // Blur Detection using Canny Edge Density
      const edgesMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      matsToCleanup.push(edgesMat);

      OpenCV.invoke("Canny", grayMat, edgesMat, 50, 150);

      const res = OpenCV.invoke("countNonZero", edgesMat) as any;
      const edgePixels = typeof res === "number" ? res : res?.value || 0;

      const srcJs = OpenCV.toJSValue(grayMat) as any;
      const totalPixels = srcJs.rows * srcJs.cols;

      const edgeDensity = (edgePixels / totalPixels) * 100;
      console.log(
        `[Validation] Blur Edge Density: ${edgeDensity.toFixed(2)}% (${edgePixels} edges)`,
      );

      // Extremely blurry sheets typically have an edge density < 0.8%
      // Sharp sheets typically range from 2.0% - 6.0% depending on lighting
      if (edgeDensity < 0.8) {
        issues.push(
          "Image is too blurry. Ensure the camera is steadily focused and lighting is bright.",
        );
      }
    } catch (err) {
      console.error("[Validation] Blur detection check failed:", err);
    } finally {
      // Cleanup Mat objects
      try {
        for (const mat of matsToCleanup) {
          try {
            if (mat && typeof mat.delete === "function") {
              mat.delete();
            }
          } catch (e) {
            // Ignore individual deletion errors
          }
        }
        OpenCV.clearBuffers();
        console.log(
          `[Validation] Cleanup: Released ${matsToCleanup.length} Mat objects`,
        );
      } catch (e) {
        console.warn("[Validation] Cleanup warning:", e);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      confidence: issues.length === 0 ? 0.95 : 0.4,
      detectedTemplate: "standard20",
    };
  }
}
