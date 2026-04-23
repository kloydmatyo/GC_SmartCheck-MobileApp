/**
 * Brightness-Based Scanner for 200-Item Templates (2-Stage)
 *
 * Each page of a 200-item exam contains 100 answers, but the 200-item PDF uses
 * its own 5-column answer grid. This scanner is intentionally self-contained so
 * changes for 200-item speed/accuracy do not affect 20/50/100-item scans.
 */

import { Skia } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system/legacy";
import { StudentAnswer } from "../types/scanning";

const DEBUG_LOGS = false;
const SCANNER_200Q_VERSION = "200Q-anchor-orientation-v4";

interface Markers {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

type CornerKey = keyof Markers;

interface CornerWindow {
  key: CornerKey;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  targetX: number;
  targetY: number;
}

interface MarkerCandidate {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

interface PixelOffset {
  dx: number;
  dy: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

interface GridCalibration {
  centerX: number;
  centerY: number;
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  score: number;
}

type PageOrientation = "normal" | "rotated180";

interface OrientationScores {
  normal: number;
  rotated180: number;
  orientation: PageOrientation;
}

interface BubbleInteriorSample {
  choice: string;
  brightness: number;
  minLuma: number;
  darkRatio: number;
  paperMean: number;
  contrast: number;
  p25: number;
  score: number;
}

interface AnswerBlock {
  startQ: number;
  endQ: number;
  firstBubbleNX: number;
  firstBubbleNY: number;
  markerNX: number;
  markerNY: number;
  bubbleSpacingNX: number;
  rowSpacingNY: number;
}

interface TemplateLayout {
  answerBlocks: AnswerBlock[];
  bubbleDiameterNX: number;
  bubbleDiameterNY: number;
  physicalChoices: 4 | 5;
}

interface LumaStats {
  mean: number;
  min: number;
  max: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  darkRatio: number;
  count: number;
}

interface BubbleMarkSample {
  mean: number;
  minLuma: number;
  p25: number;
  paperMean: number;
  darkRatio: number;
  contrast: number;
}

interface AnswerBandCalibration {
  rowDy: number[];
  colDx: number[];
  blockDy: number[];
  score: number;
}

interface BlockMarkerOffset {
  dx: number;
  dy: number;
  score: number;
}

interface BlockAnchor extends BlockMarkerOffset {
  reliable: boolean;
}

interface PageCalibration {
  layout: TemplateLayout;
  physicalChoices: 4 | 5;
  orientation: PageOrientation;
  grid: GridCalibration;
  score: number;
}

interface ImagePixels {
  pixels: Uint8Array;
  width: number;
  height: number;
}

function mapToPixel(
  markers: Markers,
  nx: number,
  ny: number,
): { px: number; py: number } {
  const x00 = markers.topLeft.x;
  const y00 = markers.topLeft.y;
  const x10 = markers.topRight.x;
  const y10 = markers.topRight.y;
  const x01 = markers.bottomLeft.x;
  const y01 = markers.bottomLeft.y;
  const x11 = markers.bottomRight.x;
  const y11 = markers.bottomRight.y;

  // Projective homography from template coordinates to the photographed page.
  // This is materially more accurate than bilinear interpolation for camera
  // captures, where the sheet is a planar surface under perspective projection.
  const dx1 = x10 - x11;
  const dx2 = x01 - x11;
  const dx3 = x00 - x10 + x11 - x01;
  const dy1 = y10 - y11;
  const dy2 = y01 - y11;
  const dy3 = y00 - y10 + y11 - y01;
  const det = dx1 * dy2 - dx2 * dy1;

  if (Math.abs(det) < 1e-6) {
    const topX = x00 + nx * (x10 - x00);
    const topY = y00 + nx * (y10 - y00);
    const botX = x01 + nx * (x11 - x01);
    const botY = y01 + nx * (y11 - y01);
    return {
      px: topX + ny * (botX - topX),
      py: topY + ny * (botY - topY),
    };
  }

  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  const a = x10 - x00 + g * x10;
  const b = x01 - x00 + h * x01;
  const c = x00;
  const d = y10 - y00 + g * y10;
  const e = y01 - y00 + h * y01;
  const f = y00;
  const denom = g * nx + h * ny + 1;

  return {
    px: (a * nx + b * ny + c) / denom,
    py: (d * nx + e * ny + f) / denom,
  };
}

function mapTemplatePointToPixel(
  markers: Markers,
  nx: number,
  ny: number,
  orientation: PageOrientation,
): { px: number; py: number } {
  if (orientation === "rotated180") {
    return mapToPixel(markers, 1 - nx, 1 - ny);
  }

  return mapToPixel(markers, nx, ny);
}

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getAverageFrameSize(markers: Markers): { width: number; height: number } {
  const top = distance(markers.topLeft, markers.topRight);
  const bottom = distance(markers.bottomLeft, markers.bottomRight);
  const left = distance(markers.topLeft, markers.bottomLeft);
  const right = distance(markers.topRight, markers.bottomRight);

  return {
    width: (top + bottom) / 2,
    height: (left + right) / 2,
  };
}

function lumaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  const idx = (y * width + x) * 4;
  return (pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29) >> 8;
}

function buildSampleOffsets(
  radiusX: number,
  radiusY: number,
  innerScale: number,
  densityDivisor: number,
  includeCenterCross: boolean,
): PixelOffset[] {
  const offsets: PixelOffset[] = [];
  const seen = new Set<string>();
  const innerRX = Math.max(1, radiusX * innerScale);
  const innerRY = Math.max(1, radiusY * innerScale);
  const step = Math.max(
    1,
    Math.floor(Math.min(innerRX, innerRY) / Math.max(1, densityDivisor)),
  );

  for (let dy = -Math.ceil(innerRY); dy <= Math.ceil(innerRY); dy += step) {
    for (let dx = -Math.ceil(innerRX); dx <= Math.ceil(innerRX); dx += step) {
      const outside =
        (dx * dx) / (innerRX * innerRX) +
          (dy * dy) / (innerRY * innerRY) >
        1;
      if (outside) continue;

      const ox = Math.round(dx);
      const oy = Math.round(dy);
      const key = `${ox},${oy}`;
      if (!seen.has(key)) {
        offsets.push({ dx: ox, dy: oy });
        seen.add(key);
      }
    }
  }

  if (includeCenterCross) {
    const maxR = Math.floor(Math.min(innerRX, innerRY) * 0.8);
    for (let r = 0; r <= maxR; r++) {
      for (const [dx, dy] of [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ] as const) {
        const key = `${dx},${dy}`;
        if (!seen.has(key)) {
          offsets.push({ dx, dy });
          seen.add(key);
        }
      }
    }
  }

  return offsets.length > 0 ? offsets : [{ dx: 0, dy: 0 }];
}

function sampleBubbleAtOffsets(
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  offsets: readonly PixelOffset[],
): number {
  let sumLuma = 0;
  let count = 0;
  const baseX = Math.round(cx);
  const baseY = Math.round(cy);

  for (const { dx, dy } of offsets) {
    const px = baseX + dx;
    const py = baseY + dy;
    if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
      const idx = (py * imgW + px) * 4;
      sumLuma += pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29;
      count++;
    }
  }

