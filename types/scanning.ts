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
}

export interface GradingResult {
  studentId: string;
  examId: string;
  score: number;
  totalPoints: number;
  percentage: number;
  gradeEquivalent: string; // A, B, C, D, or F
  correctAnswers: number;
  totalQuestions: number;
  dateScanned: string; // ISO 8601 timestamp
  status: "saved" | "duplicate" | "pending" | "error";
  details: {
    questionNumber: number;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    points: number;
  }[];
}

export interface GradeStorageRecord {
  studentId: string; // e.g. "20231234"
  examId: string; // Firestore exams/{examId}
  score: number;
  totalPoints: number;
  percentage: number;
  gradeEquivalent: string; // A, B, C, D, or F
  correctAnswers: number;
  totalQuestions: number;
  dateScanned: string; // ISO 8601 — "2026-02-19T10:30:00.000Z"
  status: "saved" | "duplicate" | "pending" | "error";
  savedBy: string; // Firebase auth UID of the faculty who scanned
  createdAt: Date;
}

export interface BubbleDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  filled: boolean;
  confidence: number;
}
