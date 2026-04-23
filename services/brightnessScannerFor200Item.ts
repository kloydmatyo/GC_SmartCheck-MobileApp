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
  const topX =
    markers.topLeft.x + nx * (markers.topRight.x - markers.topLeft.x);
  const topY =
    markers.topLeft.y + nx * (markers.topRight.y - markers.topLeft.y);
  const botX =
    markers.bottomLeft.x + nx * (markers.bottomRight.x - markers.bottomLeft.x);
  const botY =
    markers.bottomLeft.y + nx * (markers.bottomRight.y - markers.bottomLeft.y);

  return {
    px: topX + ny * (botX - topX),
    py: topY + ny * (botY - topY),
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

function sampleBestBubbleCenterBrightness(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  centerOffsets: readonly PixelOffset[],
  searchRadius: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  const step = Math.max(1, Math.round(searchRadius / 2));

  for (let dy = -searchRadius; dy <= searchRadius; dy += step) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
      const brightness = sampleBubbleAtOffsets(
        pixels,
        width,
        height,
        cx + dx,
        cy + dy,
        centerOffsets,
      );
      best = Math.min(best, brightness);
    }
  }

  return best;
}

function buildOffsetCandidates(radius: number, step: number): number[] {
  const result = [0];
  for (let d = step; d <= radius; d += step) {
    result.push(-d, d);
  }
  return result.sort((a, b) => a - b);
}

