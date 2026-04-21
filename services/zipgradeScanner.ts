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
  
  // Get full rows (close to targetCols bubbles)
  const fullRows = rows.filter(
    (r) => r.length >= targetCols - 1 && r.length <= targetCols + 1,
  );
  if (fullRows.length === 0) return [];
  
  // Sort each row by X position (left to right)
  const sortedRows = fullRows.map((r) => [...r].sort((a, b) => a.x - b.x));
  
  // Calculate span of each row (distance from leftmost to rightmost bubble)
  const spans = sortedRows.map((r) => r[r.length - 1].x - r[0].x);
  const medianSpan = [...spans].sort((a, b) => a - b)[
    Math.floor(spans.length / 2)
  ];
  
  // Filter rows with consistent span (within 20% of median)
  const cleanRows = sortedRows.filter(
    (_, i) => spans[i] >= medianSpan * 0.8 && spans[i] <= medianSpan * 1.2,
  );
  if (cleanRows.length === 0) return [];
  
  // CRITICAL FIX: Map bubbles to column indices by X position, not array index
  // This handles cases where some rows have fewer bubbles (blank columns)
  const centroids: number[] = Array(targetCols).fill(0);
  const counts: number[] = Array(targetCols).fill(0);
  
  for (const row of cleanRows) {
    if (row.length < 2) continue; // Skip rows with <2 bubbles
    
    const minX = row[0].x;
    const maxX = row[row.length - 1].x;
    const colWidth = (maxX - minX) / (targetCols - 1); // Equal spacing between columns
    
    for (const bubble of row) {
      // Determine which column this bubble belongs to based on X position
      const relativeX = bubble.x - minX;
      let colIdx = Math.round(relativeX / colWidth);
      colIdx = Math.max(0, Math.min(targetCols - 1, colIdx)); // Clamp to 0-4
      
      centroids[colIdx] += bubble.x;
      counts[colIdx]++;
    }
  }
  
  // Average each column's X position
  const result: number[] = [];
  for (let i = 0; i < targetCols; i++) {
    if (counts[i] > 0) {
      result.push(centroids[i] / counts[i]);
    }
  }
  
  // Ensure we have exactly targetCols centroids, sorted by X position
  if (result.length === targetCols) {
    return result.sort((a, b) => a - b);
  }
  
  // Fallback if calculation failed
  return [];
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

// ─────────────────────────────────────────────────────────────────────────────
// BAND-BASED EXTRACTION (for sparse regions like 150q templates)
// ─────────────────────────────────────────────────────────────────────────────
// Instead of clustering bubbles by Y-distance (which fails for sparse regions),
// this divides each region into numQ equal horizontal bands and processes each band.
// This guarantees all questions are attempted, even if they have few bubbles.

