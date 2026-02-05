import {
    ZipgradeTemplate
} from "../types/zipgrade";

export class ZipgradeGenerator {
  /**
   * Standard Zipgrade templates
   */
  static getTemplates(): { [key: string]: ZipgradeTemplate } {
    return {
      standard20: {
        name: "Standard 20 Questions",
        totalQuestions: 20,
        questionsPerColumn: 20,
        columns: 1,
        studentIdLength: 8,
        bubbleRadius: 8,
        spacing: {
          horizontal: 25,
          vertical: 18,
        },
        margins: {
          top: 120,
          left: 50,
          right: 50,
          bottom: 50,
        },
        regions: {
          studentId: {
            x: 50,
            y: 40,
            width: 300,
            height: 60,
          },
          answers: {
            x: 50,
            y: 120,
            width: 200,
            height: 400,
          },
          examInfo: {
            x: 300,
            y: 40,
            width: 150,
            height: 60,
          },
        },
      },
      standard50: {
        name: "Standard 50 Questions",
        totalQuestions: 50,
        questionsPerColumn: 25,
        columns: 2,
        studentIdLength: 8,
        bubbleRadius: 6,
        spacing: {
          horizontal: 20,
          vertical: 15,
        },
        margins: {
          top: 120,
          left: 40,
          right: 40,
          bottom: 40,
        },
        regions: {
          studentId: {
            x: 40,
            y: 30,
            width: 280,
            height: 60,
          },
          answers: {
            x: 40,
            y: 120,
            width: 400,
            height: 400,
          },
          examInfo: {
            x: 350,
            y: 30,
            width: 120,
            height: 60,
          },
        },
      },
      standard100: {
        name: "Standard 100 Questions",
        totalQuestions: 100,
        questionsPerColumn: 50,
        columns: 2,
        studentIdLength: 8,
        bubbleRadius: 5,
        spacing: {
          horizontal: 18,
          vertical: 12,
        },
        margins: {
          top: 100,
          left: 30,
          right: 30,
          bottom: 30,
        },
        regions: {
          studentId: {
            x: 30,
            y: 20,
            width: 250,
            height: 60,
          },
          answers: {
            x: 30,
            y: 100,
            width: 450,
            height: 650,
          },
          examInfo: {
            x: 320,
            y: 20,
            width: 100,
            height: 60,
          },
        },
      },
    };
  }

