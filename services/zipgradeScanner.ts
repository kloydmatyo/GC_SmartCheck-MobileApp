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
      DecompTypes: opencv.DecompTypes,
      InterpolationFlags: opencv.InterpolationFlags,
      LineTypes: opencv.LineTypes,
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
  originalX?: number;
  originalY?: number;
};

type Point2D = {
  x: number;
  y: number;
};

type RegistrationCorners = {
  topLeft: Point2D;
  topRight: Point2D;
  bottomLeft: Point2D;
  bottomRight: Point2D;
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

function deriveColumnCentroidsFromBubbles(
  bubbles: Bubble[],
  targetCols: number,
): number[] {
  if (bubbles.length === 0 || targetCols <= 0) return [];

  const sorted = [...bubbles].sort((a, b) => a.x - b.x);
  const trimStart = Math.floor(sorted.length * 0.08);
  const trimEnd = Math.ceil(sorted.length * 0.92);
  const trimmed = sorted.slice(trimStart, trimEnd);
  const pool = trimmed.length >= 2 ? trimmed : sorted;

  const xMin = pool[0].x;
  const xMax = pool[pool.length - 1].x;
  if (xMax - xMin < 1) return [xMin];

  const step = (xMax - xMin) / Math.max(targetCols - 1, 1);
  let centroids = Array.from({ length: targetCols }, (_, i) => xMin + i * step);

  // Run a few 1D k-means style refinement passes.
  for (let iter = 0; iter < 4; iter++) {
    const buckets: number[][] = Array.from({ length: targetCols }, () => []);

    for (const bubble of bubbles) {
      let nearestIdx = 0;
      for (let i = 1; i < centroids.length; i++) {
        if (
          Math.abs(bubble.x - centroids[i]) <
          Math.abs(bubble.x - centroids[nearestIdx])
        ) {
          nearestIdx = i;
        }
      }
      buckets[nearestIdx].push(bubble.x);
    }

    centroids = centroids.map((c, i) => {
      if (buckets[i].length === 0) return c;
      return buckets[i].reduce((s, x) => s + x, 0) / buckets[i].length;
    });
  }

  return centroids.sort((a, b) => a - b);
}

function deriveIdRowModel(
  rows: Bubble[][],
): { row0Y: number; rowStep: number } | null {
  if (rows.length < 2) return null;

  const rowYs = rows
    .map((row) => row.reduce((s, b) => s + b.y, 0) / row.length)
    .sort((a, b) => a - b);

  const diffs = rowYs
    .slice(1)
    .map((y, i) => y - rowYs[i])
    .filter((d) => d > 1);

  if (diffs.length === 0) return null;

  const sortedDiffs = [...diffs].sort((a, b) => a - b);
  const seed =
    sortedDiffs[Math.floor(sortedDiffs.length * 0.25)] || sortedDiffs[0];

  const normalizedSteps = sortedDiffs.map((d) => {
    const multiple = Math.max(1, Math.round(d / Math.max(seed, 1)));
    return d / multiple;
  });

  const sortedSteps = normalizedSteps.sort((a, b) => a - b);
  const rowStep = sortedSteps[Math.floor(sortedSteps.length / 2)];
  if (!Number.isFinite(rowStep) || rowStep <= 0) return null;

  let best: { row0Y: number; error: number } | null = null;

  for (let firstRowDigit = 0; firstRowDigit <= 9; firstRowDigit++) {
    const row0Y = rowYs[0] - firstRowDigit * rowStep;
    let error = 0;

    for (const y of rowYs) {
      const idx = Math.round((y - row0Y) / rowStep);
      if (idx < 0 || idx > 9) {
        error += 1000;
        continue;
      }
      const predicted = row0Y + idx * rowStep;
      error += Math.abs(y - predicted);
    }

    if (!best || error < best.error) {
      best = { row0Y, error };
    }
  }

  return best ? { row0Y: best.row0Y, rowStep } : null;
}

function distance2D(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function markerCornerScore(
  marker: Bubble,
  target: Point2D,
  imgW: number,
  imgH: number,
  areaRef: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): number {
  const dx = (marker.x - target.x) / Math.max(imgW, 1);
  const dy = (marker.y - target.y) / Math.max(imgH, 1);
  const cornerDist = Math.sqrt(dx * dx + dy * dy);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const xRank = (marker.x - minX) / spanX;
  const yRank = (marker.y - minY) / spanY;
  const targetXRank = target.x <= imgW * 0.5 ? 0 : 1;
  const targetYRank = target.y <= imgH * 0.5 ? 0 : 1;
  const edgeRankPenalty =
    Math.abs(xRank - targetXRank) + Math.abs(yRank - targetYRank);
  const aspectPenalty = Math.abs(marker.w / Math.max(marker.h, 1) - 1);
  const fillPenalty = Math.max(0, 0.62 - marker.fill);
  const extentPenalty = Math.max(0, 0.68 - marker.extent);
  const areaPenalty =
    areaRef > 0 ? Math.max(0, (areaRef - marker.area) / areaRef) : 0;
  return (
    cornerDist * 2.2 +
    edgeRankPenalty * 1.4 +
    aspectPenalty * 0.7 +
    fillPenalty * 0.8 +
    extentPenalty * 0.8 +
    areaPenalty * 0.7
  );
}

function pickCornerMarker(
  candidates: Bubble[],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  target: Point2D,
  imgW: number,
  imgH: number,
  areaRef: number,
  minMarkerX: number,
  maxMarkerX: number,
  minMarkerY: number,
  maxMarkerY: number,
): Bubble | null {
  const bandCandidates = candidates.filter(
    (m) => m.x >= xMin && m.x <= xMax && m.y >= yMin && m.y <= yMax,
  );

  if (bandCandidates.length === 0) return null;

  let best: Bubble | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const marker of bandCandidates) {
    const score = markerCornerScore(
      marker,
      target,
      imgW,
      imgH,
      areaRef,
      minMarkerX,
      maxMarkerX,
      minMarkerY,
      maxMarkerY,
    );
    if (score < bestScore) {
      best = marker;
      bestScore = score;
    }
  }

  return best;
}

function isValidCornerGeometry(
  corners: RegistrationCorners,
  imgW: number,
  imgH: number,
): boolean {
  const topWidth = distance2D(corners.topLeft, corners.topRight);
  const bottomWidth = distance2D(corners.bottomLeft, corners.bottomRight);
  const leftHeight = distance2D(corners.topLeft, corners.bottomLeft);
  const rightHeight = distance2D(corners.topRight, corners.bottomRight);

  if (
    topWidth < imgW * 0.18 ||
    bottomWidth < imgW * 0.18 ||
    leftHeight < imgH * 0.18 ||
    rightHeight < imgH * 0.18
  ) {
    return false;
  }

  // Corner order should preserve top-above-bottom and left-before-right.
  if (
    !(corners.topLeft.y < corners.bottomLeft.y) ||
    !(corners.topRight.y < corners.bottomRight.y) ||
    !(corners.topLeft.x < corners.topRight.x) ||
    !(corners.bottomLeft.x < corners.bottomRight.x)
  ) {
    return false;
  }

  const widthRatio = topWidth / Math.max(bottomWidth, 1e-6);
  const heightRatio = leftHeight / Math.max(rightHeight, 1e-6);

  return (
    widthRatio >= 0.45 &&
    widthRatio <= 2.2 &&
    heightRatio >= 0.45 &&
    heightRatio <= 2.2
  );
}

function selectRegistrationCorners(
  regMarkCandidates: Bubble[],
  imgW: number,
  imgH: number,
): RegistrationCorners | null {
  if (regMarkCandidates.length < 4) return null;

  const sortedAreas = regMarkCandidates
    .map((m) => m.area)
    .sort((a, b) => a - b);
  const areaRef =
    sortedAreas[Math.floor(sortedAreas.length * 0.7)] ||
    sortedAreas[sortedAreas.length - 1] ||
    1;

  const coarseFiltered = regMarkCandidates.filter(
    (m) => m.extent >= 0.55 && m.fill >= 0.32 && m.area >= areaRef * 0.45,
  );
  const candidates =
    coarseFiltered.length >= 4 ? coarseFiltered : regMarkCandidates;

  const markerXs = candidates.map((m) => m.x).sort((a, b) => a - b);
  const markerYs = candidates.map((m) => m.y).sort((a, b) => a - b);
  const minMarkerX = markerXs[0] ?? 0;
  const maxMarkerX = markerXs[markerXs.length - 1] ?? imgW;
  const minMarkerY = markerYs[0] ?? 0;
  const maxMarkerY = markerYs[markerYs.length - 1] ?? imgH;

  // Start with tight edge windows, then progressively widen.
  const edgeBands = [0.24, 0.32, 0.4, 0.52, 0.65];

  for (const band of edgeBands) {
    const xBand = imgW * band;
    const yBand = imgH * band;

    const topLeft = pickCornerMarker(
      candidates,
      0,
      xBand,
      0,
      yBand,
      { x: 0, y: 0 },
      imgW,
      imgH,
      areaRef,
      minMarkerX,
      maxMarkerX,
      minMarkerY,
      maxMarkerY,
    );
    const topRight = pickCornerMarker(
      candidates,
      imgW - xBand,
      imgW,
      0,
      yBand,
      { x: imgW, y: 0 },
      imgW,
      imgH,
      areaRef,
      minMarkerX,
      maxMarkerX,
      minMarkerY,
      maxMarkerY,
    );
    const bottomLeft = pickCornerMarker(
      candidates,
      0,
      xBand,
      imgH - yBand,
      imgH,
      { x: 0, y: imgH },
      imgW,
      imgH,
      areaRef,
      minMarkerX,
      maxMarkerX,
      minMarkerY,
      maxMarkerY,
    );
    const bottomRight = pickCornerMarker(
      candidates,
      imgW - xBand,
      imgW,
      imgH - yBand,
      imgH,
      { x: imgW, y: imgH },
      imgW,
      imgH,
      areaRef,
      minMarkerX,
      maxMarkerX,
      minMarkerY,
      maxMarkerY,
    );

    if (!topLeft || !topRight || !bottomLeft || !bottomRight) continue;

    const uniqueCornerPoints = new Set([
      `${Math.round(topLeft.x)}:${Math.round(topLeft.y)}`,
      `${Math.round(topRight.x)}:${Math.round(topRight.y)}`,
      `${Math.round(bottomLeft.x)}:${Math.round(bottomLeft.y)}`,
      `${Math.round(bottomRight.x)}:${Math.round(bottomRight.y)}`,
    ]);
    if (uniqueCornerPoints.size < 4) {
      continue;
    }

    const corners: RegistrationCorners = {
      topLeft: { x: topLeft.x, y: topLeft.y },
      topRight: { x: topRight.x, y: topRight.y },
      bottomLeft: { x: bottomLeft.x, y: bottomLeft.y },
      bottomRight: { x: bottomRight.x, y: bottomRight.y },
    };

    if (isValidCornerGeometry(corners, imgW, imgH)) {
      return corners;
    }
  }

  return null;
}

function solveLinearSystem8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(aug[pivot][col]) < 1e-10) return null;

    if (pivot !== col) {
      const temp = aug[col];
      aug[col] = aug[pivot];
      aug[pivot] = temp;
    }

    const pivotVal = aug[col][col];
    for (let j = col; j <= n; j++) {
      aug[col][j] /= pivotVal;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      if (Math.abs(factor) < 1e-12) continue;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map((row) => row[n]);
}