function extractAnswersFromRegionBandBased(
  bubbles: Bubble[],
  region: AnswerRegion,
  paperW: number,
  paperH: number,
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

  if (regionBubbles.length < 1) {
    console.log(
      `[OMR] Q${startQ}: no bubbles in region, skipping band extraction`,
    );
    return empty;
  }

  // STEP 1: Derive column centroids from FULL rows
  // Filter to rows with 4-6 bubbles (assuming these are complete marked rows)
  const rowGap = Math.max(paperH * 0.01, 5); // Small gap threshold for initial clustering
  const fullRows = clusterByY(regionBubbles, rowGap).filter(
    (r) => r.length >= 4 && r.length <= 7,
  );
  const colCentroids = deriveColumnCentroids(fullRows, 5);

  if (colCentroids.length < 3) {
    // Fallback: evenly space centroids across X range (5 choice columns)
    const allXs = regionBubbles.map((b) => b.x).sort((a, b) => a - b);
    const xSpanMin = allXs[0];
    const xSpanMax = allXs[allXs.length - 1];
    const step = (xSpanMax - xSpanMin) / 4; // Divide into 5 regions (step between them)
    colCentroids.length = 0;
    for (let i = 0; i < 5; i++) {
      colCentroids.push(xSpanMin + step * i);
    }
    console.log(
      `[OMR] Q${startQ} band-based fallback centroids:`,
      colCentroids.map((c) => Math.round(c)),
    );
  }

  console.log(
    `[OMR] Q${startQ}+ band-based: ${regionBubbles.length} bubbles, centroids:`,
    colCentroids.map((c) => Math.round(c)),
  );

  // STEP 2: Divide region into numQ equal Y-bands (one per question)
  const bandHeight = (yMax - yMin) / numQ;
  const answers: StudentAnswer[] = [];

  for (let qIdx = 0; qIdx < numQ; qIdx++) {
    const qNum = startQ + qIdx;
    const bandYMin = yMin + qIdx * bandHeight;
    const bandYMax = yMin + (qIdx + 1) * bandHeight;

    // Find all bubbles in this band
    const bandBubbles = regionBubbles.filter(
      (b) => b.y >= bandYMin * paperH && b.y <= bandYMax * paperH,
    );

    if (bandBubbles.length === 0) {
      console.log(`[OMR] Q${qNum} band: no bubbles detected`);
      answers.push({ questionNumber: qNum, selectedAnswer: "" });
      continue;
    }

    // Log bubble details for debugging sparse regions
    const bubbleDetails = bandBubbles
      .map((b, i) => `#${i}(x=${Math.round(b.x)},fill=${b.fill.toFixed(2)})`)
      .join(", ");
    console.log(
      `[OMR] Q${qNum} band: ${bandBubbles.length} bubble(s) - ${bubbleDetails}`,
    );

    // Find highest-fill bubble
    let bestBubble: Bubble | null = null;
    let bestFill = 0;
    for (const b of bandBubbles) {
      if (b.fill > bestFill) {
        bestFill = b.fill;
        bestBubble = b;
      }
    }

    // Threshold: 0.50 fill ratio (reject artifacts/erasures for accurate recognition)
    // Band-based extraction is for sparse regions, so slightly more lenient than row-based
    // but still strict enough to reject obvious artifacts
    if (!bestBubble || bestFill < 0.50) {
      console.log(
        `[OMR] Q${qNum}: best fill ${bestFill.toFixed(2)} < 0.50 threshold (rejecting artifact)`,
      );
      answers.push({ questionNumber: qNum, selectedAnswer: "" });
      continue;
    }

    // Map bubble X coordinate to nearest column centroid
    let bestColIdx = 0;
    let bestDist = Math.abs(bestBubble.x - colCentroids[0]);
    for (let i = 1; i < colCentroids.length; i++) {
      const dist = Math.abs(bestBubble.x - colCentroids[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestColIdx = i;
      }
    }

    const options = ["A", "B", "C", "D", "E"];
    const choice = options[Math.min(bestColIdx, options.length - 1)];
    console.log(
      `[OMR] Q${qNum}: → ${choice} (x=${Math.round(bestBubble.x)}, fill=${bestFill.toFixed(2)}, dist-to-centroid=${Math.round(bestDist)})`,
    );

    answers.push({ questionNumber: qNum, selectedAnswer: choice });
  }

  return answers;
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

  // Allow extraction with 1+ bubbles (ultra-lenient for sparse/problem regions)
  const minBubbles = 1;
  if (regionBubbles.length < minBubbles) {
    console.log(
      `[OMR] Q${startQ}: only ${regionBubbles.length} bubbles (need ${minBubbles}+), returning empty`,
    );
    return empty;
  }
  if (regionBubbles.length < 5) {
    console.log(
      `[OMR] Q${startQ}: sparse region with ${regionBubbles.length} bubbles, attempting extraction with fallback`,
    );
  }

  // CRITICAL: Increase row gap tolerance for sparse regions at top/bottom
  // Top regions (Q1-50) have answers clustered farther apart vertically
  const isTopRegion = yMin < 0.4;
  const rowGap = isTopRegion ? medianH * 1.0 : medianH * 0.75;
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

  if (colCentroids.length < 2) {
    // Fallback: if not enough full rows, evenly space centroids across region X span
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
      fallbackCentroids,
      startQ,
      numQ,
      isTopRegion,
    );
  }

  // CRITICAL FIX: For sparse rows (only filled bubbles detected), centroids may be wrong
  // Verify centroids are evenly spaced; allow 50% deviation (was 40%) for sparse regions
  if (colCentroids.length === 5) {
    const gaps = [
      colCentroids[1] - colCentroids[0],
      colCentroids[2] - colCentroids[1],
      colCentroids[3] - colCentroids[2],
      colCentroids[4] - colCentroids[3],
    ];
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - avgGap)));
    const deviationThreshold = isTopRegion ? 0.55 : 0.4;

    // If gaps vary by more than threshold, centroids are unreliable
    if (maxDeviation > avgGap * deviationThreshold) {
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
      return extractWithCentroids(
        allRows,
        fallbackCentroids,
        startQ,
        numQ,
        isTopRegion,
      );
    }
  }

  return extractWithCentroids(allRows, colCentroids, startQ, numQ, isTopRegion);
}