  return count === 0 ? 255 : sumLuma / (count * 256);
}

function percentileFromSorted(values: number[], percentile: number): number {
  if (values.length === 0) return 255;
  const idx = Math.min(
    values.length - 1,
    Math.max(0, Math.floor((values.length - 1) * percentile)),
  );
  return values[idx];
}

function sampleLumaStatsAtOffsets(
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  offsets: readonly PixelOffset[],
  darkThreshold?: number,
): LumaStats {
  const values: number[] = [];
  let sumLuma = 0;
  let darkCount = 0;
  const baseX = Math.round(cx);
  const baseY = Math.round(cy);

  for (const { dx, dy } of offsets) {
    const px = baseX + dx;
    const py = baseY + dy;
    if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
      const luma = lumaAt(pixels, imgW, px, py);
      values.push(luma);
      sumLuma += luma;
      if (darkThreshold !== undefined && luma <= darkThreshold) darkCount++;
    }
  }

  if (values.length === 0) {
    return {
      mean: 255,
      min: 255,
      max: 255,
      p10: 255,
      p25: 255,
      p50: 255,
      p75: 255,
      p90: 255,
      darkRatio: 0,
      count: 0,
    };
  }

  values.sort((a, b) => a - b);
  return {
    mean: sumLuma / values.length,
    min: values[0],
    max: values[values.length - 1],
    p10: percentileFromSorted(values, 0.1),
    p25: percentileFromSorted(values, 0.25),
    p50: percentileFromSorted(values, 0.5),
    p75: percentileFromSorted(values, 0.75),
    p90: percentileFromSorted(values, 0.9),
    darkRatio:
      darkThreshold === undefined ? 0 : darkCount / Math.max(1, values.length),
    count: values.length,
  };
}

function buildRingOffsets(radiusX: number, radiusY: number): PixelOffset[] {
  const offsets: PixelOffset[] = [];
  const seen = new Set<string>();
  const rings = [0.82, 1.0, 1.14];
  const angles = 16;

  for (const ring of rings) {
    for (let i = 0; i < angles; i++) {
      const angle = (Math.PI * 2 * i) / angles;
      const dx = Math.round(Math.cos(angle) * radiusX * ring);
      const dy = Math.round(Math.sin(angle) * radiusY * ring);
      const key = `${dx},${dy}`;
      if (!seen.has(key)) {
        offsets.push({ dx, dy });
        seen.add(key);
      }
    }
  }

  return offsets.length > 0 ? offsets : [{ dx: 0, dy: 0 }];
}

function buildBackgroundOffsets(radiusX: number, radiusY: number): PixelOffset[] {
  const offsets: PixelOffset[] = [];
  const seen = new Set<string>();
  const rings = [1.45, 1.75];
  const angles = 20;

  for (const ring of rings) {
    for (let i = 0; i < angles; i++) {
      const angle = (Math.PI * 2 * i) / angles;
      const dx = Math.round(Math.cos(angle) * radiusX * ring);
      const dy = Math.round(Math.sin(angle) * radiusY * ring);
      const key = `${dx},${dy}`;
      if (!seen.has(key)) {
        offsets.push({ dx, dy });
        seen.add(key);
      }
    }
  }

  return offsets.length > 0 ? offsets : [{ dx: 0, dy: 0 }];
}

function sampleBubbleInkScore(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  ringOffsets: readonly PixelOffset[],
): number {
  // High score means the expected bubble outline/fill is present at this center.
  return 255 - sampleBubbleAtOffsets(pixels, width, height, cx, cy, ringOffsets);
}

function applyGridCalibration(
  point: PixelPoint,
  calibration: GridCalibration,
): PixelPoint {
  return {
    x:
      calibration.centerX +
      (point.x - calibration.centerX) * calibration.scaleX +
      calibration.dx,
    y:
      calibration.centerY +
      (point.y - calibration.centerY) * calibration.scaleY +
      calibration.dy,
  };
}

function sampleBubbleMarkRaw(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  centerOffsets: readonly PixelOffset[],
  backgroundOffsets: readonly PixelOffset[],
): BubbleMarkSample {
  const background = sampleLumaStatsAtOffsets(
    pixels,
    width,
    height,
    cx,
    cy,
    backgroundOffsets,
  );
  const paperMean = Math.max(background.mean, background.p75);
  const darkThreshold = Math.max(35, paperMean - Math.max(18, paperMean * 0.1));
  const center = sampleLumaStatsAtOffsets(
    pixels,
    width,
    height,
    cx,
    cy,
    centerOffsets,
    darkThreshold,
  );

  return {
    mean: center.mean,
    minLuma: center.min,
    p25: center.p25,
    paperMean,
    darkRatio: center.darkRatio,
    contrast: Math.max(0, paperMean - center.mean),
  };
}

function buildOffsetCandidates(radius: number, step: number): number[] {
  const result = [0];
  for (let d = step; d <= radius; d += step) {
    result.push(-d, d);
  }
  return result.sort((a, b) => a - b);
}

