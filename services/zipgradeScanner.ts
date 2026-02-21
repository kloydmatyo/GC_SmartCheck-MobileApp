import { File } from "expo-file-system";
import {
  AdaptiveThresholdTypes,
  BorderTypes,
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  ObjectType,
  OpenCV,
  RetrievalModes,
  ThresholdTypes,
} from "react-native-fast-opencv";
import { ScanResult, StudentAnswer } from "../types/scanning";
import { ZipgradeGenerator } from "./zipgradeGenerator";

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

  // Only use rows with the expected number of bubbles
  const fullRows = rows.filter(
    (r) => r.length >= targetCols - 1 && r.length <= targetCols + 1,
  );
  if (fullRows.length === 0) return [];

  // Sort each row left-to-right
  const sortedRows = fullRows.map((r) => [...r].sort((a, b) => a.x - b.x));

  // Compute X span for each row (rightmost - leftmost bubble)
  const spans = sortedRows.map((r) => r[r.length - 1].x - r[0].x);
  const medianSpan = spans.slice().sort((a, b) => a - b)[
    Math.floor(spans.length / 2)
  ];

  // Only keep rows whose span is within 20% of the median span
  // This removes rows with stray outlier bubbles that shift the centroids
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

/**
 * Find the largest cluster of similarly-sized values.
 * Returns the median value of that cluster.
 * windowRatio: values within [ref * (1-windowRatio), ref * (1+windowRatio)] are "similar"
 */
function findModalClusterMedian(values: number[], windowRatio = 0.4): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let bestMedian = sorted[Math.floor(sorted.length / 2)];
  let bestCount = 0;

  for (const ref of sorted) {
    const lo = ref * (1 - windowRatio);
    const hi = ref * (1 + windowRatio);
    const inWin = sorted.filter((v) => v >= lo && v <= hi);
    if (inWin.length > bestCount) {
      bestCount = inWin.length;
      bestMedian = inWin[Math.floor(inWin.length / 2)];
    }
  }
  return bestMedian;
}

type Bubble = {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  extent: number;
  fill: number;
};

// ─────────────────────────────────────────────
// Main Scanner
// ─────────────────────────────────────────────

