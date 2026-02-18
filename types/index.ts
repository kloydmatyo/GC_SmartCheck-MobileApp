/**
 * types/index.ts
 *
 * Shared TypeScript interfaces for the GC SmartCheck app.
 * All screens and utils import from here to keep data shapes consistent.
 */

// ── Student ──────────────────────────────────────────────────────
export interface Student {
  id: string;         // e.g. "202310813"
  name: string;       // "Last, First Middle"
  photoUri?: string;  // local or remote image URI
  score?: number;     // latest quiz score
  totalItems?: number;
}

// ── Answer Key ───────────────────────────────────────────────────
export type AnswerChoice = 'A' | 'B' | 'C' | 'D' | 'E';

export interface QuestionAnswer {
  questionNumber: number;
  correctAnswer: AnswerChoice;
}

// ── Quiz ─────────────────────────────────────────────────────────
export interface Quiz {
  id: string;
  name: string;           // e.g. "Midterm Exam"
  subject: string;
  numberOfItems: number;
  answerKey: QuestionAnswer[];
  createdAt: string;      // "YYYY-MM-DD"
  studentCount: number;
  classId: string;        // foreign key to ClassSection.id
  status: 'Active' | 'Completed' | 'Upcoming';
}

// ── Student Quiz Result ──────────────────────────────────────────
export interface StudentResult {
  studentId: string;
  studentName: string;
  photoUri?: string;
  answers: string[];      // student's answers per item index
  score: number;
  totalItems: number;
  quizId: string;
}

// ── Class Section ────────────────────────────────────────────────
export interface ClassSection {
  id: string;
  name: string;           // e.g. "BSIT-3A"
  subject: string;
  studentCount: number;
  students: Student[];
  recentQuizzes: Quiz[];
  school: string;         // e.g. "Gordon College"
}