import { File } from "expo-file-system";
import { ScanResult, StudentAnswer } from "../types/scanning";

// Lazy load OpenCV
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

interface BubbleCandidate {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  fillRatio: number;
  confidence: number;
}

interface ProcessingOptions {
  questionCount: number;
  hasStudentId: boolean;
  minBubbleSize?: number;
  maxBubbleSize?: number;
  fillThreshold?: number;
}

export class OMRProcessingService {
  /**
   * Enhanced OMR processing with perspective correction and adaptive thresholding
   */
  static async processOMRSheet(
    imageUri: string,
    options: ProcessingOptions,
  ): Promise<ScanResult> {
    try {
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

      // Load image
      const normalizedUri = imageUri.startsWith("file://")
        ? imageUri
        : `file://${imageUri}`;
      const fileObj = new File(normalizedUri);
      const base64Image = await fileObj.base64();

      console.log("[OMR Enhanced] Loading image...");
      const srcMat = OpenCV.base64ToMat(base64Image);
      const srcJs = OpenCV.toJSValue(srcMat, "jpeg") as any;
      const imgWidth = srcJs.cols;
      const imgHeight = srcJs.rows;

      console.log(`[OMR Enhanced] Image size: ${imgWidth}x${imgHeight}`);

      // Step 1: Perspective correction
      const correctedMat = await this.correctPerspective(srcMat);

      // Step 2: Preprocessing
      const processedMat = await this.preprocessImage(correctedMat);

      // Step 3: Detect bubbles
      const bubbles = await this.detectBubbles(processedMat, {
        minSize: options.minBubbleSize || Math.pow(imgWidth / 80, 2),
        maxSize: options.maxBubbleSize || Math.pow(imgWidth / 15, 2),
      });

      console.log(`[OMR Enhanced] Detected ${bubbles.length} bubbles`);

      // Step 4: Extract student ID (if applicable)
      let studentId = "00000000";
      if (options.hasStudentId) {
        studentId = await this.extractStudentId(bubbles, imgWidth, imgHeight);
      }

      // Step 5: Extract answers
      const answers = await this.extractAnswers(
        bubbles,
        options.questionCount,
        imgWidth,
        imgHeight,
      );

      // Step 6: Calculate confidence
      const confidence = this.calculateConfidence(bubbles, answers);

      // Generate processed image for review
      const processedJs = OpenCV.toJSValue(processedMat, "jpeg") as any;
      const processedImageUri = `data:image/jpeg;base64,${processedJs.base64}`;

      OpenCV.clearBuffers();

      return {
        studentId,
        answers,
        confidence,
        processedImageUri,
      };
    } catch (error) {
      console.error("[OMR Enhanced] Processing error:", error);
      throw new Error("Failed to process OMR sheet");
    }
  }

  /**
   * Correct perspective distortion using corner detection
   */
  private static async correctPerspective(srcMat: any): Promise<any> {
    try {
      const { ColorConversionCodes, DataTypes, ObjectType } = OpenCVTypes;

      // Convert to grayscale
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

      // For now, return the grayscale image
      // In production, implement full perspective transform using corner detection
      return grayMat;
    } catch (error) {
      console.error("[OMR Enhanced] Perspective correction failed:", error);
      return srcMat;
    }
  }

  /**
   * Preprocess image with adaptive thresholding and noise reduction
   */
  private static async preprocessImage(srcMat: any): Promise<any> {
    try {
      const {
        AdaptiveThresholdTypes,
        BorderTypes,
        DataTypes,
        ObjectType,
        ThresholdTypes,
      } = OpenCVTypes;

      // Gaussian blur to reduce noise
      const blurMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      OpenCV.invoke(
        "GaussianBlur",
        srcMat,
        blurMat,
        OpenCV.createObject(ObjectType.Size, 5, 5),
        0,
        0,
        BorderTypes.BORDER_DEFAULT,
      );

      // Adaptive thresholding
      const threshMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      const srcJs = OpenCV.toJSValue(srcMat) as any;
      const blockSize = Math.max(3, Math.round(srcJs.cols / 15) | 1);

      OpenCV.invoke(
        "adaptiveThreshold",
        blurMat,
        threshMat,
        255,
        AdaptiveThresholdTypes.ADAPTIVE_THRESH_GAUSSIAN_C,
        ThresholdTypes.THRESH_BINARY_INV,
        blockSize,
        10,
      );

      return threshMat;
    } catch (error) {
      console.error("[OMR Enhanced] Preprocessing failed:", error);
      return srcMat;
    }
  }