function get200ItemPageLayout(physicalChoices: 4 | 5): TemplateLayout {
  // Measured from the provided 5-choice 200_Answer_Sheet.pdf.
  // Coordinates are normalized against the four 8mm corner-marker centers.
  // The app can generate 4-choice sheets too; those use the same first block
  // and bubble spacing, but every following block shifts left by one choice.
  const firstBlockNX = 0.081228956;
  const fiveChoiceBlockSpacingNX = 0.189814815;
  const bubbleSpacingNX = 0.027777778;
  const blockMarkerOffsetNX = 0.045454542;
  const blockMarkerOffsetNY = 0.014035081;
  const blockSpacingNX =
    physicalChoices === 4
      ? fiveChoiceBlockSpacingNX - bubbleSpacingNX
      : fiveChoiceBlockSpacingNX;
  const firstBubbleNX = Array.from(
    { length: 5 },
    (_, idx) => firstBlockNX + idx * blockSpacingNX,
  );
  const topFirstNY = 0.280701672;
  const bottomFirstNY = 0.498246014;
  const rowSpacingNY = 0.018245609;

  return {
    physicalChoices,
    answerBlocks: [
      {
        startQ: 1,
        endQ: 10,
        firstBubbleNX: firstBubbleNX[0],
        firstBubbleNY: topFirstNY,
        markerNX: firstBubbleNX[0] - blockMarkerOffsetNX,
        markerNY: topFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 21,
        endQ: 30,
        firstBubbleNX: firstBubbleNX[1],
        firstBubbleNY: topFirstNY,
        markerNX: firstBubbleNX[1] - blockMarkerOffsetNX,
        markerNY: topFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 41,
        endQ: 50,
        firstBubbleNX: firstBubbleNX[2],
        firstBubbleNY: topFirstNY,
        markerNX: firstBubbleNX[2] - blockMarkerOffsetNX,
        markerNY: topFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 61,
        endQ: 70,
        firstBubbleNX: firstBubbleNX[3],
        firstBubbleNY: topFirstNY,
        markerNX: firstBubbleNX[3] - blockMarkerOffsetNX,
        markerNY: topFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 81,
        endQ: 90,
        firstBubbleNX: firstBubbleNX[4],
        firstBubbleNY: topFirstNY,
        markerNX: firstBubbleNX[4] - blockMarkerOffsetNX,
        markerNY: topFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 11,
        endQ: 20,
        firstBubbleNX: firstBubbleNX[0],
        firstBubbleNY: bottomFirstNY,
        markerNX: firstBubbleNX[0] - blockMarkerOffsetNX,
        markerNY: bottomFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 31,
        endQ: 40,
        firstBubbleNX: firstBubbleNX[1],
        firstBubbleNY: bottomFirstNY,
        markerNX: firstBubbleNX[1] - blockMarkerOffsetNX,
        markerNY: bottomFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 51,
        endQ: 60,
        firstBubbleNX: firstBubbleNX[2],
        firstBubbleNY: bottomFirstNY,
        markerNX: firstBubbleNX[2] - blockMarkerOffsetNX,
        markerNY: bottomFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 71,
        endQ: 80,
        firstBubbleNX: firstBubbleNX[3],
        firstBubbleNY: bottomFirstNY,
        markerNX: firstBubbleNX[3] - blockMarkerOffsetNX,
        markerNY: bottomFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 91,
        endQ: 100,
        firstBubbleNX: firstBubbleNX[4],
        firstBubbleNY: bottomFirstNY,
        markerNX: firstBubbleNX[4] - blockMarkerOffsetNX,
        markerNY: bottomFirstNY - blockMarkerOffsetNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
    ],
    bubbleDiameterNX: 0.017676768,
    bubbleDiameterNY: 0.012280698,
  };
}

function getExpectedGridPoints(
  markers: Markers,
  layout: TemplateLayout,
  choicesPerQuestion: number,
  orientation: PageOrientation,
): PixelPoint[] {
  const points: PixelPoint[] = [];

  for (const block of layout.answerBlocks) {
    for (let row = 0; row < 10; row++) {
      for (let choice = 0; choice < choicesPerQuestion; choice++) {
        const nx = block.firstBubbleNX + choice * block.bubbleSpacingNX;
        const ny = block.firstBubbleNY + row * block.rowSpacingNY;
        const { px, py } = mapTemplatePointToPixel(
          markers,
          nx,
          ny,
          orientation,
        );
        points.push({ x: px, y: py });
      }
    }
  }

  return points;
}

function findGridCalibration(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout,
  choicesPerQuestion: number,
  bubbleRX: number,
  bubbleRY: number,
  ringOffsets: readonly PixelOffset[],
  orientation: PageOrientation,
): GridCalibration {
  const allPoints = getExpectedGridPoints(
    markers,
    layout,
    choicesPerQuestion,
    orientation,
  );
  const centerX =
    allPoints.reduce((sum, point) => sum + point.x, 0) / allPoints.length;
  const centerY =
    allPoints.reduce((sum, point) => sum + point.y, 0) / allPoints.length;

  // Use a stable subset spread across the page so calibration is based on
  // printed bubble outlines, not on which answers happen to be shaded.
  const calibrationPoints = allPoints.filter((_, idx) => {
    const choice = idx % choicesPerQuestion;
    const row = Math.floor(idx / choicesPerQuestion) % 10;
    const middleChoice = Math.floor((choicesPerQuestion - 1) / 2);
    return (
      (choice === 0 ||
        choice === middleChoice ||
        choice === choicesPerQuestion - 1) &&
      row % 3 === 0
    );
  });

  const shiftRadius = Math.max(8, Math.round(Math.max(bubbleRX, bubbleRY) * 1.8));
  const shiftStep = Math.max(2, Math.round(shiftRadius / 3));
  const shifts = buildOffsetCandidates(shiftRadius, shiftStep);
  const scales = [0.96, 1, 1.04, 1.08];
  let best: GridCalibration = {
    centerX,
    centerY,
    dx: 0,
    dy: 0,
    scaleX: 1,
    scaleY: 1,
    score: Number.NEGATIVE_INFINITY,
  };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const scaleY of scales) {
    for (const scaleX of scales) {
      for (const dy of shifts) {
        for (const dx of shifts) {
          let score = 0;

          for (const point of calibrationPoints) {
            const calibrated = applyGridCalibration(point, {
              centerX,
              centerY,
              dx,
              dy,
              scaleX,
              scaleY,
              score: 0,
            });
            score += sampleBubbleInkScore(
              pixels,
              width,
              height,
              calibrated.x,
              calibrated.y,
              ringOffsets,
            );
          }

          score /= calibrationPoints.length;
          if (score > bestScore) {
            bestScore = score;
            best = { centerX, centerY, dx, dy, scaleX, scaleY, score };
          }
        }
      }
    }
  }

  console.log(
    `[200Q-FAST] Grid calibration (${choicesPerQuestion} choices, ${orientation}): dx=${best.dx}, dy=${best.dy}, scaleX=${best.scaleX.toFixed(2)}, scaleY=${best.scaleY.toFixed(2)}, score=${bestScore.toFixed(1)}`,
  );

  return best;
}

function sampleDarkDensityInTemplateRegion(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  orientation: PageOrientation,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let dark = 0;
  let count = 0;
  const cols = 16;
  const rows = 10;

  for (let row = 0; row < rows; row++) {
    const ny = y0 + ((y1 - y0) * (row + 0.5)) / rows;
    for (let col = 0; col < cols; col++) {
      const nx = x0 + ((x1 - x0) * (col + 0.5)) / cols;
      const { px, py } = mapTemplatePointToPixel(
        markers,
        nx,
        ny,
        orientation,
      );
      const x = Math.round(px);
      const y = Math.round(py);

      if (x >= 0 && x < width && y >= 0 && y < height) {
        if (lumaAt(pixels, width, x, y) < 185) dark++;
        count++;
      }
    }
  }

  return count === 0 ? 0 : dark / count;
}

function estimatePageOrientationByHeader(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
): OrientationScores {
  const scoreOrientation = (orientation: PageOrientation): number => {
    const headerDensity = sampleDarkDensityInTemplateRegion(
      pixels,
      width,
      height,
      markers,
      orientation,
      0.08,
      0.04,
      0.92,
      0.25,
    );
    const footerDensity = sampleDarkDensityInTemplateRegion(
      pixels,
      width,
      height,
      markers,
      orientation,
      0.08,
      0.72,
      0.92,
      0.92,
    );

    return headerDensity - footerDensity * 0.45;
  };

  const normalScore = scoreOrientation("normal");
  const rotatedScore = scoreOrientation("rotated180");
  const orientation: PageOrientation =
    rotatedScore > normalScore * 1.08 ? "rotated180" : "normal";

  console.log(
    `[200Q-FAST] Orientation header score: normal=${normalScore.toFixed(3)}, rotated180=${rotatedScore.toFixed(3)} -> ${orientation}`,
  );

  return { normal: normalScore, rotated180: rotatedScore, orientation };
}

function scoreBlockMarkersForOrientation(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout,
  orientation: PageOrientation,
  markerOffsets: readonly PixelOffset[],
  markerBackgroundOffsets: readonly PixelOffset[],
  bubbleRX: number,
  bubbleRY: number,
): number {
  const searchRadius = Math.max(8, Math.round(Math.max(bubbleRX, bubbleRY) * 2));
  const searchStep = Math.max(2, Math.round(Math.min(bubbleRX, bubbleRY) * 0.35));
  let score = 0;

  for (const block of layout.answerBlocks) {
    const point = getCalibratedBlockMarkerPoint(markers, block, orientation);
    const marker = findBestBlockMarkerOffset(
      pixels,
      width,
      height,
      point,
      markerOffsets,
      markerBackgroundOffsets,
      searchRadius,
      searchStep,
    );
    score += marker.score;
  }

  return score / Math.max(1, layout.answerBlocks.length);
}