function get200ItemPageLayout(): TemplateLayout {
  // Measured from the provided 200_Answer_Sheet.pdf.
  // Coordinates are normalized against the four 8mm corner-marker centers.
  const firstBubbleNX = [
    0.081228956,
    0.271043771,
    0.460858586,
    0.650673401,
    0.840488215,
  ];
  const topFirstNY = 0.280701672;
  const bottomFirstNY = 0.498246014;
  const bubbleSpacingNX = 0.027777778;
  const rowSpacingNY = 0.018245609;

  return {
    answerBlocks: [
      {
        startQ: 1,
        endQ: 10,
        firstBubbleNX: firstBubbleNX[0],
        firstBubbleNY: topFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 21,
        endQ: 30,
        firstBubbleNX: firstBubbleNX[1],
        firstBubbleNY: topFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 41,
        endQ: 50,
        firstBubbleNX: firstBubbleNX[2],
        firstBubbleNY: topFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 61,
        endQ: 70,
        firstBubbleNX: firstBubbleNX[3],
        firstBubbleNY: topFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 81,
        endQ: 90,
        firstBubbleNX: firstBubbleNX[4],
        firstBubbleNY: topFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 11,
        endQ: 20,
        firstBubbleNX: firstBubbleNX[0],
        firstBubbleNY: bottomFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 31,
        endQ: 40,
        firstBubbleNX: firstBubbleNX[1],
        firstBubbleNY: bottomFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 51,
        endQ: 60,
        firstBubbleNX: firstBubbleNX[2],
        firstBubbleNY: bottomFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 71,
        endQ: 80,
        firstBubbleNX: firstBubbleNX[3],
        firstBubbleNY: bottomFirstNY,
        bubbleSpacingNX,
        rowSpacingNY,
      },
      {
        startQ: 91,
        endQ: 100,
        firstBubbleNX: firstBubbleNX[4],
        firstBubbleNY: bottomFirstNY,
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
): PixelPoint[] {
  const points: PixelPoint[] = [];

  for (const block of layout.answerBlocks) {
    for (let row = 0; row < 10; row++) {
      for (let choice = 0; choice < choicesPerQuestion; choice++) {
        const nx = block.firstBubbleNX + choice * block.bubbleSpacingNX;
        const ny = block.firstBubbleNY + row * block.rowSpacingNY;
        const { px, py } = mapToPixel(markers, nx, ny);
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
): GridCalibration {
  const allPoints = getExpectedGridPoints(markers, layout, choicesPerQuestion);
  const centerX =
    allPoints.reduce((sum, point) => sum + point.x, 0) / allPoints.length;
  const centerY =
    allPoints.reduce((sum, point) => sum + point.y, 0) / allPoints.length;

  // Use a stable subset spread across the page so calibration is based on
  // printed bubble outlines, not on which answers happen to be shaded.
  const calibrationPoints = allPoints.filter((_, idx) => {
    const choice = idx % choicesPerQuestion;
    const row = Math.floor(idx / choicesPerQuestion) % 10;
    return (choice === 0 || choice === 2 || choice === 4) && row % 3 === 0;
  });

  const shiftRadius = Math.max(8, Math.round(Math.max(bubbleRX, bubbleRY) * 1.8));
  const shiftStep = Math.max(2, Math.round(shiftRadius / 3));
  const shifts = buildOffsetCandidates(shiftRadius, shiftStep);
  const scales = [0.94, 0.97, 1, 1.03, 1.06];
  let best: GridCalibration = { centerX, centerY, dx: 0, dy: 0, scaleX: 1, scaleY: 1 };
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
            best = { centerX, centerY, dx, dy, scaleX, scaleY };
          }
        }
      }
    }
  }

  console.log(
    `[200Q-FAST] Grid calibration: dx=${best.dx}, dy=${best.dy}, scaleX=${best.scaleX.toFixed(2)}, scaleY=${best.scaleY.toFixed(2)}, score=${bestScore.toFixed(1)}`,
  );

  return best;
}

function scan200ItemPagePixelsWithBrightness(
  pixels: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  choicesPerQuestion: 4 | 5,
): StudentAnswer[] {
  const layout = get200ItemPageLayout();
  const effectiveChoices = choicesPerQuestion === 4 ? 4 : 5;
  const choiceLabels = "ABCDE".slice(0, effectiveChoices).split("");
  const answers: StudentAnswer[] = [];
  const frameW = markers.topRight.x - markers.topLeft.x;
  const frameH = markers.bottomLeft.y - markers.topLeft.y;
  const bubbleRX = (layout.bubbleDiameterNX * frameW) / 2;
  const bubbleRY = (layout.bubbleDiameterNY * frameH) / 2;
  const centerOffsets = buildSampleOffsets(bubbleRX, bubbleRY, 0.42, 5, true);
  const ringOffsets = buildRingOffsets(bubbleRX, bubbleRY);
  const gridCalibration = findGridCalibration(
    pixels,
    width,
    height,
    markers,
    layout,
    effectiveChoices,
    bubbleRX,
    bubbleRY,
    ringOffsets,
  );

  for (const block of layout.answerBlocks) {
    let blockDx = 0;
    let blockDy = 0;
    const probeRows = [0, 3, 6, 9];
    const localRadius = Math.max(
      4,
      Math.round(Math.max(bubbleRX, bubbleRY) * 0.8),
    );
    const localStep = Math.max(2, Math.round(localRadius / 2));
    const localCandidates = buildOffsetCandidates(localRadius, localStep);
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const localDy of localCandidates) {
      for (const localDx of localCandidates) {
        const candDx = localDx;
        const candDy = localDy;
        let score = 0;
        let samples = 0;

        for (const row of probeRows) {
          for (let c = 0; c < effectiveChoices; c++) {
            const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
            const ny = block.firstBubbleNY + row * block.rowSpacingNY;
            const { px, py } = mapToPixel(markers, nx, ny);
            const calibrated = applyGridCalibration(
              { x: px, y: py },
              gridCalibration,
            );
            score += sampleBubbleInkScore(
              pixels,
              width,
              height,
              calibrated.x + candDx,
              calibrated.y + candDy,
              ringOffsets,
            );
            samples++;
          }
        }

        if (samples > 0) score /= samples;
        if (score > bestScore) {
          bestScore = score;
          blockDx = candDx;
          blockDy = candDy;
        }
      }
    }

    for (let q = block.startQ; q <= block.endQ; q++) {
      const rowInBlock = q - block.startQ;
      const fills: { choice: string; brightness: number }[] = [];

      for (let c = 0; c < effectiveChoices; c++) {
        const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
        const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
        const { px, py } = mapToPixel(markers, nx, ny);
        const calibrated = applyGridCalibration(
          { x: px, y: py },
          gridCalibration,
        );
        const brightness = sampleBestBubbleCenterBrightness(
          pixels,
          width,
          height,
          calibrated.x + blockDx,
          calibrated.y + blockDy,
          centerOffsets,
          Math.max(1, Math.round(Math.min(bubbleRX, bubbleRY) * 0.28)),
        );
        fills.push({ choice: choiceLabels[c], brightness });
      }

      const sorted = [...fills].sort((a, b) => a.brightness - b.brightness);
      const darkest = sorted[0].brightness;
      const secondDark = sorted.length >= 2 ? sorted[1].brightness : 255;
      const thirdDark = sorted.length >= 3 ? sorted[2].brightness : 255;
      const brightest = sorted[sorted.length - 1].brightness;
      const ref = brightest;
      const darkRatio = ref > 20 ? darkest / ref : 1;
      const absoluteGap = secondDark - darkest;
      const gapFromThird = thirdDark - darkest;
      const median = sorted[Math.floor(sorted.length / 2)].brightness;
      const mean =
        fills.reduce((sum, item) => sum + item.brightness, 0) / fills.length;
      const spread = brightest - darkest;
      const adaptiveGap = Math.max(3, spread * 0.16);
      let selectedChoice = "";

      if (darkRatio < 0.82 && absoluteGap >= 3) {
        selectedChoice = sorted[0].choice;
      } else if (darkRatio < 0.9 && absoluteGap >= 5) {
        selectedChoice = sorted[0].choice;
      } else if (absoluteGap >= 8 && gapFromThird >= 5 && darkest < median - 2) {
        selectedChoice = sorted[0].choice;
      } else if (darkRatio < 0.96 && absoluteGap >= 5 && spread >= 8) {
        selectedChoice = sorted[0].choice;
      } else if (
        absoluteGap >= adaptiveGap &&
        darkest <= mean - 3 &&
        spread >= 5
      ) {
        selectedChoice = sorted[0].choice;
      }

      if (DEBUG_LOGS && (q === block.startQ || !selectedChoice)) {
        console.log(
          `[200Q-FAST] Q${q}: ${fills
            .map((f) => `${f.choice}=${f.brightness.toFixed(0)}`)
            .join(", ")} -> ${selectedChoice || "?"}`,
        );
      }

      answers.push({ questionNumber: q, selectedAnswer: selectedChoice });
    }
  }

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
    if (aspect < 0.5 || aspect > 2.0) continue;
    if (density < 0.35) continue;

    const centerX = x0 + (minGX + maxGX + 1) * step * 0.5;
    const centerY = y0 + (minGY + maxGY + 1) * step * 0.5;
    const targetDist =
      Math.hypot(centerX - window.targetX, centerY - window.targetY) /
      Math.hypot(imageW, imageH);
    const squareScore = 1 - Math.min(0.7, Math.abs(Math.log(aspect)));
    const score = count * density * (0.8 + squareScore) * (1.4 - targetDist);

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

export async function scan200ItemPageFast(
  imageUri: string,
  pageNumber: 1 | 2,
  choicesPerQuestion: 4 | 5 = 5,
): Promise<StudentAnswer[]> {
  const startedAt = Date.now();
  const questionOffset = pageNumber === 1 ? 0 : 100;
  console.log(
    `[200Q-FAST] Starting direct pixel scan for Page ${pageNumber} (offset=${questionOffset})`,
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

  return pageAnswers;
}

export async function scan200ItemPage(
  imageUri: string,
  markers: Markers,
  pageNumber: 1 | 2,
  choicesPerQuestion: 4 | 5 = 5,
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

    return pageAnswers;
  } catch (error) {
    console.error(`[200Q-BRIGHTNESS] Page ${pageNumber} error:`, error);

    return Array.from({ length: 100 }, (_, i) => ({
      questionNumber: i + 1 + questionOffset,
      selectedAnswer: "",
    }));
  }
}
