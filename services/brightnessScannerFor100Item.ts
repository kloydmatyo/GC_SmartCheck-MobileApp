/**
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

function normalizeMarkers(markers: Markers): Markers {
  const pts = [
    { ...markers.topLeft },
    { ...markers.topRight },
    { ...markers.bottomLeft },
    { ...markers.bottomRight },
  ];
  // Order corners by sum/diff so steep perspective does not swap top/bottom lanes.
  // This is more stable than simple Y-splitting for heavily tilted captures.
  const sum = (p: { x: number; y: number }) => p.x + p.y;
  const diff = (p: { x: number; y: number }) => p.x - p.y;
  const sortedBySum = [...pts].sort((a, b) => sum(a) - sum(b));
  const sortedByDiff = [...pts].sort((a, b) => diff(a) - diff(b));

  const topLeft = sortedBySum[0];
  const bottomRight = sortedBySum[sortedBySum.length - 1];
  const bottomLeft = sortedByDiff[0];
  const topRight = sortedByDiff[sortedByDiff.length - 1];

  return { topLeft, topRight, bottomLeft, bottomRight };
}

// ─── COORDINATE MAPPING ───
// Maps normalized coordinates (0-1) to pixel coordinates
// Handles perspective distortion using bilinear interpolation
function mapToPixel(
  markers: Markers,
  nx: number,
  ny: number
): { px: number; py: number } {
  // Interpolate along top edge
  const topX = markers.topLeft.x + nx * (markers.topRight.x - markers.topLeft.x);
  const topY = markers.topLeft.y + nx * (markers.topRight.y - markers.topLeft.y);
  
  // Interpolate along bottom edge
  const botX = markers.bottomLeft.x + nx * (markers.bottomRight.x - markers.bottomLeft.x);
  const botY = markers.bottomLeft.y + nx * (markers.bottomRight.y - markers.bottomLeft.y);
  
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
  grayscale: Uint8Array,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number
): number {
  // Sample the center of the bubble using an elliptical mask
  // Use inner 50% to safely avoid the printed circle outline
  let sum = 0, count = 0;
  // Use 100% of the provided radius (which is already scaled safely from the printed outline)
  const innerRX = radiusX * 0.50;
  const innerRY = radiusY * 0.50;
  const step = Math.max(1, Math.floor(Math.min(innerRX, innerRY) / 4));

  for (let dy = -Math.ceil(innerRY); dy <= Math.ceil(innerRY); dy += step) {
    for (let dx = -Math.ceil(innerRX); dx <= Math.ceil(innerRX); dx += step) {
      if (innerRX > 0 && innerRY > 0 && (dx * dx) / (innerRX * innerRX) + (dy * dy) / (innerRY * innerRY) > 1) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        sum += grayscale[py * imgW + px];
        count++;
      }
    }
  }

  // Also sample the exact center cross pattern for extra precision
  // This catches small-pencil fills that are concentrated at center
  for (let r = 0; r <= Math.floor(innerRX * 0.7); r++) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        sum += grayscale[py * imgW + px];
        count++;
      }
    }
  }

  if (count === 0) return 255; // default = bright = unfilled
  return sum / count; // raw brightness: low = dark = filled
}

// ─── TEMPLATE LAYOUT ───
// 100-question full page 210 × 297 mm
// Frame width (fw) = 197mm, Frame height (fh) = 215.5mm
function get100ItemTemplateLayout(): TemplateLayout {
  const fw = 197, fh = 215.5;
  
  return {
    answerBlocks: [
      // Top row (beside ID section)
      {
        startQ: 41, endQ: 50,
        firstBubbleNX: 89.35 / fw,
        firstBubbleNY: 47 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 71, endQ: 80,
        firstBubbleNX: 154.85 / fw,
        firstBubbleNY: 47 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      // Bottom grid – row 0
      {
        startQ: 1, endQ: 10,
        firstBubbleNX: 24.86 / fw,  // Adjusted: was 24.86, moved left by 2.5mm (half bubble spacing)
        firstBubbleNY: 102 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 21, endQ: 30,
        firstBubbleNX: 70.02 / fw,
        firstBubbleNY: 102 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 51, endQ: 60,
        firstBubbleNX: 115.18 / fw,
        firstBubbleNY: 102 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 81, endQ: 90,
        firstBubbleNX: 160.34 / fw,
        firstBubbleNY: 102 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      // Bottom grid – row 1
      {
        startQ: 11, endQ: 20,
        firstBubbleNX: 24.86 / fw,
        firstBubbleNY: 159 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 31, endQ: 40,
        firstBubbleNX: 70.02 / fw,
        firstBubbleNY: 161 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 61, endQ: 70,
        firstBubbleNX: 115.18 / fw,
        firstBubbleNY: 161 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 91, endQ: 100,
        firstBubbleNX: 160.34 / fw,
        firstBubbleNY: 161 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
    ],
    bubbleDiameterNX: 3.8 / fw,
    bubbleDiameterNY: 3.8 / fh,
  };
}

// 150-item template layout for brightness scanning
// IMPORTANT: Frame = distance between corner marker CENTERS, not usable area.
// Corner markers: 6mm squares at 2mm from edges → centers at 5mm from edges.
// Usable area: 194×281mm. Marker centers: (5,5) to (189,276).
// Effective frame: fw=184mm, fh=271mm.
// All coordinates below are relative to top-left marker center.
function get150ItemTemplateLayout(): TemplateLayout {
  const fw = 184, fh = 271;
  
  // 5-column X positions — EMPIRICAL from contour centroid pixel data
  // (CSS calculation was wrong; actual print has wider bubble spacing)
  // Source centroids: Q21+[16,42,68,94,121], Q71+[254,283,311,340,368],
  //   Q101+[379,407,436,464,493], Q131+[502,528,554,580,606]
  // At ~623px image width → 3.386 px/mm
  const col0X = 4.7 / fw;    // 16px / 3.386
  const col1X = 39.9 / fw;   // ~135px / 3.386 (interpolated)
  const col2X = 75.0 / fw;   // 254px / 3.386
  const col3X = 111.9 / fw;  // 379px / 3.386
  const col4X = 148.2 / fw;  // 502px / 3.386
  
  const row1Y = 86 / fh;
  const row2Y = 139 / fh;
  const row3Y = 192 / fh;
  
  // Bubble spacing: ~28px at 623px width = 8.3mm (NOT 3.5mm from CSS)
  const rSpacingY = 4.2 / fh;

  console.log('[TEMPLATE] Block positions:');
  const blocks = [
    { q: 1,   nx: 0.046 }, { q: 31,  nx: 0.232 }, { q: 61,  nx: 0.418 },
    { q: 91,  nx: 0.604 }, { q: 121, nx: 0.790 },
    { q: 11,  nx: 0.046 }, { q: 41,  nx: 0.232 }, { q: 71,  nx: 0.418 },
    { q: 101, nx: 0.604 }, { q: 131, nx: 0.790 },
    { q: 21,  nx: 0.046 }, { q: 51,  nx: 0.232 }, { q: 81,  nx: 0.418 },
    { q: 111, nx: 0.604 }, { q: 141, nx: 0.790 },
  ];
  blocks.forEach(b => {
    const a=b.nx, bx=b.nx+0.037, c=b.nx+0.074, d=b.nx+0.111, e=b.nx+0.148;
    console.log(`Q${b.q}: A=${a.toFixed(3)} B=${bx.toFixed(3)} C=${c.toFixed(3)} D=${d.toFixed(3)} E=${e.toFixed(3)}`);
  });

  return {
    answerBlocks: [
      // ═══════════════════════════════════════════════════════════════
      // ROW 1 (Y ≈ 90mm): Q1-10, Q31-40, Q61-70, Q91-100, Q121-130
      // ═══════════════════════════════════════════════════════════════
      { startQ: 1, endQ: 10, firstBubbleNX: 0.046, firstBubbleNY: 0.326, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 31, endQ: 40, firstBubbleNX: 0.232, firstBubbleNY: 0.326, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 61, endQ: 70, firstBubbleNX: 0.418, firstBubbleNY: 0.326, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 91, endQ: 100, firstBubbleNX: 0.604, firstBubbleNY: 0.326, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 121, endQ: 130, firstBubbleNX: 0.790, firstBubbleNY: 0.326, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      
      // ═══════════════════════════════════════════════════════════════
      // ROW 2 (Y ≈ 148mm): Q11-20, Q41-50, Q71-80, Q101-110, Q131-140
      // ═══════════════════════════════════════════════════════════════
      { startQ: 11, endQ: 20, firstBubbleNX: 0.046, firstBubbleNY: 0.492, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 41, endQ: 50, firstBubbleNX: 0.232, firstBubbleNY: 0.492, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 71, endQ: 80, firstBubbleNX: 0.418, firstBubbleNY: 0.492, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 101, endQ: 110, firstBubbleNX: 0.604, firstBubbleNY: 0.492, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 131, endQ: 140, firstBubbleNX: 0.790, firstBubbleNY: 0.492, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      
      // ═══════════════════════════════════════════════════════════════
      // ROW 3 (Y ≈ 206mm): Q21-30, Q51-60, Q81-90, Q111-120, Q141-150
      // ═══════════════════════════════════════════════════════════════
      { startQ: 21, endQ: 30, firstBubbleNX: 0.046, firstBubbleNY: 0.658, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 51, endQ: 60, firstBubbleNX: 0.232, firstBubbleNY: 0.658, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 81, endQ: 90, firstBubbleNX: 0.418, firstBubbleNY: 0.658, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 111, endQ: 120, firstBubbleNX: 0.604, firstBubbleNY: 0.658, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
      { startQ: 141, endQ: 150, firstBubbleNX: 0.790, firstBubbleNY: 0.658, bubbleSpacingNX: 0.037, rowSpacingNY: 0.015 },
    ],
    bubbleDiameterNX: 3.2 / fw,
    bubbleDiameterNY: 3.2 / fh,
  };
}

// ─── ANSWER DETECTION ───
// Detects answers using brightness sampling
function detectAnswersFromImage(
  grayscale: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout,
  numQuestions: number,
  choicesPerQuestion: number
): StudentAnswer[] {
  const answers: StudentAnswer[] = [];
  const choiceLabels = 'ABCDE'.slice(0, choicesPerQuestion).split('');
  const is150 = numQuestions === 150;
  const logPrefix = is150 ? '150Q-BRIGHTNESS' : '100Q-BRIGHTNESS';

  const normalizedMarkers = normalizeMarkers(markers);
  let safeMarkers = normalizedMarkers;

  // Coordinate transform helper (kept for API compatibility)
  // NOTE: Always use 'identity' — zipgradeScanner.ts already handles rotation
  // before calling this function. Auto-detecting rotation here was redundant
  // and wasted ~200ms per scan.
  type CoordTransform = 'identity' | 'rot90' | 'rot180' | 'rot270';
  const applyTransform = (nx: number, ny: number, t: CoordTransform) => {
    switch (t) {
      case 'rot90':
        return { nx: ny, ny: 1 - nx };
      case 'rot180':
        return { nx: 1 - nx, ny: 1 - ny };
      case 'rot270':
        return { nx: 1 - ny, ny: nx };
      default:
        return { nx, ny };
    }
  };

  const selectedTransform: CoordTransform = 'identity';
  console.log(`[${logPrefix}] Using identity transform (rotation handled upstream)`);

  const markerXsRaw = [
    safeMarkers.topLeft.x,
    safeMarkers.topRight.x,
    safeMarkers.bottomLeft.x,
    safeMarkers.bottomRight.x,
  ];
  const markerYsRaw = [
    safeMarkers.topLeft.y,
    safeMarkers.topRight.y,
    safeMarkers.bottomLeft.y,
    safeMarkers.bottomRight.y,
  ];
  const rawMinX = Math.min(...markerXsRaw);
  const rawMaxX = Math.max(...markerXsRaw);
  const rawMinY = Math.min(...markerYsRaw);
  const rawMaxY = Math.max(...markerYsRaw);
  const frameWEstimate = Math.max(
    Math.hypot(
      safeMarkers.topRight.x - safeMarkers.topLeft.x,
      safeMarkers.topRight.y - safeMarkers.topLeft.y,
    ),
    Math.hypot(
      safeMarkers.bottomRight.x - safeMarkers.bottomLeft.x,
      safeMarkers.bottomRight.y - safeMarkers.bottomLeft.y,
    ),
  );
  const frameHEstimate = Math.max(
    Math.hypot(
      safeMarkers.bottomLeft.x - safeMarkers.topLeft.x,
      safeMarkers.bottomLeft.y - safeMarkers.topLeft.y,
    ),
    Math.hypot(
      safeMarkers.bottomRight.x - safeMarkers.topRight.x,
      safeMarkers.bottomRight.y - safeMarkers.topRight.y,
    ),
  );
  const frameAspect = frameHEstimate > 0 ? frameWEstimate / frameHEstimate : 0;
  const invalidMarkerGeometry =
    frameWEstimate < 120 ||
    frameHEstimate < 160 ||
    frameAspect < 0.42 ||
    frameAspect > 0.95;

  if (is150 && invalidMarkerGeometry) {
    // Fallback to axis-aligned marker box if corner ordering/selection is unreliable.
    safeMarkers = {
      topLeft: { x: rawMinX, y: rawMinY },
      topRight: { x: rawMaxX, y: rawMinY },
      bottomLeft: { x: rawMinX, y: rawMaxY },
      bottomRight: { x: rawMaxX, y: rawMaxY },
    };
    console.warn(
      `[150Q-BRIGHTNESS] Marker geometry fallback applied (w=${Math.round(frameWEstimate)}, h=${Math.round(frameHEstimate)}, aspect=${frameAspect.toFixed(2)})`,
    );
  }

  const frameW = Math.max(
    1,
    Math.hypot(
      safeMarkers.topRight.x - safeMarkers.topLeft.x,
      safeMarkers.topRight.y - safeMarkers.topLeft.y,
    ),
  );
  const frameH = Math.max(
    1,
    Math.hypot(
      safeMarkers.bottomLeft.x - safeMarkers.topLeft.x,
      safeMarkers.bottomLeft.y - safeMarkers.topLeft.y,
    ),
  );
  const bubbleRX = (layout.bubbleDiameterNX * frameW) / 2;
  const bubbleRY = (layout.bubbleDiameterNY * frameH) / 2;

  const markerXs = [
    safeMarkers.topLeft.x,
    safeMarkers.topRight.x,
    safeMarkers.bottomLeft.x,
    safeMarkers.bottomRight.x,
  ];
  const markerYs = [
    safeMarkers.topLeft.y,
    safeMarkers.topRight.y,
    safeMarkers.bottomLeft.y,
    safeMarkers.bottomRight.y,
  ];
  const markerMinX = Math.min(...markerXs);
  const markerMaxX = Math.max(...markerXs);
  const markerMinY = Math.min(...markerYs);
  const markerMaxY = Math.max(...markerYs);
  const sheetLeft = markerMinX;
  const sheetRight = markerMaxX;
  const sheetWidth = markerMaxX - markerMinX;
  console.log(`[CALIBRATE] Sheet bounds: left=${Math.round(sheetLeft)}px  right=${Math.round(sheetRight)}px  width=${Math.round(sheetWidth)}px`);

  const edgeMarginLeft = 4;
  const edgeMarginRight = 4;
  const edgeMarginY = Math.max(4, Math.abs(frameH) * 0.03);
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const medianOf = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sortedVals = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sortedVals.length / 2);
    return sortedVals.length % 2 === 0
      ? (sortedVals[mid - 1] + sortedVals[mid]) / 2
      : sortedVals[mid];
  };

  console.log(`[${logPrefix}] Frame: ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR: ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px`);

  for (const block of layout.answerBlocks) {
    const transformedFirst = applyTransform(block.firstBubbleNX, block.firstBubbleNY, selectedTransform);
    const firstPx = mapToPixel(safeMarkers, transformedFirst.nx, transformedFirst.ny);
    console.log(`[${logPrefix}] Block Q${block.startQ}-${block.endQ}: firstBubble px=(${Math.round(firstPx.px)},${Math.round(firstPx.py)})`);

    const sampledQuestions: {
      questionNumber: number;
      fills: { choice: string; brightness: number }[];
    }[] = [];

    const sampleRX = Math.round(bubbleRX * 0.8);
    const sampleRY = Math.round(bubbleRY * 0.8);

    for (let q = block.startQ; q <= block.endQ && q <= numQuestions; q++) {
      const rowInBlock = q - block.startQ;
      const fills: { choice: string; brightness: number }[] = [];
      const colXs: number[] = [];

      let firstPy = 0;

      // Sample all choices for this question
      for (let c = 0; c < choicesPerQuestion; c++) {
        const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
        const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
        const transformed = applyTransform(nx, ny, selectedTransform);

        // Guard against out-of-frame sampling caused by layout drift.
        if (
          transformed.nx <= 0.01 ||
          transformed.nx >= 0.995 ||
          transformed.ny <= 0.01 ||
          transformed.ny >= 0.99
        ) {
          fills.push({ choice: choiceLabels[c], brightness: 255 });
          colXs.push(0);
          continue;
        }

        const { px, py } = mapToPixel(
          safeMarkers,
          transformed.nx,
          transformed.ny,
        );
        colXs.push(px);
        if (c === 0) firstPy = py;

        // Avoid sampling near sheet edges
        if (
          px <= markerMinX + edgeMarginLeft ||
          px >= markerMaxX - edgeMarginRight ||
          py <= markerMinY + edgeMarginY ||
          py >= markerMaxY - edgeMarginY
        ) {
          fills.push({ choice: choiceLabels[c], brightness: 255 });
          continue;
        }

        const rawBrightness = sampleBubbleAt(grayscale, width, height, px, py, sampleRX, sampleRY);
        
        const offsetDir = c === choicesPerQuestion - 1 ? -0.5 : 0.5;
        const bgNx = transformed.nx + offsetDir * block.bubbleSpacingNX;
        const bgPx = mapToPixel(safeMarkers, bgNx, transformed.ny);
        const bgBrightness = sampleBubbleAt(grayscale, width, height, bgPx.px, bgPx.py, sampleRX, sampleRY);

        // Normalize against the safe background point for this row
        const invariantBrightness = Math.max(0, Math.min(255, 255 - Math.max(0, bgBrightness - rawBrightness)));

        fills.push({ choice: choiceLabels[c], brightness: invariantBrightness });
      }



      if (q === block.startQ) {
        console.log(`[CALIBRATE] Block Q${block.startQ}: firstBubble px=(${Math.round(colXs[0])},${Math.round(firstPy)})  colA_x=${Math.round(colXs[0])}  colB_x=${Math.round(colXs[1])}  colC_x=${Math.round(colXs[2])}  colD_x=${Math.round(colXs[3])}  colE_x=${Math.round(colXs[4])}`);
        console.log(`[VERIFY] Block Q${block.startQ}: \n    colA=${Math.round(colXs[0])} colE=${Math.round(colXs[4])} \n    sheetRight=${Math.round(markerMaxX)} margin=${edgeMarginRight}`);
      }

      sampledQuestions.push({ questionNumber: q, fills });
    }

    const laneOffsets = new Array(choicesPerQuestion).fill(0);
    if (false && is150 && sampledQuestions.length >= 4) {
      const laneBaselines = new Array(choicesPerQuestion).fill(0);

      for (let c = 0; c < choicesPerQuestion; c++) {
        const laneValues = sampledQuestions
          .map((row) => row.fills[c]?.brightness ?? 255)
          // Ignore out-of-frame placeholders when estimating lane baseline
          .filter((v) => v < 250)
          .sort((a, b) => a - b);

        if (laneValues.length > 0) {
          // FIX: Use brightest 25% (was 45%) to avoid contamination when
          // a column has many filled marks (e.g., answer key is all "A").
          // The old 45% threshold pulled filled marks into the baseline,
          // causing the lane offset to make filled bubbles appear brighter.
          const brightStart = Math.floor(laneValues.length * 0.75);
          const brightSubset = laneValues.slice(brightStart);
          const baselineSamples = brightSubset.length >= 2 ? brightSubset : laneValues;
          laneBaselines[c] = medianOf(baselineSamples);
        }
      }

      const validBaselines = laneBaselines.filter((v) => v > 0);
      if (validBaselines.length >= 3) {
        const globalBaseline = medianOf(validBaselines);
        const baselineSpread = Math.max(...validBaselines) - Math.min(...validBaselines);
        // Large spread often means baselines are contaminated by many filled marks.
        // In that case, minimize normalization to avoid injecting false lane bias.
        const spreadScale = baselineSpread > 6 ? 6 / baselineSpread : 1;
        // FIX: Reduced maxOffset from 3.5 to 2.0 to prevent over-normalization
        // that can invert correct detections in heavily-filled columns.
        const maxOffset = baselineSpread > 6 ? 1.5 : 2.0;

        for (let c = 0; c < choicesPerQuestion; c++) {
          if (laneBaselines[c] > 0) {
            const rawOffset = (laneBaselines[c] - globalBaseline) * spreadScale;
            laneOffsets[c] = clamp(rawOffset, -maxOffset, maxOffset);
          }
        }
        console.log(
          `[${logPrefix}] Block Q${block.startQ}-${block.endQ}: laneOffsets=${choiceLabels
            .map((label, i) => `${label}:${laneOffsets[i].toFixed(1)}`)
            .join(' ')}`,
        );
      }
    }

    for (const sampled of sampledQuestions) {
      const q = sampled.questionNumber;
      const fills = sampled.fills;

      const normalizedFills = fills.map((f, i) => ({
        choice: f.choice,
        brightness: Math.max(0, Math.min(255, f.brightness - laneOffsets[i])),
      }));

      // Debug: Log all brightness values for first question in each block
      if (q === block.startQ) {
        console.log(`[${logPrefix}] Q${q} all choices: ${fills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')}`);
        if (is150) {
          console.log(`[${logPrefix}] Q${q} normalized: ${normalizedFills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')}`);
        }
      }

      // Sort ascending by brightness — darkest (most filled) first
      const sorted = [...normalizedFills].sort((a, b) => a.brightness - b.brightness);
      const darkest = sorted[0].brightness;
      const secondDark = sorted.length >= 2 ? sorted[1].brightness : 255;
      const thirdDark = sorted.length >= 3 ? sorted[2].brightness : 255;
      const brightest = sorted[sorted.length - 1].brightness;

      // Keep raw metrics to ensure normalization does not invent weak winners.
      const rawSorted = [...fills].sort((a, b) => a.brightness - b.brightness);
      const rawDarkest = rawSorted[0].brightness;
      const rawSecondDark = rawSorted.length >= 2 ? rawSorted[1].brightness : 255;
      const rawBrightest = rawSorted[rawSorted.length - 1].brightness;
      const rawAbsoluteGap = rawSecondDark - rawDarkest;
      const rawMean = fills.reduce((s, f) => s + f.brightness, 0) / fills.length;
      const rawVariance =
        fills.reduce((s, f) => s + Math.pow(f.brightness - rawMean, 2), 0) /
        Math.max(1, fills.length - 1);
      const rawStdDev = Math.sqrt(rawVariance);
      const rawDarkRatio = rawBrightest > 20 ? rawDarkest / rawBrightest : 1;

      let selectedChoice = '';
      let usedPairTieRecovery = false;

      // Use the brightest bubble as the "unfilled" reference
      const ref = brightest;
      const darkRatio = ref > 20 ? darkest / ref : 1;
      const gapFromSecond = secondDark - darkest;
      const gapRatio = ref > 20 ? gapFromSecond / ref : 0;
      const absoluteGap = secondDark - darkest;
      const gapFromThird = thirdDark - darkest;

      // Detection with balanced thresholds:
      // Primary: darkest must be < 68% of brightest (32%+ drop) - strong fill
      // Secondary: darkest < 88% of brightest AND strong gap from 2nd (12%+) - clear fill
      // Tertiary: darkest < 93% of brightest AND moderate gap (7%+) AND absolute gap >= 12 - light fill
      // Quaternary: absolute gap >= 18 AND darkest clearly darker than 3rd (gap >= 8) - handles noise
      // Quinary: very light fills - absolute gap >= 3 AND darkest is clearly below median
      // Final: extremely light fills - any detectable difference (catches 1-unit differences)
      const median = sorted[Math.floor(sorted.length / 2)].brightness;
      const mean = normalizedFills.reduce((s, f) => s + f.brightness, 0) / normalizedFills.length;
      const variance =
        normalizedFills.reduce((s, f) => s + Math.pow(f.brightness - mean, 2), 0) /
        Math.max(1, normalizedFills.length - 1);
      const stdDev = Math.sqrt(variance);
      const zScore = stdDev > 0.5 ? (mean - darkest) / stdDev : 0;
      
      const spread = brightest - darkest;

      if (is150) {
        const spread150 = rawBrightest - rawDarkest;
        const darkestVal = sorted[0].brightness;
        const secondDarkest = sorted[1].brightness;
        const absGap = secondDarkest - darkestVal;

        if (spread150 < 12) {
          selectedChoice = "";
        } else if (absGap < 8) {
          selectedChoice = "";
        } else {
          selectedChoice = sorted[0].choice;
        }
      } else {
        if (spread < 12) {
          selectedChoice = "";
        } else if (darkRatio < 0.75) {
          selectedChoice = sorted[0].choice;
        } else if (darkRatio < 0.90 && gapRatio > 0.08) {
          selectedChoice = sorted[0].choice;
        } else if (darkRatio < 0.95 && gapRatio > 0.05 && absoluteGap >= 5) {
          selectedChoice = sorted[0].choice;
        } else if (absoluteGap >= 10 && gapFromThird >= 5) {
          selectedChoice = sorted[0].choice;
        } else if (absoluteGap >= 6 && darkest < median - 6) {
          selectedChoice = sorted[0].choice;
        }
      }

      // Log first few questions per block for debugging
      if (q <= block.startQ + 2 || q === block.endQ || !selectedChoice) {
        const baseLog = `${fills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')}`;
        const normLog = normalizedFills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ');
        console.log(`[${logPrefix}] Q${q}: ${baseLog}${is150 ? ` | norm ${normLog}` : ''} → ${selectedChoice || '?'} (darkRatio=${darkRatio.toFixed(2)} gapRatio=${gapRatio.toFixed(2)} absGap=${absoluteGap.toFixed(0)} std=${stdDev.toFixed(1)} ref=${ref.toFixed(0)})`);
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
  numQuestions: number = 100
): Promise<StudentAnswer[]> {
  const templateType = numQuestions === 150 ? '150Q' : '100Q';
  console.log(`[${templateType}-BRIGHTNESS] Starting brightness-based scanning with Skia`);
  
  try {
    // Import Skia and FileSystem (using legacy API for compatibility)
    const { Skia } = require('@shopify/react-native-skia');
    const FileSystem = require('expo-file-system/legacy');
    
    // Load image with Skia
    const normalizedUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: 'base64',
    });
    
    const imageData = Skia.Data.fromBase64(base64);
    const image = Skia.Image.MakeImageFromEncoded(imageData);
    
    if (!image) {
      throw new Error('Failed to load image with Skia');
    }
    
    const width = image.width();
    const height = image.height();
    console.log(`[${templateType}-BRIGHTNESS] Image loaded: ${width}x${height}px`);
    
    // Read pixel data (RGBA format)
    const pixels = image.readPixels();
    
    if (!pixels) {
      throw new Error('Failed to read pixels from image');
    }
    
    console.log(`[${templateType}-BRIGHTNESS] Pixel data loaded: ${pixels.length} bytes (${width}x${height}x4)`);
    
    // Convert RGBA to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      // Convert to grayscale using standard formula
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    let finalWidth = width;
    let finalHeight = height;
    if (width > height) {
      console.log(`[${templateType}-BRIGHTNESS] Landscape detected. Rotating 90° CW.`);
      const rotated = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          rotated[x * height + (height - 1 - y)] = grayscale[y * width + x];
        }
      }
      finalWidth = height;
      finalHeight = width;
      grayscale.set(rotated);
    }
    
    console.log(`[${templateType}-BRIGHTNESS] Converted to grayscale`);
    
    // Detect answers using brightness sampling
    const layout = numQuestions === 150 ? get150ItemTemplateLayout() : get100ItemTemplateLayout();
    const choicesPerQuestion = 5;
    
    const answers = detectAnswersFromImage(
      grayscale,
      finalWidth,
      finalHeight,
      markers,
      layout,
      numQuestions,
      choicesPerQuestion
    );
    
    const detectedCount = answers.filter(a => a.selectedAnswer).length;
    console.log(`[${templateType}-BRIGHTNESS] Detected ${detectedCount}/${numQuestions} answers`);
    
    return answers;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${templateType}-BRIGHTNESS] Error: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(`[${templateType}-BRIGHTNESS] Stack:`, error.stack);
    }
    
    // Log Skia/FileSystem availability for debugging
    try {
      const { Skia } = require('@shopify/react-native-skia');
      console.error(`[${templateType}-BRIGHTNESS] Skia is available`);
    } catch (e) {
      console.error(`[${templateType}-BRIGHTNESS] Skia not available:`, e instanceof Error ? e.message : String(e));
    }
    
    // Return empty answers on error
    return Array.from({ length: numQuestions }, (_, i) => ({
      questionNumber: i + 1,
      selectedAnswer: '',
    }));
  }
}

// ─── DEDICATED 150-ITEM BRIGHTNESS SCANNER ───
export async function scan150ItemWithBrightness(
  imageUri: string,
  markers: Markers
): Promise<StudentAnswer[]> {
  console.log('[150Q-BRIGHTNESS] Starting brightness-based scanning for 150-item template');
  
  try {
    // Import Skia and FileSystem
    const { Skia } = require('@shopify/react-native-skia');
    const FileSystem = require('expo-file-system/legacy');
    
    // Load image with Skia
    const normalizedUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: 'base64',
    });
    
    const imageData = Skia.Data.fromBase64(base64);
    const image = Skia.Image.MakeImageFromEncoded(imageData);
    
    if (!image) {
      throw new Error('Failed to load image with Skia');
    }
    
    const width = image.width();
    const height = image.height();
    console.log(`[150Q-BRIGHTNESS] Image loaded: ${width}x${height}px`);
    
    // Read pixel data (RGBA format)
    const pixels = image.readPixels();
    
    if (!pixels) {
      throw new Error('Failed to read pixels from image');
    }
    
    console.log(`[150Q-BRIGHTNESS] Pixel data loaded: ${pixels.length} bytes`);
    
    // Convert RGBA to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    let finalWidth = width;
    let finalHeight = height;
    if (width > height) {
      console.log('[150Q-BRIGHTNESS] Landscape detected. Rotating 90° CW.');
      const rotated = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          rotated[x * height + (height - 1 - y)] = grayscale[y * width + x];
        }
      }
      finalWidth = height;
      finalHeight = width;
      grayscale.set(rotated);
    }
    
    console.log('[150Q-BRIGHTNESS] Converted to grayscale');
    
    // Detect answers using brightness sampling
    const layout = get150ItemTemplateLayout();
    const choicesPerQuestion = 5;
    
    const answers = detectAnswersFromImage(
      grayscale,
      finalWidth,
      finalHeight,
      markers,
      layout,
      150,
      choicesPerQuestion
    );
    
    const detectedCount = answers.filter(a => a.selectedAnswer).length;
    console.log(`[150Q-BRIGHTNESS] Detected ${detectedCount}/150 answers`);
    
    return answers;
    
  } catch (error) {
    console.error('[150Q-BRIGHTNESS] Error:', error);
    
    // Return empty answers on error
    return Array.from({ length: 150 }, (_, i) => ({
      questionNumber: i + 1,
      selectedAnswer: '',
    }));
  }
}