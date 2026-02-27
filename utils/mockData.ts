/**
 * utils/mockData.ts
 *
 * Sample data for development.
 * Each class block (BSIT-3A, 3B, 3C) has its OWN student list.
 * When a user taps a class block, only THAT block's students are shown.
 *
 * Replace with real API calls when the backend is ready.
 * All shapes match interfaces in types/index.ts.
 */

import { ClassSection, Quiz, Student, StudentResult } from '../types';

// ── BSIT-3A Students ─────────────────────────────────────────────
const STUDENTS_3A: Student[] = [
  { id: '202310101', name: 'Arabe, Cloyd Matthew',      score: 45, totalItems: 50 },
  { id: '202310102', name: 'Bautista, Juan Miguel',     score: 38, totalItems: 50 },
  { id: '202310103', name: 'Cruz, Ana Marie',           score: 47, totalItems: 50 },
  { id: '202310104', name: 'Diaz, Jose Antonio',        score: 25, totalItems: 50 },
  { id: '202310105', name: 'Estacio, Aaron Jan',        score: 43, totalItems: 50 },
  { id: '202310106', name: 'Garcia, Maria Santos',      score: 40, totalItems: 50 },
  { id: '202310107', name: 'Hernandez, Carlo Rey',      score: 33, totalItems: 50 },
  { id: '202310108', name: 'Ignacio, Patricia Ann',     score: 48, totalItems: 50 },
  { id: '202310109', name: 'Jimenez, Roberto Luis',     score: 22, totalItems: 50 },
  { id: '202310110', name: 'Lim, Kevin Andrew',         score: 41, totalItems: 50 },
  { id: '202310111', name: 'Mendoza, Christine Joy',    score: 37, totalItems: 50 },
  { id: '202310112', name: 'Navarro, Mark Anthony',     score: 44, totalItems: 50 },
];

// ── BSIT-3B Students ─────────────────────────────────────────────
const STUDENTS_3B: Student[] = [
  { id: '202310201', name: 'Cloyd, Arabe Matthew',        score: 38, totalItems: 50 },
  { id: '202310202', name: 'Tamondong, Seann Patrick',    score: 42, totalItems: 50 },
  { id: '202310203', name: 'Castillejo, Christian John',  score: 18, totalItems: 50 },
  { id: '202310204', name: 'Ong, Vincent Paul',           score: 2,  totalItems: 50 },
  { id: '202310205', name: 'Dilag, Paul Jan',             score: 4,  totalItems: 50 },
  { id: '202310206', name: 'Del Rosario, Justin Mark',    score: 31, totalItems: 50 },
  { id: '202310207', name: 'Reyes, Jose Antonio',         score: 35, totalItems: 50 },
  { id: '202310208', name: 'Santos, Maria Luisa',         score: 46, totalItems: 50 },
  { id: '202310209', name: 'Torres, Emmanuel Rey',        score: 29, totalItems: 50 },
  { id: '202310210', name: 'Villanueva, Ana Kristine',    score: 39, totalItems: 50 },
];

// ── BSIT-3C Students ─────────────────────────────────────────────
const STUDENTS_3C: Student[] = [
  { id: '202310301', name: 'Aquino, Benedicto Jose',    score: 36, totalItems: 50 },
  { id: '202310302', name: 'Bonifacio, Clara Mae',      score: 49, totalItems: 50 },
  { id: '202310303', name: 'Corazon, Dante Miguel',     score: 27, totalItems: 50 },
  { id: '202310304', name: 'Dimalanta, Elvira Rose',    score: 41, totalItems: 50 },
  { id: '202310305', name: 'Enriquez, Francisco Jay',   score: 15, totalItems: 50 },
  { id: '202310306', name: 'Ferrer, Gina Luz',          score: 44, totalItems: 50 },
  { id: '202310307', name: 'Gomez, Hernan Carlo',       score: 32, totalItems: 50 },
  { id: '202310308', name: 'Hizon, Imelda Grace',       score: 38, totalItems: 50 },
];

