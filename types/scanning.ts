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
  id?: string;
  studentId: string;
  examId: string;
  score: number;
  totalPoints: number;
  percentage: number;
  gradeEquivalent: string; // A, B, C, D, or F
  letterGrade: string; // Alias for gradeEquivalent
  correctAnswers: number;
  totalQuestions: number;
  dateScanned: string; // ISO 8601 timestamp
  timestamp: string; // Alias for dateScanned
  status: "saved" | "duplicate" | "pending" | "error";
  confidence: number; // 0-1 scale
  answers: {
    questionNumber: number;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    points: number;
    selectedAnswer?: string; // Alias for studentAnswer
  }[];
  details: {
    questionNumber: number;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    points: number;
  }[];
  metadata?: {
    timestamp: number;
    deviceId: string;
    isBlurred?: boolean;
    imageUri?: string;
    isValidId?: boolean;
    replacedDuplicate?: boolean;
    previousResultId?: string;
    duplicateOverride?: boolean;
    overrideTimestamp?: string;
  };
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