function estimatePageOrientation(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout,
  markerOffsets: readonly PixelOffset[],
  markerBackgroundOffsets: readonly PixelOffset[],
  bubbleRX: number,
  bubbleRY: number,
): PageOrientation {
  const normalScore = scoreBlockMarkersForOrientation(
    pixels,
    width,
    height,
    markers,
    layout,
    "normal",
    markerOffsets,
    markerBackgroundOffsets,
    bubbleRX,
    bubbleRY,
  );
  const rotatedScore = scoreBlockMarkersForOrientation(
    pixels,
    width,
    height,
    markers,
    layout,
    "rotated180",
    markerOffsets,
    markerBackgroundOffsets,
    bubbleRX,
    bubbleRY,
  );
  const markerOrientation: PageOrientation =
    rotatedScore > normalScore * 1.12 ? "rotated180" : "normal";
  const headerScores = estimatePageOrientationByHeader(
    pixels,
    width,
    height,
    markers,
  );
  const headerOrientation = headerScores.orientation;
  const headerWinner = Math.max(headerScores.normal, headerScores.rotated180);
  const headerLoser = Math.min(headerScores.normal, headerScores.rotated180);
  const headerIsDecisive =
    headerWinner >= 0.18 &&
    (headerWinner - headerLoser >= 0.18 ||
      headerWinner >= Math.max(0.01, headerLoser) * 1.8);
  const scoresAreWeak = Math.max(normalScore, rotatedScore) < 95;
  const scoresAreClose = Math.abs(normalScore - rotatedScore) < 12;
  const orientation =
    headerIsDecisive || scoresAreWeak || scoresAreClose
      ? headerOrientation
      : markerOrientation;

  console.log(
    `[200Q-FAST] Orientation final: header=${headerOrientation}${headerIsDecisive ? "/decisive" : ""}, marker=${markerOrientation}, markerScore normal=${normalScore.toFixed(1)}, rotated180=${rotatedScore.toFixed(1)} -> ${orientation}`,
  );

  return orientation;
}

function findBestPageCalibration(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  requestedChoices: 4 | 5,
  bubbleRX: number,
  bubbleRY: number,
  ringOffsets: readonly PixelOffset[],
  markerOffsets: readonly PixelOffset[],
  markerBackgroundOffsets: readonly PixelOffset[],
): PageCalibration {
  const layout = get200ItemPageLayout(requestedChoices);
  const orientation = estimatePageOrientation(
    pixels,
    width,
    height,
    markers,
    layout,
    markerOffsets,
    markerBackgroundOffsets,
    bubbleRX,
    bubbleRY,
  );
  const grid = findGridCalibration(
    pixels,
    width,
    height,
    markers,
    layout,
    requestedChoices,
    bubbleRX,
    bubbleRY,
    ringOffsets,
    orientation,
  );

  console.log(
    `[200Q-FAST] Using requested ${requestedChoices}-choice layout, orientation=${orientation}, score=${grid.score.toFixed(1)}`,
  );

  return {
    layout,
    physicalChoices: requestedChoices,
    orientation,
    grid,
    score: grid.score,
  };
}

function getCalibratedBubblePoint(
  markers: Markers,
  block: AnswerBlock,
  rowInBlock: number,
  choiceIndex: number,
  orientation: PageOrientation,
  grid: GridCalibration,
): PixelPoint {
  const nx = block.firstBubbleNX + choiceIndex * block.bubbleSpacingNX;
  const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
  const { px, py } = mapTemplatePointToPixel(markers, nx, ny, orientation);
  return applyGridCalibration({ x: px, y: py }, grid);
}

function getCalibratedBlockMarkerPoint(
  markers: Markers,
  block: AnswerBlock,
  orientation: PageOrientation,
  grid?: GridCalibration,
): PixelPoint {
  const { px, py } = mapTemplatePointToPixel(
    markers,
    block.markerNX,
    block.markerNY,
    orientation,
  );
  const point = { x: px, y: py };
  return grid ? applyGridCalibration(point, grid) : point;
}

function getBandBlocks(layout: TemplateLayout, bandIndex: 0 | 1): AnswerBlock[] {
  return layout.answerBlocks.slice(bandIndex * 5, bandIndex * 5 + 5);
}

function sampleBlockMarkerScore(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  markerOffsets: readonly PixelOffset[],
  backgroundOffsets: readonly PixelOffset[],
): number {
  const background = sampleLumaStatsAtOffsets(
    pixels,
    width,
    height,
    cx,
    cy,
    backgroundOffsets,
  );
  const paperMean = Math.max(background.mean, background.p75);
  const darkThreshold = Math.max(45, paperMean - Math.max(28, paperMean * 0.18));
  const center = sampleLumaStatsAtOffsets(
    pixels,
    width,
    height,
    cx,
    cy,
    markerOffsets,
    darkThreshold,
  );
  const contrast = Math.max(0, paperMean - center.mean);

  // Block header squares are solid black. Text and bubble outlines have lower
  // dark coverage, so darkRatio strongly separates the intended anchor.
  return (255 - center.mean) * 0.75 + contrast * 1.35 + center.darkRatio * 95;
}

function findBestBlockMarkerOffset(
  pixels: Uint8Array,
  width: number,
  height: number,
  point: PixelPoint,
  markerOffsets: readonly PixelOffset[],
  backgroundOffsets: readonly PixelOffset[],
  searchRadius: number,
  searchStep: number,
): BlockMarkerOffset {
  const candidates = buildOffsetCandidates(searchRadius, searchStep);
  let best: BlockMarkerOffset = {
    dx: 0,
    dy: 0,
    score: Number.NEGATIVE_INFINITY,
  };

  for (const dy of candidates) {
    for (const dx of candidates) {
      const score = sampleBlockMarkerScore(
        pixels,
        width,
        height,
        point.x + dx,
        point.y + dy,
        markerOffsets,
        backgroundOffsets,
      );

      if (score > best.score) {
        best = { dx, dy, score };
      }
    }
  }

  return best;
}

function getRawBubblePoint(
  markers: Markers,
  block: AnswerBlock,
  rowInBlock: number,
  choiceIndex: number,
  orientation: PageOrientation,
): PixelPoint {
  const nx = block.firstBubbleNX + choiceIndex * block.bubbleSpacingNX;
  const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
  const { px, py } = mapTemplatePointToPixel(markers, nx, ny, orientation);
  return { x: px, y: py };
}

function getRawBlockMarkerPoint(
  markers: Markers,
  block: AnswerBlock,
  orientation: PageOrientation,
): PixelPoint {
  const { px, py } = mapTemplatePointToPixel(
    markers,
    block.markerNX,
    block.markerNY,
    orientation,
  );
  return { x: px, y: py };
}

function calibrateBlockAnchors(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout,
  orientation: PageOrientation,
  markerOffsets: readonly PixelOffset[],
  markerBackgroundOffsets: readonly PixelOffset[],
  bubbleRX: number,
  bubbleRY: number,
): BlockAnchor[] {
  const searchRadius = Math.max(12, Math.round(Math.max(bubbleRX, bubbleRY) * 3.1));
  const searchStep = Math.max(2, Math.round(Math.min(bubbleRX, bubbleRY) * 0.28));
  const anchors = layout.answerBlocks.map((block) => {
    const markerPoint = getRawBlockMarkerPoint(markers, block, orientation);
    const marker = findBestBlockMarkerOffset(
      pixels,
      width,
      height,
      markerPoint,
      markerOffsets,
      markerBackgroundOffsets,
      searchRadius,
      searchStep,
    );

    return {
      ...marker,
      reliable: marker.score >= 95,
    };
  });
  const reliableCount = anchors.filter((anchor) => anchor.reliable).length;
  const avgScore =
    anchors.reduce((sum, anchor) => sum + anchor.score, 0) /
    Math.max(1, anchors.length);
  const dxValues = anchors.map((anchor) => anchor.dx);
  const dyValues = anchors.map((anchor) => anchor.dy);

  console.log(
    `[200Q-FAST] Block anchors: reliable=${reliableCount}/${anchors.length}, dxRange=${Math.round(Math.min(...dxValues))}..${Math.round(Math.max(...dxValues))}, dyRange=${Math.round(Math.min(...dyValues))}..${Math.round(Math.max(...dyValues))}, score=${avgScore.toFixed(1)}`,
  );

  return anchors;
}

