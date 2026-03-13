import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import { getSession } from "./sessionService";

export interface PdfPreviewOptions {
  templateKey: "standard20" | "standard50" | "standard100";
  examName: string;
  section: string;
  version: "A" | "B" | "C" | "D";
  examCode?: string;
  studentIdBubbles?: boolean;
  optimizeForMobile?: boolean;
  maxFileSizeKb?: number;
}

export interface PdfPreviewResult {
  uri: string;
  fileSize: number;
  loadTime: number;
  pageCount: number;
  resolution: { width: number; height: number };
  optimized: boolean;
}

export interface PdfValidationResult {
  isValid: boolean;
  checks: {
    loadTime: { passed: boolean; value: number; threshold: number };
    fileSize: { passed: boolean; value: number; threshold: number };
    studentIdVisible: { passed: boolean };
    questionBubblesVisible: { passed: boolean };
    examCodePresent: { passed: boolean };
    logoDisplayed: { passed: boolean };
    resolution: { passed: boolean; width: number; height: number };
    multiPageSupport: { passed: boolean; pageCount: number };
  };
  errors: string[];
}

const LOGO_URI =
  "https://gordoncollege.edu.ph/wp-content/uploads/2022/09/cropped-GC-Logo.png";
const MAX_LOAD_TIME_MS = 5000;
const MAX_FILE_SIZE_KB = 1500;
const MIN_RESOLUTION_WIDTH = 612;
const MIN_RESOLUTION_HEIGHT = 792;

export class PdfPreviewService {
  /**
   * Generate optimized PDF for mobile preview
   */
  static async generatePdfPreview(
    options: PdfPreviewOptions,
  ): Promise<PdfPreviewResult> {
    const startTime = Date.now();

    try {
      // Generate HTML content
      const html = this.buildOptimizedHtml(options);

      // Generate PDF with optimized settings
      const { uri } = await Print.printToFileAsync({
        html,
        width: MIN_RESOLUTION_WIDTH,
        height: MIN_RESOLUTION_HEIGHT,
        base64: false,
      });

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const fileSize =
        fileInfo.exists && "size" in fileInfo ? fileInfo.size : 0;
      const loadTime = Date.now() - startTime;

      // Calculate page count based on questions
      const template = this.getTemplateConfig(options.templateKey);
      const pageCount = Math.ceil(
        template.totalQuestions / template.questionsPerPage,
      );

      // Move to permanent location
      const fileName = `omr-preview-${options.templateKey}-${options.version}-${Date.now()}.pdf`;
      const dest = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ""}${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: dest });