  /**
   * Detect bubble candidates using contour detection
   */
  private static async detectBubbles(
    processedMat: any,
    sizeConstraints: { minSize: number; maxSize: number },
  ): Promise<BubbleCandidate[]> {
    try {
      const {
        ContourApproximationModes,
        DataTypes,
        ObjectType,
        RetrievalModes,
      } = OpenCVTypes;

      // Find contours
      const contoursVec = OpenCV.createObject(ObjectType.MatVector);
      const hierMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_32S,
      );

      OpenCV.invoke(
        "findContoursWithHierarchy",
        processedMat,
        contoursVec,
        hierMat,
        RetrievalModes.RETR_EXTERNAL,
        ContourApproximationModes.CHAIN_APPROX_SIMPLE,
      );

      const numContours = (OpenCV.toJSValue(contoursVec) as any).array.length;
      console.log(`[OMR Enhanced] Found ${numContours} contours`);

      const bubbles: BubbleCandidate[] = [];

      for (let i = 0; i < numContours; i++) {
        const contour = OpenCV.copyObjectFromVector(contoursVec, i);
        const rect = OpenCV.invoke("boundingRect", contour);
        const rectJs = OpenCV.toJSValue(rect) as any;
        const { x, y, width, height } = rectJs;

        const area = width * height;
        const aspectRatio = width / height;

        // Filter by size and aspect ratio
        if (area < sizeConstraints.minSize || area > sizeConstraints.maxSize) {
          continue;
        }

        if (aspectRatio < 0.5 || aspectRatio > 2.0) {
          continue;
        }

        // Calculate fill ratio
        let fillRatio = 0;
        try {
          const crop = OpenCV.createObject(
            ObjectType.Mat,
            0,
            0,
            DataTypes.CV_8U,
          );
          OpenCV.invoke(
            "crop",
            processedMat,
            crop,
            OpenCV.createObject(ObjectType.Rect, x, y, width, height),
          );
          const nonZero = (OpenCV.invoke("countNonZero", crop) as any).value;
          fillRatio = nonZero / area;
        } catch (error) {
          console.error("[OMR Enhanced] Fill ratio calculation failed:", error);
        }

        // Calculate confidence based on circularity and fill
        const perimeter = (OpenCV.invoke("arcLength", contour, true) as any)
          .value;
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
        const confidence = Math.min(circularity * fillRatio, 1.0);

        bubbles.push({
          x: x + width / 2,
          y: y + height / 2,
          width,
          height,
          area,
          fillRatio,
          confidence,
        });
      }

      return bubbles;
    } catch (error) {
      console.error("[OMR Enhanced] Bubble detection failed:", error);
      return [];
    }
  }

  /**
   * Extract student ID from bubble grid
   */
  private static async extractStudentId(
    bubbles: BubbleCandidate[],
    imgWidth: number,
    imgHeight: number,
  ): Promise<string> {
    try {
      // Filter bubbles in ID region (top 20% of image)
      const idBubbles = bubbles.filter((b) => b.y < imgHeight * 0.2);

      if (idBubbles.length < 10) {
        console.warn("[OMR Enhanced] Insufficient ID bubbles detected");
        return "00000000";
      }

      // Group bubbles into columns
      const columns = this.groupBubblesIntoColumns(idBubbles, 8);

      // Extract digit from each column
      const digits: string[] = [];
      const digitLabels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

      for (const column of columns) {
        // Sort by Y position (top to bottom)
        const sortedColumn = column.sort((a, b) => a.y - b.y);

        // Find the most filled bubble
        let maxFill = 0;
        let selectedIndex = -1;

        sortedColumn.forEach((bubble, index) => {
          if (bubble.fillRatio > maxFill && bubble.fillRatio > 0.4) {
            maxFill = bubble.fillRatio;
            selectedIndex = index;
          }
        });

        if (selectedIndex >= 0 && selectedIndex < digitLabels.length) {
          digits.push(digitLabels[selectedIndex]);
        } else {
          digits.push("0");
        }
      }

      const studentId = digits.join("").padStart(8, "0").slice(0, 8);
      console.log(`[OMR Enhanced] Extracted student ID: ${studentId}`);

      return studentId;
    } catch (error) {
      console.error("[OMR Enhanced] Student ID extraction failed:", error);
      return "00000000";
    }
  }

  /**
   * Extract answers from bubble grid
   */
  private static async extractAnswers(
    bubbles: BubbleCandidate[],
    questionCount: number,
    imgWidth: number,
    imgHeight: number,
  ): Promise<StudentAnswer[]> {
    try {
      // Filter bubbles in answer region (below ID section)
      const answerBubbles = bubbles.filter((b) => b.y > imgHeight * 0.25);

      console.log(
        `[OMR Enhanced] Processing ${answerBubbles.length} answer bubbles for ${questionCount} questions`,
      );

      // Group bubbles into rows (questions)
      const rows = this.groupBubblesIntoRows(answerBubbles, questionCount);

      const answers: StudentAnswer[] = [];
      const options = ["A", "B", "C", "D", "E"];

      for (let i = 0; i < questionCount; i++) {
        const row = rows[i] || [];

        // Sort bubbles by X position (left to right)
        const sortedRow = row.sort((a, b) => a.x - b.x);

        // Find the most filled bubble
        let maxFill = 0;
        let selectedIndex = -1;

        sortedRow.forEach((bubble, index) => {
          if (bubble.fillRatio > maxFill && bubble.fillRatio > 0.4) {
            maxFill = bubble.fillRatio;
            selectedIndex = index;
          }
        });

        const selectedAnswer =
          selectedIndex >= 0 && selectedIndex < options.length
            ? options[selectedIndex]
            : "";

        answers.push({
          questionNumber: i + 1,
          selectedAnswer,
        });
      }

      return answers;
    } catch (error) {
      console.error("[OMR Enhanced] Answer extraction failed:", error);
      return Array.from({ length: questionCount }, (_, i) => ({
        questionNumber: i + 1,
        selectedAnswer: "",
      }));
    }
  }

  /**
   * Group bubbles into columns based on X position
   */
  private static groupBubblesIntoColumns(
    bubbles: BubbleCandidate[],
    numColumns: number,
  ): BubbleCandidate[][] {
    if (bubbles.length === 0) return [];

    // Sort by X position
    const sorted = [...bubbles].sort((a, b) => a.x - b.x);

    // Find column boundaries using gaps
    const xPositions = sorted.map((b) => b.x);
    const gaps: number[] = [];

    for (let i = 1; i < xPositions.length; i++) {
      const gap = xPositions[i] - xPositions[i - 1];
      gaps.push(gap);
    }

    // Find median gap to determine column separation
    const medianGap =
      gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 10;
    const columnThreshold = medianGap * 1.5;

    // Group into columns
    const columns: BubbleCandidate[][] = [];
    let currentColumn: BubbleCandidate[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].x - sorted[i - 1].x;

      if (gap > columnThreshold) {
        columns.push(currentColumn);
        currentColumn = [sorted[i]];
      } else {
        currentColumn.push(sorted[i]);
      }
    }

    columns.push(currentColumn);

    return columns.slice(0, numColumns);
  }

  /**
   * Group bubbles into rows based on Y position
   */
  private static groupBubblesIntoRows(
    bubbles: BubbleCandidate[],
    numRows: number,
  ): BubbleCandidate[][] {
    if (bubbles.length === 0) return [];

    // Sort by Y position
    const sorted = [...bubbles].sort((a, b) => a.y - b.y);

    // Find row boundaries using gaps
    const yPositions = sorted.map((b) => b.y);
    const gaps: number[] = [];

    for (let i = 1; i < yPositions.length; i++) {
      const gap = yPositions[i] - yPositions[i - 1];
      gaps.push(gap);
    }

    // Find median gap to determine row separation
    const medianGap =
      gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 10;
    const rowThreshold = medianGap * 1.5;

    // Group into rows
    const rows: BubbleCandidate[][] = [];
    let currentRow: BubbleCandidate[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].y - sorted[i - 1].y;

      if (gap > rowThreshold) {
        rows.push(currentRow);
        currentRow = [sorted[i]];
      } else {
        currentRow.push(sorted[i]);
      }
    }

    rows.push(currentRow);

    return rows.slice(0, numRows);
  }

  /**
   * Calculate overall confidence score
   */
  private static calculateConfidence(
    bubbles: BubbleCandidate[],
    answers: StudentAnswer[],
  ): number {
    if (bubbles.length === 0) return 0;

    // Calculate average bubble confidence
    const avgBubbleConfidence =
      bubbles.reduce((sum, b) => sum + b.confidence, 0) / bubbles.length;

    // Calculate answer completeness
    const answeredQuestions = answers.filter(
      (a) => a.selectedAnswer !== "",
    ).length;
    const answerCompleteness = answeredQuestions / answers.length;

    // Combined confidence score
    return avgBubbleConfidence * 0.6 + answerCompleteness * 0.4;
  }

  /**
   * Validate scan quality before processing
   */
  static async validateScanQuality(imageUri: string): Promise<{
    isValid: boolean;
    issues: string[];
    confidence: number;
  }> {
    try {
      loadOpenCV();
      const { ColorConversionCodes, DataTypes, ObjectType } = OpenCVTypes;

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

      // Check blur using Laplacian variance
      const edgesMat = OpenCV.createObject(
        ObjectType.Mat,
        0,
        0,
        DataTypes.CV_8U,
      );
      OpenCV.invoke("Canny", grayMat, edgesMat, 50, 150);

      const edgePixels = (OpenCV.invoke("countNonZero", edgesMat) as any).value;
      const srcJs = OpenCV.toJSValue(grayMat) as any;
      const totalPixels = srcJs.rows * srcJs.cols;
      const edgeDensity = (edgePixels / totalPixels) * 100;

      const issues: string[] = [];

      if (edgeDensity < 0.8) {
        issues.push("Image is too blurry");
      }

      if (srcJs.cols < 800 || srcJs.rows < 600) {
        issues.push("Image resolution is too low");
      }

      OpenCV.clearBuffers();

      return {
        isValid: issues.length === 0,
        issues,
        confidence: issues.length === 0 ? 0.95 : 0.4,
      };
    } catch (error) {
      console.error("[OMR Enhanced] Quality validation failed:", error);
      return {
        isValid: false,
        issues: ["Failed to validate image quality"],
        confidence: 0,
      };
    }
  }
}