  /**
   * Generate SVG answer sheet
   */
  static generateAnswerSheetSVG(
    templateName: keyof ReturnType<typeof ZipgradeGenerator.getTemplates>,
    examId: string = "EXAM001",
    version: "A" | "B" | "C" | "D" = "A",
  ): string {
    const template = this.getTemplates()[templateName];
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    const svgWidth = 612; // 8.5 inches at 72 DPI
    const svgHeight = 792; // 11 inches at 72 DPI

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .header-text { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; }
      .label-text { font-family: Arial, sans-serif; font-size: 10px; }
      .question-text { font-family: Arial, sans-serif; font-size: 9px; }
      .bubble { fill: none; stroke: black; stroke-width: 1; }
      .grid-line { stroke: #ccc; stroke-width: 0.5; }
    </style>
  </defs>
  
  <!-- Header -->
  <text x="50" y="25" class="header-text">ZIPGRADE ANSWER SHEET</text>
  <text x="400" y="25" class="label-text">Exam: ${examId} | Version: ${version}</text>
  
  <!-- Instructions -->
  <text x="50" y="45" class="label-text">• Use a #2 pencil only</text>
  <text x="50" y="58" class="label-text">• Fill bubbles completely</text>
  <text x="50" y="71" class="label-text">• Erase cleanly to change answers</text>
`;

    // Student ID Section
    svg += this.generateStudentIdSection(template);

    // Answer Section
    svg += this.generateAnswerSection(template);

    // Footer
    svg += `
  <!-- Footer -->
  <text x="50" y="${svgHeight - 20}" class="label-text">SmartCheck Mobile Scanner Compatible</text>
  
  <!-- Alignment markers -->
  <circle cx="30" cy="30" r="3" fill="black"/>
  <circle cx="${svgWidth - 30}" cy="30" r="3" fill="black"/>
  <circle cx="30" cy="${svgHeight - 30}" r="3" fill="black"/>
  <circle cx="${svgWidth - 30}" cy="${svgHeight - 30}" r="3" fill="black"/>
  
</svg>`;

    return svg;
  }

  /**
   * Generate student ID section
   */
  private static generateStudentIdSection(template: ZipgradeTemplate): string {
    const { studentId } = template.regions;
    const { bubbleRadius, spacing } = template;

    let svg = `
  <!-- Student ID Section -->
  <text x="${studentId.x}" y="${studentId.y - 10}" class="label-text">STUDENT ID (Fill bubbles for each digit)</text>
  <rect x="${studentId.x - 5}" y="${studentId.y - 5}" width="${studentId.width + 10}" height="${studentId.height + 10}" 
        fill="none" stroke="black" stroke-width="1"/>
`;

    // Generate digit columns
    for (let pos = 0; pos < template.studentIdLength; pos++) {
      const x = studentId.x + 20 + pos * spacing.horizontal;

      // Position label
      svg += `<text x="${x}" y="${studentId.y + 10}" class="question-text" text-anchor="middle">${pos + 1}</text>`;

      // Digit bubbles (0-9)
      for (let digit = 0; digit <= 9; digit++) {
        const y = studentId.y + 20 + digit * 15;
        svg += `<circle cx="${x}" cy="${y}" r="${bubbleRadius}" class="bubble"/>`;
        svg += `<text x="${x - 15}" y="${y + 3}" class="question-text">${digit}</text>`;
      }
    }

    return svg;
  }

  /**
   * Generate answer section
   */
  private static generateAnswerSection(template: ZipgradeTemplate): string {
    const { answers } = template.regions;
    const { bubbleRadius, spacing } = template;

    let svg = `
  <!-- Answer Section -->
  <text x="${answers.x}" y="${answers.y - 10}" class="label-text">ANSWERS</text>
  <rect x="${answers.x - 5}" y="${answers.y - 5}" width="${answers.width + 10}" height="${answers.height + 10}" 
        fill="none" stroke="black" stroke-width="1"/>
`;

    const questionsPerColumn = template.questionsPerColumn;
    const options = ["A", "B", "C", "D"];

    for (let col = 0; col < template.columns; col++) {
      const colX = answers.x + 20 + col * 200;

      for (let row = 0; row < questionsPerColumn; row++) {
        const questionNum = col * questionsPerColumn + row + 1;
        if (questionNum > template.totalQuestions) break;

        const questionY = answers.y + 20 + row * spacing.vertical;

        // Question number
        svg += `<text x="${colX - 15}" y="${questionY + 3}" class="question-text">${questionNum}</text>`;

        // Answer bubbles
        options.forEach((option, optIndex) => {
          const bubbleX = colX + optIndex * spacing.horizontal;
          svg += `<circle cx="${bubbleX}" cy="${questionY}" r="${bubbleRadius}" class="bubble"/>`;
          svg += `<text x="${bubbleX}" y="${questionY - bubbleRadius - 3}" class="question-text" text-anchor="middle">${option}</text>`;
        });
      }
    }

    return svg;
  }

  /**
   * Generate filled answer sheet for testing
   */
  static generateFilledAnswerSheet(
    templateName: keyof ReturnType<typeof ZipgradeGenerator.getTemplates>,
    studentId: string,
    answers: { [questionNumber: number]: "A" | "B" | "C" | "D" },
    examId: string = "EXAM001",
  ): string {
    const template = this.getTemplates()[templateName];
    let svg = this.generateAnswerSheetSVG(templateName, examId);

    // Fill student ID bubbles
    const studentIdDigits = studentId
      .padStart(template.studentIdLength, "0")
      .split("");
    studentIdDigits.forEach((digit, pos) => {
      const x =
        template.regions.studentId.x + 20 + pos * template.spacing.horizontal;
      const y = template.regions.studentId.y + 20 + parseInt(digit) * 15;

      // Add filled bubble
      svg = svg.replace(
        `<circle cx="${x}" cy="${y}" r="${template.bubbleRadius}" class="bubble"/>`,
        `<circle cx="${x}" cy="${y}" r="${template.bubbleRadius}" class="bubble" fill="black"/>`,
      );
    });

    // Fill answer bubbles
    Object.entries(answers).forEach(([questionNum, answer]) => {
      const qNum = parseInt(questionNum);
      const col = Math.floor((qNum - 1) / template.questionsPerColumn);
      const row = (qNum - 1) % template.questionsPerColumn;

      const colX = template.regions.answers.x + 20 + col * 200;
      const questionY =
        template.regions.answers.y + 20 + row * template.spacing.vertical;

      const optIndex = ["A", "B", "C", "D"].indexOf(answer);
      const bubbleX = colX + optIndex * template.spacing.horizontal;

      // Add filled bubble
      svg = svg.replace(
        `<circle cx="${bubbleX}" cy="${questionY}" r="${template.bubbleRadius}" class="bubble"/>`,
        `<circle cx="${bubbleX}" cy="${questionY}" r="${template.bubbleRadius}" class="bubble" fill="black"/>`,
      );
    });

    return svg;
  }

  /**
   * Generate random filled answer sheet for testing
   */
  static generateRandomFilledSheet(
    templateName: keyof ReturnType<typeof ZipgradeGenerator.getTemplates>,
    examId: string = "EXAM001",
  ): {
    svg: string;
    studentId: string;
    answers: { [key: number]: "A" | "B" | "C" | "D" };
  } {
    const template = this.getTemplates()[templateName];

    // Generate random student ID
    const studentId = Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0");

    // Generate random answers
    const answers: { [key: number]: "A" | "B" | "C" | "D" } = {};
    const options: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

    for (let i = 1; i <= template.totalQuestions; i++) {
      // 90% chance of answering (10% blank)
      if (Math.random() > 0.1) {
        answers[i] = options[Math.floor(Math.random() * options.length)];
      }
    }

    const svg = this.generateFilledAnswerSheet(
      templateName,
      studentId,
      answers,
      examId,
    );

    return { svg, studentId, answers };
  }

  /**
   * Convert SVG to data URL for display
   */
  static svgToDataUrl(svg: string): string {
    const encoded = encodeURIComponent(svg);
    return `data:image/svg+xml;charset=utf-8,${encoded}`;
  }
}