function computeHomography(
  src: [Point2D, Point2D, Point2D, Point2D],
  dst: [Point2D, Point2D, Point2D, Point2D],
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = src[i].x;
    const y = src[i].y;
    const u = dst[i].x;
    const v = dst[i].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem8x8(A, b);
  if (!h) return null;
  return [...h, 1];
}

function applyHomography(point: Point2D, H: number[]): Point2D | null {
  const x = point.x;
  const y = point.y;
  const denom = H[6] * x + H[7] * y + H[8];
  if (Math.abs(denom) < 1e-10) return null;

  return {
    x: (H[0] * x + H[1] * y + H[2]) / denom,
    y: (H[3] * x + H[4] * y + H[5]) / denom,
  };
}

function rectifyBubblesToPaper(
  bubbles: Bubble[],
  corners: RegistrationCorners,
  expectedAspectRatio: number,
): {
  bubbles: Bubble[];
  paperW: number;
  paperH: number;
  homographyInv: number[];
} | null {
  const topWidth = distance2D(corners.topLeft, corners.topRight);
  const bottomWidth = distance2D(corners.bottomLeft, corners.bottomRight);
  const leftHeight = distance2D(corners.topLeft, corners.bottomLeft);
  const rightHeight = distance2D(corners.topRight, corners.bottomRight);

  let paperW = Math.round(Math.max(topWidth, bottomWidth));
  let paperH = Math.round(Math.max(leftHeight, rightHeight));

  if (paperW < 80 || paperH < 80) return null;

  if (expectedAspectRatio > 0) {
    const measuredAspect = paperW / Math.max(paperH, 1);
    if (measuredAspect > expectedAspectRatio * 1.25) {
      paperH = Math.round(paperW / expectedAspectRatio);
    } else if (measuredAspect < expectedAspectRatio * 0.75) {
      paperW = Math.round(paperH * expectedAspectRatio);
    }
  }

  const maxDim = 1800;
  const maxCurrent = Math.max(paperW, paperH);
  if (maxCurrent > maxDim) {
    const scale = maxDim / maxCurrent;
    paperW = Math.max(320, Math.round(paperW * scale));
    paperH = Math.max(320, Math.round(paperH * scale));
  }

  const src: [Point2D, Point2D, Point2D, Point2D] = [
    corners.topLeft,
    corners.topRight,
    corners.bottomLeft,
    corners.bottomRight,
  ];
  const dst: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: paperW - 1, y: 0 },
    { x: 0, y: paperH - 1 },
    { x: paperW - 1, y: paperH - 1 },
  ];

  const H = computeHomography(src, dst);
  if (!H) return null;

  const homographyInv = computeHomography(dst, src);
  if (!homographyInv) return null;

  const avgSourceW = Math.max((topWidth + bottomWidth) / 2, 1);
  const avgSourceH = Math.max((leftHeight + rightHeight) / 2, 1);
  const scaleX = paperW / avgSourceW;
  const scaleY = paperH / avgSourceH;

  const mappedBubbles = bubbles
    .map((bubble) => {
      const mapped = applyHomography({ x: bubble.x, y: bubble.y }, H);
      if (!mapped) return null;
      return {
        ...bubble,
        x: mapped.x,
        y: mapped.y,
        w: bubble.w * scaleX,
        h: bubble.h * scaleY,
        originalX: bubble.originalX ?? bubble.x,
        originalY: bubble.originalY ?? bubble.y,
      } as Bubble;
    })
    .filter((b): b is Bubble => !!b)
    .filter(
      (b) =>
        b.x >= -paperW * 0.05 &&
        b.x <= paperW * 1.05 &&
        b.y >= -paperH * 0.05 &&
        b.y <= paperH * 1.05,
    )
    .filter((b) => b.x >= 0 && b.x <= paperW && b.y >= 0 && b.y <= paperH);

  if (mappedBubbles.length < 10) return null;

  return {
    bubbles: mappedBubbles,
    paperW,
    paperH,
    homographyInv,
  };
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

function getAdaptiveFillCutoff(fills: number[]): {
  threshold: number;
  minGap: number;
  minRatio: number;
} {
  if (fills.length === 0) {
    return { threshold: 0.3, minGap: 0.04, minRatio: 1.12 };
  }

  const sorted = [...fills].sort((a, b) => a - b);
  const lowRef =
    sorted[Math.floor((sorted.length - 1) * 0.35)] ?? sorted[0] ?? 0;

  const threshold = Math.min(0.6, Math.max(0.24, lowRef + 0.06));
  const minGap = Math.max(0.03, threshold * 0.1);

  return {
    threshold,
    minGap,
    minRatio: 1.1,
  };
}

