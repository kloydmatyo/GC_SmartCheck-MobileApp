import { File } from "expo-file-system";
import { ScanResult, StudentAnswer } from "../types/scanning";
import { scan200ItemPageFast } from "./brightnessScannerFor200Item";
import { ZipgradeGenerator } from "./zipgradeGenerator";

const OMR_DEBUG_LOGS = false;

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
//   NO Student ID section
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
  "200": {
    // 200-item uses the SAME physical sheet as 100-item (2 pages)
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
    // Template: 2 mini-sheets stacked on A4 (210 × 297mm), each sheet 210 × 148.5mm
    // Each mini-sheet has 5 blocks arranged HORIZONTALLY in a single row:
    //   Q1-10 | Q11-20 | Q21-30 | Q31-40 | Q41-50
    //
    // Physical measurements (per mini-sheet, relative to its own top-left):
    //   margin = 10mm, width = 210mm → usableW = 190mm
    //   blockWidth = 190 / 5 = 38mm per block
    //   Block X positions (mm): 10, 48, 86, 124, 162  (left edge of each block)
    //   Block X ends   (mm): 48, 86, 124, 162, 200
    //   As fractions of 210mm:
    //     Col 0 (Q1-10):  xMin=0.048, xMax=0.229
    //     Col 1 (Q11-20): xMin=0.229, xMax=0.410
    //     Col 2 (Q21-30): xMin=0.410, xMax=0.590
    //     Col 3 (Q31-40): xMin=0.590, xMax=0.771
    //     Col 4 (Q41-50): xMin=0.771, xMax=0.952
    //
    //   Answer Y start: after header (~27mm) + name row (4mm) + ID section (~55mm) ≈ 86mm
    //   Answer Y end:   86mm + 10 rows × 5.2mm ≈ 138mm
    //   As fractions of 148.5mm: yMin ≈ 0.55, yMax ≈ 0.95
    //
    // NOTE: The scanner receives a cropped image of ONE mini-sheet (half the A4 page).
    return [
      { xMin: 0.1, xMax: 0.23, yMin: 0.52, yMax: 0.97, startQ: 1, numQ: 10 },
      { xMin: 0.21, xMax: 0.41, yMin: 0.52, yMax: 0.97, startQ: 11, numQ: 10 },
      { xMin: 0.39, xMax: 0.61, yMin: 0.52, yMax: 0.97, startQ: 21, numQ: 10 },
      { xMin: 0.59, xMax: 0.79, yMin: 0.52, yMax: 0.97, startQ: 31, numQ: 10 },
      { xMin: 0.77, xMax: 0.97, yMin: 0.52, yMax: 0.97, startQ: 41, numQ: 10 },
    ];
  } else {
    // ── 100-question layout ─────────────────────────────────────────────────
    // Template: full A4 page (210 × 297mm), drawFullSheet() in templatePdfGenerator.ts
    //
    // Grid: 5 columns × 2 rows, sequential left-to-right, top-to-bottom:
    //   Col 0: Q1-10  (row 0), Q11-20  (row 1)
    //   Col 1: Q21-30 (row 0), Q31-40  (row 1)
    //   Col 2: Q41-50 (row 0), Q51-60  (row 1)
    //   Col 3: Q61-70 (row 0), Q71-80  (row 1)
    //   Col 4: Q81-90 (row 0), Q91-100 (row 1)
    //
    // Physical measurements (mm, page = 210 × 297):
    //   margin=10, usableW=190, numChoices=5, bubbleGap=5.5, bubbleSize=3.5
    //   qBlockW = 10 + (5-1)×5.5 + 3.5 = 35.5mm
    //   colGap = (190 - 5×35.5) / 6 ≈ 2.0833mm
    //   bx[col] = 10 + 2.0833 + col×37.5833
    //     Col 0: bx=12.08  → xEnd=47.58  → page fracs 0.058–0.227
    //     Col 1: bx=49.67  → xEnd=85.17  → page fracs 0.237–0.406
    //     Col 2: bx=87.25  → xEnd=122.75 → page fracs 0.416–0.585
    //     Col 3: bx=124.83 → xEnd=160.33 → page fracs 0.595–0.763
    //     Col 4: bx=162.42 → xEnd=197.92 → page fracs 0.774–0.942
    //
    //   currentY after header+ID ≈ 81mm; drawQBlock adds 5mm header row
    //   Row 0 bubbles: Y 86–138mm  → page fracs 0.290–0.465
    //   blockVGap = 10×5.2 + 10 = 62mm
    //   Row 1 bubbles: Y 148–200mm → page fracs 0.499–0.673
    //
    // Regions are padded ±5mm around the bubble area for robust detection.
    return [
      // Row 0 (top blocks)
      { xMin: 0.04, xMax: 0.24, yMin: 0.27, yMax: 0.49, startQ: 1, numQ: 10 },
      { xMin: 0.22, xMax: 0.42, yMin: 0.27, yMax: 0.49, startQ: 21, numQ: 10 },
      { xMin: 0.4, xMax: 0.6, yMin: 0.27, yMax: 0.49, startQ: 41, numQ: 10 },
      { xMin: 0.58, xMax: 0.78, yMin: 0.27, yMax: 0.49, startQ: 61, numQ: 10 },
      { xMin: 0.76, xMax: 0.96, yMin: 0.27, yMax: 0.49, startQ: 81, numQ: 10 },
      // Row 1 (bottom blocks)
      { xMin: 0.04, xMax: 0.24, yMin: 0.47, yMax: 0.7, startQ: 11, numQ: 10 },
      { xMin: 0.22, xMax: 0.42, yMin: 0.47, yMax: 0.7, startQ: 31, numQ: 10 },
      { xMin: 0.4, xMax: 0.6, yMin: 0.47, yMax: 0.7, startQ: 51, numQ: 10 },
      { xMin: 0.58, xMax: 0.78, yMin: 0.47, yMax: 0.7, startQ: 71, numQ: 10 },
      { xMin: 0.76, xMax: 0.96, yMin: 0.47, yMax: 0.7, startQ: 91, numQ: 10 },
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
    pageNumber?: 1 | 2,
    choicesPerQuestion: 4 | 5 = 4,
  ): Promise<ScanResult> {
    // Track all Mat objects for cleanup
    const matsToCleanup: any[] = [];

    try {
      // Normalize questionCount before loading OpenCV.
      const rawQ =
        typeof questionCount === "number"
          ? questionCount
          : Number(String(questionCount).replace(/[^0-9]/g, "")) || 20;
      const qCount = rawQ > 0 ? rawQ : 20;

      if (qCount === 200) {
        const currentPage = pageNumber || 1;
        const startedAt = Date.now();
        console.log(
          `[OMR] 200Q dedicated scanner config: page=${currentPage}, choices=${choicesPerQuestion} (${choicesPerQuestion === 5 ? "A-E" : "A-D"})`,
        );

        const answers = await scan200ItemPageFast(
          imageUri,
          currentPage,
          choicesPerQuestion,
        );

        console.log(
          `[OMR] 200Q dedicated scanner complete in ${Date.now() - startedAt}ms: ${answers.filter((a) => a.selectedAnswer).length}/100 answers`,
        );

        return {
          studentId: "00000000",
          answers,
          confidence: 0.98,
          processedImageUri: imageUri,
        };
      }

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
      let workingMat = srcMat;
      const imgAspect = srcJs.cols / srcJs.rows;
      const isLandscape = imgAspect > 1.0;

      if (qCount === 50) {
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
      } else if (qCount >= 100 && isLandscape) {
        // 100q/200q templates are portrait-oriented A4-like sheets.
        console.log(
          `[OMR] Image is landscape (${srcJs.cols}x${srcJs.rows}, aspect=${imgAspect.toFixed(2)}) for ${qCount}q. Rotating 90° clockwise...`,
        );
        const rotatedMat = OpenCV.createObject(
          ObjectType.Mat,
          0,
          0,
          DataTypes.CV_8U,
        );
        matsToCleanup.push(rotatedMat);
        OpenCV.invoke("rotate", srcMat, rotatedMat, 0);
        const rotatedJs = OpenCV.toJSValue(rotatedMat, "jpeg") as any;
        console.log(
          `[OMR] After rotation: ${rotatedJs.cols}x${rotatedJs.rows}`,
        );
        workingMat = rotatedMat;
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
        if (OMR_DEBUG_LOGS && timingMarks.length > 0) {
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

      const getStrict200CornerMarkers = () => {
        if (regMarks.length < 4) return null;

        const cornerTargets = [
          { key: "topLeft", x: 0, y: 0 },
          { key: "topRight", x: imgWidth, y: 0 },
          { key: "bottomLeft", x: 0, y: imgHeight },
          { key: "bottomRight", x: imgWidth, y: imgHeight },
        ] as const;

        const chosenIndices = new Set<number>();
        const chosen: Record<string, { x: number; y: number }> = {};

        for (const target of cornerTargets) {
          let bestIdx = -1;
          let bestScore = Number.POSITIVE_INFINITY;
          for (let i = 0; i < regMarks.length; i++) {
            if (chosenIndices.has(i)) continue;
            const m = regMarks[i];
            const dx = m.x - target.x;
            const dy = m.y - target.y;
            const score = dx * dx + dy * dy;
            if (score < bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          }

          if (bestIdx < 0) return null;
          chosenIndices.add(bestIdx);
          chosen[target.key] = {
            x: regMarks[bestIdx].x,
            y: regMarks[bestIdx].y,
          };
        }

        const tl = chosen.topLeft;
        const tr = chosen.topRight;
        const bl = chosen.bottomLeft;
        const br = chosen.bottomRight;
        const minWidth = imgWidth * 0.45;
        const minHeight = imgHeight * 0.45;
        const topWidth = Math.abs(tr.x - tl.x);
        const bottomWidth = Math.abs(br.x - bl.x);
        const leftHeight = Math.abs(bl.y - tl.y);
        const rightHeight = Math.abs(br.y - tr.y);
        const maxCornerOffsetX = imgWidth * 0.25;
        const maxCornerOffsetY = imgHeight * 0.25;

        const cornersNearImageEdges =
          tl.x <= maxCornerOffsetX &&
          tl.y <= maxCornerOffsetY &&
          tr.x >= imgWidth - maxCornerOffsetX &&
          tr.y <= maxCornerOffsetY &&
          bl.x <= maxCornerOffsetX &&
          bl.y >= imgHeight - maxCornerOffsetY &&
          br.x >= imgWidth - maxCornerOffsetX &&
          br.y >= imgHeight - maxCornerOffsetY;

        const geometryLooksValid =
          topWidth >= minWidth &&
          bottomWidth >= minWidth &&
          leftHeight >= minHeight &&
          rightHeight >= minHeight;

        if (!cornersNearImageEdges || !geometryLooksValid) {
          return null;
        }

        return {
          topLeft: tl,
          topRight: tr,
          bottomLeft: bl,
          bottomRight: br,
        };
      };

      let paperLeft = imgWidth * 0.03,
        paperRight = imgWidth * 0.97;
      let paperTop = imgHeight * 0.03,
        paperBottom = imgHeight * 0.97;
      let detectedSheetType: "20" | "50" | "100" | null = null;

      // Use strict corner markers for 200-item sheets.
      const strict200Corners =
        qCount === 200 ? getStrict200CornerMarkers() : null;

      if (qCount === 200 && strict200Corners) {
        paperLeft = Math.max(
          0,
          Math.min(
            strict200Corners.topLeft.x,
            strict200Corners.bottomLeft.x,
            strict200Corners.topRight.x,
            strict200Corners.bottomRight.x,
          ) -
            medianW * 2,
        );
        paperRight = Math.min(
          imgWidth,
          Math.max(
            strict200Corners.topLeft.x,
            strict200Corners.bottomLeft.x,
            strict200Corners.topRight.x,
            strict200Corners.bottomRight.x,
          ) +
            medianW * 2,
        );
        paperTop = Math.max(
          0,
          Math.min(
            strict200Corners.topLeft.y,
            strict200Corners.topRight.y,
            strict200Corners.bottomLeft.y,
            strict200Corners.bottomRight.y,
          ) -
            medianH * 2,
        );
        paperBottom = Math.min(
          imgHeight,
          Math.max(
            strict200Corners.topLeft.y,
            strict200Corners.topRight.y,
            strict200Corners.bottomLeft.y,
            strict200Corners.bottomRight.y,
          ) +
            medianH * 2,
        );
        console.log(
          `[OMR] 200q strict crop from 4 corners: [${Math.round(paperLeft)},${Math.round(paperTop)}] → [${Math.round(paperRight)},${Math.round(paperBottom)}]`,
        );
      }
      // Use registration marks for cropping when available (legacy path).
      else if (regMarks.length >= 3) {
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
      if (OMR_DEBUG_LOGS) {
        console.log(
          `[OMR] bubble density grid (rows=Y 0-100%, cols=X 0-100%):`,
        );
        grid.forEach((row, yi) => {
          const label = `y${yi * 10}-${yi * 10 + 10}%`;
          const cells = row
            .map((v, xi) => (v > 0 ? `x${xi * 10}:${v}` : ""))
            .filter(Boolean)
            .join(" ");
          if (cells) console.log(`  ${label}: ${cells}`);
        });
      }

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
      let studentId = "00000000"; // Default, may be overwritten by brightness scanner

      // Helper: extract corner markers from regMarks for brightness scanning
      const extractCornerMarkers = () => {
        if (qCount === 200 && strict200Corners) {
          console.log(
            "[OMR] Corner markers:",
            `TL=(${Math.round(strict200Corners.topLeft.x)},${Math.round(strict200Corners.topLeft.y)})`,
            `TR=(${Math.round(strict200Corners.topRight.x)},${Math.round(strict200Corners.topRight.y)})`,
            `BL=(${Math.round(strict200Corners.bottomLeft.x)},${Math.round(strict200Corners.bottomLeft.y)})`,
            `BR=(${Math.round(strict200Corners.bottomRight.x)},${Math.round(strict200Corners.bottomRight.y)})`,
          );
          return strict200Corners;
        }

        const sortedMarks = [...regMarks].sort(
          (a, b) => a.y - b.y || a.x - b.x,
        );

        let markers;
        if (regMarks.length >= 4) {
          const topMarks = sortedMarks.slice(0, 2).sort((a, b) => a.x - b.x);
          const bottomMarks = sortedMarks.slice(-2).sort((a, b) => a.x - b.x);
          markers = {
            topLeft: { x: topMarks[0].x, y: topMarks[0].y },
            topRight: { x: topMarks[1].x, y: topMarks[1].y },
            bottomLeft: { x: bottomMarks[0].x, y: bottomMarks[0].y },
            bottomRight: { x: bottomMarks[1].x, y: bottomMarks[1].y },
          };
        } else {
          const marks = [...sortedMarks];
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
          const [edgeLeft, edgeRight] =
            edge1.x < edge2.x ? [edge1, edge2] : [edge2, edge1];
          const edgeIsTop = (edgeLeft.y + edgeRight.y) / 2 < lone.y;

          if (edgeIsTop) {
            const missingX =
              lone.x < (edgeLeft.x + edgeRight.x) / 2
                ? edgeRight.x
                : edgeLeft.x;
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
            const missingX =
              lone.x < (edgeLeft.x + edgeRight.x) / 2
                ? edgeRight.x
                : edgeLeft.x;
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
        return markers;
      };

      // ── 200-item template: brightness scanning with page offset ──────────
      if (qCount === 200 && strict200Corners) {
        const currentPage = pageNumber || 1;
        console.log(
          `[OMR] Using BRIGHTNESS scanning for 200-item template Page ${currentPage} (Skia pixel sampling)`,
        );

        const { scan200ItemPage } = require("./brightnessScannerFor200Item");
        const markers = extractCornerMarkers();
        allAnswers = await scan200ItemPage(
          imageUri,
          markers,
          currentPage,
          choicesPerQuestion,
        );

        const rangeStart = currentPage === 1 ? 1 : 101;
        const rangeEnd = currentPage === 1 ? 100 : 200;
        console.log(
          `[OMR] 200Q Page ${currentPage}: Detected ${allAnswers.filter((a) => a.selectedAnswer).length}/100 answers (Q${rangeStart}-${rangeEnd})`,
        );
      }
      // ── 200-item strict guard: require all four edge corner boxes ───────
      else if (qCount === 200) {
        const currentPage = pageNumber || 1;
        console.warn(
          "[OMR] Strict 200Q corner validation failed; falling back to dedicated 200Q pixel scanner",
        );

        const {
          scan200ItemPageFast,
        } = require("./brightnessScannerFor200Item");
        allAnswers = await scan200ItemPageFast(
          imageUri,
          currentPage,
          choicesPerQuestion,
        );

        const rangeStart = currentPage === 1 ? 1 : 101;
        const rangeEnd = currentPage === 1 ? 100 : 200;
        console.log(
          `[OMR] 200Q fallback scanner detected ${allAnswers.filter((a) => a.selectedAnswer).length}/100 answers (Q${rangeStart}-${rangeEnd})`,
        );
      }
      // ── 150-item template: brightness scanning ──────────────────────────
      else if (detectedQ === 150 && regMarks.length >= 3) {
        console.log(
          "[OMR] Using BRIGHTNESS scanning for 150-item template (Skia pixel sampling)",
        );

        try {
          const {
            scan150ItemWithBrightness,
          } = require("./brightnessScannerFor150Item");
          const markers = extractCornerMarkers();
          const result = await scan150ItemWithBrightness(
            imageUri,
            markers,
            choicesPerQuestion,
            true, // enableBlockAutoAlign: local ±8px search per block for better accuracy
          );

          if (result && result.answers) {
            allAnswers = result.answers;
            studentId = result.studentId || "000000000";
            console.log(
              `[OMR] Brightness scanner detected ${allAnswers.filter((a) => a.selectedAnswer).length}/150 answers, ID: ${studentId}`,
            );
          } else {
            console.error(
              "[OMR] 150Q scanner returned invalid result:",
              result,
            );
            allAnswers = Array.from({ length: 150 }, (_, i) => ({
              questionNumber: i + 1,
              selectedAnswer: "",
            }));
          }
        } catch (scanError) {
          console.error("[OMR] 150Q brightness scanner error:", scanError);
          allAnswers = Array.from({ length: 150 }, (_, i) => ({
            questionNumber: i + 1,
            selectedAnswer: "",
          }));
        }
      } else if (detectedQ === 150) {
        // Fallback: not enough markers for brightness scanning
        console.warn(
          "[OMR] Not enough corner markers for brightness scanning, falling back to region-based detection",
        );

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
      // ── 100-item template: brightness scanning ──────────────────────────
      else if (detectedQ === 100 && regMarks.length >= 3) {
        console.log(
          "[OMR] Using BRIGHTNESS scanning for 100-item template (Skia pixel sampling)",
        );

        const {
          scan100ItemWithBrightness,
        } = require("./brightnessScannerFor100Item");
        const markers = extractCornerMarkers();
        allAnswers = await scan100ItemWithBrightness(
          imageUri,
          markers,
          choicesPerQuestion,
          true, // enableBlockAutoAlign: local ±8px search per block for better accuracy
        );

        console.log(
          `[OMR] Brightness scanner detected ${allAnswers.filter((a) => a.selectedAnswer).length}/100 answers`,
        );
      } else if (detectedQ === 100) {
        // Fallback: not enough markers for hybrid scanning
        console.warn(
          "[OMR] Not enough corner markers for hybrid scanning, falling back to region-based detection",
        );

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
      // For 200-item, pad only the current page's range
      const padStart = qCount === 200 ? ((pageNumber || 1) === 1 ? 1 : 101) : 1;
      const padEnd =
        qCount === 200 ? ((pageNumber || 1) === 1 ? 100 : 200) : detectedQ;
      for (let q = padStart; q <= padEnd; q++) {
        finalAnswers.push(
          answerMap.get(q) ?? { questionNumber: q, selectedAnswer: "" },
        );
      }

      // ── 9. Extract Student ID (50q sheets only) ────────────────────────────
      //
      // The Student ZipGrade ID grid is in the top section of 50q sheets:
      //   y ∈ [26%, 33%] of paper height
      //   5 digit columns, 10 rows each (digits 1-9 then 0, top to bottom)
      //
      // NOTE: Student ID auto-detection is disabled for stability
      // Users can manually edit the ID after scanning
      // For 100q/150q templates, ID is detected by brightness scanner
      if (!studentId || studentId === "00000000") {
        studentId = "00000000";
        console.log(
          `[OMR] Student ID: Using default (manual edit available after scan)`,
        );
      } else {
        console.log(
          `[OMR] Student ID: Detected from brightness scanner: ${studentId}`,
        );
      }

      // Ensure numeric
      const numericId = studentId
        .replace(/[^0-9]/g, "")
        .padStart(9, "0")
        .slice(0, 9);
      console.log(`[OMR] Final studentId: ${numericId}`);
      if (OMR_DEBUG_LOGS) {
        console.log("--- OPENCV EXTRACTED ANSWERS ---");
        console.log(JSON.stringify(finalAnswers, null, 2));
      } else {
        console.log(
          `[OMR] Answers extracted: ${finalAnswers.filter((a) => !!a.selectedAnswer).length}/${finalAnswers.length}`,
        );
      }

      return {
        studentId: numericId,
        answers: finalAnswers,
        confidence: 0.95,
        processedImageUri,
      };
    } catch (error) {
      console.error("[OMR] Fatal error:", error);
      if (error instanceof Error && error.message) {
        throw error;
      }
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

        // Clear OpenCV internal buffers when this scan used OpenCV.
        if (OpenCV && typeof OpenCV.clearBuffers === "function") {
          OpenCV.clearBuffers();
        }

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
