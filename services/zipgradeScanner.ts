import { File } from "expo-file-system";
import { ScanResult, StudentAnswer } from "../types/scanning";
import { ZipgradeGenerator } from "./zipgradeGenerator";

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
// Types
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

  // Take exactly numQ rows (the actual question rows)
  const qRows = sortedRows.slice(0, numQ);
  const answers: StudentAnswer[] = [];

  qRows.forEach((row, rowIdx) => {
    const qNum = startQ + rowIdx;

    // Find the highest-fill bubble in this row
    let best: Bubble | null = null;
    for (const b of row) {
      if (!best || b.fill > best.fill) best = b;
    }

    if (!best || best.fill < 0.38) {
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
// Layout Profiles
// ─────────────────────────────────────────────────────────────────────────────
//
// These define the answer regions for each sheet type, as fractions of paper
// width/height. Derived by measuring the actual sheet photos.
//
// 20q Sheet (IMG_20260221_162340.jpg):
//   No Student ID grid. Two column groups side by side.
//   A-B-C-D-E headers visible. Q1-10 left, Q11-20 right.
//   Answer grid: y ∈ [28%, 95%]
//   Left group  (Q1-10):  x ∈ [22%, 50%]
//   Right group (Q11-20): x ∈ [56%, 95%]
//
// 50q Sheet (20260221_210707.jpg):
//   Has Student ID grid at top (y ∈ [26%, 33%]).
//   Top answer band  (y ∈ [33%, 54%]): Q1-10, Q11-20, Q31-40
//   Bottom answer band (y ∈ [56%, 97%]): [Key Version skip], Q21-30, Q41-50
//   X groups (3 equal thirds of paper): left, center, right
//
function getLayoutRegions(questionCount: number): AnswerRegion[] {
  if (questionCount <= 20) {
    // ── 20-question layout ──────────────────────────────────────────────────
    // The 20q Zipgrade sheet has NO Student ID section.
    // Two column groups: Q1-10 (left) and Q11-20 (right).
    // Question number labels are on the LEFT edge of each group (~x<26%).
    // The A-E bubble columns for Q1-10 sit in x=[26%,50%] of paper.
    // The A-E bubble columns for Q11-20 sit in x=[54%,84%] of paper.
    // Y: answer grid spans from ~28% to ~95% of paper height.
    return [
      { xMin: 0.26, xMax: 0.5, yMin: 0.28, yMax: 0.95, startQ: 1, numQ: 10 },
      { xMin: 0.54, xMax: 0.84, yMin: 0.28, yMax: 0.95, startQ: 11, numQ: 10 },
    ];
  } else if (questionCount <= 30) {
    // ── 30-question layout (3 groups side by side, no Y split) ─────────────
    return [
      { xMin: 0.1, xMax: 0.36, yMin: 0.28, yMax: 0.96, startQ: 1, numQ: 10 },
      { xMin: 0.38, xMax: 0.64, yMin: 0.28, yMax: 0.96, startQ: 11, numQ: 10 },
      { xMin: 0.66, xMax: 0.92, yMin: 0.28, yMax: 0.96, startQ: 21, numQ: 10 },
    ];
  } else {
    // ── 50-question layout ──────────────────────────────────────────────────
    // The 50q Zipgrade sheet has:
    //   - Student ID grid:   y ∈ [24%, 34%]
    //   - Top answer band:   y ∈ [34%, 55%]  → Q1-10, Q11-20, Q31-40
    //   - Bottom answer band: y ∈ [57%, 97%] → [Key Version skip], Q21-30, Q41-50
    //
    // 3 X zones per band (each ~33% wide). Bubble A-E columns start
    // after question number labels (offset ~9% into each zone).
    //
    // Layout measured from actual 50q Zipgrade sheet image + density grid calibration.
    //
    // Top band  (Q1-10, Q11-20, Q31-40): y ∈ [13%, 51%]
    // Bottom band (Q1-10 key, Q21-30, Q41-50): y ∈ [55%, 98%]
    //
    // X groups (density grid shows bubbles at x20-x30, x40-x50, x60-x80):
    //   Left   (Q1-10  / Key Version): x ∈ [12%, 40%]
    //   Center (Q11-20 / Q21-30):      x ∈ [40%, 64%]
    //   Right  (Q31-40 / Q41-50):      x ∈ [62%, 87%]
    //
    return [
      // Top band: Q1-10, Q11-20, Q31-40
      { xMin: 0.12, xMax: 0.4, yMin: 0.13, yMax: 0.51, startQ: 1, numQ: 10 },
      { xMin: 0.4, xMax: 0.64, yMin: 0.13, yMax: 0.51, startQ: 11, numQ: 10 },
      { xMin: 0.62, xMax: 0.87, yMin: 0.13, yMax: 0.51, startQ: 31, numQ: 10 },
      // Bottom band: skip left (Key Version), Q21-30, Q41-50
      { xMin: 0.4, xMax: 0.64, yMin: 0.55, yMax: 0.98, startQ: 21, numQ: 10 },
      { xMin: 0.62, xMax: 0.87, yMin: 0.55, yMax: 0.98, startQ: 41, numQ: 10 },
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
      const IMG_W: number = srcJs.cols;

      // ── 2. Grayscale + Blur ───────────────────────────────────────────────
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
      const minShapeArea = Math.pow(imgWidth / 80, 2);
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

        if (area < minShapeArea || area > imgArea * 0.05) continue;
        if (aspect < 0.4 || aspect > 2.5) continue;
        if (extent < 0.1) continue;

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

      console.log(`[OMR] rawShapes: ${rawShapes.length}`);
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

      // ── 7. Paper crop via registration marks ──────────────────────────────
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
      // If caller passed 20 (default) but we see many bubbles spread across
      // the full paper width/height, it's likely a 50q sheet.
      // Heuristic: 50q sheets have bubbles in BOTH y=[30-55%] AND y=[57-82%] bands.
      // 20q sheets only have bubbles in one Y band (y=[28-95%] but X-split only).
      let detectedQ = qCount;
      if (qCount <= 20) {
        const topBandCount = bubbles.filter(
          (b) => b.y >= paperH * 0.13 && b.y <= paperH * 0.51,
        ).length;
        const botBandCount = bubbles.filter(
          (b) => b.y >= paperH * 0.55 && b.y <= paperH * 0.98,
        ).length;
        const hasIdSection =
          bubbles.filter((b) => b.y >= paperH * 0.02 && b.y <= paperH * 0.18)
            .length > 3;

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
      }

      // ── 9. Extract answers using explicit layout profile ───────────────────
      const regions = getLayoutRegions(detectedQ);
      console.log(`[OMR] layout: ${detectedQ}q → ${regions.length} regions`);

      const allAnswers: StudentAnswer[] = [];
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
      let studentId = "00000000";

      if (detectedQ >= 40) {
        const idBubbles = bubbles.filter(
          (b) => b.y >= paperH * 0.02 && b.y <= paperH * 0.22,
        );
        console.log(`[OMR] ID bubbles: ${idBubbles.length}`);

        if (idBubbles.length >= 10) {
          // Find 4 largest X gaps → 5 columns
          const idXs = idBubbles.map((b) => b.x).sort((a, b) => a - b);
          const idGaps: { pos: number; size: number }[] = [];
          for (let i = 1; i < idXs.length; i++) {
            const gap = idXs[i] - idXs[i - 1];
            if (gap > medianW * 0.5) {
              idGaps.push({ pos: (idXs[i] + idXs[i - 1]) / 2, size: gap });
            }
          }
          idGaps.sort((a, b) => b.size - a.size);
          const idColSeps = idGaps
            .slice(0, 4)
            .map((g) => g.pos)
            .sort((a, b) => a - b);

          const idCols: Bubble[][] = [];
          let idPrev = -Infinity;
          for (const sep of idColSeps) {
            idCols.push(idBubbles.filter((b) => b.x > idPrev && b.x <= sep));
            idPrev = sep;
          }
          idCols.push(idBubbles.filter((b) => b.x > idPrev));

          console.log(
            `[OMR] ID cols: ${idCols.length}, sizes: [${idCols.map((c) => c.length).join(",")}]`,
          );

          // ZipGrade digit row order: 1,2,3,4,5,6,7,8,9,0
          const digitLabels = [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "0",
          ];
          const idDigits: string[] = [];

          for (const col of idCols) {
            if (col.length === 0) {
              idDigits.push("0");
              continue;
            }
            const digitRows = clusterByY(
              [...col].sort((a, b) => a.y - b.y),
              medianH * 0.8,
            );
            digitRows.sort(
              (a, b) =>
                a.reduce((s, b) => s + b.y, 0) / a.length -
                b.reduce((s, b) => s + b.y, 0) / b.length,
            );
            let bestIdx = -1,
              bestFill = 0.35;
            digitRows.forEach((row, idx) => {
              const maxFill = Math.max(...row.map((b) => b.fill));
              if (maxFill > bestFill) {
                bestFill = maxFill;
                bestIdx = idx;
              }
            });
            idDigits.push(
              bestIdx >= 0 && bestIdx < digitLabels.length
                ? digitLabels[bestIdx]
                : "0",
            );
          }

          while (idDigits.length < 8) idDigits.unshift("0");
          studentId = idDigits.slice(-8).join("");
          console.log(`[OMR] ID: [${idDigits.join(",")}] → "${studentId}"`);
        }
      }

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
      OpenCV.clearBuffers();
    }
  }

  static async validateZipgradeSheet(imageUri: string): Promise<{
    isValid: boolean;
    issues: string[];
    confidence: number;
    detectedTemplate?: keyof ReturnType<typeof ZipgradeGenerator.getTemplates>;
  }> {
    const issues: string[] = [];

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
      const grayMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
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

      OpenCV.clearBuffers();
    } catch (err) {
      console.error("[Validation] Blur detection check failed:", err);
    }

    return {
      isValid: issues.length === 0,
      issues,
      confidence: issues.length === 0 ? 0.95 : 0.4,
      detectedTemplate: "standard20",
    };
  }
}