export class ZipgradeScanner {
  static async processZipgradeSheet(
    imageUri: string,
    templateName: keyof ReturnType<
      typeof ZipgradeGenerator.getTemplates
    > = "standard20",
  ): Promise<ScanResult> {
    try {
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

      console.log(`[OMR] base64 length: ${base64Image.length}`);
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

      const IMG_W: number = srcJs.cols;

      // ── 2. Grayscale ───────────────────────────────────────────────────────
      let grayMat = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8U);
      try {
        OpenCV.invoke(
          "cvtColor",
          srcMat,
          grayMat,
          ColorConversionCodes.COLOR_BGR2GRAY,
        );
      } catch (e) {
        grayMat = srcMat;
      }

      // ── 3. Blur ────────────────────────────────────────────────────────────
      const blurMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      const ksize = OpenCV.createObject(ObjectType.Size, 5, 5);
      OpenCV.invoke(
        "GaussianBlur",
        grayMat,
        blurMat,
        ksize,
        0,
        0,
        BorderTypes.BORDER_DEFAULT,
      );

      // ── 4. Adaptive threshold ──────────────────────────────────────────────
      // Strategy: try THREE threshold approaches and pick the one that yields
      // the most circle-shaped contours in the expected size range.
      // This makes the scanner robust across different lighting conditions.
      //
      // 1. Otsu global — works well on high-contrast sheets (dark bg + white bubbles)
      // 2. Adaptive medium block — handles uneven lighting
      // 3. Adaptive large block  — handles extreme uneven lighting
      //
      const threshCandidates: { mat: any; label: string }[] = [];

      // Candidate 1: Otsu INV (dark bg, light bubbles → INV makes bubbles white)
      const threshOtsuInv = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      OpenCV.invoke(
        "threshold",
        blurMat,
        threshOtsuInv,
        0,
        255,
        ThresholdTypes.THRESH_BINARY_INV | ThresholdTypes.THRESH_OTSU,
      );
      threshCandidates.push({ mat: threshOtsuInv, label: "Otsu-INV" });

      // Candidate 2: Otsu normal (light bg, dark bubbles → keeps dark marks)
      const threshOtsu = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      OpenCV.invoke(
        "threshold",
        blurMat,
        threshOtsu,
        0,
        255,
        ThresholdTypes.THRESH_BINARY | ThresholdTypes.THRESH_OTSU,
      );
      threshCandidates.push({ mat: threshOtsu, label: "Otsu" });

      // Candidate 3: Adaptive medium block
      const threshAdaptMed = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      try {
        const bsMed = Math.round(IMG_W / 15) | 1; // force odd
        OpenCV.invoke(
          "adaptiveThreshold",
          blurMat,
          threshAdaptMed,
          255,
          AdaptiveThresholdTypes.ADAPTIVE_THRESH_GAUSSIAN_C,
          ThresholdTypes.THRESH_BINARY_INV,
          bsMed < 3 ? 3 : bsMed,
          12,
        );
        threshCandidates.push({
          mat: threshAdaptMed,
          label: `Adaptive-${bsMed}`,
        });
      } catch (_) {}

      // Quick contour count helper to score each candidate
      const countContoursInRange = (
        mat: any,
        minA: number,
        maxA: number,
      ): number => {
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
        const data = OpenCV.toJSValue(cv) as any;
        const n = data.array.length;
        let count = 0;
        for (let i = 0; i < n; i++) {
          const c = OpenCV.copyObjectFromVector(cv, i);
          const r = OpenCV.toJSValue(OpenCV.invoke("boundingRect", c)) as any;
          const a = r.width * r.height;
          const asp = r.width / r.height;
          if (a >= minA && a <= maxA && asp >= 0.5 && asp <= 2.0) count++;
        }
        return count;
      };

      // Expected bubble area range: roughly (imgWidth * 0.02)^2 to (imgWidth * 0.12)^2
      const scoringMin = Math.pow(IMG_W * 0.02, 2);
      const scoringMax = Math.pow(IMG_W * 0.12, 2);

      let bestScore = -1;
      let bestThreshMat = threshCandidates[0].mat;
      let bestLabel = threshCandidates[0].label;
      for (const cand of threshCandidates) {
        const score = countContoursInRange(cand.mat, scoringMin, scoringMax);
        console.log(
          `[OMR] threshold "${cand.label}": score=${score} (range ${Math.round(scoringMin)}-${Math.round(scoringMax)})`,
        );
        if (score > bestScore) {
          bestScore = score;
          bestThreshMat = cand.mat;
          bestLabel = cand.label;
        }
      }
      console.log(`[OMR] using threshold: ${bestLabel}`);
      // Use the best threshold result directly
      const threshJs = OpenCV.toJSValue(bestThreshMat, "jpeg") as any;
      const imgWidth: number = threshJs.cols;
      const imgHeight: number = threshJs.rows;
      const imgArea = imgWidth * imgHeight;
      const processedImageUri = `data:image/jpeg;base64,${threshJs.base64}`;
      console.log(
        `[OMR] threshMat: ${imgWidth}x${imgHeight}, imgArea: ${imgArea}`,
      );

      // ── 5. Find contours ───────────────────────────────────────────────────
      const contoursVector = OpenCV.createObject(ObjectType.MatVector);
      const hierarchy = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_32S,
      );
      OpenCV.invoke(
        "findContoursWithHierarchy",
        bestThreshMat,
        contoursVector,
        hierarchy,
        RetrievalModes.RETR_EXTERNAL,
        ContourApproximationModes.CHAIN_APPROX_SIMPLE,
      );

      const contoursData = OpenCV.toJSValue(contoursVector) as any;
      const numContours: number = contoursData.array.length;
      console.log(`[OMR] numContours: ${numContours}`);

      if (numContours === 0) {
        return {
          studentId: "00000000",
          answers: [],
          confidence: 0,
          processedImageUri,
        };
      }

      // ── 6. Collect ALL shape-valid contours (no area bounds at all) ────────
      //
      // Only filter by:
      //   - aspect ratio (roughly square/circular)
      //   - extent (filled enough to be a real shape, not a line)
      //   - absolute minimum area of 4px (truly ignore single pixels)
      //
      // We will determine the correct bubble size from the DATA itself.
      //
      const rawShapes: Bubble[] = [];

      for (let i = 0; i < numContours; i++) {
        const contour = OpenCV.copyObjectFromVector(contoursVector, i);
        const rect = OpenCV.invoke("boundingRect", contour);
        const rectJs = OpenCV.toJSValue(rect) as any;
        const { x, y, width: w, height: h } = rectJs;
        const area = w * h;
        const aspect = w / h;
        const cAreaObj = OpenCV.invoke("contourArea", contour);
        const extent = area > 0 ? cAreaObj.value / area : 0;

        // Minimum area: at least (imgWidth/80)^2 — scales with shooting distance.
        // At 1200px wide: floor = 225px² (~15x15px). Skips text noise.
        // Maximum area: 5% of image — skips full-page borders.
        const minArea = Math.pow(imgWidth / 80, 2);
        if (area < minArea) continue;
        if (area > imgArea * 0.05) continue; // ignore full-page contours
        if (aspect < 0.4 || aspect > 2.5) continue; // must be roughly square
        if (extent < 0.1) continue; // must have some fill

        let fillPerc = 0;
        try {
          const cropDst = OpenCV.createObject(
            ObjectType.Mat,
            0,
            0,
            DataTypes.CV_8U,
          );
          const tempRect = OpenCV.createObject(ObjectType.Rect, x, y, w, h);
          OpenCV.invoke("crop", bestThreshMat, cropDst, tempRect);
          const countObj = OpenCV.invoke("countNonZero", cropDst);
          fillPerc = countObj.value / area;
        } catch (_) {}

        rawShapes.push({
          x: x + w / 2,
          y: y + h / 2,
          w,
          h,
          area,
          extent,
          fill: fillPerc,
        });
      }