// ── Quizzes per class ────────────────────────────────────────────
const QUIZZES_3A: Quiz[] = [
  {
    id: 'q1a', name: 'Midterm Exam', classId: 'c1',
    subject: 'Information Assurance and Security 1',
    numberOfItems: 50, studentCount: 12,
    answerKey: Array.from({ length: 50 }, (_, i) => ({
      questionNumber: i + 1,
      correctAnswer: (['A','B','C','D','E'] as const)[i % 5],
    })),
    createdAt: '2026-02-11', status: 'Completed',
  },
  {
    id: 'q2a', name: 'Quiz #3', classId: 'c1',
    subject: 'Information Assurance and Security 1',
    numberOfItems: 20, studentCount: 12,
    answerKey: Array.from({ length: 20 }, (_, i) => ({
      questionNumber: i + 1,
      correctAnswer: (['A','B','C','D','E'] as const)[i % 5],
    })),
    createdAt: '2026-02-01', status: 'Completed',
  },
  {
    id: 'q3a', name: 'Quiz #4', classId: 'c1',
    subject: 'Information Assurance and Security 1',
    numberOfItems: 20, studentCount: 0,
    answerKey: [],
    createdAt: '2026-02-20', status: 'Upcoming',
  },
];

const QUIZZES_3B: Quiz[] = [
  {
    id: 'q1b', name: 'Midterm Exam', classId: 'c2',
    subject: 'Systems Integration and Architecture 1',
    numberOfItems: 50, studentCount: 10,
    answerKey: Array.from({ length: 50 }, (_, i) => ({
      questionNumber: i + 1,
      correctAnswer: (['A','B','C','D','E'] as const)[i % 5],
    })),
    createdAt: '2026-02-11', status: 'Active',
  },
  {
    id: 'q2b', name: 'Quiz #3', classId: 'c2',
    subject: 'Systems Integration and Architecture 1',
    numberOfItems: 20, studentCount: 10,
    answerKey: Array.from({ length: 20 }, (_, i) => ({
      questionNumber: i + 1,
      correctAnswer: (['A','B','C','D','E'] as const)[i % 5],
    })),
    createdAt: '2026-02-04', status: 'Completed',
  },
];

const QUIZZES_3C: Quiz[] = [
  {
    id: 'q1c', name: 'Long Quiz 1', classId: 'c3',
    subject: 'Information Assurance and Security 1',
    numberOfItems: 30, studentCount: 8,
    answerKey: Array.from({ length: 30 }, (_, i) => ({
      questionNumber: i + 1,
      correctAnswer: (['A','B','C','D','E'] as const)[i % 5],
    })),
    createdAt: '2026-02-10', status: 'Completed',
  },
];

// ── Class Sections ───────────────────────────────────────────────
export const MOCK_CLASSES: ClassSection[] = [
  {
    id: 'c1',
    name: 'BSIT-3A',
    subject: 'Information Assurance and Security 1',
    studentCount: STUDENTS_3A.length,
    school: 'Gordon College',
    students: STUDENTS_3A,
    recentQuizzes: QUIZZES_3A,
  },
  {
    id: 'c2',
    name: 'BSIT-3B',
    subject: 'Systems Integration and Architecture 1',
    studentCount: STUDENTS_3B.length,
    school: 'Gordon College',
    students: STUDENTS_3B,
    recentQuizzes: QUIZZES_3B,
  },
  {
    id: 'c3',
    name: 'BSIT-3C',
    subject: 'Information Assurance and Security 1',
    studentCount: STUDENTS_3C.length,
    school: 'Gordon College',
    students: STUDENTS_3C,
    recentQuizzes: QUIZZES_3C,
  },
];

// ── All quizzes flat (for Quizzes tab) ───────────────────────────
export const MOCK_QUIZZES: Quiz[] = [
  ...QUIZZES_3A,
  ...QUIZZES_3B,
  ...QUIZZES_3C,
];

// ── Sample results for export demo ──────────────────────────────
export function getMockResults(classId: string): StudentResult[] {
  const cls = MOCK_CLASSES.find((c) => c.id === classId);
  if (!cls) return [];
  return cls.students.map((s) => ({
    studentId:   s.id,
    studentName: s.name,
    answers:     Array.from({ length: 50 }, (_, i) => (['A','B','C','D','E'])[i % 5]),
    score:       s.score ?? 0,
    totalItems:  s.totalItems ?? 50,
    quizId:      cls.recentQuizzes[0]?.id ?? '',
  }));
}