function getAnchoredBubblePoint(
  markers: Markers,
  block: AnswerBlock,
  rowInBlock: number,
  choiceIndex: number,
  orientation: PageOrientation,
  anchor: BlockAnchor,
): PixelPoint {
  const raw = getRawBubblePoint(
    markers,
    block,
    rowInBlock,
    choiceIndex,
    orientation,
  );
  return {
    x: raw.x + anchor.dx,
    y: raw.y + anchor.dy,
  };
}

function findBestQuestionRowOffsetForPoints(
  pixels: Uint8Array,
  width: number,
  height: number,
  choicePoints: readonly PixelPoint[],
  centerOffsets: readonly PixelOffset[],
  backgroundOffsets: readonly PixelOffset[],
  bubbleRX: number,
  bubbleRY: number,
): PixelOffset {
  const radius = Math.max(2, Math.round(Math.min(bubbleRX, bubbleRY) * 0.55));
  const step = Math.max(1, Math.round(radius / 2));
  const candidates = buildOffsetCandidates(radius, step);
  let bestOffset: PixelOffset = { dx: 0, dy: 0 };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const dy of candidates) {
    for (const dx of candidates) {
      const samples = choicePoints.map((point) =>
        sampleBubbleMarkRaw(
          pixels,
          width,
          height,
          point.x + dx,
          point.y + dy,
          centerOffsets,
          backgroundOffsets,
        ),
      );
      const byBrightness = [...samples].sort((a, b) => a.mean - b.mean);
      const darkest = byBrightness[0];
      const secondDark = byBrightness.length > 1 ? byBrightness[1] : darkest;
      const brightest = byBrightness[byBrightness.length - 1];
      const spread = brightest.mean - darkest.mean;
      const gap = secondDark.mean - darkest.mean;
      const score =
        spread * 0.8 +
        gap * 0.5 +
        darkest.contrast * 1.4 +
        darkest.darkRatio * 45;

      if (score > bestScore) {
        bestScore = score;
        bestOffset = { dx, dy };
      }
    }
  }

  return bestOffset;
}

function getBandBubblePoint(
  markers: Markers,
  blocks: readonly AnswerBlock[],
  rowInBlock: number,
  colIndex: number,
  physicalChoices: 4 | 5,
  orientation: PageOrientation,
  grid: GridCalibration,
): PixelPoint {
  const blockIndex = Math.floor(colIndex / physicalChoices);
  const choiceIndex = colIndex % physicalChoices;
  return getCalibratedBubblePoint(
    markers,
    blocks[blockIndex],
    rowInBlock,
    choiceIndex,
    orientation,
    grid,
  );
}

function calibrateAnswerBandGrid(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout,
  bandIndex: 0 | 1,
  physicalChoices: 4 | 5,
  orientation: PageOrientation,
  grid: GridCalibration,
  bubbleRX: number,
  bubbleRY: number,
  ringOffsets: readonly PixelOffset[],
  frameSize: { width: number; height: number },
  markerOffsets: readonly PixelOffset[],
  markerBackgroundOffsets: readonly PixelOffset[],
): AnswerBandCalibration {
  const blocks = getBandBlocks(layout, bandIndex);
  const totalCols = physicalChoices * blocks.length;
  const probeRows = [0, 3, 6, 9];
  const maxBubbleR = Math.max(bubbleRX, bubbleRY);
  const rowSpacingPx = Math.max(4, layout.answerBlocks[0].rowSpacingNY * frameSize.height);
  const colSpacingPx = Math.max(4, layout.answerBlocks[0].bubbleSpacingNX * frameSize.width);
  const baseRadius = Math.max(4, Math.round(maxBubbleR * 1.15));
  const baseStep = Math.max(1, Math.round(Math.min(bubbleRX, bubbleRY) * 0.35));
  const baseOffsets = buildOffsetCandidates(baseRadius, baseStep);
  let baseDx = 0;
  let baseDy = 0;
  let baseScore = Number.NEGATIVE_INFINITY;

  for (const dy of baseOffsets) {
    for (const dx of baseOffsets) {
      let score = 0;
      let samples = 0;

      for (const row of probeRows) {
        for (let col = 0; col < totalCols; col++) {
          const point = getBandBubblePoint(
            markers,
            blocks,
            row,
            col,
            physicalChoices,
            orientation,
            grid,
          );
          score += sampleBubbleInkScore(
            pixels,
            width,
            height,
            point.x + dx,
            point.y + dy,
            ringOffsets,
          );
          samples++;
        }
      }

      score /= Math.max(1, samples);
      if (score > baseScore) {
        baseScore = score;
        baseDx = dx;
        baseDy = dy;
      }
    }
  }

  const rowRadius = Math.max(
    3,
    Math.round(Math.min(rowSpacingPx * 0.42, maxBubbleR * 1.6)),
  );
  const colRadius = Math.max(
    3,
    Math.round(Math.min(colSpacingPx * 0.42, maxBubbleR * 1.6)),
  );
  const fineStep = Math.max(1, Math.round(Math.min(bubbleRX, bubbleRY) * 0.25));
  const rowDy = new Array(10).fill(baseDy);
  const colDx = new Array(totalCols).fill(baseDx);
  const blockRadius = Math.max(3, Math.round(Math.min(rowRadius, colRadius)));
  const blockCandidates = buildOffsetCandidates(blockRadius, fineStep);
  const blockDy = new Array(blocks.length).fill(baseDy);
  let score = 0;
  let dySum = 0;
  let markerUsed = 0;
  let markerScoreSum = 0;

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const firstCol = blockIndex * physicalChoices;
    let bestBlockDx = baseDx;
    let bestBlockDy = baseDy;
    let bestBlockScore = Number.NEGATIVE_INFINITY;

    for (const localDy of blockCandidates) {
      for (const localDx of blockCandidates) {
        const candDx = baseDx + localDx;
        const candDy = baseDy + localDy;
        let blockScore = 0;
        let samples = 0;

        for (const row of probeRows) {
          for (let choice = 0; choice < physicalChoices; choice++) {
            const point = getCalibratedBubblePoint(
              markers,
              blocks[blockIndex],
              row,
              choice,
              orientation,
              grid,
            );
            blockScore += sampleBubbleInkScore(
              pixels,
              width,
              height,
              point.x + candDx,
              point.y + candDy,
              ringOffsets,
            );
            samples++;
          }
        }

        blockScore /= Math.max(1, samples);
        if (blockScore > bestBlockScore) {
          bestBlockScore = blockScore;
          bestBlockDx = candDx;
          bestBlockDy = candDy;
        }
      }
    }

    for (let choice = 0; choice < physicalChoices; choice++) {
      colDx[firstCol + choice] = bestBlockDx;
    }
    blockDy[blockIndex] = bestBlockDy;

    const markerPoint = getCalibratedBlockMarkerPoint(
      markers,
      blocks[blockIndex],
      orientation,
      grid,
    );
    const markerAnchor = findBestBlockMarkerOffset(
      pixels,
      width,
      height,
      markerPoint,
      markerOffsets,
      markerBackgroundOffsets,
      Math.max(baseRadius * 2, Math.round(maxBubbleR * 2.4)),
      fineStep,
    );
    markerScoreSum += markerAnchor.score;

    if (markerAnchor.score >= 95) {
      for (let choice = 0; choice < physicalChoices; choice++) {
        colDx[firstCol + choice] = markerAnchor.dx;
      }
      blockDy[blockIndex] = markerAnchor.dy;
      bestBlockScore = Math.max(bestBlockScore, markerAnchor.score);
      markerUsed++;
    }

    dySum += blockDy[blockIndex];
    score += bestBlockScore;
  }

  rowDy.fill(dySum / blocks.length);
  score /= blocks.length;
  console.log(
    `[200Q-FAST] Band ${bandIndex + 1} grid: baseDx=${baseDx}, baseDy=${baseDy}, rowRange=${Math.round(Math.min(...rowDy))}..${Math.round(Math.max(...rowDy))}, colRange=${Math.round(Math.min(...colDx))}..${Math.round(Math.max(...colDx))}, markerAnchors=${markerUsed}/${blocks.length}, markerScore=${(markerScoreSum / Math.max(1, blocks.length)).toFixed(1)}, score=${score.toFixed(1)}`,
  );

  return { rowDy, colDx, blockDy, score };
}