      console.log(`[OMR] rawShapes (no area bounds): ${rawShapes.length}`);

      if (rawShapes.length === 0) {
        return {
          studentId: "00000000",
          answers: [],
          confidence: 0,
          processedImageUri,
        };
      }

      // ── 7. Find the bubble size cluster ───────────────────────────────────
      //
      // The answer sheet has ~100 bubbles (20 questions × 5 options).
      // There will also be: text characters (small), registration marks (medium-large).
      // The bubbles should form the LARGEST cluster of similarly-sized shapes.
      //
      // Algorithm: find the area value whose ±40% window contains the most shapes.
      //
      const allAreas = rawShapes.map((s) => s.area);
      const bubbleRefArea = findModalClusterMedian(allAreas, 0.4);

      console.log(`[OMR] bubbleRefArea (modal cluster): ${bubbleRefArea}`);

      // Log full distribution for diagnosis
      const sortedAreas = [...allAreas].sort((a, b) => a - b);
      console.log(
        `[OMR] area dist: min=${sortedAreas[0]} p10=${sortedAreas[Math.floor(sortedAreas.length * 0.1)]} p25=${sortedAreas[Math.floor(sortedAreas.length * 0.25)]} p50=${sortedAreas[Math.floor(sortedAreas.length * 0.5)]} p75=${sortedAreas[Math.floor(sortedAreas.length * 0.75)]} p90=${sortedAreas[Math.floor(sortedAreas.length * 0.9)]} max=${sortedAreas[sortedAreas.length - 1]}`,
      );

      // Keep shapes within ±50% of the bubble reference area
      const bubbles = rawShapes.filter(
        (s) => s.area >= bubbleRefArea * 0.5 && s.area <= bubbleRefArea * 2.0,
      );
      console.log(`[OMR] bubbles after cluster filter: ${bubbles.length}`);

      if (bubbles.length < 10) {
        console.warn("[OMR] Too few bubbles. Check area dist log above.");
        return {
          studentId: "00000000",
          answers: [],
          confidence: 0,
          processedImageUri,
        };
      }

      // ── 8. Split into grid regions ─────────────────────────────────────────
      //
      // Grid is below header (~top 28%) and above footer (~bottom 8%).
      // Left column Q1-10: x in [10%, 50%] of image width.
      // Right column Q11-20: x in [52%, 95%] of image width.
      //
      const gridTop = imgHeight * 0.28;
      const gridBottom = imgHeight * 0.92;
      // Left side: question numbers (1-10) sit in the leftmost ~22% of image width.
      // Push leftMinX to 22% to exclude them from bubble detection.
      const leftMinX = imgWidth * 0.22;
      const leftMaxX = imgWidth * 0.5;
      // Right side: question numbers (11-20) sit between 52-56%.
      // Push rightMinX to 56% to exclude them.
      const rightMinX = imgWidth * 0.56;
      const rightMaxX = imgWidth * 0.95;

      const leftBubbles = bubbles.filter(
        (b) =>
          b.y > gridTop &&
          b.y < gridBottom &&
          b.x >= leftMinX &&
          b.x <= leftMaxX,
      );
      const rightBubbles = bubbles.filter(
        (b) =>
          b.y > gridTop &&
          b.y < gridBottom &&
          b.x >= rightMinX &&
          b.x <= rightMaxX,
      );

      console.log(
        `[OMR] left: ${leftBubbles.length}, right: ${rightBubbles.length}`,
      );
      console.log(
        `[OMR] gridTop=${Math.round(gridTop)} gridBottom=${Math.round(gridBottom)}`,
      );
      console.log(
        `[OMR] leftX=[${Math.round(leftMinX)},${Math.round(leftMaxX)}] rightX=[${Math.round(rightMinX)},${Math.round(rightMaxX)}]`,
      );

