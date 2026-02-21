export interface StudentAnswer {
  questionNumber: number;
  selectedAnswer: string; // A, B, C, D, or null
}

export interface AnswerKey {
  questionNumber: number;
  correctAnswer: string;
  points: number;
}

export interface ScanResult {
  studentId: string;
  answers: StudentAnswer[];
  confidence: number; // 0-1 scale
  processedImageUri?: string;
}

export interface GradingResult {
  studentId: string;
  score: number;
  totalPoints: number;
  percentage: number;
  correctAnswers: number;
  totalQuestions: number;
  details: {
    questionNumber: number;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    points: number;
  }[];
}

export interface BubbleDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  filled: boolean;
  confidence: number;
}