function findBestQuestionRowOffset(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  block: AnswerBlock,
  rowInBlock: number,
  physicalChoices: 4 | 5,
  orientation: PageOrientation,
  grid: GridCalibration,
  baseDx: number,
  baseDy: number,
  centerOffsets: readonly PixelOffset[],
  backgroundOffsets: readonly PixelOffset[],
  bubbleRX: number,
  bubbleRY: number,
): PixelOffset {
  const radius = Math.max(2, Math.round(Math.min(bubbleRX, bubbleRY) * 0.75));
  const step = Math.max(1, Math.round(radius / 2));
  const candidates = buildOffsetCandidates(radius, step);
  let bestOffset: PixelOffset = { dx: 0, dy: 0 };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const dy of candidates) {
    for (const dx of candidates) {
      const samples: BubbleMarkSample[] = [];

      for (let choice = 0; choice < physicalChoices; choice++) {
        const point = getCalibratedBubblePoint(
          markers,
          block,
          rowInBlock,
          choice,
          orientation,
          grid,
        );
        samples.push(
          sampleBubbleMarkRaw(
            pixels,
            width,
            height,
            point.x + baseDx + dx,
            point.y + baseDy + dy,
            centerOffsets,
            backgroundOffsets,
          ),
        );
      }

      const byBrightness = [...samples].sort((a, b) => a.mean - b.mean);
      const darkest = byBrightness[0];
      const secondDark = byBrightness.length > 1 ? byBrightness[1] : darkest;
      const brightest = byBrightness[byBrightness.length - 1];
      const spread = brightest.mean - darkest.mean;
      const gap = secondDark.mean - darkest.mean;
      const score =
        spread * 0.9 +
        gap * 0.45 +
        darkest.contrast * 1.6 +
        darkest.darkRatio * 55;

      if (score > bestScore) {
        bestScore = score;
        bestOffset = { dx, dy };
      }
    }
  }

  return bestOffset;
}

function scan200ItemPagePixelsWithBrightness(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  choicesPerQuestion: 4 | 5,
): StudentAnswer[] {
  const requestedChoices = choicesPerQuestion === 4 ? 4 : 5;
  const answers: StudentAnswer[] = [];
  const frameSize = getAverageFrameSize(markers);
  const referenceLayout = get200ItemPageLayout(5);
  const bubbleRX = (referenceLayout.bubbleDiameterNX * frameSize.width) / 2;
  const bubbleRY = (referenceLayout.bubbleDiameterNY * frameSize.height) / 2;
  const centerOffsets = buildSampleOffsets(bubbleRX, bubbleRY, 0.48, 4, true);
  const backgroundOffsets = buildBackgroundOffsets(bubbleRX, bubbleRY);
  const ringOffsets = buildRingOffsets(bubbleRX, bubbleRY);
  const markerRX = bubbleRX * 0.57;
  const markerRY = bubbleRY * 0.57;
  const markerOffsets = buildSampleOffsets(markerRX, markerRY, 0.95, 2, true);
  const markerBackgroundOffsets = buildBackgroundOffsets(markerRX, markerRY);
  const pageCalibration = findBestPageCalibration(
    pixels,
    width,
    height,
    markers,
    requestedChoices,
    bubbleRX,
    bubbleRY,
    ringOffsets,
    markerOffsets,
    markerBackgroundOffsets,
  );
  const { layout, physicalChoices, orientation, grid } = pageCalibration;
  const choiceLabels = "ABCDE".slice(0, physicalChoices).split("");
  const blockAnchors = calibrateBlockAnchors(
    pixels,
    width,
    height,
    markers,
    layout,
    orientation,
    markerOffsets,
    markerBackgroundOffsets,
    bubbleRX,
    bubbleRY,
  );
  const reliableAnchorCount = blockAnchors.filter((anchor) => anchor.reliable).length;
  const useAnchorGrid = reliableAnchorCount >= 7;
  const bandCalibrations = useAnchorGrid
    ? null
    : [
        calibrateAnswerBandGrid(
          pixels,
          width,
          height,
          markers,
          layout,
          0,
          physicalChoices,
          orientation,
          grid,
          bubbleRX,
          bubbleRY,
          ringOffsets,
          frameSize,
          markerOffsets,
          markerBackgroundOffsets,
        ),
        calibrateAnswerBandGrid(
          pixels,
          width,
          height,
          markers,
          layout,
          1,
          physicalChoices,
          orientation,
          grid,
          bubbleRX,
          bubbleRY,
          ringOffsets,
          frameSize,
          markerOffsets,
          markerBackgroundOffsets,
        ),
      ];

  layout.answerBlocks.forEach((block, blockIndex) => {
    const bandIndex = blockIndex < 5 ? 0 : 1;
    const blockColumn = blockIndex % 5;
    const blockAnchor = blockAnchors[blockIndex];
    const useBlockAnchor = useAnchorGrid || blockAnchor.reliable;
    const bandCalibration = bandCalibrations?.[bandIndex] ?? null;

    for (let q = block.startQ; q <= block.endQ; q++) {
      const rowInBlock = q - block.startQ;
      const fills: BubbleInteriorSample[] = [];
      const choicePoints = Array.from({ length: physicalChoices }, (_, c) => {
        if (useBlockAnchor) {
          return getAnchoredBubblePoint(
            markers,
            block,
            rowInBlock,
            c,
            orientation,
            blockAnchor,
          );
        }

        return getCalibratedBubblePoint(
          markers,
          block,
          rowInBlock,
          c,
          orientation,
          grid,
        );
      });
      const baseColIndex = blockColumn * physicalChoices;
      const rowOffset =
        useBlockAnchor || !bandCalibration
          ? findBestQuestionRowOffsetForPoints(
              pixels,
              width,
              height,
              choicePoints,
              centerOffsets,
              backgroundOffsets,
              bubbleRX,
              bubbleRY,
            )
          : findBestQuestionRowOffset(
              pixels,
              width,
              height,
              markers,
              block,
              rowInBlock,
              physicalChoices,
              orientation,
              grid,
              bandCalibration.colDx[baseColIndex],
              bandCalibration.blockDy[blockColumn],
              centerOffsets,
              backgroundOffsets,
              bubbleRX,
              bubbleRY,
            );

      for (let c = 0; c < physicalChoices; c++) {
        const colIndex = blockColumn * physicalChoices + c;
        const sampleX =
          useBlockAnchor || !bandCalibration
            ? choicePoints[c].x + rowOffset.dx
            : choicePoints[c].x +
              bandCalibration.colDx[colIndex] +
              rowOffset.dx;
        const sampleY =
          useBlockAnchor || !bandCalibration
            ? choicePoints[c].y + rowOffset.dy
            : choicePoints[c].y +
              bandCalibration.blockDy[blockColumn] +
              rowOffset.dy;
        const sample = sampleBubbleMarkRaw(
          pixels,
          width,
          height,
          sampleX,
          sampleY,
          centerOffsets,
          backgroundOffsets,
        );
        fills.push({
          choice: choiceLabels[c],
          brightness: sample.mean,
          minLuma: sample.minLuma,
          darkRatio: sample.darkRatio,
          paperMean: sample.paperMean,
          contrast: sample.contrast,
          p25: sample.p25,
          score: 0,
        });
      }

      const byBrightness = [...fills].sort(
        (a, b) => a.brightness - b.brightness,
      );
      const darkest = byBrightness[0].brightness;
      const secondDark =
        byBrightness.length >= 2 ? byBrightness[1].brightness : 255;
      const brightest = byBrightness[byBrightness.length - 1].brightness;
      const brightnessSpread = brightest - darkest;
      const mean =
        fills.reduce((sum, item) => sum + item.brightness, 0) / fills.length;

      for (const fill of fills) {
        const relativeDarkness = Math.max(0, brightest - fill.brightness);
        const percentileContrast = Math.max(0, fill.paperMean - fill.p25);
        const minContrast = Math.max(0, fill.paperMean - fill.minLuma);
        fill.score =
          relativeDarkness * 0.45 +
          fill.contrast +
          percentileContrast * 0.55 +
          fill.darkRatio * 90 +
          minContrast * 0.06;
      }

      const sorted = [...fills].sort((a, b) => b.score - a.score);
      const best = sorted[0];
      const second = sorted.length >= 2 ? sorted[1] : null;
      const worst = sorted[sorted.length - 1];
      const scoreGap = second ? best.score - second.score : best.score;
      const absoluteGap = secondDark - darkest;
      const scoreSpread = best.score - worst.score;
      const bestIsDarkest = best.choice === byBrightness[0].choice;
      let selectedChoice = "";

      if (best.score >= 7 && scoreGap >= 0.35) {
        selectedChoice = best.choice;
      } else if (scoreGap >= 1.75 && best.contrast >= 1.5) {
        selectedChoice = best.choice;
      } else if (
        bestIsDarkest &&
        absoluteGap >= 1.25 &&
        brightnessSpread >= 1.75 &&
        best.score >= 2
      ) {
        selectedChoice = best.choice;
      } else if (
        scoreSpread >= 2.25 &&
        best.score >= 2.25 &&
        scoreGap >= 0.12
      ) {
        selectedChoice = best.choice;
      } else if (
        bestIsDarkest &&
        brightnessSpread >= 0.8 &&
        best.brightness <= mean - 0.2 &&
        best.score >= 1.25
      ) {
        selectedChoice = best.choice;
      }

      if (DEBUG_LOGS && (q === block.startQ || !selectedChoice)) {
        console.log(
          `[200Q-FAST] Q${q}: ${fills
            .map(
              (f) =>
                `${f.choice}=${f.brightness.toFixed(0)}/${f.contrast.toFixed(0)}/${f.score.toFixed(0)}`,
            )
            .join(", ")} -> ${selectedChoice || "?"}`,
        );
      }

      answers.push({ questionNumber: q, selectedAnswer: selectedChoice });
    }
  });

  return answers.sort((a, b) => a.questionNumber - b.questionNumber);
}