function dominantDigitRatio(id: string): number {
  const digits = id.replace(/[^0-9]/g, "");
  if (digits.length === 0) return 1;

  const counts = new Map<string, number>();
  for (const d of digits) {
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  const maxCount = Math.max(...counts.values());
  return maxCount / digits.length;
}

function isSuspiciousStudentId(id: string): boolean {
  const digits = id.replace(/[^0-9]/g, "");
  if (digits.length === 0 || /^0+$/.test(digits)) return true;
  if (/^([0-9])\1{5,}$/.test(digits)) return true;
  return digits.length >= 6 && dominantDigitRatio(digits) >= 0.8;
}

function getIdGridModel(questionCount: number): {
  cols: number;
  rows: number;
  firstColNX: number;
  firstRowNY: number;
  colSpacingNX: number;
  rowSpacingNY: number;
} | null {
  3; // Match the active Gordon College sheet geometry used in mobile capture.
  if (questionCount <= 20) {
    // Calibrated for Gordon College 20q template:
    // ID grid spans roughly X:14%-57%, Y:14%-44% in paper space.
    return {
      cols: 9,
      rows: 10,
      firstColNX:    0.135,   // was 0.151 — shift left
      firstRowNY:    0.200,   // was 0.215 — shift up
      colSpacingNX:  0.049,   // was 0.0516 — tighten spacing
      rowSpacingNY: 0.0333,
    };
  }

  if (questionCount <= 50) {
    const fw = 91;
    const fh = 211;
    return {
      cols: 9,
      rows: 10,
      firstColNX: 11 / fw,
      firstRowNY: 15 / fh,
      colSpacingNX: 4.5 / fw,
      rowSpacingNY: 3.5 / fh,
    };
  }

  return null;
}

function estimateIdRegionBounds(
  questionCount: number,
  bubbles: Bubble[],
  paperW: number,
  paperH: number,
): {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
} {
  if (questionCount <= 20) {
    const model = getIdGridModel(questionCount);
    if (model) {
      const xMin = Math.max(0.14, model.firstColNX - model.colSpacingNX * 0.5);
      const xMax = Math.min(
        0.64,
        model.firstColNX +
        (model.cols - 1) * model.colSpacingNX +
        model.colSpacingNX * 0.7,
      );
      const yMin = Math.max(0.09, model.firstRowNY - model.rowSpacingNY * 0.8);
      const yMax = Math.min(
        0.54,
        model.firstRowNY +
        (model.rows - 1) * model.rowSpacingNY +
        model.rowSpacingNY * 0.8,
      );

      return {
        xMin,
        xMax,
        yMin,
        yMax,
      };
    }

    return {
      xMin: 0.11,
      xMax: 0.6,
      yMin: 0.13,
      yMax: 0.45,
    };
  }

  const defaults =
    questionCount <= 50
      ? { xMin: 0.14, xMax: 0.78, yMin: 0.08, yMax: 0.27 }
      : { xMin: 0.12, xMax: 0.74, yMin: 0.08, yMax: 0.42 };

  const answerCandidates = bubbles.filter((b) => b.y >= paperH * 0.42);
  if (answerCandidates.length < 12) {
    return defaults;
  }

  const xRatios = answerCandidates
    .map((b) => b.x / Math.max(paperW, 1))
    .sort((a, b) => a - b);
  const yRatios = answerCandidates
    .map((b) => b.y / Math.max(paperH, 1))
    .sort((a, b) => a - b);

  const xLow =
    xRatios[Math.floor((xRatios.length - 1) * 0.06)] ?? defaults.xMin;
  const xHigh =
    xRatios[Math.ceil((xRatios.length - 1) * 0.94)] ?? defaults.xMax;
  const answerTop = yRatios[Math.floor((yRatios.length - 1) * 0.08)] ?? 0.56;

  const xMin = Math.max(
    defaults.xMin - 0.06,
    Math.min(defaults.xMin, xLow - 0.04),
  );
  const xMax = Math.min(
    defaults.xMax + 0.06,
    Math.max(defaults.xMax * 0.9, xHigh + 0.04),
  );
  const dynamicYMax = Math.min(
    defaults.yMax + 0.06,
    Math.max(defaults.yMax * 0.85, answerTop - 0.04),
  );
  const idSpan = 0.21;
  const yMin = Math.max(0.01, dynamicYMax - idSpan);

  return {
    xMin,
    xMax,
    yMin,
    yMax: Math.max(dynamicYMax, yMin + 0.09),
  };
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

  const localMedianH =
    regionBubbles.map((b) => b.h).sort((a, b) => a - b)[
    Math.floor(regionBubbles.length / 2)
    ] || medianH;
  const expectedRowStep = ((yMax - yMin) * paperH) / Math.max(numQ, 1);
  // Keep row clustering conservative so adjacent question rows do not merge.
  const rowGap = Math.max(
    8,
    Math.min(localMedianH * 0.45, expectedRowStep * 0.45),
  );
  const rows = clusterByY(regionBubbles, rowGap);

  // Rows with 4-6 bubbles are "full rows" — used to derive reliable column centroids.
  // Rows with 1-3 bubbles are "sparse rows" — only the filled bubble detected (empty ones
  // may be missing because their fill is too low). We still answer these using centroids.
  const fullRows = rows.filter((r) => r.length >= 4 && r.length <= 7);
  const allRows = rows.filter((r) => r.length >= 1); // every detected row

  console.log(
    `[OMR] Q${startQ}+${numQ}: ${regionBubbles.length} bubbles, ${rows.length} rows (${fullRows.length} full, rowGap=${rowGap.toFixed(1)})`,
  );

  // Derive centroids from full rows only (reliable A-E positions)
  const colCentroids = deriveColumnCentroids(fullRows, 5);
  console.log(
    `[OMR] Q${startQ}+ centroids(A-E):`,
    colCentroids.map((c) => Math.round(c)),
  );

  if (colCentroids.length < 3) {
    // Better fallback for sparse rows: estimate using trimmed X span
    // to reduce left/right outlier influence.
    const allColBubbles = [...regionBubbles].sort((a, b) => a.x - b.x);
    const trimStart = Math.floor(allColBubbles.length * 0.1);
    const trimEnd = Math.ceil(allColBubbles.length * 0.9);
    const trimmed = allColBubbles.slice(trimStart, trimEnd);
    const fallbackPool = trimmed.length >= 2 ? trimmed : allColBubbles;
    const xSpanMin = fallbackPool[0].x;
    const xSpanMax = fallbackPool[fallbackPool.length - 1].x;
    const step = (xSpanMax - xSpanMin) / 4;
    const fallbackCentroids = [0, 1, 2, 3, 4].map((i) => xSpanMin + step * i);
    console.warn(
      `[OMR] Q${startQ}+ using trimmed fallback centroids:`,
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
  const colSpacing =
    colCentroids.length > 1
      ? Math.abs(colCentroids[1] - colCentroids[0])
      : 100; // fallback if centroids are unreliable
  const maxDistanceFromCentroid = colSpacing * 0.45; // 45% of column spacing (was 60%)

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

  // ── Header row skip heuristic ──────────────────────────────────────────
  // The 20q sheet prints "A B C D E" column headers at the top of each
  // answer column.  These labels produce bubble-like contours that pass
  // filtering but contain only 1–3 marks vs the 4–5 in a real answer row.
  // When we detect numQ+1 rows and the first row has far fewer bubbles
  // than the median of subsequent rows, skip it.
  let headerSkip = 0;
  if (validRows.length >= numQ + 1) {
    const firstRowLen = validRows[0].length;
    const subsequentLens = validRows
      .slice(1, Math.min(validRows.length, numQ + 1))
      .map((r) => r.length)
      .sort((a, b) => a - b);
    const medianSubsequent =
      subsequentLens[Math.floor(subsequentLens.length / 2)] || 5;
    if (firstRowLen <= 3 && medianSubsequent >= 4) {
      headerSkip = 1;
      console.log(
        `[OMR] Q${startQ}+: Skipping header row (${firstRowLen} bubbles vs median ${medianSubsequent})`,
      );
    }
  }

  // Take exactly numQ rows (the actual question rows)
  const qRows = validRows.slice(headerSkip, headerSkip + numQ);
  const answers: StudentAnswer[] = [];

  // Pre-compute left/right edge bounds to reject stray artifacts
  const leftBound = colCentroids[0] - colSpacing * 0.4;
  const rightBound =
    colCentroids[colCentroids.length - 1] + colSpacing * 0.4;

  qRows.forEach((row, rowIdx) => {
    const qNum = startQ + rowIdx;

    // Filter out bubbles outside the valid centroid range (stray artifacts)
    const cleanedRow = row.filter(
      (b) => b.x >= leftBound && b.x <= rightBound,
    );

    // Log all bubbles in this row for debugging
    const rowBubbles = cleanedRow
      .map((b) => `x=${Math.round(b.x)} fill=${b.fill.toFixed(2)}`)
      .join(", ");
    if (cleanedRow.length !== row.length) {
      console.log(
        `[OMR] Q${qNum} row bubbles: ${rowBubbles} (filtered ${row.length - cleanedRow.length} strays)`,
      );
    } else {
      console.log(`[OMR] Q${qNum} row bubbles: ${rowBubbles}`);
    }

    // Rank bubbles by fill, then use adaptive confidence checks.
    const ranked = [...cleanedRow].sort((a, b) => b.fill - a.fill);
    const best = ranked[0] || null;
    const second = ranked[1] || null;

    if (!best) {
      answers.push({ questionNumber: qNum, selectedAnswer: "" });
      return;
    }

    const fillGap = second ? best.fill - second.fill : best.fill;
    const fillRatio = second ? best.fill / Math.max(second.fill, 0.001) : 999;
    const rowFillStats = getAdaptiveFillCutoff(cleanedRow.map((b) => b.fill));

    // Require a confident mark relative to this row's local background fill.
    const strongAbsolute = best.fill >= rowFillStats.threshold + 0.08;
    const passByGap = second
      ? fillGap >= rowFillStats.minGap
      : best.fill >= rowFillStats.threshold + 0.05;
    const passByRatio = second ? fillRatio >= rowFillStats.minRatio : false;

    const isConfidentMark =
      best.fill >= rowFillStats.threshold &&
      (strongAbsolute || passByGap || passByRatio);

    if (!isConfidentMark) {
      console.log(
        `[OMR] Q${qNum}: blank (best=${best.fill.toFixed(2)}, second=${(second?.fill ?? 0).toFixed(2)}, gap=${fillGap.toFixed(3)}, cutoff=${rowFillStats.threshold.toFixed(2)})`,
      );
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
      `[OMR] Q${qNum}: x=${Math.round(best.x)} → ${options[safeIdx]} fill=${best.fill.toFixed(2)} (second=${(second?.fill ?? 0).toFixed(2)})`,
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
      // Left column Q1-10 starts below the Student ID grid.
      { xMin: 0.12, xMax: 0.5, yMin: 0.54, yMax: 0.97, startQ: 1, numQ: 10 },
      // Right column Q11-20.
      {
        xMin: 0.52,
        xMax: 0.9,
        yMin: 0.54,
        yMax: 0.97,
        startQ: 11,
        numQ: 10,
      },
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
        DecompTypes,
        InterpolationFlags,
        LineTypes,
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

      if (qCount === 20 || qCount === 50 || qCount === 100) {
        // If we receive a landscape matrix for a portrait sheet, rotate 90° clockwise.
        if (isLandscape) {
          console.log(
            `[OMR] Image is landscape (${srcJs.cols}x${srcJs.rows}, aspect=${imgAspect.toFixed(2)}) but ${qCount}q sheet is portrait. Rotating 90° clockwise...`,
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

      // Reduce processing cost for very large captures while preserving enough
      // detail for bubble detection and ID decoding.
      try {
        const workingJs = OpenCV.toJSValue(workingMat) as any;
        const currentMaxDim = Math.max(
          workingJs.cols || 0,
          workingJs.rows || 0,
        );
        const maxProcessingDim =
          qCount <= 20 ? 2000 : qCount <= 50 ? 2100 : 2500;

        if (currentMaxDim > maxProcessingDim) {
          const scale = maxProcessingDim / currentMaxDim;
          const targetW = Math.max(
            960,
            Math.round((workingJs.cols || 0) * scale),
          );
          const targetH = Math.max(
            1280,
            Math.round((workingJs.rows || 0) * scale),
          );
          const resizedMat = OpenCV.createObject(
            ObjectType.Mat,
            0,
            0,
            DataTypes.CV_8U,
          );
          matsToCleanup.push(resizedMat);

          // INTER_LINEAR = 1
          OpenCV.invoke(
            "resize",
            workingMat,
            resizedMat,
            OpenCV.createObject(ObjectType.Size, targetW, targetH),
            0,
            0,
            1,
          );
          workingMat = resizedMat;
          console.log(
            `[OMR] Downscaled image for performance: ${workingJs.cols}x${workingJs.rows} -> ${targetW}x${targetH}`,
          );
        }
      } catch (resizeErr) {
        console.warn(
          "[OMR] Performance downscale skipped; continuing with original resolution",
          resizeErr,
        );
      }

      // NOTE: Duplicate resize block was removed here — the resize at lines 1419-1468 already handles this.

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
      } catch (_) { }

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
      let processedImageUri = "";
      const getProcessedImageUri = () => {
        try {
          const js = OpenCV.toJSValue(workingMat, "jpeg") as any;
          return `data:image/jpeg;base64,${js.base64}`;
        } catch (e) {
          return "";
        }
      };

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
          processedImageUri: getProcessedImageUri(),
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
      let minCircularity: number; // 4π×contourArea/perimeter² — circles ≈ 0.78, text ≈ 0.1-0.4

      if (qCount <= 20) {
        // 20q: Student ID bubbles are smaller than answer bubbles, so use a
        // lower minShapeArea.  Tighten aspect & extent to reject text labels.
        // Relaxed from /140→/220 and 0.60→0.25 to capture smaller, lightly-
        // filled ID grid bubbles that were being filtered out.
        minShapeArea = Math.pow(imgWidth / 220, 2);
        maxShapeArea = imgArea * 0.05;
        minAspect = 0.35;
        maxAspect = 3.0;
        minExtent = 0.20;
        minCircularity = 0.25;
      } else if (qCount <= 50) {
        // 50q: relaxed filtering
        minShapeArea = Math.pow(imgWidth / 120, 2);
        maxShapeArea = imgArea * 0.1;
        minAspect = 0.25;
        maxAspect = 4.0;
        minExtent = 0.03;
        minCircularity = 0.35;
      } else {
        // 100q: EXTREMELY relaxed filtering (smallest bubbles, most of them)
        minShapeArea = Math.pow(imgWidth / 200, 2); // Very small minimum
        maxShapeArea = imgArea * 0.15; // Very large maximum
        minAspect = 0.1; // Accept almost any aspect ratio
        maxAspect = 10.0;
        minExtent = 0.01; // Accept almost any extent
        minCircularity = 0.0; // Skip circularity check for 100q (tiny bubbles)
      }

      const rawShapes: Bubble[] = [];

      for (let i = 0; i < numContours; i++) {
        const contour = OpenCV.copyObjectFromVector(contoursVec, i);
        const rect = OpenCV.invoke("boundingRect", contour);
        const rectJs = OpenCV.toJSValue(rect) as any;
        const { x, y, width: w, height: h } = rectJs;
        const area = w * h;
        const aspect = w / h;
        const contourArea = (OpenCV.invoke("contourArea", contour) as any)
          .value;
        const extent = area > 0 ? contourArea / area : 0;

        // Apply template-specific filtering
        if (area < minShapeArea || area > maxShapeArea) continue;
        if (aspect < minAspect || aspect > maxAspect) continue;
        if (extent < minExtent) continue;

        // Circularity filter: rejects text characters (A,B,C,D,1,2,3...)
        // which have irregular outlines vs round bubbles.
        // circularity = 4π × contourArea / perimeter²
        // Perfect circle = ~0.785, text characters = ~0.1-0.4
        if (minCircularity > 0) {
          const perimeter = (OpenCV.invoke("arcLength", contour, true) as any)
            .value;
          if (perimeter > 0) {
            const circularity =
              (4 * Math.PI * contourArea) / (perimeter * perimeter);
            if (circularity < minCircularity) continue;
          }
        }

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
        } catch (_) { }

        rawShapes.push({
          x: x + w / 2,
          y: y + h / 2,
          w,
          h,
          area,
          extent,
          fill,
          originalX: x + w / 2,
          originalY: y + h / 2,
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
          processedImageUri: getProcessedImageUri(),
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
      // For 20q, ID bubbles are much smaller than answer bubbles, so we must relax the area bounds
      // otherwise they are discarded for being too small compared to the answer bubble modal area.
      const minAreaMult = qCount <= 20 ? 0.15 : 0.4;
      const maxAreaMult = qCount <= 20 ? 3.0 : 2.2;

      const allBubbles: typeof rawShapes = [];
      const seen = new Set<number>();
      const addBubble = (s: (typeof rawShapes)[0], refArea: number) => {
        const key = Math.round(s.x) * 10000 + Math.round(s.y);
        if (
          !seen.has(key) &&
          s.area >= refArea * minAreaMult &&
          s.area <= refArea * maxAreaMult
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
          s.area >= filledRefArea * minAreaMult &&
          s.area <= filledRefArea * maxAreaMult;
        const nearEmpty =
          emptyRefArea > 0 &&
          s.area >= emptyRefArea * minAreaMult &&
          s.area <= emptyRefArea * maxAreaMult;
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
          processedImageUri: getProcessedImageUri(),
        };
      }

      // Drawing of detected bubbles is now deferred to the end of the function
      // where we have full region information.

      // Save the image with drawn bubbles
      processedImageUri = getProcessedImageUri();

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

      const expectedAspectRatio =
        qCount <= 20
          ? SHEET_SPECS["20"].aspectRatio
          : qCount <= 50
            ? SHEET_SPECS["50"].aspectRatio
            : SHEET_SPECS["100"].aspectRatio;

      const cornerMarkers = selectRegistrationCorners(
        regMarks,
        imgWidth,
        imgHeight,
      );

      const strict200Corners =
        qCount === 200 ? getStrict200CornerMarkers() : null;

      if (cornerMarkers) {
        console.log(
          `[OMR] corner markers: TL=(${Math.round(cornerMarkers.topLeft.x)},${Math.round(cornerMarkers.topLeft.y)}), ` +
          `TR=(${Math.round(cornerMarkers.topRight.x)},${Math.round(cornerMarkers.topRight.y)}), ` +
          `BL=(${Math.round(cornerMarkers.bottomLeft.x)},${Math.round(cornerMarkers.bottomLeft.y)}), ` +
          `BR=(${Math.round(cornerMarkers.bottomRight.x)},${Math.round(cornerMarkers.bottomRight.y)})`,
        );
      } else {
        console.log("[OMR] corner markers: unavailable, using fallback crop");
      }

      let paperLeft = imgWidth * 0.03,
        paperRight = imgWidth * 0.97;
      let paperTop = imgHeight * 0.03,
        paperBottom = imgHeight * 0.97;
      let paperW = paperRight - paperLeft;
      let paperH = paperBottom - paperTop;
      let bubbles: Bubble[] = [];
      let homographyInv: number[] | null = null;

      if (cornerMarkers) {
        const rectified = rectifyBubblesToPaper(
          allBubbles,
          cornerMarkers,
          expectedAspectRatio,
        );
        if (rectified) {
          bubbles = rectified.bubbles;
          paperW = rectified.paperW;
          paperH = rectified.paperH;
          homographyInv = rectified.homographyInv;
          console.log(
            `[OMR] perspective-normalized paper: ${Math.round(paperW)}x${Math.round(paperH)}, bubbles=${bubbles.length}`,
          );

          // ── Create pixel-warped paper image for preview & ID crop ────────
          try {
            const srcPts = OpenCV.createObject(ObjectType.Point2fVector, [
              OpenCV.createObject(ObjectType.Point2f, cornerMarkers.topLeft.x, cornerMarkers.topLeft.y),
              OpenCV.createObject(ObjectType.Point2f, cornerMarkers.topRight.x, cornerMarkers.topRight.y),
              OpenCV.createObject(ObjectType.Point2f, cornerMarkers.bottomLeft.x, cornerMarkers.bottomLeft.y),
              OpenCV.createObject(ObjectType.Point2f, cornerMarkers.bottomRight.x, cornerMarkers.bottomRight.y),
            ]);
            const dstPts = OpenCV.createObject(ObjectType.Point2fVector, [
              OpenCV.createObject(ObjectType.Point2f, 0, 0),
              OpenCV.createObject(ObjectType.Point2f, paperW - 1, 0),
              OpenCV.createObject(ObjectType.Point2f, 0, paperH - 1),
              OpenCV.createObject(ObjectType.Point2f, paperW - 1, paperH - 1),
            ]);
            const perspMat = OpenCV.invoke(
              "getPerspectiveTransform", srcPts, dstPts, DecompTypes.DECOMP_LU,
            );
            const warpedPaperMat = OpenCV.createObject(
              ObjectType.Mat, 0, 0, DataTypes.CV_8U,
            );
            const dstSize = OpenCV.createObject(
              ObjectType.Size, Math.round(paperW), Math.round(paperH),
            );
            OpenCV.invoke(
              "warpPerspective",
              workingMat,
              warpedPaperMat,
              perspMat,
              dstSize,
              InterpolationFlags.INTER_LINEAR,
              BorderTypes.BORDER_CONSTANT,
              OpenCV.createObject(ObjectType.Scalar, 0, 0, 0, 255),
            );
            // Replace workingMat so all subsequent drawing + encoding uses the flat paper
            workingMat = warpedPaperMat;
            matsToCleanup.push(warpedPaperMat);
            console.log(`[OMR] Warped paper image created: ${Math.round(paperW)}x${Math.round(paperH)}`);
          } catch (warpErr) {
            console.warn("[OMR] warpPerspective failed, using original image:", warpErr);
          }
        } else {
          console.warn(
            "[OMR] perspective normalization failed, falling back to bbox crop",
          );
        }
      }

      // Fallback crop when perspective normalization is unavailable.
      if (bubbles.length === 0) {
        if (cornerMarkers) {
          const cornerXs = [
            cornerMarkers.topLeft.x,
            cornerMarkers.topRight.x,
            cornerMarkers.bottomLeft.x,
            cornerMarkers.bottomRight.x,
          ].sort((a, b) => a - b);
          const cornerYs = [
            cornerMarkers.topLeft.y,
            cornerMarkers.topRight.y,
            cornerMarkers.bottomLeft.y,
            cornerMarkers.bottomRight.y,
          ].sort((a, b) => a - b);
          paperLeft = Math.max(0, cornerXs[0] - medianW * 2);
          paperRight = Math.min(
            imgWidth,
            cornerXs[cornerXs.length - 1] + medianW * 2,
          );
          paperTop = Math.max(0, cornerYs[0] - medianH * 2);
          paperBottom = Math.min(
            imgHeight,
            cornerYs[cornerYs.length - 1] + medianH * 2,
          );
          console.log(
            `[OMR] fallback crop from corner bounds: [${Math.round(paperLeft)},${Math.round(paperTop)}] → [${Math.round(paperRight)},${Math.round(paperBottom)}]`,
          );
        } else if (regMarks.length >= 3) {
          const edgeBiased = regMarks.filter(
            (m) =>
              m.x <= imgWidth * 0.45 ||
              m.x >= imgWidth * 0.55 ||
              m.y <= imgHeight * 0.45 ||
              m.y >= imgHeight * 0.55,
          );
          const boundsPool = edgeBiased.length >= 4 ? edgeBiased : regMarks;

          const mxs = boundsPool.map((m) => m.x).sort((a, b) => a - b);
          const mys = boundsPool.map((m) => m.y).sort((a, b) => a - b);

          const lowIdxX = Math.max(0, Math.floor((mxs.length - 1) * 0.02));
          const highIdxX = Math.min(
            mxs.length - 1,
            Math.ceil((mxs.length - 1) * 0.98),
          );
          const lowIdxY = Math.max(0, Math.floor((mys.length - 1) * 0.02));
          const highIdxY = Math.min(
            mys.length - 1,
            Math.ceil((mys.length - 1) * 0.98),
          );

          paperLeft = Math.max(0, mxs[lowIdxX] - medianW * 2.5);
          paperRight = Math.min(imgWidth, mxs[highIdxX] + medianW * 2.5);
          paperTop = Math.max(0, mys[lowIdxY] - medianH * 2.5);
          paperBottom = Math.min(imgHeight, mys[highIdxY] + medianH * 2.5);
          console.log(
            `[OMR] crop from marks: [${Math.round(paperLeft)},${Math.round(paperTop)}] → [${Math.round(paperRight)},${Math.round(paperBottom)}]`,
          );
        } else {
          console.log(`[OMR] crop: using default margins`);
        }

        paperW = paperRight - paperLeft;
        paperH = paperBottom - paperTop;

        // Translate bubble coordinates to paper space
        bubbles = allBubbles
          .map((b) => ({
            ...b,
            x: b.x - paperLeft,
            y: b.y - paperTop,
            originalX: b.originalX ?? b.x,
            originalY: b.originalY ?? b.y,
          }))
          .filter(
            (b) => b.x >= 0 && b.x <= paperW && b.y >= 0 && b.y <= paperH,
          );
      }

      console.log(
        `[OMR] bubbles in paper space: ${bubbles.length}, paper: ${Math.round(paperW)}x${Math.round(paperH)}`,
      );

      const paperMedianH =
        bubbles.map((b) => b.h).sort((a, b) => a - b)[
        Math.floor(bubbles.length / 2)
        ] || medianH;
      const paperMedianW =
        bubbles.map((b) => b.w).sort((a, b) => a - b)[
        Math.floor(bubbles.length / 2)
        ] || medianW;
      console.log(
        `[OMR] paper medians: h=${paperMedianH.toFixed(1)}, w=${paperMedianW.toFixed(1)}`,
      );

      // DEBUG: Inspect top-of-page bubble distribution (ID grid lives here).
      // This helps confirm whether ID bubbles are being detected at all.
      const bubbleYs = bubbles.map((b) => b.y);
      const bubbleYMin = bubbleYs.length ? Math.min(...bubbleYs) : 0;
      const bubbleYMax = bubbleYs.length ? Math.max(...bubbleYs) : 0;
      const topBandMaxY = paperH * 0.45;
      const topBandBubbles = bubbles.filter((b) => b.y <= topBandMaxY);
      const topBandAreas = topBandBubbles
        .map((b) => b.area)
        .sort((a, b) => a - b);
      const topBandMedianArea =
        topBandAreas[Math.floor(topBandAreas.length / 2)] ?? 0;
      console.log(
        `[OMR][DEBUG] bubbleY range: ${bubbleYMin.toFixed(1)}-${bubbleYMax.toFixed(1)} ` +
        `(${((bubbleYMin / Math.max(paperH, 1)) * 100).toFixed(1)}%-${((bubbleYMax / Math.max(paperH, 1)) * 100).toFixed(1)}%), ` +
        `topBand<=45% count=${topBandBubbles.length}, topBandMedianArea=${topBandMedianArea.toFixed(1)}`,
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

        // For 100-item templates, use brightness-based scanning (Skia)
        if (detectedQ === 100 && (cornerMarkers || regMarks.length >= 3)) {
          console.log(
            "[OMR] Using BRIGHTNESS scanning for 100-item template (Skia pixel sampling)",
          );

          // Import the brightness scanner
          const {
            scan100ItemWithBrightness,
          } = require("./brightnessScannerFor100Item");

          let markers;
          if (cornerMarkers) {
            // Prefer robust quadrant-picked corners when available.
            markers = {
              topLeft: {
                x: cornerMarkers.topLeft.x,
                y: cornerMarkers.topLeft.y,
              },
              topRight: {
                x: cornerMarkers.topRight.x,
                y: cornerMarkers.topRight.y,
              },
              bottomLeft: {
                x: cornerMarkers.bottomLeft.x,
                y: cornerMarkers.bottomLeft.y,
              },
              bottomRight: {
                x: cornerMarkers.bottomRight.x,
                y: cornerMarkers.bottomRight.y,
              },
            };
          } else {
            // Extract corner markers (sorted by position)
            const sortedMarks = [...regMarks].sort(
              (a, b) => a.y - b.y || a.x - b.x,
            );

            if (regMarks.length >= 4) {
              // Use all 4 corners
              const topMarks = sortedMarks
                .slice(0, 2)
                .sort((a, b) => a.x - b.x);
              const bottomMarks = sortedMarks
                .slice(-2)
                .sort((a, b) => a.x - b.x);

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

              console.log(
                "[OMR] Only 3 markers detected, estimating 4th corner",
              );
            }
          }

          console.log(
            "[OMR] Corner markers:",
            `TL=(${Math.round(markers.topLeft.x)},${Math.round(markers.topLeft.y)})`,
            `TR=(${Math.round(markers.topRight.x)},${Math.round(markers.topRight.y)})`,
            `BL=(${Math.round(markers.bottomLeft.x)},${Math.round(markers.bottomLeft.y)})`,
            `BR=(${Math.round(markers.bottomRight.x)},${Math.round(markers.bottomRight.y)})`,
          );
          return markers;
        }

        // For non-100 templates, use cornerMarkers if available
        if (cornerMarkers) {
          return {
            topLeft: { x: cornerMarkers.topLeft.x, y: cornerMarkers.topLeft.y },
            topRight: {
              x: cornerMarkers.topRight.x,
              y: cornerMarkers.topRight.y,
            },
            bottomLeft: {
              x: cornerMarkers.bottomLeft.x,
              y: cornerMarkers.bottomLeft.y,
            },
            bottomRight: {
              x: cornerMarkers.bottomRight.x,
              y: cornerMarkers.bottomRight.y,
            },
          };
        }

        return null;
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

        const {
          scan150ItemWithBrightness,
        } = require("./brightnessScannerFor150Item");
        const markers = extractCornerMarkers();
        allAnswers = await scan150ItemWithBrightness(
          imageUri,
          markers,
          choicesPerQuestion,
          true, // enableBlockAutoAlign: local ±8px search per block for better accuracy
        );

        console.log(
          `[OMR] Brightness scanner detected ${allAnswers.filter((a) => a.selectedAnswer).length}/150 answers`,
        );
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
            paperMedianH,
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
            paperMedianH,
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

      // ── 9. Extract Student ID ────────────────────────────────────────────
      // The ID grid is at the top section of the sheet.
      // Most active templates use 10 ID columns × 10 digit rows (0..9).
      let studentId = "00000000";
      let contourIdConfidence = 0;
      const idGridModel = getIdGridModel(detectedQ);
      let idBounds: any = null;
      let bestSampled: any = null;

      if (idGridModel) {
        console.log(
          `[OMR] ID fixed grid model: cols=${idGridModel.cols}, rows=${idGridModel.rows}, first=(${idGridModel.firstColNX.toFixed(3)},${idGridModel.firstRowNY.toFixed(3)}), step=(${idGridModel.colSpacingNX.toFixed(4)},${idGridModel.rowSpacingNY.toFixed(4)})`,
        );
      }

      try {
        idBounds = estimateIdRegionBounds(detectedQ, bubbles, paperW, paperH);
        console.log(
          `[OMR] ID bounds: X[${(idBounds.xMin * 100).toFixed(1)}%-${(idBounds.xMax * 100).toFixed(1)}%] Y[${(idBounds.yMin * 100).toFixed(1)}%-${(idBounds.yMax * 100).toFixed(1)}%]`,
        );

        // DEBUG: Log ID bounds in pixels and a loose-band count for alignment checks.
        const idBoundsPx = {
          xMin: Math.round(idBounds.xMin * paperW),
          xMax: Math.round(idBounds.xMax * paperW),
          yMin: Math.round(idBounds.yMin * paperH),
          yMax: Math.round(idBounds.yMax * paperH),
        };
        const loosePad = 0.10; // Wider search band for ID bubbles (was 0.06)
        const looseBounds = {
          xMin: Math.max(0, idBounds.xMin - loosePad),
          xMax: Math.min(1, idBounds.xMax + loosePad),
          yMin: Math.max(0, idBounds.yMin - loosePad),
          yMax: Math.min(1, idBounds.yMax + loosePad),
        };
        const looseIdBubbles = bubbles.filter(
          (b) =>
            b.x >= paperW * looseBounds.xMin &&
            b.x <= paperW * looseBounds.xMax &&
            b.y >= paperH * looseBounds.yMin &&
            b.y <= paperH * looseBounds.yMax,
        );
        console.log(
          `[OMR][DEBUG] ID bounds px: X[${idBoundsPx.xMin}-${idBoundsPx.xMax}] Y[${idBoundsPx.yMin}-${idBoundsPx.yMax}], ` +
          `looseBand count=${looseIdBubbles.length}`,
        );

        const idRegionBubbles = bubbles.filter(
          (b) =>
            b.x >= paperW * idBounds.xMin &&
            b.x <= paperW * idBounds.xMax &&
            b.y >= paperH * idBounds.yMin &&
            b.y <= paperH * idBounds.yMax,
        );

        if (idGridModel) {
          const idTargetCols = idGridModel.cols;
          const idTargetRows = idGridModel.rows;
          const gridX0 = idGridModel.firstColNX * paperW;
          const gridX1 =
            (idGridModel.firstColNX +
              (idTargetCols - 1) * idGridModel.colSpacingNX) *
            paperW;
          const gridY0 = idGridModel.firstRowNY * paperH;
          const gridY1 =
            (idGridModel.firstRowNY +
              (idTargetRows - 1) * idGridModel.rowSpacingNY) *
            paperH;
          console.log(
            `[OMR][DEBUG] ID grid px: X[${Math.round(gridX0)}-${Math.round(gridX1)}] ` +
            `Y[${Math.round(gridY0)}-${Math.round(gridY1)}] (${idTargetCols}x${idTargetRows})`,
          );
        }

        if (idRegionBubbles.length >= 9) {
          const idTargetCols = idGridModel?.cols ?? 10;

          // Cluster into rows (each row = one digit value 0-9)
          const idRows = clusterByY(idRegionBubbles, paperMedianH * 0.6);

          // Sort rows top-to-bottom (row 0 = digit "0", row 9 = digit "9")
          idRows.sort((a, b) => {
            const ay = a.reduce((s, bb) => s + bb.y, 0) / a.length;
            const by = b.reduce((s, bb) => s + bb.y, 0) / b.length;
            return ay - by;
          });

          // Derive ID column centroids from full rows when available.
          // Fallback to sparse-bubble clustering when most rows are missing.
          const rowBasedIdCentroids = deriveColumnCentroids(
            idRows,
            idTargetCols,
          );
          const idColCentroids =
            rowBasedIdCentroids.length >= 8
              ? rowBasedIdCentroids
              : deriveColumnCentroidsFromBubbles(idRegionBubbles, idTargetCols);

          const idRowModel = deriveIdRowModel(idRows);

          console.log(
            `[OMR] ID rows: ${idRows.length}, col centroids: ${idColCentroids.length}, rowModel: ${idRowModel ? `step=${idRowModel.rowStep.toFixed(1)}` : "none"}`,
          );

          if (idColCentroids.length >= 8) {
            const colSpacing =
              idColCentroids.length > 1
                ? (idColCentroids[idColCentroids.length - 1] -
                  idColCentroids[0]) /
                (idColCentroids.length - 1)
                : paperMedianW;

            // For each column, score each digit-row and choose the most confident one.
            const digits: string[] = [];
            const digitConfidences: number[] = [];
            for (
              let col = 0;
              col < Math.min(idColCentroids.length, idTargetCols);
              col++
            ) {
              const colX = idColCentroids[col];
              const tolerance = Math.max(
                paperMedianW * 0.45,
                colSpacing * 0.35,
              );

              // Get all bubbles near this column
              const colBubbles = idRegionBubbles.filter(
                (b) => Math.abs(b.x - colX) <= tolerance,
              );

              if (colBubbles.length === 0) {
                digits.push("");
                continue;
              }

              let bestDigit = -1;
              let bestScore = 0;
              let secondScore = 0;

              if (idRowModel) {
                const yTolerance = Math.max(
                  paperMedianH * 0.7,
                  idRowModel.rowStep * 0.42,
                );

                for (let digit = 0; digit <= 9; digit++) {
                  const targetY = idRowModel.row0Y + digit * idRowModel.rowStep;
                  const score = colBubbles.reduce((maxFill, bubble) => {
                    if (Math.abs(bubble.y - targetY) <= yTolerance) {
                      return Math.max(maxFill, bubble.fill);
                    }
                    return maxFill;
                  }, 0);

                  if (score > bestScore) {
                    secondScore = bestScore;
                    bestScore = score;
                    bestDigit = digit;
                  } else if (score > secondScore) {
                    secondScore = score;
                  }
                }
              } else {
                // Fallback without global row model.
                const rowsForCol = clusterByY(
                  colBubbles,
                  Math.max(paperMedianH * 0.6, 4),
                ).sort((a, b) => {
                  const ay = a.reduce((s, bb) => s + bb.y, 0) / a.length;
                  const by = b.reduce((s, bb) => s + bb.y, 0) / b.length;
                  return ay - by;
                });

                rowsForCol.slice(0, 10).forEach((row, rowIdx) => {
                  const score = row.reduce(
                    (maxFill, bubble) => Math.max(maxFill, bubble.fill),
                    0,
                  );
                  if (score > bestScore) {
                    secondScore = bestScore;
                    bestScore = score;
                    bestDigit = rowIdx;
                  } else if (score > secondScore) {
                    secondScore = score;
                  }
                });
              }

              // Apply per-column adaptive thresholding exactly like the answer region
              const colFillStats = getAdaptiveFillCutoff(colBubbles.map((b) => b.fill));
              
              const fillGap = bestScore - secondScore;
              const fillRatio = secondScore > 0 ? bestScore / Math.max(secondScore, 0.001) : 999;
              
              const strongAbsolute = bestScore >= colFillStats.threshold + 0.08;
              const passByGap = secondScore > 0
                ? fillGap >= colFillStats.minGap
                : bestScore >= colFillStats.threshold + 0.05;
              const passByRatio = secondScore > 0 ? fillRatio >= colFillStats.minRatio : false;

              const isConfidentMark =
                bestScore >= colFillStats.threshold &&
                (strongAbsolute || passByGap || passByRatio);

              if (bestDigit < 0 || !isConfidentMark) {
                digits.push("");
                continue;
              }

              // Calculate confidence 
              const strongThreshold = colFillStats.threshold + 0.08;
              const weakThreshold = colFillStats.threshold;
              
              const normalizedScore =
                bestScore <= weakThreshold
                  ? 0
                  : Math.min(
                    1,
                    (bestScore - weakThreshold) /
                    Math.max(strongThreshold - weakThreshold, 0.01),
                  );
              const gapScore = Math.min(1, fillGap / colFillStats.minGap);
              const ratioScore = Math.min(1, fillRatio / colFillStats.minRatio);
              
              digitConfidences.push(
                normalizedScore * 0.55 + gapScore * 0.25 + ratioScore * 0.2,
              );
              digits.push(String(Math.min(9, Math.max(0, bestDigit))));
            }

            const idWithPlaceholders = digits
              .map((d) => (d.length ? d : "_"))
              .join("");
            const compactId = digits.join("");

            contourIdConfidence =
              digitConfidences.length > 0
                ? (digitConfidences.reduce((s, c) => s + c, 0) /
                  digitConfidences.length) *
                (compactId.length / idTargetCols)
                : 0;

            studentId = compactId.length >= 6 ? compactId : "00000000";
            console.log(
              `[OMR] Detected Student ID: ${studentId} from digits: ${idWithPlaceholders} (contourConf=${contourIdConfidence.toFixed(2)})`,
            );
          }
        } else {
          console.log(
            `[OMR] Not enough ID bubbles detected: ${idRegionBubbles.length}`,
          );
        }

        // Fallback: direct threshold sampling on the expected ID grid.
        // This recovers IDs when contour extraction misses lightly marked bubbles.
        const shouldTrySampledId =
          !!cornerMarkers &&
          (detectedQ <= 20 || // Always run sampled path for 20q sheets
            studentId === "00000000" ||
            isSuspiciousStudentId(studentId) ||
            contourIdConfidence < 0.58);

        if (shouldTrySampledId && cornerMarkers) {
          const paperToSourceHomography = computeHomography(
            [
              { x: 0, y: 0 },
              { x: paperW - 1, y: 0 },
              { x: 0, y: paperH - 1 },
              { x: paperW - 1, y: paperH - 1 },
            ],
            [
              { x: cornerMarkers.topLeft.x, y: cornerMarkers.topLeft.y },
              { x: cornerMarkers.topRight.x, y: cornerMarkers.topRight.y },
              { x: cornerMarkers.bottomLeft.x, y: cornerMarkers.bottomLeft.y },
              {
                x: cornerMarkers.bottomRight.x,
                y: cornerMarkers.bottomRight.y,
              },
            ],
          );

          if (!paperToSourceHomography) {
            console.warn(
              "[OMR] ID sampling homography unavailable, using edge interpolation fallback",
            );
          }

          const sampleHalfSize = Math.max(
            5,
            Math.round(Math.min(imgWidth, imgHeight) * 0.007),
          );
          const idTargetCols = idGridModel?.cols ?? 10;
          const idTargetRows = idGridModel?.rows ?? 10;

          const sampleFillAt = (
            thresholdMat: any,
            paperX: number,
            paperY: number,
          ): number => {
            let srcX = 0;
            let srcY = 0;
            let mappedByHomography = false;

            if (paperToSourceHomography) {
              const mapped = applyHomography(
                { x: paperX, y: paperY },
                paperToSourceHomography,
              );
              if (mapped) {
                srcX = mapped.x;
                srcY = mapped.y;
                mappedByHomography = true;
              }
            }

            // Fallback to edge interpolation when homography mapping fails.
            if (!paperToSourceHomography || !mappedByHomography) {
              const nx = Math.min(1, Math.max(0, paperX / Math.max(paperW, 1)));
              const ny = Math.min(1, Math.max(0, paperY / Math.max(paperH, 1)));

              const topX =
                cornerMarkers.topLeft.x +
                nx * (cornerMarkers.topRight.x - cornerMarkers.topLeft.x);
              const topY =
                cornerMarkers.topLeft.y +
                nx * (cornerMarkers.topRight.y - cornerMarkers.topLeft.y);
              const botX =
                cornerMarkers.bottomLeft.x +
                nx * (cornerMarkers.bottomRight.x - cornerMarkers.bottomLeft.x);
              const botY =
                cornerMarkers.bottomLeft.y +
                nx * (cornerMarkers.bottomRight.y - cornerMarkers.bottomLeft.y);

              srcX = topX + ny * (botX - topX);
              srcY = topY + ny * (botY - topY);
            }

            const cx = Math.round(srcX);
            const cy = Math.round(srcY);
            const x0 = Math.max(0, cx - sampleHalfSize);
            const y0 = Math.max(0, cy - sampleHalfSize);
            const x1 = Math.min(imgWidth - 1, cx + sampleHalfSize);
            const y1 = Math.min(imgHeight - 1, cy + sampleHalfSize);
            const w = Math.max(1, x1 - x0 + 1);
            const h = Math.max(1, y1 - y0 + 1);

            let fill = 0;
            let crop: any = null;
            try {
              crop = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8U);
              OpenCV.invoke(
                "crop",
                thresholdMat,
                crop,
                OpenCV.createObject(ObjectType.Rect, x0, y0, w, h),
              );
              const nonZero = (OpenCV.invoke("countNonZero", crop) as any)
                .value;
              fill = nonZero / Math.max(w * h, 1);
            } catch (_) {
              fill = 0;
            } finally {
              try {
                if (crop && typeof crop.delete === "function") {
                  crop.delete();
                }
              } catch (_) { }
            }

            return fill;
          };

          type SampledIdCandidate = {
            id: string;
            idWithPlaceholders: string;
            confidence: number;
            weak: number;
            strong: number;
            filledDigits: number;
            label: string;
          };

          const sampleIdFromThresholdMat = (
            thresholdMat: any,
            label: string,
          ): SampledIdCandidate => {
            const gridScores: number[][] = Array.from(
              { length: idTargetCols },
              () => new Array(idTargetRows).fill(0),
            );

            for (let col = 0; col < idTargetCols; col++) {
              for (let row = 0; row < idTargetRows; row++) {
                const xRatio = idGridModel
                  ? idGridModel.firstColNX + col * idGridModel.colSpacingNX
                  : idBounds.xMin +
                  ((col + 0.5) / idTargetCols) *
                  (idBounds.xMax - idBounds.xMin);
                const yRatio = idGridModel
                  ? idGridModel.firstRowNY + row * idGridModel.rowSpacingNY
                  : idBounds.yMin +
                  ((row + 0.5) / idTargetRows) *
                  (idBounds.yMax - idBounds.yMin);
                const paperX = xRatio * paperW;
                const paperY = yRatio * paperH;

                // FIX: Pass paper-space coordinates directly to sampleFillAt.
                // sampleFillAt already handles paper->source mapping via
                // paperToSourceHomography (or corner-based interpolation fallback).
                // Previously, coordinates were pre-mapped through homographyInv
                // here AND then mapped again inside sampleFillAt — a double-mapping
                // bug that caused sample points to land at wrong positions.
                gridScores[col][row] = sampleFillAt(
                  thresholdMat,
                  paperX,
                  paperY,
                );

                // Diagnostic: log first column's origin to verify alignment
                if (col === 0 && row === 0 && typeof __DEV__ !== "undefined" && __DEV__) {
                  console.log(
                    `[ID-DEBUG] Sample origin: paperX=${Math.round(paperX)} paperY=${Math.round(paperY)} (ratio: ${xRatio.toFixed(3)}, ${yRatio.toFixed(3)})`,
                  );
                }
              }
            }


            if (typeof __DEV__ !== "undefined" && __DEV__) {
              for (let col = 0; col < idTargetCols; col++) {
                console.log(
                  `[ID-DEBUG] ${label} col${col}: ${gridScores[col].map((v) => v.toFixed(2)).join(" ")}`,
                );
              }
            }

            const sampledDigits: string[] = [];
            const sampledConfidences: number[] = [];
            const sampledRefLevels: number[] = [];

            for (let col = 0; col < idTargetCols; col++) {
              const ranked = gridScores[col]
                .map((score, row) => ({ score, row }))
                .sort((a, b) => b.score - a.score);
              const best = ranked[0];
              const second = ranked[1] ?? { score: 0, row: -1 };
              const sortedCol = [...gridScores[col]].sort((a, b) => b - a);
              const lowRef =
                sortedCol[
                Math.min(
                  sortedCol.length - 1,
                  Math.floor(sortedCol.length * 0.75),
                )
                ] ?? 0;

              sampledRefLevels.push(lowRef);

              const gap = best.score - second.score;
              const ratio = best.score / Math.max(second.score, 0.001);
              const contrastVsRef = best.score - lowRef;
              const ratioToRef = best.score / Math.max(lowRef, 0.01);
              const confidentByStrong =
                contrastVsRef >= 0.12 || ratioToRef >= 1.8;
              const confidentByContrast =
                contrastVsRef >= 0.07 && (gap >= 0.02 || ratioToRef >= 1.3);

              if (!confidentByStrong && !confidentByContrast) {
                sampledDigits.push("");
                continue;
              }

              const normalizedScore = Math.min(
                1,
                Math.max(0, (contrastVsRef - 0.06) / 0.22),
              );
              const gapScore = Math.min(1, gap / 0.12);
              const ratioScore = Math.min(
                1,
                Math.max(0, (ratioToRef - 1) / 1.6),
              );
              sampledConfidences.push(
                normalizedScore * 0.55 + gapScore * 0.25 + ratioScore * 0.2,
              );

              sampledDigits.push(String(Math.min(9, Math.max(0, best.row))));
            }

            const avgRef =
              sampledRefLevels.length > 0
                ? sampledRefLevels.reduce((s, v) => s + v, 0) /
                sampledRefLevels.length
                : 0;

            const sampledIdWithPlaceholders = sampledDigits
              .map((d) => (d.length ? d : "_"))
              .join("");
            const sampledCompactId = sampledDigits.join("");
            const sampledConfidence =
              sampledConfidences.length > 0
                ? (sampledConfidences.reduce((s, c) => s + c, 0) /
                  sampledConfidences.length) *
                (sampledCompactId.length / idTargetCols)
                : 0;
            const sampledId =
              sampledCompactId.length >= 6 ? sampledCompactId : "00000000";

            return {
              id: sampledId,
              idWithPlaceholders: sampledIdWithPlaceholders,
              confidence: sampledConfidence,
              weak: avgRef,
              strong: avgRef + 0.12,
              filledDigits: sampledCompactId.length,
              label,
            };
          };

          const idSamplingCandidates = threshCandidates.some(
            (candidate) => candidate.mat === bestThreshMat,
          )
            ? threshCandidates
            : [{ mat: bestThreshMat, label: bestLabel }, ...threshCandidates];

          bestSampled = null;
          let bestSampledRank = Number.NEGATIVE_INFINITY;

          for (const candidate of idSamplingCandidates) {
            const sampled = sampleIdFromThresholdMat(
              candidate.mat,
              candidate.label,
            );
            const sampledIsSuspicious = isSuspiciousStudentId(sampled.id);
            const sampledHasId = sampled.id !== "00000000";
            const idCols = sampled.idWithPlaceholders.split("");
            const firstFilled = idCols.findIndex((ch) => ch !== "_");
            const lastFilled = idCols.reduce(
              (last, ch, idx) => (ch !== "_" ? idx : last),
              -1,
            );
            const internalGapCount =
              firstFilled >= 0 && lastFilled > firstFilled
                ? sampled.idWithPlaceholders
                  .slice(firstFilled, lastFilled + 1)
                  .split("")
                  .filter((ch) => ch === "_").length
                : 0;
            const sampledRank =
              sampled.confidence +
              (sampledHasId ? 0.18 : 0) +
              (sampled.filledDigits / idTargetCols) * 0.06 -
              internalGapCount * 0.08 -
              (sampledIsSuspicious ? 0.22 : 0);

            console.log(
              `[OMR] Sampled ID (${sampled.label}): ${sampled.id} from digits: ${sampled.idWithPlaceholders} ` +
              `(sampleConf=${sampled.confidence.toFixed(2)}, weak=${sampled.weak.toFixed(2)}, strong=${sampled.strong.toFixed(2)}, gaps=${internalGapCount}, suspicious=${sampledIsSuspicious})`,
            );

            if (sampledRank > bestSampledRank) {
              bestSampled = sampled;
              bestSampledRank = sampledRank;
            }
          }

          if (bestSampled) {
            const sampledIsSuspicious = isSuspiciousStudentId(bestSampled.id);
            const contourIsSuspicious = isSuspiciousStudentId(studentId);
            const shouldAdoptSampledId =
              bestSampled.id !== "00000000" &&
              !sampledIsSuspicious &&
              (studentId === "00000000" ||
                contourIsSuspicious ||
                bestSampled.confidence > contourIdConfidence + 0.08);

            if (shouldAdoptSampledId) {
              studentId = bestSampled.id;
              contourIdConfidence = bestSampled.confidence;
              console.log(
                `[OMR] Adopted sampled Student ID (${bestSampled.label}): ${studentId} (conf=${contourIdConfidence.toFixed(2)})`,
              );
            }
          }
        }
      } catch (idErr) {
        console.warn("[OMR] Student ID detection failed:", idErr);
        studentId = "00000000";
      }

      // Draw valid bubbles on the working image for visualization
      try {
        const validBubblesToDraw: Array<Bubble & { isIdBubble?: boolean }> = [];

        for (const b of bubbles) {
          const px = b.x / paperW;
          const py = b.y / paperH;
          let isValid = false;
          let isIdBubble = false;

          // Check if in ID bounds
          if (
            idBounds &&
            px >= idBounds.xMin - 0.02 &&
            px <= idBounds.xMax + 0.02 &&
            py >= idBounds.yMin - 0.02 &&
            py <= idBounds.yMax + 0.02
          ) {
            isValid = true;
            isIdBubble = true;
          } else {
            // Check if in answer regions
            for (const r of regions) {
              if (
                px >= r.xMin - 0.02 &&
                px <= r.xMax + 0.02 &&
                py >= r.yMin - 0.02 &&
                py <= r.yMax + 0.02
              ) {
                isValid = true;
                break;
              }
            }
          }

          if (isValid) {
            // Use paper-space coords directly (workingMat is now the warped paper)
            validBubblesToDraw.push({ ...b, isIdBubble });
          }
        }

        // Add dynamically sampled ID grid bubbles for visualization
        if (bestSampled && idGridModel) {
          const digits = bestSampled.idWithPlaceholders.split("");
          for (let col = 0; col < idGridModel.cols; col++) {
            const char = digits[col] || "_";
            const filledRow = char === "_" ? -1 : parseInt(char, 10);
            
            for (let row = 0; row < idGridModel.rows; row++) {
              const px = idGridModel.firstColNX + col * idGridModel.colSpacingNX;
              const py = idGridModel.firstRowNY + row * idGridModel.rowSpacingNY;
              
              // Draw at paper-space coords directly
              validBubblesToDraw.push({
                x: px * paperW,
                y: py * paperH,
                w: paperMedianW,
                h: paperMedianH,
                area: 0,
                extent: 0,
                fill: row === filledRow ? 1 : 0, // 1 = Green, 0 = Cyan
                isIdBubble: true,
              });
            }
          }
        }

        for (const b of validBubblesToDraw) {
          const center = OpenCV.createObject(
            ObjectType.Point,
            Math.round(b.x),
            Math.round(b.y),
          );
          const radius = Math.round(Math.max(b.w, b.h) / 3) + 3;
          const isFilled = b.fill >= 0.45;

          let color;
          if ((b as any).isIdBubble) {
            // ID bubbles: green for filled, cyan for empty
            color = isFilled
              ? OpenCV.createObject(ObjectType.Scalar, 0, 255, 0, 255)
              : OpenCV.createObject(ObjectType.Scalar, 0, 200, 255, 255);
          } else {
            // Answer bubbles: green for filled, blue for empty
            color = isFilled
              ? OpenCV.createObject(ObjectType.Scalar, 0, 255, 0, 255)
              : OpenCV.createObject(ObjectType.Scalar, 255, 0, 0, 255);
          }
          const thickness = isFilled ? 3 : 2;

          OpenCV.invoke(
            "circle",
            workingMat,
            center,
            radius,
            color,
            thickness,
            LineTypes.LINE_8,
          );
        }

        // --- DRAW CORNER VISUALIZATIONS ---
        // Draw green boxes at the 4 corners so the user can verify the registration marks were detected correctly
        try {
          const cornerColor = OpenCV.createObject(ObjectType.Scalar, 0, 255, 0, 255); // Green
          const boxSize = Math.max(20, Math.round(Math.min(paperW, paperH) * 0.05)); // 5% of paper size
          const thickness = 5;

          // Top Left
          OpenCV.invoke("rectangle", workingMat,
            OpenCV.createObject(ObjectType.Point, 0, 0),
            OpenCV.createObject(ObjectType.Point, boxSize, boxSize),
            cornerColor, thickness, LineTypes.LINE_8
          );
          // Top Right
          OpenCV.invoke("rectangle", workingMat,
            OpenCV.createObject(ObjectType.Point, Math.round(paperW - boxSize), 0),
            OpenCV.createObject(ObjectType.Point, Math.round(paperW), boxSize),
            cornerColor, thickness, LineTypes.LINE_8
          );
          // Bottom Left
          OpenCV.invoke("rectangle", workingMat,
            OpenCV.createObject(ObjectType.Point, 0, Math.round(paperH - boxSize)),
            OpenCV.createObject(ObjectType.Point, boxSize, Math.round(paperH)),
            cornerColor, thickness, LineTypes.LINE_8
          );
          // Bottom Right
          OpenCV.invoke("rectangle", workingMat,
            OpenCV.createObject(ObjectType.Point, Math.round(paperW - boxSize), Math.round(paperH - boxSize)),
            OpenCV.createObject(ObjectType.Point, Math.round(paperW), Math.round(paperH)),
            cornerColor, thickness, LineTypes.LINE_8
          );
        } catch (err) {
          console.warn("[OMR] Could not draw corner boxes", err);
        }
        // ----------------------------------

      } catch (drawErr) {
        console.warn("[OMR] Could not draw debug bubbles", drawErr);
      }

      processedImageUri = getProcessedImageUri();

      // ── Crop ID region for visual verification on confirmation screen ────
      let idRegionImageUri: string | undefined;
      if (idBounds && paperW > 0 && paperH > 0) {
        try {
          const padX = 0.02; // Add 2% padding around the ID region
          const padY = 0.02;
          const idX = Math.max(0, Math.round((idBounds.xMin - padX) * paperW));
          const idY = Math.max(0, Math.round((idBounds.yMin - padY) * paperH));
          const idX2 = Math.min(paperW, Math.round((idBounds.xMax + padX) * paperW));
          const idY2 = Math.min(paperH, Math.round((idBounds.yMax + padY) * paperH));
          const idW = idX2 - idX;
          const idH = idY2 - idY;

          if (idW > 10 && idH > 10) {
            const idCropMat = OpenCV.createObject(
              ObjectType.Mat, 0, 0, DataTypes.CV_8U,
            );
            OpenCV.invoke(
              "crop",
              workingMat,
              idCropMat,
              OpenCV.createObject(ObjectType.Rect, idX, idY, idW, idH),
            );
            const idB64 = OpenCV.toJSValue(idCropMat, "jpeg") as any;
            idRegionImageUri = `data:image/jpeg;base64,${idB64.base64}`;
            try { idCropMat.delete(); } catch (_) { }
            console.log(`[OMR] ID region crop: ${idW}x${idH} at (${idX},${idY})`);
          }
        } catch (cropErr) {
          console.warn("[OMR] ID region crop failed:", cropErr);
        }
      }

      // Ensure numeric
      const numericId = studentId.replace(/[^0-9]/g, "");
      const normalizedStudentId = numericId.length > 0 ? numericId : "00000000";
      console.log(`[OMR] Final studentId: ${normalizedStudentId}`);
      console.log("--- OPENCV EXTRACTED ANSWERS ---");
      console.log(JSON.stringify(finalAnswers, null, 2));

      return {
        studentId: normalizedStudentId,
        answers: finalAnswers,
        confidence: 0.95,
        processedImageUri,
        idRegionImageUri,
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
