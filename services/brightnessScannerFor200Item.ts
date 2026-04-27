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
const SCANNER_200Q_VERSION = "200Q-adaptive-bubble-grid-v10";

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

interface CornerDetectionAttempt {
  label: string;
  foundCount: number;
  scoreSum: number;
  markers: Partial<Record<CornerKey, MarkerCandidate>>;
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
  profileName: string;
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

interface FastLumaStats {
  mean: number;
  min: number;
  max: number;
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

interface RectifiedBubbleCandidate {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  density: number;
  score: number;
}

interface AxisCluster {
  center: number;
  count: number;
  score: number;
  items: RectifiedBubbleCandidate[];
}

interface AdaptiveBandGrid {
  rows: AxisCluster[];
  columnGroups: AxisCluster[][];
  candidates: RectifiedBubbleCandidate[];
}

interface AdaptiveGrid {
  orientation: PageOrientation;
  roiX0: number;
  roiY0: number;
  roiX1: number;
  roiY1: number;
  rectWidth: number;
  rectHeight: number;
  expectedBubblePx: number;
  componentCount: number;
  bands: [AdaptiveBandGrid, AdaptiveBandGrid];
}

type ProjectiveMapper = (nx: number, ny: number) => { px: number; py: number };

const projectiveMapperCache = new WeakMap<Markers, ProjectiveMapper>();

function createProjectiveMapper(markers: Markers): ProjectiveMapper {
  const x00 = markers.topLeft.x;
  const y00 = markers.topLeft.y;
  const x10 = markers.topRight.x;
  const y10 = markers.topRight.y;
  const x01 = markers.bottomLeft.x;
  const y01 = markers.bottomLeft.y;
  const x11 = markers.bottomRight.x;
  const y11 = markers.bottomRight.y;

  // Precompute homography coefficients once per marker set to avoid
  // recomputing them for every sampled pixel.
  const dx1 = x10 - x11;
  const dx2 = x01 - x11;
  const dx3 = x00 - x10 + x11 - x01;
  const dy1 = y10 - y11;
  const dy2 = y01 - y11;
  const dy3 = y00 - y10 + y11 - y01;
  const det = dx1 * dy2 - dx2 * dy1;

  if (Math.abs(det) < 1e-6) {
    return (nx: number, ny: number) => {
      const topX = x00 + nx * (x10 - x00);
      const topY = y00 + nx * (y10 - y00);
      const botX = x01 + nx * (x11 - x01);
      const botY = y01 + nx * (y11 - y01);
      return {
        px: topX + ny * (botX - topX),
        py: topY + ny * (botY - topY),
      };
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

  return (nx: number, ny: number) => {
    const denom = g * nx + h * ny + 1;
    return {
      px: (a * nx + b * ny + c) / denom,
      py: (d * nx + e * ny + f) / denom,
    };
  };
}

function getProjectiveMapper(markers: Markers): ProjectiveMapper {
  let mapper = projectiveMapperCache.get(markers);
  if (!mapper) {
    mapper = createProjectiveMapper(markers);
    projectiveMapperCache.set(markers, mapper);
  }
  return mapper;
}

function mapToPixel(
  markers: Markers,
  nx: number,
  ny: number,
): { px: number; py: number } {
  const mapper = getProjectiveMapper(markers);
  return mapper(nx, ny);
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

function getAverageFrameSize(markers: Markers): {
  width: number;
  height: number;
} {
  const top = distance(markers.topLeft, markers.topRight);
  const bottom = distance(markers.bottomLeft, markers.bottomRight);
  const left = distance(markers.topLeft, markers.bottomLeft);
  const right = distance(markers.topRight, markers.bottomRight);

  return {
    width: (top + bottom) / 2,
    height: (left + right) / 2,
  };
}

function lumaAt(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
): number {
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
        (dx * dx) / (innerRX * innerRX) + (dy * dy) / (innerRY * innerRY) > 1;
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
      sumLuma +=
        pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29;
      count++;
    }
  }

  return count === 0 ? 255 : sumLuma / (count * 256);
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
  const histogram = new Uint16Array(256);
  let sumLuma = 0;
  let darkCount = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let count = 0;
  const baseX = Math.round(cx);
  const baseY = Math.round(cy);

  for (const { dx, dy } of offsets) {
    const px = baseX + dx;
    const py = baseY + dy;
    if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
      const luma = lumaAt(pixels, imgW, px, py);
      histogram[luma]++;
      sumLuma += luma;
      count++;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;
      if (darkThreshold !== undefined && luma <= darkThreshold) darkCount++;
    }
  }

  if (count === 0) {
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

  return {
    mean: sumLuma / count,
    min: minLuma,
    max: maxLuma,
    p10: histogramPercentile(histogram, count, 0.1),
    p25: histogramPercentile(histogram, count, 0.25),
    p50: histogramPercentile(histogram, count, 0.5),
    p75: histogramPercentile(histogram, count, 0.75),
    p90: histogramPercentile(histogram, count, 0.9),
    darkRatio: darkThreshold === undefined ? 0 : darkCount / Math.max(1, count),
    count,
  };
}

function sampleFastLumaStatsAtOffsets(
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  offsets: readonly PixelOffset[],
  darkThreshold?: number,
): FastLumaStats {
  let sumLuma = 0;
  let darkCount = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let count = 0;
  const baseX = Math.round(cx);
  const baseY = Math.round(cy);

  for (const { dx, dy } of offsets) {
    const px = baseX + dx;
    const py = baseY + dy;
    if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
      const luma = lumaAt(pixels, imgW, px, py);
      sumLuma += luma;
      count++;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;
      if (darkThreshold !== undefined && luma <= darkThreshold) darkCount++;
    }
  }

  if (count === 0) {
    return {
      mean: 255,
      min: 255,
      max: 255,
      darkRatio: 0,
      count: 0,
    };
  }

  return {
    mean: sumLuma / count,
    min: minLuma,
    max: maxLuma,
    darkRatio: darkThreshold === undefined ? 0 : darkCount / count,
    count,
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

function buildBackgroundOffsets(
  radiusX: number,
  radiusY: number,
): PixelOffset[] {
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
  return (
    255 - sampleBubbleAtOffsets(pixels, width, height, cx, cy, ringOffsets)
  );
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function build200ItemLayout(input: {
  profileName: string;
  physicalChoices: 4 | 5;
  firstBlockNX: number;
  blockSpacingNX: number;
  bubbleSpacingNX: number;
  blockMarkerOffsetNX: number;
  blockMarkerOffsetNY: number;
  topFirstNY: number;
  bottomFirstNY: number;
  rowSpacingNY: number;
  bubbleDiameterNX: number;
  bubbleDiameterNY: number;
}): TemplateLayout {
  const firstBubbleNX = Array.from(
    { length: 5 },
    (_, idx) => input.firstBlockNX + idx * input.blockSpacingNX,
  );

  const makeBlock = (
    startQ: number,
    endQ: number,
    column: number,
    firstBubbleNY: number,
  ): AnswerBlock => ({
    startQ,
    endQ,
    firstBubbleNX: firstBubbleNX[column],
    firstBubbleNY,
    markerNX: firstBubbleNX[column] - input.blockMarkerOffsetNX,
    markerNY: firstBubbleNY - input.blockMarkerOffsetNY,
    bubbleSpacingNX: input.bubbleSpacingNX,
    rowSpacingNY: input.rowSpacingNY,
  });

  return {
    profileName: input.profileName,
    physicalChoices: input.physicalChoices,
    answerBlocks: [
      makeBlock(1, 10, 0, input.topFirstNY),
      makeBlock(21, 30, 1, input.topFirstNY),
      makeBlock(41, 50, 2, input.topFirstNY),
      makeBlock(61, 70, 3, input.topFirstNY),
      makeBlock(81, 90, 4, input.topFirstNY),
      makeBlock(11, 20, 0, input.bottomFirstNY),
      makeBlock(31, 40, 1, input.bottomFirstNY),
      makeBlock(51, 60, 2, input.bottomFirstNY),
      makeBlock(71, 80, 3, input.bottomFirstNY),
      makeBlock(91, 100, 4, input.bottomFirstNY),
    ],
    bubbleDiameterNX: input.bubbleDiameterNX,
    bubbleDiameterNY: input.bubbleDiameterNY,
  };
}

function getLegacy200ItemPageLayout(physicalChoices: 4 | 5): TemplateLayout {
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
  const topFirstNY = 0.280701672;
  const bottomFirstNY = 0.498246014;
  const rowSpacingNY = 0.018245609;

  return build200ItemLayout({
    profileName: `legacy-${physicalChoices}choice`,
    physicalChoices,
    firstBlockNX,
    blockSpacingNX,
    bubbleSpacingNX,
    blockMarkerOffsetNX,
    blockMarkerOffsetNY,
    topFirstNY,
    bottomFirstNY,
    rowSpacingNY,
    bubbleDiameterNX: 0.017676768,
    bubbleDiameterNY: 0.012280698,
  });
}

function getGenerated200ItemPageLayout(physicalChoices: 4 | 5): TemplateLayout {
  // Mirrors services/templatePdfGenerator.ts for generated 200-item sheets.
  // The coordinates are normalized against the centers of the four 7mm corner
  // markers: page marker centers (6.5, 6.5) to (183.5, 270.5) on the
  // 190mm x 277mm printable page.
  const frameWidthMM = 177;
  const frameHeightMM = 264;
  const markerLeftMM = 6.5;
  const markerTopMM = 6.5;
  const headerSquareMM = 2.5;
  const labelWidthMM = 12;
  const bubbleMM = 3.8;
  const gapMM = 0.5;
  const blockGapMM = 3;
  const choiceHeaderMM = 5;
  const answerRowWidthMM =
    headerSquareMM +
    labelWidthMM +
    physicalChoices * bubbleMM +
    (physicalChoices + 1) * gapMM;
  const headerRowWidthMM =
    headerSquareMM +
    labelWidthMM +
    physicalChoices * choiceHeaderMM +
    (physicalChoices + 1) * gapMM;
  const blockWidthMM = Math.max(answerRowWidthMM, headerRowWidthMM);
  const firstBubbleXMM =
    headerSquareMM + gapMM + labelWidthMM + gapMM + bubbleMM / 2;
  const markerXMM = headerSquareMM / 2;
  const markerToBubbleYMM = headerSquareMM / 2 + 2 + bubbleMM / 2;
  const topFirstYMM = 110.8;
  const answerBandGapMM = 52.5;

  return build200ItemLayout({
    profileName: `generated-${physicalChoices}choice`,
    physicalChoices,
    firstBlockNX: (firstBubbleXMM - markerLeftMM) / frameWidthMM,
    blockSpacingNX: (blockWidthMM + blockGapMM) / frameWidthMM,
    bubbleSpacingNX: (bubbleMM + gapMM) / frameWidthMM,
    blockMarkerOffsetNX: (firstBubbleXMM - markerXMM) / frameWidthMM,
    blockMarkerOffsetNY: markerToBubbleYMM / frameHeightMM,
    topFirstNY: (topFirstYMM - markerTopMM) / frameHeightMM,
    bottomFirstNY:
      (topFirstYMM + answerBandGapMM - markerTopMM) / frameHeightMM,
    rowSpacingNY: (bubbleMM + 0.8) / frameHeightMM,
    bubbleDiameterNX: bubbleMM / frameWidthMM,
    bubbleDiameterNY: bubbleMM / frameHeightMM,
  });
}

function get200ItemPageLayout(physicalChoices: 4 | 5): TemplateLayout {
  return getGenerated200ItemPageLayout(physicalChoices);
}

function get200ItemPageLayoutCandidates(
  physicalChoices: 4 | 5,
): TemplateLayout[] {
  return [
    getGenerated200ItemPageLayout(physicalChoices),
    getLegacy200ItemPageLayout(physicalChoices),
  ];
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

  const shiftRadius = Math.max(
    8,
    Math.round(Math.max(bubbleRX, bubbleRY) * 1.8),
  );
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
      const { px, py } = mapTemplatePointToPixel(markers, nx, ny, orientation);
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
  const searchRadius = Math.max(
    10,
    Math.round(Math.max(bubbleRX, bubbleRY) * 4.6),
  );
  const searchStep = Math.max(
    2,
    Math.round(Math.min(bubbleRX, bubbleRY) * 0.45),
  );
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
  // Generated 200Q sheets are graded in the printed/upright orientation. The
  // old header-density heuristic can be fooled because the answer grid is much
  // darker than the logo/name area, so it often "decisively" prefers 180deg.
  // Keep the diagnostics, but avoid remapping exam answers through that guess.
  const orientation: PageOrientation = "normal";

  console.log(
    `[200Q-FAST] Orientation final: header=${headerOrientation}${headerIsDecisive ? "/decisive" : "/weak"}/diagnostic, marker=${markerOrientation}/diagnostic, markerScore normal=${normalScore.toFixed(1)}, rotated180=${rotatedScore.toFixed(1)} -> ${orientation}`,
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
  let bestCalibration: PageCalibration | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const layout of get200ItemPageLayoutCandidates(requestedChoices)) {
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
    const markerScore = scoreBlockMarkersForOrientation(
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
    const layoutPreference = layout.profileName.startsWith("generated") ? 2 : 0;
    const combinedScore = grid.score + markerScore * 0.45 + layoutPreference;

    console.log(
      `[200Q-FAST] Layout candidate ${layout.profileName}: orientation=${orientation}, grid=${grid.score.toFixed(1)}, markers=${markerScore.toFixed(1)}, combined=${combinedScore.toFixed(1)}`,
    );

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestCalibration = {
        layout,
        physicalChoices: requestedChoices,
        orientation,
        grid,
        score: combinedScore,
      };
    }
  }

  if (!bestCalibration) {
    throw new Error("Unable to calibrate 200-item answer grid.");
  }

  console.log(
    `[200Q-FAST] Using ${bestCalibration.layout.profileName} layout, orientation=${bestCalibration.orientation}, score=${bestCalibration.score.toFixed(1)}`,
  );

  return bestCalibration;
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

function getBandBlocks(
  layout: TemplateLayout,
  bandIndex: 0 | 1,
): AnswerBlock[] {
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
  const background = sampleFastLumaStatsAtOffsets(
    pixels,
    width,
    height,
    cx,
    cy,
    backgroundOffsets,
  );
  const paperMean = Math.max(background.mean, background.max * 0.92);
  const darkThreshold = Math.max(
    45,
    paperMean - Math.max(28, paperMean * 0.18),
  );
  const center = sampleFastLumaStatsAtOffsets(
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
  const searchRadius = Math.max(
    14,
    Math.round(Math.max(bubbleRX, bubbleRY) * 5.2),
  );
  const searchStep = Math.max(
    2,
    Math.round(Math.min(bubbleRX, bubbleRY) * 0.32),
  );
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
  const rowSpacingPx = Math.max(
    4,
    layout.answerBlocks[0].rowSpacingNY * frameSize.height,
  );
  const colSpacingPx = Math.max(
    4,
    layout.answerBlocks[0].bubbleSpacingNX * frameSize.width,
  );
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
      Math.max(baseRadius * 2, Math.round(maxBubbleR * 4)),
      fineStep,
    );
    markerScoreSum += markerAnchor.score;

    const markerAnchorDistanceFromBand = Math.hypot(
      markerAnchor.dx - baseDx,
      markerAnchor.dy - baseDy,
    );
    const maxMarkerAnchorDistance = Math.max(45, Math.round(maxBubbleR * 2.1));

    if (
      markerAnchor.score >= 95 &&
      markerAnchorDistanceFromBand <= maxMarkerAnchorDistance
    ) {
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

function histogramPercentile(
  histogram: ArrayLike<number>,
  total: number,
  percentile: number,
): number {
  if (total <= 0) return 255;

  const target = Math.max(
    0,
    Math.min(total - 1, Math.floor(total * percentile)),
  );
  let seen = 0;

  for (let value = 0; value < histogram.length; value++) {
    seen += histogram[value] || 0;
    if (seen > target) return value;
  }

  return 255;
}

function buildRectifiedLumaRoi(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  orientation: PageOrientation,
  roiX0: number,
  roiY0: number,
  roiX1: number,
  roiY1: number,
  rectWidth: number,
  rectHeight: number,
): { luma: Uint8Array; threshold: number } {
  const luma = new Uint8Array(rectWidth * rectHeight);
  const histogram = new Array(256).fill(0);
  const roiW = roiX1 - roiX0;
  const roiH = roiY1 - roiY0;
  const toPixel: ProjectiveMapper =
    orientation === "rotated180"
      ? (nx: number, ny: number) => mapToPixel(markers, 1 - nx, 1 - ny)
      : (nx: number, ny: number) => mapToPixel(markers, nx, ny);

  for (let y = 0; y < rectHeight; y++) {
    const ny = roiY0 + ((y + 0.5) / rectHeight) * roiH;
    for (let x = 0; x < rectWidth; x++) {
      const nx = roiX0 + ((x + 0.5) / rectWidth) * roiW;
      const point = toPixel(nx, ny);
      const px = clamp(Math.round(point.px), 0, width - 1);
      const py = clamp(Math.round(point.py), 0, height - 1);
      const value = lumaAt(pixels, width, px, py);
      luma[y * rectWidth + x] = value;
      histogram[value]++;
    }
  }

  const total = rectWidth * rectHeight;
  const median = histogramPercentile(histogram, total, 0.5);
  const p10 = histogramPercentile(histogram, total, 0.1);
  const p25 = histogramPercentile(histogram, total, 0.25);
  const threshold = clamp(
    Math.min(median - 32, p25 - 14, p10 + 52, median * 0.78),
    72,
    182,
  );

  return { luma, threshold };
}

function findRectifiedBubbleCandidates(
  luma: Uint8Array,
  rectWidth: number,
  rectHeight: number,
  threshold: number,
  expectedBubblePx: number,
): RectifiedBubbleCandidate[] {
  const seen = new Uint8Array(luma.length);
  const stack: number[] = [];
  const candidates: RectifiedBubbleCandidate[] = [];
  const minDim = Math.max(5, expectedBubblePx * 0.42);
  const maxDim = Math.max(12, expectedBubblePx * 2.05);
  const minArea = Math.max(8, expectedBubblePx * expectedBubblePx * 0.08);
  const maxArea = expectedBubblePx * expectedBubblePx * 1.4;

  for (let i = 0; i < luma.length; i++) {
    if (seen[i] || luma[i] > threshold) continue;

    seen[i] = 1;
    stack.length = 0;
    stack.push(i);

    let area = 0;
    let minX = rectWidth;
    let maxX = 0;
    let minY = rectHeight;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;

    while (stack.length > 0) {
      const cur = stack.pop()!;
      const x = cur % rectWidth;
      const y = Math.floor(cur / rectWidth);
      area++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;

      if (x > 0) {
        const left = cur - 1;
        if (!seen[left] && luma[left] <= threshold) {
          seen[left] = 1;
          stack.push(left);
        }
      }
      if (x < rectWidth - 1) {
        const right = cur + 1;
        if (!seen[right] && luma[right] <= threshold) {
          seen[right] = 1;
          stack.push(right);
        }
      }
      if (y > 0) {
        const up = cur - rectWidth;
        if (!seen[up] && luma[up] <= threshold) {
          seen[up] = 1;
          stack.push(up);
        }
      }
      if (y < rectHeight - 1) {
        const down = cur + rectWidth;
        if (!seen[down] && luma[down] <= threshold) {
          seen[down] = 1;
          stack.push(down);
        }
      }
    }

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    const aspect = boxW / Math.max(1, boxH);
    const density = area / Math.max(1, boxW * boxH);

    if (boxW < minDim || boxH < minDim) continue;
    if (boxW > maxDim || boxH > maxDim) continue;
    if (area < minArea || area > maxArea) continue;
    if (aspect < 0.55 || aspect > 1.8) continue;
    if (density < 0.08 || density > 0.92) continue;

    const avgDim = (boxW + boxH) / 2;
    const sizeScore = Math.exp(
      -Math.abs(Math.log(avgDim / Math.max(1, expectedBubblePx))) * 1.1,
    );
    const aspectScore = Math.exp(-Math.abs(Math.log(aspect)) * 1.4);
    const densityScore = density < 0.18 ? density / 0.18 : 1;

    candidates.push({
      x: sumX / area,
      y: sumY / area,
      width: boxW,
      height: boxH,
      area,
      density,
      score: area * sizeScore * aspectScore * densityScore,
    });
  }

  return candidates;
}

function clusterCandidatesByAxis(
  candidates: readonly RectifiedBubbleCandidate[],
  axis: "x" | "y",
  tolerancePx: number,
): AxisCluster[] {
  const sorted = [...candidates].sort((a, b) => a[axis] - b[axis]);
  const clusters: AxisCluster[] = [];

  for (const candidate of sorted) {
    const value = candidate[axis];
    const last = clusters[clusters.length - 1];

    if (last && Math.abs(value - last.center) <= tolerancePx) {
      last.items.push(candidate);
      last.count++;
      last.score += candidate.score;
      const weight = Math.max(1, candidate.score);
      const existingWeight = Math.max(1, last.score - candidate.score);
      last.center =
        (last.center * existingWeight + value * weight) /
        (existingWeight + weight);
    } else {
      clusters.push({
        center: value,
        count: 1,
        score: candidate.score,
        items: [candidate],
      });
    }
  }

  return clusters;
}

function selectAnswerRows(
  candidates: readonly RectifiedBubbleCandidate[],
  physicalChoices: 4 | 5,
  expectedBubblePx: number,
): [AxisCluster[], AxisCluster[]] | null {
  const totalColumns = physicalChoices * 5;
  const minRowCount = Math.max(8, Math.floor(totalColumns * 0.48));
  const rowClusters = clusterCandidatesByAxis(
    candidates,
    "y",
    Math.max(5, expectedBubblePx * 0.48),
  ).filter((cluster) => cluster.count >= minRowCount);

  if (rowClusters.length < 18) return null;

  const strongestRows = [...rowClusters]
    .sort((a, b) => b.count - a.count || b.score - a.score)
    .slice(0, Math.min(24, rowClusters.length))
    .sort((a, b) => a.center - b.center);

  if (strongestRows.length < 20) return null;

  let splitAfter = 9;
  let largestGap = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < strongestRows.length - 1; i++) {
    const gap = strongestRows[i + 1].center - strongestRows[i].center;
    if (gap > largestGap) {
      largestGap = gap;
      splitAfter = i;
    }
  }

  let topRows = strongestRows.slice(0, splitAfter + 1);
  let bottomRows = strongestRows.slice(splitAfter + 1);

  if (topRows.length < 10 || bottomRows.length < 10) {
    topRows = strongestRows.slice(0, 10);
    bottomRows = strongestRows.slice(strongestRows.length - 10);
  } else {
    topRows = topRows
      .sort((a, b) => b.count - a.count || b.score - a.score)
      .slice(0, 10)
      .sort((a, b) => a.center - b.center);
    bottomRows = bottomRows
      .sort((a, b) => b.count - a.count || b.score - a.score)
      .slice(0, 10)
      .sort((a, b) => a.center - b.center);
  }

  return topRows.length === 10 && bottomRows.length === 10
    ? [topRows, bottomRows]
    : null;
}

function rowCandidateSubset(
  candidates: readonly RectifiedBubbleCandidate[],
  rows: readonly AxisCluster[],
  expectedBubblePx: number,
): RectifiedBubbleCandidate[] {
  const tolerance = Math.max(5, expectedBubblePx * 0.58);
  return candidates.filter((candidate) =>
    rows.some((row) => Math.abs(candidate.y - row.center) <= tolerance),
  );
}

function extractColumnGroups(
  candidates: readonly RectifiedBubbleCandidate[],
  rows: readonly AxisCluster[],
  physicalChoices: 4 | 5,
  expectedBubblePx: number,
): {
  groups: AxisCluster[][];
  rowCandidates: RectifiedBubbleCandidate[];
} | null {
  const rowCandidates = rowCandidateSubset(candidates, rows, expectedBubblePx);
  const minColumnCount = Math.max(4, Math.floor(rows.length * 0.42));
  const xClusters = clusterCandidatesByAxis(
    rowCandidates,
    "x",
    Math.max(5, expectedBubblePx * 0.5),
  )
    .filter((cluster) => cluster.count >= minColumnCount)
    .sort((a, b) => a.center - b.center);

  const minChoiceGap = expectedBubblePx * 0.55;
  const maxChoiceGap = expectedBubblePx * 1.85;
  const groups: AxisCluster[][] = [];
  let i = 0;

  while (i <= xClusters.length - physicalChoices && groups.length < 5) {
    const group = xClusters.slice(i, i + physicalChoices);
    const gaps = group
      .slice(1)
      .map((cluster, idx) => cluster.center - group[idx].center);
    const looksLikeChoices =
      gaps.length === physicalChoices - 1 &&
      gaps.every((gap) => gap >= minChoiceGap && gap <= maxChoiceGap);

    if (looksLikeChoices) {
      groups.push(group);
      i += physicalChoices;
    } else {
      i++;
    }
  }

  if (groups.length === 5) {
    return { groups, rowCandidates };
  }

  // Last resort: choose the strongest columns, then preserve physical order.
  const expectedColumns = physicalChoices * 5;
  if (xClusters.length >= expectedColumns) {
    const strongest = [...xClusters]
      .sort((a, b) => b.count - a.count || b.score - a.score)
      .slice(0, expectedColumns)
      .sort((a, b) => a.center - b.center);
    return {
      groups: Array.from({ length: 5 }, (_, groupIndex) =>
        strongest.slice(
          groupIndex * physicalChoices,
          (groupIndex + 1) * physicalChoices,
        ),
      ),
      rowCandidates,
    };
  }

  return null;
}

function findNearestRectifiedCandidate(
  candidates: readonly RectifiedBubbleCandidate[],
  x: number,
  y: number,
  radius: number,
): RectifiedBubbleCandidate | null {
  let best: RectifiedBubbleCandidate | null = null;
  let bestDistance = radius;

  for (const candidate of candidates) {
    const dist = Math.hypot(candidate.x - x, candidate.y - y);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = candidate;
    }
  }

  return best;
}

function detectAdaptiveGrid(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  physicalChoices: 4 | 5,
  orientation: PageOrientation,
  rectWidth: number,
): AdaptiveGrid | null {
  const roiX0 = -0.02;
  const roiX1 = 1.04;
  const roiY0 = 0.22;
  const roiY1 = 0.84;
  const frameAspect = 264 / 177;
  const rectHeight = Math.round(
    rectWidth * frameAspect * ((roiY1 - roiY0) / (roiX1 - roiX0)),
  );
  const expectedBubblePx = (3.8 / 177) * rectWidth;
  const { luma, threshold } = buildRectifiedLumaRoi(
    pixels,
    width,
    height,
    markers,
    orientation,
    roiX0,
    roiY0,
    roiX1,
    roiY1,
    rectWidth,
    rectHeight,
  );
  const candidates = findRectifiedBubbleCandidates(
    luma,
    rectWidth,
    rectHeight,
    threshold,
    expectedBubblePx,
  );
  const rows = selectAnswerRows(candidates, physicalChoices, expectedBubblePx);

  if (!rows) {
    console.log(
      `[200Q-FAST] Adaptive grid failed (${orientation}): components=${candidates.length}, threshold=${threshold.toFixed(0)}, rows=0`,
    );
    return null;
  }

  const topColumns = extractColumnGroups(
    candidates,
    rows[0],
    physicalChoices,
    expectedBubblePx,
  );
  const bottomColumns = extractColumnGroups(
    candidates,
    rows[1],
    physicalChoices,
    expectedBubblePx,
  );

  if (!topColumns || !bottomColumns) {
    console.log(
      `[200Q-FAST] Adaptive grid failed (${orientation}): components=${candidates.length}, threshold=${threshold.toFixed(0)}, topCols=${topColumns ? 5 : 0}, bottomCols=${bottomColumns ? 5 : 0}`,
    );
    return null;
  }

  console.log(
    `[200Q-FAST] Adaptive grid (${orientation}, w=${rectWidth}): components=${candidates.length}, threshold=${threshold.toFixed(0)}, rows=${rows[0].length}+${rows[1].length}, cols=${topColumns.groups.length * physicalChoices}+${bottomColumns.groups.length * physicalChoices}`,
  );

  return {
    orientation,
    roiX0,
    roiY0,
    roiX1,
    roiY1,
    rectWidth,
    rectHeight,
    expectedBubblePx,
    componentCount: candidates.length,
    bands: [
      {
        rows: rows[0],
        columnGroups: topColumns.groups,
        candidates: topColumns.rowCandidates,
      },
      {
        rows: rows[1],
        columnGroups: bottomColumns.groups,
        candidates: bottomColumns.rowCandidates,
      },
    ],
  };
}

function rectifiedToTemplatePoint(
  grid: AdaptiveGrid,
  x: number,
  y: number,
): { nx: number; ny: number } {
  return {
    nx: grid.roiX0 + (x / grid.rectWidth) * (grid.roiX1 - grid.roiX0),
    ny: grid.roiY0 + (y / grid.rectHeight) * (grid.roiY1 - grid.roiY0),
  };
}

function chooseMarkedChoice(fills: BubbleInteriorSample[]): string {
  const byBrightness = [...fills].sort((a, b) => a.brightness - b.brightness);
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

  if (best.score >= 7 && scoreGap >= 0.35) {
    return best.choice;
  }
  if (scoreGap >= 1.75 && best.contrast >= 1.5) {
    return best.choice;
  }
  if (
    bestIsDarkest &&
    absoluteGap >= 1.25 &&
    brightnessSpread >= 1.75 &&
    best.score >= 2
  ) {
    return best.choice;
  }
  if (scoreSpread >= 2.25 && best.score >= 2.25 && scoreGap >= 0.12) {
    return best.choice;
  }
  if (
    bestIsDarkest &&
    brightnessSpread >= 0.8 &&
    best.brightness <= mean - 0.2 &&
    best.score >= 1.25
  ) {
    return best.choice;
  }

  return "";
}

function scan200ItemPageWithAdaptiveGrid(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  physicalChoices: 4 | 5,
  centerOffsets: readonly PixelOffset[],
  backgroundOffsets: readonly PixelOffset[],
): StudentAnswer[] | null {
  const adaptiveRectWidths = [760, 920] as const;
  let grid: AdaptiveGrid | null = null;

  for (const rectWidth of adaptiveRectWidths) {
    grid =
      detectAdaptiveGrid(
        pixels,
        width,
        height,
        markers,
        physicalChoices,
        "normal",
        rectWidth,
      ) ??
      detectAdaptiveGrid(
        pixels,
        width,
        height,
        markers,
        physicalChoices,
        "rotated180",
        rectWidth,
      );

    if (grid) break;
  }

  if (!grid) return null;

  const choiceLabels = "ABCDE".slice(0, physicalChoices).split("");
  const answers: StudentAnswer[] = [];
  const bandStarts = [
    [1, 21, 41, 61, 81],
    [11, 31, 51, 71, 91],
  ];
  const snapRadius = Math.max(5, grid.expectedBubblePx * 0.62);

  for (let bandIndex = 0; bandIndex < 2; bandIndex++) {
    const band = grid.bands[bandIndex];

    for (let blockIndex = 0; blockIndex < 5; blockIndex++) {
      const startQ = bandStarts[bandIndex][blockIndex];
      const columns = band.columnGroups[blockIndex];

      for (let row = 0; row < 10; row++) {
        const fills: BubbleInteriorSample[] = [];
        const rowY = band.rows[row].center;

        for (let choice = 0; choice < physicalChoices; choice++) {
          const colX = columns[choice].center;
          const snapped = findNearestRectifiedCandidate(
            band.candidates,
            colX,
            rowY,
            snapRadius,
          );
          const point = rectifiedToTemplatePoint(
            grid,
            snapped?.x ?? colX,
            snapped?.y ?? rowY,
          );
          const pixelPoint = mapTemplatePointToPixel(
            markers,
            point.nx,
            point.ny,
            grid.orientation,
          );
          const sample = sampleBubbleMarkRaw(
            pixels,
            width,
            height,
            pixelPoint.px,
            pixelPoint.py,
            centerOffsets,
            backgroundOffsets,
          );

          fills.push({
            choice: choiceLabels[choice],
            brightness: sample.mean,
            minLuma: sample.minLuma,
            darkRatio: sample.darkRatio,
            paperMean: sample.paperMean,
            contrast: sample.contrast,
            p25: sample.p25,
            score: 0,
          });
        }

        const selectedChoice = chooseMarkedChoice(fills);
        answers.push({
          questionNumber: startQ + row,
          selectedAnswer: selectedChoice,
        });
      }
    }
  }

  console.log(
    `[200Q-FAST] Using adaptive bubble grid (${grid.componentCount} components)`,
  );

  return answers.sort((a, b) => a.questionNumber - b.questionNumber);
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
  const adaptiveAnswers = scan200ItemPageWithAdaptiveGrid(
    pixels,
    width,
    height,
    markers,
    requestedChoices,
    centerOffsets,
    backgroundOffsets,
  );

  if (adaptiveAnswers) {
    return adaptiveAnswers;
  }

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
  const reliableAnchors = blockAnchors.filter((anchor) => anchor.reliable);
  const reliableAnchorCount = reliableAnchors.length;
  const anchorDxValues = reliableAnchors.map((anchor) => anchor.dx);
  const anchorDyValues = reliableAnchors.map((anchor) => anchor.dy);
  const anchorDxRange =
    anchorDxValues.length > 0
      ? Math.max(...anchorDxValues) - Math.min(...anchorDxValues)
      : Number.POSITIVE_INFINITY;
  const anchorDyRange =
    anchorDyValues.length > 0
      ? Math.max(...anchorDyValues) - Math.min(...anchorDyValues)
      : Number.POSITIVE_INFINITY;
  const maxCoherentAnchorRange = Math.max(
    55,
    Math.round(Math.max(bubbleRX, bubbleRY) * 2.4),
  );
  const hasStrongPerBlockAnchors = reliableAnchorCount >= 8;
  const hasCoherentAnchorGrid =
    reliableAnchorCount >= 7 &&
    anchorDxRange <= maxCoherentAnchorRange &&
    anchorDyRange <= maxCoherentAnchorRange;
  const useAnchorGrid =
    hasStrongPerBlockAnchors || hasCoherentAnchorGrid;

  if (reliableAnchorCount >= 7 && !useAnchorGrid) {
    console.log(
      `[200Q-FAST] Block anchors rejected: reliable=${reliableAnchorCount}/10, dxRange=${Math.round(anchorDxRange)}, dyRange=${Math.round(anchorDyRange)}, max=${maxCoherentAnchorRange}`,
    );
  }
  if (
    useAnchorGrid &&
    hasStrongPerBlockAnchors &&
    !hasCoherentAnchorGrid
  ) {
    console.log(
      `[200Q-FAST] Using per-block anchors: reliable=${reliableAnchorCount}/10, dxRange=${Math.round(anchorDxRange)}, dyRange=${Math.round(anchorDyRange)}`,
    );
  }

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
    const useBlockAnchor = useAnchorGrid && blockAnchor.reliable;
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
      let rowOffset: PixelOffset;

      if (useBlockAnchor) {
        rowOffset = { dx: 0, dy: 0 };
      } else if (!bandCalibration) {
        rowOffset = findBestQuestionRowOffsetForPoints(
          pixels,
          width,
          height,
          choicePoints,
          centerOffsets,
          backgroundOffsets,
          bubbleRX,
          bubbleRY,
        );
      } else {
        rowOffset = findBestQuestionRowOffset(
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
      }

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

  const minDim = Math.max(8, Math.min(imageW, imageH) * 0.0085);
  const maxDim = Math.min(imageW, imageH) * 0.055;

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
    if (density < 0.16) continue;

    const centerX = x0 + (minGX + maxGX + 1) * step * 0.5;
    const centerY = y0 + (minGY + maxGY + 1) * step * 0.5;
    const targetDist =
      Math.hypot(centerX - window.targetX, centerY - window.targetY) /
      Math.hypot(imageW, imageH);
    if (targetDist > 0.42) continue;
    const squareScore = 1 - Math.min(0.7, Math.abs(Math.log(aspect)));
    const expectedMarkerDim = Math.min(imageW, imageH) * 0.026;
    const avgDim = (compW + compH) / 2;
    const sizeScore = Math.max(
      0.12,
      Math.exp(
        -Math.abs(Math.log(avgDim / Math.max(1, expectedMarkerDim))) * 1.15,
      ),
    );
    const targetScore = Math.exp(-targetDist * 11);
    const score =
      Math.sqrt(count) *
      density *
      (0.8 + squareScore) *
      sizeScore *
      targetScore;

    if (!best || score > best.score) {
      best = { x: centerX, y: centerY, width: compW, height: compH, score };
    }
  }

  return best;
}

function buildCornerWindows(
  width: number,
  height: number,
  xBandRatio: number,
  yBandRatio: number,
): CornerWindow[] {
  const xBand = width * xBandRatio;
  const yBand = height * yBandRatio;

  return [
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
}

function collectCornerMarkers(
  pixels: Uint8Array,
  width: number,
  height: number,
  windows: CornerWindow[],
  step: number,
): CornerDetectionAttempt {
  const markers: Partial<Record<CornerKey, MarkerCandidate>> = {};
  let foundCount = 0;
  let scoreSum = 0;

  for (const window of windows) {
    const candidate = findCornerMarker(pixels, width, height, window, step);
    if (!candidate) continue;
    markers[window.key] = candidate;
    foundCount++;
    scoreSum += candidate.score;
  }

  return {
    label: `${Math.round(((windows[0].x1 + 1) / width) * 100)}x${Math.round(((windows[0].y1 + 1) / height) * 100)}@${step}`,
    foundCount,
    scoreSum,
    markers,
  };
}

function defaultCornerPoint(
  key: CornerKey,
  width: number,
  height: number,
): { x: number; y: number } {
  const insetX = width * 0.055;
  const insetY = height * 0.055;

  switch (key) {
    case "topLeft":
      return { x: insetX, y: insetY };
    case "topRight":
      return { x: width - insetX, y: insetY };
    case "bottomLeft":
      return { x: insetX, y: height - insetY };
    case "bottomRight":
      return { x: width - insetX, y: height - insetY };
  }
}

function clampPointToFrame(
  point: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const insetX = width * 0.015;
  const insetY = height * 0.015;
  return {
    x: clamp(point.x, insetX, width - insetX),
    y: clamp(point.y, insetY, height - insetY),
  };
}

function inferMissingCorner(
  key: CornerKey,
  known: Partial<Record<CornerKey, { x: number; y: number }>>,
  width: number,
  height: number,
): { x: number; y: number } | null {
  let inferred: { x: number; y: number } | null = null;

  if (
    key === "topLeft" &&
    known.topRight &&
    known.bottomLeft &&
    known.bottomRight
  ) {
    inferred = {
      x: known.topRight.x + known.bottomLeft.x - known.bottomRight.x,
      y: known.topRight.y + known.bottomLeft.y - known.bottomRight.y,
    };
  } else if (
    key === "topRight" &&
    known.topLeft &&
    known.bottomLeft &&
    known.bottomRight
  ) {
    inferred = {
      x: known.topLeft.x + known.bottomRight.x - known.bottomLeft.x,
      y: known.topLeft.y + known.bottomRight.y - known.bottomLeft.y,
    };
  } else if (
    key === "bottomLeft" &&
    known.topLeft &&
    known.topRight &&
    known.bottomRight
  ) {
    inferred = {
      x: known.topLeft.x + known.bottomRight.x - known.topRight.x,
      y: known.topLeft.y + known.bottomRight.y - known.topRight.y,
    };
  } else if (
    key === "bottomRight" &&
    known.topLeft &&
    known.topRight &&
    known.bottomLeft
  ) {
    inferred = {
      x: known.topRight.x + known.bottomLeft.x - known.topLeft.x,
      y: known.topRight.y + known.bottomLeft.y - known.topLeft.y,
    };
  }

  return inferred ? clampPointToFrame(inferred, width, height) : null;
}

function buildMarkersFromAttempt(
  attempt: CornerDetectionAttempt,
  width: number,
  height: number,
): { markers: Markers; synthesized: CornerKey[] } {
  const points: Partial<Record<CornerKey, { x: number; y: number }>> = {};
  const synthesized: CornerKey[] = [];

  (Object.keys(attempt.markers) as CornerKey[]).forEach((key) => {
    const marker = attempt.markers[key];
    if (!marker) return;
    points[key] = { x: marker.x, y: marker.y };
  });

  (["topLeft", "topRight", "bottomLeft", "bottomRight"] as CornerKey[]).forEach(
    (key) => {
      if (points[key]) return;
      const inferred = inferMissingCorner(key, points, width, height);
      points[key] = inferred ?? defaultCornerPoint(key, width, height);
      synthesized.push(key);
    },
  );

  return {
    markers: {
      topLeft: points.topLeft!,
      topRight: points.topRight!,
      bottomLeft: points.bottomLeft!,
      bottomRight: points.bottomRight!,
    },
    synthesized,
  };
}

function isPlausible200ItemGeometry(
  markers: Markers,
  width: number,
  height: number,
  minCoverageRatio: number,
): boolean {
  const topWidth = Math.abs(markers.topRight.x - markers.topLeft.x);
  const bottomWidth = Math.abs(markers.bottomRight.x - markers.bottomLeft.x);
  const leftHeight = Math.abs(markers.bottomLeft.y - markers.topLeft.y);
  const rightHeight = Math.abs(markers.bottomRight.y - markers.topRight.y);

  return !(
    topWidth < width * minCoverageRatio ||
    bottomWidth < width * minCoverageRatio ||
    leftHeight < height * minCoverageRatio ||
    rightHeight < height * minCoverageRatio
  );
}

function hasStrongCornerPlacement(
  markers: Markers,
  width: number,
  height: number,
): boolean {
  const topMaxY = Math.max(markers.topLeft.y, markers.topRight.y) / height;
  const bottomMinY =
    Math.min(markers.bottomLeft.y, markers.bottomRight.y) / height;
  const leftMaxX = Math.max(markers.topLeft.x, markers.bottomLeft.x) / width;
  const rightMinX = Math.min(markers.topRight.x, markers.bottomRight.x) / width;
  const topSkew = Math.abs(markers.topLeft.y - markers.topRight.y) / height;
  const bottomSkew =
    Math.abs(markers.bottomLeft.y - markers.bottomRight.y) / height;

  return (
    topMaxY <= 0.24 &&
    bottomMinY >= 0.72 &&
    leftMaxX <= 0.24 &&
    rightMinX >= 0.72 &&
    topSkew <= 0.2 &&
    bottomSkew <= 0.2
  );
}

function detect200ItemCornerMarkers(
  pixels: Uint8Array,
  width: number,
  height: number,
): Markers {
  const step = Math.max(4, Math.round(Math.min(width, height) / 750));
  const attemptConfigs = [
    { xBand: 0.22, yBand: 0.22, stepDelta: 1 },
    { xBand: 0.28, yBand: 0.28, stepDelta: 0 },
    { xBand: 0.34, yBand: 0.34, stepDelta: -1 },
    { xBand: 0.42, yBand: 0.42, stepDelta: -2 },
  ] as const;

  const attempts = attemptConfigs.map((config) =>
    collectCornerMarkers(
      pixels,
      width,
      height,
      buildCornerWindows(width, height, config.xBand, config.yBand),
      Math.max(2, step + config.stepDelta),
    ),
  );

  const bestAttempt = [...attempts].sort((a, b) => {
    if (b.foundCount !== a.foundCount) return b.foundCount - a.foundCount;
    return b.scoreSum - a.scoreSum;
  })[0];

  const evaluatedAttempts = attempts.map((attempt) => {
    const built = buildMarkersFromAttempt(attempt, width, height);
    const strongPlacement = hasStrongCornerPlacement(
      built.markers,
      width,
      height,
    );
    const plausibleGeometry = isPlausible200ItemGeometry(
      built.markers,
      width,
      height,
      0.36,
    );

    return {
      attempt,
      markers: built.markers,
      synthesized: built.synthesized,
      strongPlacement,
      plausibleGeometry,
    };
  });

  const strictCandidates = evaluatedAttempts.filter(
    (entry) =>
      entry.attempt.foundCount === 4 &&
      entry.synthesized.length === 0 &&
      entry.strongPlacement &&
      entry.plausibleGeometry,
  );

  if (strictCandidates.length === 0) {
    const bestBuilt = buildMarkersFromAttempt(bestAttempt, width, height);
    console.warn(
      `[200Q-FAST] Corner marker rejected: found=${bestAttempt.foundCount}/4 using attempt=${bestAttempt.label}, synthesized=${bestBuilt.synthesized.join(",") || "none"}`,
    );
    throw new Error(
      "Could not detect all 4 corner boxes on the 200-item sheet. Retake with the full sheet visible and all four edge boxes inside the frame.",
    );
  }

  const chosen = strictCandidates[0];
  const markers = chosen.markers;
  const topMaxY = Math.max(markers.topLeft.y, markers.topRight.y) / height;
  const bottomMinY =
    Math.min(markers.bottomLeft.y, markers.bottomRight.y) / height;
  const leftMaxX = Math.max(markers.topLeft.x, markers.bottomLeft.x) / width;
  const rightMinX = Math.min(markers.topRight.x, markers.bottomRight.x) / width;

  console.log(
    "[200Q-FAST] Corner markers:",
    `TL=(${Math.round(markers.topLeft.x)},${Math.round(markers.topLeft.y)})`,
    `TR=(${Math.round(markers.topRight.x)},${Math.round(markers.topRight.y)})`,
    `BL=(${Math.round(markers.bottomLeft.x)},${Math.round(markers.bottomLeft.y)})`,
    `BR=(${Math.round(markers.bottomRight.x)},${Math.round(markers.bottomRight.y)})`,
  );
  console.log(
    `[200Q-FAST] Corner placement: topMaxY=${topMaxY.toFixed(3)}, bottomMinY=${bottomMinY.toFixed(3)}, leftMaxX=${leftMaxX.toFixed(3)}, rightMinX=${rightMinX.toFixed(3)}`,
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