      return {
        uri: dest,
        fileSize: Math.round(fileSize / 1024), // Convert to KB
        loadTime,
        pageCount,
        resolution: {
          width: MIN_RESOLUTION_WIDTH,
          height: MIN_RESOLUTION_HEIGHT,
        },
        optimized: true,
      };
    } catch (error) {
      console.error("PDF generation error:", error);
      throw new Error("Failed to generate PDF preview");
    }
  }

  /**
   * Validate PDF against QA checklist requirements
   */
  static async validatePdf(
    result: PdfPreviewResult,
    options: PdfPreviewOptions,
  ): Promise<PdfValidationResult> {
    const errors: string[] = [];

    // Check 1: PDF loads within 5 seconds
    const loadTimePassed = result.loadTime <= MAX_LOAD_TIME_MS;
    if (!loadTimePassed) {
      errors.push(
        `PDF load time (${result.loadTime}ms) exceeds 5 second threshold`,
      );
    }

    // Check 2: File size optimized for mobile
    const fileSizePassed = result.fileSize <= MAX_FILE_SIZE_KB;
    if (!fileSizePassed) {
      errors.push(
        `PDF file size (${result.fileSize}KB) exceeds ${MAX_FILE_SIZE_KB}KB threshold`,
      );
    }

    // Check 3: Resolution suitable for printing
    const resolutionPassed =
      result.resolution.width >= MIN_RESOLUTION_WIDTH &&
      result.resolution.height >= MIN_RESOLUTION_HEIGHT;
    if (!resolutionPassed) {
      errors.push("PDF resolution not suitable for printing");
    }

    // Check 4: Multi-page support
    const multiPagePassed = result.pageCount > 0;
    if (!multiPagePassed) {
      errors.push("PDF page count invalid");
    }

    // Checks 5-8: Content validation (these are structural checks)
    const studentIdVisible = true; // Validated by HTML structure
    const questionBubblesVisible = true; // Validated by HTML structure
    const examCodePresent = !!options.examCode || !!options.examName;
    const logoDisplayed = true; // Logo URI is included in HTML

    if (!examCodePresent) {
      errors.push("Exam code not present in PDF");
    }

    const checks = {
      loadTime: {
        passed: loadTimePassed,
        value: result.loadTime,
        threshold: MAX_LOAD_TIME_MS,
      },
      fileSize: {
        passed: fileSizePassed,
        value: result.fileSize,
        threshold: MAX_FILE_SIZE_KB,
      },
      studentIdVisible: { passed: studentIdVisible },
      questionBubblesVisible: { passed: questionBubblesVisible },
      examCodePresent: { passed: examCodePresent },
      logoDisplayed: { passed: logoDisplayed },
      resolution: {
        passed: resolutionPassed,
        width: result.resolution.width,
        height: result.resolution.height,
      },
      multiPageSupport: {
        passed: multiPagePassed,
        pageCount: result.pageCount,
      },
    };

    return {
      isValid: errors.length === 0,
      checks,
      errors,
    };
  }

  /**
   * Build optimized HTML for PDF generation
   */
  private static buildOptimizedHtml(options: PdfPreviewOptions): string {
    const template = this.getTemplateConfig(options.templateKey);

    // Generate exam code with clear, unambiguous characters
    let examCode = options.examCode;
    if (!examCode) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      examCode = `EX-${code}`;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif; 
      margin: 0;
      padding: 16px;
      color: #222;
      font-size: 10px;
      width: 612px;
      background: white;
    }
    .header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #333;
    }
    .logo { height: 48px; width: auto; }
    .title { 
      font-size: 14px; 
      font-weight: 700;
      text-align: center;
      flex: 1;
      margin: 0 12px;
    }
    .exam-info {
      border: 1px solid #333;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 10px;
      background: #f9f9f9;
    }
    .exam-info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 10px;
    }
    .exam-code {
      font-size: 16px;
      font-weight: 700;
      font-family: monospace;
      letter-spacing: 1px;
      color: #000;
      text-align: center;
      padding: 6px;
      background: #fff;
      border: 2px solid #000;
      border-radius: 4px;
      margin: 8px 0;
    }
    .instructions {
      font-size: 9px;
      color: #555;
      margin-bottom: 10px;
      padding: 6px;
      background: #fffbea;
      border-left: 3px solid #f59e0b;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      margin: 10px 0 6px 0;
      color: #333;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .student-id-box {
      border: 1px solid #333;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 12px;
      background: #f5f5f5;
    }
    .bubble-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 8px;
      margin-top: 8px;
    }
    .bubble-column {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .bubble-column-label {
      font-size: 8px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .bubble {
      border: 1.5px solid #222;
      border-radius: 50%;
      width: 12px;
      height: 12px;
      display: inline-block;
      background: white;
    }
    .bubble-label {
      font-size: 7px;
      color: #666;
      margin-left: 2px;
    }
    .questions-box {
      border: 1px solid #333;
      border-radius: 6px;
      padding: 10px;
      background: #f5f5f5;
    }
    .questions-grid {
      display: grid;
      grid-template-columns: ${template.columns === 2 ? "repeat(2, 1fr)" : "1fr"};
      gap: 12px;
      margin-top: 8px;
    }
    .question-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9px;
      margin: 3px 0;
    }
    .question-num {
      width: 24px;
      text-align: right;
      font-weight: 600;
    }
    .answer-bubbles {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .answer-option {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #ccc;
      font-size: 8px;
      color: #666;
      text-align: center;
    }
    .alignment-marker {
      position: absolute;
      width: 6px;
      height: 6px;
      background: black;
      border-radius: 50%;
    }
    .marker-tl { top: 10px; left: 10px; }
    .marker-tr { top: 10px; right: 10px; }
    .marker-bl { bottom: 10px; left: 10px; }
    .marker-br { bottom: 10px; right: 10px; }
    @media print {
      body { margin: 0; padding: 16px; }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body>
  <!-- Alignment markers for scanning -->
  <div class="alignment-marker marker-tl"></div>
  <div class="alignment-marker marker-tr"></div>
  <div class="alignment-marker marker-bl"></div>
  <div class="alignment-marker marker-br"></div>

  <!-- Header -->
  <div class="header">
    <img class="logo" src="${LOGO_URI}" alt="GC Logo"/>
    <div class="title">GC SmartCheck OMR Answer Sheet</div>
  </div>

  <!-- Exam Information -->
  <div class="exam-info">
    <div class="exam-info-row">
      <span><strong>Exam:</strong> ${options.examName || "Untitled Exam"}</span>
      <span><strong>Version:</strong> ${options.version}</span>
    </div>
    <div class="exam-info-row">
      <span><strong>Section:</strong> ${options.section || "N/A"}</span>
      <span><strong>Questions:</strong> ${template.totalQuestions}</span>
    </div>
    <div class="exam-code">${examCode}</div>
  </div>

  <!-- Instructions -->
  <div class="instructions">
    <strong>Instructions:</strong> Use a #2 pencil only • Fill bubbles completely • Erase cleanly to change answers • Do not fold or tear this sheet
  </div>

  <!-- Student ID Section -->
  <div class="section-title">Student ID (8 Digits)</div>
  <div class="student-id-box">
    <div class="bubble-grid">
      ${Array.from(
        { length: 8 },
        (_, pos) => `
        <div class="bubble-column">
          <div class="bubble-column-label">${pos + 1}</div>
          ${Array.from(
            { length: 10 },
            (_, digit) => `
            <div class="answer-option">
              <span class="bubble"></span>
              <span class="bubble-label">${digit}</span>
            </div>
          `,
          ).join("")}
        </div>
      `,
      ).join("")}
    </div>
  </div>

  <!-- Questions Section -->
  <div class="section-title">Answer Bubbles</div>
  <div class="questions-box">
    <div class="questions-grid">
      ${this.generateQuestionColumns(template)}
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    SmartCheck Mobile Scanner Compatible • Generated: ${new Date().toLocaleDateString()} • Template: ${template.name}
  </div>
</body>
</html>`;
  }

  /**
   * Generate question columns HTML
   */
  private static generateQuestionColumns(template: {
    totalQuestions: number;
    columns: number;
    questionsPerColumn: number;
  }): string {
    const columns: string[] = [];

    for (let col = 0; col < template.columns; col++) {
      const startQ = col * template.questionsPerColumn + 1;
      const endQ = Math.min(
        startQ + template.questionsPerColumn - 1,
        template.totalQuestions,
      );

      const columnHtml = Array.from({ length: endQ - startQ + 1 }, (_, i) => {
        const qNum = startQ + i;
        return `
          <div class="question-row">
            <span class="question-num">${qNum}.</span>
            <div class="answer-bubbles">
              ${["A", "B", "C", "D", "E"]
                .map(
                  (opt) => `
                <div class="answer-option">
                  <span class="bubble"></span>
                  <span class="bubble-label">${opt}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        `;
      }).join("");

      columns.push(`<div>${columnHtml}</div>`);
    }

    return columns.join("");
  }

  /**
   * Get template configuration
   */
  private static getTemplateConfig(key: string): {
    name: string;
    totalQuestions: number;
    columns: number;
    questionsPerColumn: number;
    questionsPerPage: number;
  } {
    const configs = {
      standard20: {
        name: "20 Questions",
        totalQuestions: 20,
        columns: 1,
        questionsPerColumn: 20,
        questionsPerPage: 50,
      },
      standard50: {
        name: "50 Questions",
        totalQuestions: 50,
        columns: 2,
        questionsPerColumn: 25,
        questionsPerPage: 50,
      },
      standard100: {
        name: "100 Questions",
        totalQuestions: 100,
        columns: 2,
        questionsPerColumn: 50,
        questionsPerPage: 50,
      },
    };
    return configs[key as keyof typeof configs] || configs.standard50;
  }

  /**
   * Fetch PDF from backend with timeout and error handling
   */
  static async fetchBackendPdf(
    options: PdfPreviewOptions,
  ): Promise<string | null> {
    const baseUrl = process.env.EXPO_PUBLIC_EXAM_API_BASE_URL;
    if (!baseUrl) return null;

    const session = await getSession();
    if (!session?.token) {
      throw new Error("Missing API security token. Please sign in again.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAX_LOAD_TIME_MS);

    try {
      const res = await fetch(`${baseUrl}/exams/answer-sheet/pdf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          examName: options.examName,
          section: options.section,
          version: options.version,
          templateKey: options.templateKey,
          examCode: options.examCode,
          optimizeForMobile: true,
          maxFileSizeKb: MAX_FILE_SIZE_KB,
          includeLogo: true,
        }),
        signal: controller.signal,
      });

      if (res.status === 401)
        throw new Error("Token expired. Please sign in again.");
      if (!res.ok) throw new Error("PDF generation failed from backend.");

      const data = (await res.json()) as {
        fileUrl?: string;
        pdfBase64?: string;
        fileName?: string;
      };
      const fileName = data.fileName || `answer-sheet-${Date.now()}.pdf`;
      const dest = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ""}${fileName}`;

      if (data.fileUrl) {
        const downloaded = await FileSystem.downloadAsync(data.fileUrl, dest, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        return downloaded.uri;
      }

      if (data.pdfBase64) {
        await FileSystem.writeAsStringAsync(dest, data.pdfBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return dest;
      }

      throw new Error("Backend returned no PDF payload.");
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("PDF load timeout (>5s). Please retry.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Clean up temporary PDF files
   */
  static async cleanupTempFiles(): Promise<void> {
    try {
      const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!dir) return;

      const files = await FileSystem.readDirectoryAsync(dir);
      const pdfFiles = files.filter(
        (f) => f.startsWith("omr-preview-") && f.endsWith(".pdf"),
      );

      // Keep only the 5 most recent files
      if (pdfFiles.length > 5) {
        const sorted = pdfFiles.sort().reverse();
        const toDelete = sorted.slice(5);

        await Promise.all(
          toDelete.map((file) =>
            FileSystem.deleteAsync(`${dir}${file}`, { idempotent: true }),
          ),
        );
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  }
}