function extractWithCentroids(
  rows: Bubble[][],
  colCentroids: number[],
  startQ: number,
  numQ: number,
  isTopRegion: boolean,
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
  // Increased tolerance for edge bubbles and sparse regions (0.80 for top regions, 0.70 for dense)
  const maxDistanceFromCentroid =
    colCentroids.length > 1
      ? Math.abs(colCentroids[1] - colCentroids[0]) * (isTopRegion ? 0.9 : 0.75)
      : 100; // fallback if centroids are unreliable

  const validRows = sortedRows.filter((row) => {
    // For sparse regions, accept rows where ANY bubble is near a centroid
    // For dense regions, require at least some to be near centroids
    const bubblesNearCentroid = row.filter((bubble) => {
      const nearestCentroidDist = Math.min(
        ...colCentroids.map((c) => Math.abs(bubble.x - c)),
      );
      return nearestCentroidDist <= maxDistanceFromCentroid;
    });
    // CRITICAL: Accept if ANY bubble is near a centroid OR if row has 1-2 bubbles (must be answers)
    // Single bubbles in sparse rows MUST be answer marks, no validation needed
    return bubblesNearCentroid.length > 0 || row.length <= 2;
  });

  // Count total bubbles in all rows
  const totalBubbles = rows.reduce((sum, row) => sum + row.length, 0);
  console.log(
    `[OMR] Q${startQ}+: ${totalBubbles} bubbles → ${rows.length} rows → ${validRows.length} valid rows`,
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

    // SMARTER MULTI-BUBBLE DETECTION: Only reject if 2+ bubbles are CLEARLY filled (fill >= 0.60)
    // AND they're spatially close (same column). If they're far apart (different columns), accept the best.
    const clearlFilledBubbles = row.filter((b) => b.fill >= 0.6);

    if (clearlFilledBubbles.length >= 2) {
      // Calculate min gap between centroids (typical column spacing)
      const minCentroidGap =
        colCentroids.length > 1
          ? Math.min(
              ...Array.from({ length: colCentroids.length - 1 }, (_, i) =>
                Math.abs(colCentroids[i + 1] - colCentroids[i]),
              ),
            )
          : 50; // fallback

      // Check if clearly-filled bubbles are close together (same column) or far apart (different columns)
      const sortedByX = [...clearlFilledBubbles].sort((a, b) => a.x - b.x);
      const maxSpacing = sortedByX[sortedByX.length - 1].x - sortedByX[0].x;

      // If spacing between high-fill bubbles < 50% of min centroid gap, they're in SAME column → reject
      // If spacing >= 50% of min centroid gap, they're in DIFFERENT columns → accept best
      const spacingThreshold = minCentroidGap * 0.5;

      if (maxSpacing < spacingThreshold) {
        // True double-shading in same column
        console.warn(
          `[OMR] Q${qNum}: REJECTED - ${clearlFilledBubbles.length} bubbles in same column (spacing=${maxSpacing.toFixed(0)}px < ${spacingThreshold.toFixed(0)}px): ${clearlFilledBubbles.map((b) => `x=${Math.round(b.x)} fill=${b.fill.toFixed(2)}`).join(", ")}`,
        );
        answers.push({ questionNumber: qNum, selectedAnswer: "" });
        return;
      } else {
        // Bubbles in different columns - use best one, don't reject
        console.log(
          `[OMR] Q${qNum}: Multiple bubbles detected but in different columns (spacing=${maxSpacing.toFixed(0)}px >= ${spacingThreshold.toFixed(0)}px), accepting best`,
        );
      }
    }

    // Find the highest-fill bubble in this row
    let best: Bubble | null = null;
    for (const b of row) {
      if (!best || b.fill > best.fill) best = b;
    }

    // NUCLEAR: Accept ANY detected bubble, no fill threshold at all
    // Even if OpenCV detected a bubble with 0.001 fill, it's better than blank
    let fillThreshold = 0.0; // Accept anything detected

    // But for clearly-empty rows (no bubbles at all after row-gap clustering),
    // we still return blank. This threshold is for when bubbles ARE present but light.
    if (row.length === 0) {
      // No bubbles in this row at all - genuine blank
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
      `[OMR] Q${qNum}: x=${Math.round(best.x)} → ${options[safeIdx]} fill=${best.fill.toFixed(2)} (valid)`,
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
      { xMin: 0.25, xMax: 0.52, yMin: 0.28, yMax: 0.5, startQ: 1, numQ: 10 },
      { xMin: 0.25, xMax: 0.52, yMin: 0.45, yMax: 0.65, startQ: 11, numQ: 10 },
      { xMin: 0.25, xMax: 0.52, yMin: 0.6, yMax: 0.8, startQ: 21, numQ: 10 },
      { xMin: 0.48, xMax: 0.72, yMin: 0.28, yMax: 0.5, startQ: 31, numQ: 10 },
      { xMin: 0.48, xMax: 0.72, yMin: 0.45, yMax: 0.65, startQ: 41, numQ: 10 },
    ];
  } else if (questionCount <= 100) {
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
  } else {
    // ── 150-question layout ─────────────────────────────────────────────────
    // Gordon College 150q template on A4 paper (210×297mm)
    // 15 blocks arranged in 3 rows × 5 columns
    //
    // Bubble density analysis (905 bubbles detected):
    // - Bubbles clustered at x%: 0, 10, 20, 30, 40, 50, 60, 70, 80, 90
    // - Average ~90 bubbles per column
    // - Two bubbles per visual block (e.g., Col1 = x0% + x10%)
    //
    // Clean even spacing with proper margins:
    // Columns: [0%-20%], [20%-40%], [40%-60%], [60%-80%], [80%-100%]
    // Rows:    [0%-33%],  [33%-67%],  [67%-100%]
    //
    // With aggressive overlap to capture ALL boundary questions robustly:
    // Columns: [0%-22%], [18%-42%], [38%-62%], [58%-82%], [78%-100%]
    // Row boundaries expanded significantly (5% overlap) to catch edge cases (Q10, Q20, Q30, Q40, Q50, etc.)
    return [
      // Row 1 (y: 5%-45%) - Top row (expanded down by 7% to catch Q10)
      { xMin: 0.0, xMax: 0.22, yMin: 0.05, yMax: 0.45, startQ: 1, numQ: 10 },
      { xMin: 0.18, xMax: 0.42, yMin: 0.05, yMax: 0.45, startQ: 11, numQ: 10 },
      { xMin: 0.38, xMax: 0.62, yMin: 0.05, yMax: 0.45, startQ: 21, numQ: 10 },
      { xMin: 0.58, xMax: 0.82, yMin: 0.05, yMax: 0.45, startQ: 31, numQ: 10 },
      { xMin: 0.78, xMax: 1.0, yMin: 0.05, yMax: 0.45, startQ: 41, numQ: 10 },

      // Row 2 (y: 28%-72%) - Middle row (expanded significantly up & down)
      { xMin: 0.0, xMax: 0.22, yMin: 0.28, yMax: 0.72, startQ: 51, numQ: 10 },
      { xMin: 0.18, xMax: 0.42, yMin: 0.28, yMax: 0.72, startQ: 61, numQ: 10 },
      { xMin: 0.38, xMax: 0.62, yMin: 0.28, yMax: 0.72, startQ: 71, numQ: 10 },
      { xMin: 0.58, xMax: 0.82, yMin: 0.28, yMax: 0.72, startQ: 81, numQ: 10 },
      { xMin: 0.78, xMax: 1.0, yMin: 0.28, yMax: 0.72, startQ: 91, numQ: 10 },

      // Row 3 (y: 63%-100%) - Bottom row (expanded up by 5%)
      { xMin: 0.0, xMax: 0.22, yMin: 0.63, yMax: 1.0, startQ: 101, numQ: 10 },
      { xMin: 0.18, xMax: 0.42, yMin: 0.63, yMax: 1.0, startQ: 111, numQ: 10 },
      { xMin: 0.38, xMax: 0.62, yMin: 0.63, yMax: 1.0, startQ: 121, numQ: 10 },
      { xMin: 0.58, xMax: 0.82, yMin: 0.63, yMax: 1.0, startQ: 131, numQ: 10 },
      { xMin: 0.78, xMax: 1.0, yMin: 0.63, yMax: 1.0, startQ: 141, numQ: 10 },
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
      // DISABLED for 150Q - image comes in correct orientation from camera
      // Only for 50q sheets (legacy behavior)
      let workingMat = srcMat;

      if (qCount === 50) {
        const imgAspect = srcJs.cols / srcJs.rows;
        const isLandscape = imgAspect > 1.0;

        // 50q sheets are tall (portrait), should NOT be landscape
        // If landscape, rotate 90° clockwise
        if (isLandscape) {
          console.log(
            `[OMR] Image is landscape (${srcJs.cols}x${srcJs.rows}, aspect=${imgAspect.toFixed(2)}) but ${qCount}q sheet should be portrait. Rotating 90° clockwise...`,
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
      } else if (qCount === 150) {
        // 150Q: ALWAYS check orientation - papers are portrait (297mm H × 210mm W), camera may be landscape
        console.log(`[OMR] 150Q Pre-rotation: ${srcJs.cols}x${srcJs.rows}`);

        // For 150Q, landscape (w > h) must be rotated to portrait
        // Expected: portrait = ~210W × 297H, aspect ~0.71
        const currentAspect = srcJs.cols / srcJs.rows;
        const isLandscape = currentAspect > 1.0;

        if (isLandscape) {
          console.log(
            `[OMR] 150Q LANDSCAPE DETECTED: ${srcJs.cols}x${srcJs.rows} (aspect=${currentAspect.toFixed(2)}) - ROTATING 90° CW`,
          );
          const rotatedMat = OpenCV.createObject(
            ObjectType.Mat,
            0,
            0,
            DataTypes.CV_8U,
          );
          matsToCleanup.push(rotatedMat);
          OpenCV.invoke("rotate", srcMat, rotatedMat, 0); // 0 = 90° CW
          const rotatedJs = OpenCV.toJSValue(rotatedMat, "jpeg") as any;
          console.log(
            `[OMR] 150Q Post-rotation: ${rotatedJs.cols}x${rotatedJs.rows} (aspect=${(rotatedJs.cols / rotatedJs.rows).toFixed(2)})`,
          );
          workingMat = rotatedMat;
        } else {
          console.log(
            `[OMR] 150Q already PORTRAIT: ${srcJs.cols}x${srcJs.rows} (aspect=${currentAspect.toFixed(2)})`,
          );
          workingMat = srcMat;
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

      // CRITICAL FIX: Match scoring criteria to template-specific bubble dimensions
      // 150q bubbles are ~31×63px (aspect ≈ 0.49), not 0.5-2.0
      // This was causing all thresholds to score poorly (0-5)
      let scoringMin: number;
      let scoringMax: number;
      let scoringMinAspect: number;
      let scoringMaxAspect: number;

      if (qCount === 150) {
        // 150q: narrow vertical bubbles (31×63, aspect ≈ 0.49)
        scoringMin = Math.pow(IMG_W * 0.015, 2); // Smaller minimum
        scoringMax = Math.pow(IMG_W * 0.15, 2); // Larger maximum
        scoringMinAspect = 0.3; // Allow narrow bubbles
        scoringMaxAspect = 3.0; // Allow vertical bubbles
      } else {
        // Generic: more square bubbles
        scoringMin = Math.pow(IMG_W * 0.02, 2);
        scoringMax = Math.pow(IMG_W * 0.12, 2);
        scoringMinAspect = 0.5; // Roughly square
        scoringMaxAspect = 2.0;
      }

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
          if (
            a >= scoringMin &&
            a <= scoringMax &&
            asp >= scoringMinAspect &&
            asp <= scoringMaxAspect
          )
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
      // They should be significantly larger than bubbles (2-30x bubble area)
      // and have high extent (filled ratio) and square aspect ratio
      // For 150q, be MORE lenient since marks may be harder to detect
      const regMarks = rawShapes.filter(
        (s) =>
          s.area >= bubbleRefArea * 2 &&
          s.area <= bubbleRefArea * 30 &&
          s.extent >= 0.65 &&
          s.w / s.h >= 0.55 &&
          s.w / s.h <= 1.8,
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
        // More generous margins for 150q to ensure edge bubbles are captured
        const marginX = qCount === 150 ? medianW * 1.5 : medianW * 2;
        const marginY = qCount === 150 ? medianH * 1.5 : medianH * 2;
        paperLeft = Math.max(0, mxs[0] - marginX);
        paperRight = Math.min(imgWidth, mxs[mxs.length - 1] + marginX);
        paperTop = Math.max(0, mys[0] - marginY);
        paperBottom = Math.min(imgHeight, mys[mys.length - 1] + marginY);
        console.log(
          `[OMR] crop from ${regMarks.length} marks: [${Math.round(paperLeft)},${Math.round(paperTop)}] → [${Math.round(paperRight)},${Math.round(paperBottom)}]`,
        );
      } else {
        // Fallback: For 150q without marks, use more of image
        if (qCount === 150) {
          paperLeft = imgWidth * 0.01;
          paperRight = imgWidth * 0.99;
          paperTop = imgHeight * 0.01;
          paperBottom = imgHeight * 0.99;
        }
        console.log(
          `[OMR] crop: using ${qCount === 150 ? "wide margins for 150q" : "default margins"} (no reg marks)`,
        );
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
      // For 150q: use fixed regions with density-based validation
      let regions = getLayoutRegions(detectedQ);

      // For 150q, validate that regions overlap with detected bubble density
      if (detectedQ === 150) {
        console.log(`[OMR] Validating 150q regions against bubble density...`);
        for (const region of regions) {
          const regBubbles = bubbles.filter(
            (b) =>
              b.x >= region.xMin * paperW &&
              b.x <= region.xMax * paperW &&
              b.y >= region.yMin * paperH &&
              b.y <= region.yMax * paperH,
          );

          // Diagnostic logging
          if (regBubbles.length === 0) {
            const regionXPct = (
              ((region.xMin + region.xMax) / 2) *
              100
            ).toFixed(0);
            const regionYPct = (
              ((region.yMin + region.yMax) / 2) *
              100
            ).toFixed(0);
            console.warn(
              `[OMR] EMPTY REGION ALERT: Q${region.startQ} at X~${regionXPct}%, Y~${regionYPct}% (bounds: X[${(region.xMin * 100) | 0}%-${(region.xMax * 100) | 0}%], Y[${(region.yMin * 100) | 0}%-${(region.yMax * 100) | 0}%])`,
            );
          } else if (regBubbles.length < 5) {
            console.warn(
              `[OMR] SPARSE REGION: Q${region.startQ} has only ${regBubbles.length} bubbles`,
            );
          }
        }
      }

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

      // ── 9. Extract answers ────────────────────────────────────────────────
      let allAnswers: StudentAnswer[] = [];

      // For 150-item templates, use REGION-BASED EXTRACTION (row clustering + ballot box)
      if (detectedQ === 150 && bubbles.length > 100) {
        console.log(
          "[OMR] Using REGION-BASED extraction for 150-item template (row clustering)",
        );
        console.log(
          `[OMR] Processing ${bubbles.length} bubbles in ${regions.length} regions`,
        );

        const regionAnswers: StudentAnswer[] = [];

        // For each region, extract questions using row clustering
        for (const region of regions) {
          const regionQs = extractAnswersFromRegion(
            bubbles,
            region,
            paperW,
            paperH,
            medianH,
          );
          regionAnswers.push(...regionQs);
        }

        // Pad to 150 questions
        while (regionAnswers.length < 150) {
          regionAnswers.push({
            questionNumber: regionAnswers.length + 1,
            selectedAnswer: "",
          });
        }

        allAnswers = regionAnswers;

        console.log(
          `[OMR] Region-based detection: ${allAnswers.filter((a) => a.selectedAnswer).length}/150 answers`,
        );
      } else if (detectedQ === 100 && regMarks.length >= 3) {
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

      // ── 9. Extract Student ID (50q sheets only) ────────────────────────────
      //
      // The Student ZipGrade ID grid is in the top section of 50q sheets:
      //   y ∈ [26%, 33%] of paper height
      //   5 digit columns, 10 rows each (digits 1-9 then 0, top to bottom)
      //
      // NOTE: Student ID auto-detection is disabled for stability
      // Users can manually edit the ID after scanning
      let studentId = "00000000";
      console.log(
        `[OMR] Student ID: Using default (manual edit available after scan)`,
      );

      // Ensure numeric
      const numericId = studentId
        .replace(/[^0-9]/g, "")
        .padStart(8, "0")
        .slice(0, 8);
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
