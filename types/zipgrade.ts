export interface ZipgradeAnswerSheet {
  studentId: string;
  examId: string;
  version: "A" | "B" | "C" | "D";
  totalQuestions: number;
  questionsPerRow: number;
  bubbleSize: number;
  sheetDimensions: {
    width: number;
    height: number;
  };
}

export interface ZipgradeBubble {
  questionNumber: number;
  option: "A" | "B" | "C" | "D";
  position: {
    x: number;
    y: number;
  };
  filled: boolean;
}

export interface ZipgradeStudentIdBubble {
  digit: number; // 0-9
  position: number; // position in student ID (0-7 for 8-digit ID)
  coordinates: {
    x: number;
    y: number;
  };
  filled: boolean;
}

export interface ZipgradeTemplate {
  name: string;
  totalQuestions: number;
  questionsPerColumn: number;
  columns: number;
  studentIdLength: number;
  bubbleRadius: number;
  spacing: {
    horizontal: number;
    vertical: number;
  };
  margins: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  regions: {
    studentId: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    answers: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    examInfo: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
}