function readFullRgbaPixels(image: any): Uint8Array | null {
  const raw = image.readPixels();
  if (!raw) return null;
  if (raw instanceof Uint8Array) return raw;
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  return null;
}

async function load200ItemImagePixels(imageUri: string): Promise<ImagePixels> {
  const normalizedUri = imageUri.startsWith("file://")
    ? imageUri
    : `file://${imageUri}`;
  let imageData;

  try {
    imageData = await Skia.Data.fromURI(normalizedUri);
  } catch {
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: "base64",
    });
    imageData = Skia.Data.fromBase64(base64);
  }

  const image = Skia.Image.MakeImageFromEncoded(imageData);
  if (!image) {
    throw new Error("Failed to load 200-item image with Skia");
  }

  const width = image.width();
  const height = image.height();
  const pixels = readFullRgbaPixels(image);
  if (!pixels) {
    throw new Error("Failed to read 200-item image pixels");
  }

  return { pixels, width, height };
}

function estimateDarkThreshold(
  pixels: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  step: number,
): number {
  const values: number[] = [];
  const sampleStep = step * 3;

  for (let y = y0; y <= y1; y += sampleStep) {
    for (let x = x0; x <= x1; x += sampleStep) {
      values.push(lumaAt(pixels, width, x, y));
    }
  }

  if (values.length === 0) return 105;
  values.sort((a, b) => a - b);

  const median = values[Math.floor(values.length / 2)];
  const low = values[Math.floor(values.length * 0.12)];
  return Math.max(45, Math.min(145, Math.max(low + 28, median * 0.58)));
}