      const gridBubbles = [...leftBubbles, ...rightBubbles];
      if (gridBubbles.length < 10) {
        console.warn("[OMR] Not enough grid bubbles after region filter");
        // Log where the bubbles actually are to help diagnose
        const yBuckets: Record<string, number> = {};
        bubbles.forEach((b) => {
          const bucket = `y${Math.floor(b.y / (imgHeight / 10)) * 10}%`;
          yBuckets[bucket] = (yBuckets[bucket] || 0) + 1;
        });
        console.warn("[OMR] bubble Y distribution:", JSON.stringify(yBuckets));
        return {
          studentId: "00000000",
          answers: [],
          confidence: 0,
          processedImageUri,
        };
      }

      const allHeights = gridBubbles.map((b) => b.h).sort((a, b) => a - b);
      const medianH = allHeights[Math.floor(allHeights.length / 2)] || 20;
      console.log(`[OMR] medianH: ${medianH}`);

      // ── 9. Extract answers ─────────────────────────────────────────────────
      const extractAnswers = (
        halfBubbles: Bubble[],
        startQ: number,
      ): StudentAnswer[] => {
        const empty = Array.from({ length: 10 }, (_, i) => ({
          questionNumber: startQ + i,
          selectedAnswer: "",
        }));
        if (halfBubbles.length === 0) return empty;

        // Cluster into rows; gap = 60% of median bubble height
        const rowGap = medianH * 0.6;
        const rows = clusterByY(halfBubbles, rowGap);
        // Valid rows: 3–7 bubbles
        const validRows = rows.filter((r) => r.length >= 3 && r.length <= 8);

        console.log(
          `[OMR] Q${startQ}+ rows: ${rows.length}, valid: ${validRows.length}`,
        );
        rows.slice(0, 14).forEach((r, i) => {
          const xs = r.map((b) => Math.round(b.x)).sort((a, b) => a - b);
          console.log(
            `  row[${i}] n=${r.length} y≈${Math.round(r[0].y)} xs=[${xs.join(",")}]`,
          );
        });

        // Derive A-E column positions from full rows
        const colCentroids = deriveColumnCentroids(validRows, 5);
        console.log(
          `[OMR] Q${startQ}+ centroids (A-E):`,
          colCentroids.map((c) => Math.round(c)),
        );

        if (colCentroids.length < 3) {
          console.warn(
            `[OMR] Q${startQ}+ not enough column centroids (${colCentroids.length})`,
          );
          return empty;
        }

        const options = ["A", "B", "C", "D", "E"] as const;
        const qRows = validRows.slice(0, 10);
        const answers: StudentAnswer[] = [];

        qRows.forEach((row, rowIdx) => {
          const qNum = startQ + rowIdx;

          // Pick the highest-fill bubble in this row
          let best: Bubble | null = null;
          for (const b of row) {
            if (!best || b.fill > best.fill) best = b;
          }

          if (!best || best.fill < 0.35) {
            console.log(
              `[OMR] Q${qNum}: unanswered (fill=${best?.fill.toFixed(2)})`,
            );
            answers.push({ questionNumber: qNum, selectedAnswer: "" });
            return;
          }

          const colIdx = colCentroids.reduce(
            (bst, c, i) =>
              Math.abs(best!.x - c) < Math.abs(best!.x - colCentroids[bst])
                ? i
                : bst,
            0,
          );
          const safeIdx = Math.min(colIdx, options.length - 1);
          console.log(
            `[OMR] Q${qNum}: x=${Math.round(best.x)} → ${options[safeIdx]} fill=${best.fill.toFixed(2)}`,
          );
          answers.push({
            questionNumber: qNum,
            selectedAnswer: options[safeIdx],
          });
        });

        while (answers.length < 10) {
          answers.push({
            questionNumber: startQ + answers.length,
            selectedAnswer: "",
          });
        }
        return answers;
      };

      const leftAnswers = extractAnswers(leftBubbles, 1);
      const rightAnswers = extractAnswers(rightBubbles, 11);
      const answers = [...leftAnswers, ...rightAnswers];

      console.log("--- OPENCV EXTRACTED ANSWERS ---");
      console.log(JSON.stringify(answers, null, 2));

      return {
        studentId: "00000000",
        answers,
        confidence: 0.95,
        processedImageUri,
      };
    } catch (error) {
      console.error("[OMR] Fatal error:", error);
      throw new Error("Failed to process Zipgrade answer sheet");
    } finally {
      OpenCV.clearBuffers();
    }
  }

  static async validateZipgradeSheet(imageUri: string): Promise<{
    isValid: boolean;
    issues: string[];
    confidence: number;
    detectedTemplate?: keyof ReturnType<typeof ZipgradeGenerator.getTemplates>;
  }> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      isValid: true,
      issues: [],
      confidence: 0.95,
      detectedTemplate: "standard20",
    };
  }
}