function findCornerMarker(
  pixels: Uint8Array,
  imageW: number,
  imageH: number,
  window: CornerWindow,
  step: number,
): MarkerCandidate | null {
  const x0 = Math.max(0, Math.floor(window.x0));
  const y0 = Math.max(0, Math.floor(window.y0));
  const x1 = Math.min(imageW - 1, Math.ceil(window.x1));
  const y1 = Math.min(imageH - 1, Math.ceil(window.y1));
  const gridW = Math.floor((x1 - x0) / step) + 1;
  const gridH = Math.floor((y1 - y0) / step) + 1;
  const dark = new Uint8Array(gridW * gridH);
  const seen = new Uint8Array(gridW * gridH);
  const threshold = estimateDarkThreshold(pixels, imageW, x0, y0, x1, y1, step);
  const stack: number[] = [];
  let best: MarkerCandidate | null = null;

  for (let gy = 0; gy < gridH; gy++) {
    const y = Math.min(imageH - 1, y0 + gy * step);
    for (let gx = 0; gx < gridW; gx++) {
      const x = Math.min(imageW - 1, x0 + gx * step);
      dark[gy * gridW + gx] = lumaAt(pixels, imageW, x, y) <= threshold ? 1 : 0;
    }
  }

  const minDim = Math.max(8, Math.min(imageW, imageH) * 0.006);
  const maxDim = Math.min(imageW, imageH) * 0.13;

  for (let i = 0; i < dark.length; i++) {
    if (!dark[i] || seen[i]) continue;

    stack.length = 0;
    stack.push(i);
    seen[i] = 1;

    let count = 0;
    let minGX = Number.POSITIVE_INFINITY;
    let maxGX = 0;
    let minGY = Number.POSITIVE_INFINITY;
    let maxGY = 0;

    while (stack.length > 0) {
      const cur = stack.pop()!;
      const gx = cur % gridW;
      const gy = Math.floor(cur / gridW);
      count++;
      minGX = Math.min(minGX, gx);
      maxGX = Math.max(maxGX, gx);
      minGY = Math.min(minGY, gy);
      maxGY = Math.max(maxGY, gy);

      if (gx > 0) {
        const next = cur - 1;
        if (!seen[next] && dark[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
      if (gx < gridW - 1) {
        const next = cur + 1;
        if (!seen[next] && dark[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
      if (gy > 0) {
        const next = cur - gridW;
        if (!seen[next] && dark[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
      if (gy < gridH - 1) {
        const next = cur + gridW;
        if (!seen[next] && dark[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    const compW = (maxGX - minGX + 1) * step;
    const compH = (maxGY - minGY + 1) * step;
    const aspect = compW / Math.max(1, compH);
    const density = count / ((maxGX - minGX + 1) * (maxGY - minGY + 1));

    if (compW < minDim || compH < minDim) continue;
    if (compW > maxDim || compH > maxDim) continue;
    if (aspect < 0.65 || aspect > 1.55) continue;
    if (density < 0.45) continue;

    const centerX = x0 + (minGX + maxGX + 1) * step * 0.5;
    const centerY = y0 + (minGY + maxGY + 1) * step * 0.5;
    const targetDist =
      Math.hypot(centerX - window.targetX, centerY - window.targetY) /
      Math.hypot(imageW, imageH);
    const squareScore = 1 - Math.min(0.7, Math.abs(Math.log(aspect)));
    const expectedMarkerDim = Math.min(imageW, imageH) * 0.026;
    const avgDim = (compW + compH) / 2;
    const sizeScore = Math.max(
      0.12,
      Math.exp(-Math.abs(Math.log(avgDim / Math.max(1, expectedMarkerDim))) * 1.15),
    );
    const targetScore = 1 / (1 + targetDist * 7);
    const score =
      Math.sqrt(count) * density * (0.8 + squareScore) * sizeScore * targetScore;

    if (!best || score > best.score) {
      best = { x: centerX, y: centerY, width: compW, height: compH, score };
    }
  }

  return best;
}

function detect200ItemCornerMarkers(
  pixels: Uint8Array,
  width: number,
  height: number,
): Markers {
  const step = Math.max(4, Math.round(Math.min(width, height) / 750));
  const xBand = width * 0.38;
  const yBand = height * 0.38;
  const windows: CornerWindow[] = [
    {
      key: "topLeft",
      x0: 0,
      y0: 0,
      x1: xBand,
      y1: yBand,
      targetX: 0,
      targetY: 0,
    },
    {
      key: "topRight",
      x0: width - xBand,
      y0: 0,
      x1: width - 1,
      y1: yBand,
      targetX: width,
      targetY: 0,
    },
    {
      key: "bottomLeft",
      x0: 0,
      y0: height - yBand,
      x1: xBand,
      y1: height - 1,
      targetX: 0,
      targetY: height,
    },
    {
      key: "bottomRight",
      x0: width - xBand,
      y0: height - yBand,
      x1: width - 1,
      y1: height - 1,
      targetX: width,
      targetY: height,
    },
  ];
  const markers = {} as Markers;

  for (const window of windows) {
    const candidate = findCornerMarker(pixels, width, height, window, step);
    if (!candidate) {
      throw new Error(
        "Could not detect all 4 corner boxes on the 200-item sheet. Retake with the full sheet visible and all four edge boxes inside the frame.",
      );
    }
    markers[window.key] = { x: candidate.x, y: candidate.y };
  }

  const topWidth = Math.abs(markers.topRight.x - markers.topLeft.x);
  const bottomWidth = Math.abs(markers.bottomRight.x - markers.bottomLeft.x);
  const leftHeight = Math.abs(markers.bottomLeft.y - markers.topLeft.y);
  const rightHeight = Math.abs(markers.bottomRight.y - markers.topRight.y);

  if (
    topWidth < width * 0.42 ||
    bottomWidth < width * 0.42 ||
    leftHeight < height * 0.42 ||
    rightHeight < height * 0.42
  ) {
    throw new Error(
      "Corner boxes were detected but the page geometry is too distorted. Flatten the sheet and retake with the full page inside the frame.",
    );
  }

  console.log(
    "[200Q-FAST] Corner markers:",
    `TL=(${Math.round(markers.topLeft.x)},${Math.round(markers.topLeft.y)})`,
    `TR=(${Math.round(markers.topRight.x)},${Math.round(markers.topRight.y)})`,
    `BL=(${Math.round(markers.bottomLeft.x)},${Math.round(markers.bottomLeft.y)})`,
    `BR=(${Math.round(markers.bottomRight.x)},${Math.round(markers.bottomRight.y)})`,
  );

  return markers;
}

function offsetPageAnswers(
  answers: StudentAnswer[],
  pageNumber: 1 | 2,
): StudentAnswer[] {
  const questionOffset = pageNumber === 1 ? 0 : 100;
  if (questionOffset === 0) return answers;

  return answers.map((answer) => ({
    ...answer,
    questionNumber: answer.questionNumber + questionOffset,
  }));
}

function summarizeChoiceCounts(answers: StudentAnswer[]): string {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let blank = 0;

  for (const answer of answers) {
    if (answer.selectedAnswer && counts[answer.selectedAnswer] !== undefined) {
      counts[answer.selectedAnswer]++;
    } else {
      blank++;
    }
  }

  return `A=${counts.A}, B=${counts.B}, C=${counts.C}, D=${counts.D}, E=${counts.E}, blank=${blank}`;
}

export async function scan200ItemPageFast(
  imageUri: string,
  pageNumber: 1 | 2,
  choicesPerQuestion: 4 | 5 = 4,
): Promise<StudentAnswer[]> {
  const startedAt = Date.now();
  const questionOffset = pageNumber === 1 ? 0 : 100;
  console.log(
    `[200Q-FAST][${SCANNER_200Q_VERSION}] Starting direct pixel scan for Page ${pageNumber} (offset=${questionOffset}, choices=${choicesPerQuestion}/${choicesPerQuestion === 5 ? "A-E" : "A-D"})`,
  );

  const { pixels, width, height } = await load200ItemImagePixels(imageUri);

  if (width > height) {
    throw new Error(
      "Portrait Mode Required. Please hold your phone in portrait orientation when scanning 200-item exams.",
    );
  }

  const markers = detect200ItemCornerMarkers(pixels, width, height);
  const answers = scan200ItemPagePixelsWithBrightness(
    pixels,
    width,
    height,
    markers,
    choicesPerQuestion,
  );
  const pageAnswers = offsetPageAnswers(answers, pageNumber);
  const detectedCount = pageAnswers.filter((a) => a.selectedAnswer).length;

  console.log(
    `[200Q-FAST] Page ${pageNumber}: Detected ${detectedCount}/100 answers in ${Date.now() - startedAt}ms (Q${questionOffset + 1}-${questionOffset + 100})`,
  );
  console.log(
    `[200Q-FAST] Page ${pageNumber} answer distribution: ${summarizeChoiceCounts(pageAnswers)}`,
  );

  return pageAnswers;
}

export async function scan200ItemPage(
  imageUri: string,
  markers: Markers,
  pageNumber: 1 | 2,
  choicesPerQuestion: 4 | 5 = 4,
): Promise<StudentAnswer[]> {
  const questionOffset = pageNumber === 1 ? 0 : 100;
  console.log(
    `[200Q-BRIGHTNESS] Starting brightness scan for Page ${pageNumber} (offset=${questionOffset})`,
  );

  try {
    const { pixels, width, height } = await load200ItemImagePixels(imageUri);
    const answers = scan200ItemPagePixelsWithBrightness(
      pixels,
      width,
      height,
      markers,
      choicesPerQuestion,
    );

    const pageAnswers = offsetPageAnswers(answers, pageNumber);

    const detectedCount = pageAnswers.filter((a) => a.selectedAnswer).length;
    console.log(
      `[200Q-BRIGHTNESS] Page ${pageNumber}: Detected ${detectedCount}/100 answers (Q${questionOffset + 1}-${questionOffset + 100})`,
    );
    console.log(
      `[200Q-BRIGHTNESS] Page ${pageNumber} answer distribution: ${summarizeChoiceCounts(pageAnswers)}`,
    );

    return pageAnswers;
  } catch (error) {
    console.error(`[200Q-BRIGHTNESS] Page ${pageNumber} error:`, error);

    return Array.from({ length: 100 }, (_, i) => ({
      questionNumber: i + 1 + questionOffset,
      selectedAnswer: "",
    }));
  }
}
