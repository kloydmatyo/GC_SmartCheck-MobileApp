import { EditableExamFields, ExamPreviewData } from '@/types/exam';

export const MOCK_EXAM_PREVIEWS: ExamPreviewData[] = [
  {
    id: 'exam-draft-001',
    title: 'Midterm Exam',
    subject: 'Systems Integration and Architecture 1',
    section: 'BSIT-3B',
    examDate: '2026-02-25',
    status: 'Draft',
    questionCount: 50,
    choicesFormat: 'A-E',
    answerKey: Array.from({ length: 50 }, (_, i) => ['A', 'B', 'C', 'D', 'E'][i % 5]),
    examCode: 'SIA1-MID-B3B',
    template: {
      id: 'standard50',
      name: 'Standard 50 Questions',
      omrLayout: '2 columns, 25 questions per column, bubble grid A-E',
      columns: 2,
      questionsPerColumn: 25,
      totalQuestions: 50,
    },
    description:
      'Midterm exam for BSIT-3B covering modules 1 to 5. Keep all instruction formatting exactly as configured on web.',
    notes:
      'Students must use #2 pencil. Shade bubbles fully. Do not use check marks. This note can be long and should remain scrollable on mobile.',
    version: 3,
    lastModified: '2026-02-17T07:34:00Z',
  },
  {
    id: 'exam-scheduled-002',
    title: 'Quiz 4',
    subject: 'Information Assurance and Security 1',
    section: 'BSIT-3A',
    examDate: '2026-02-28',
    status: 'Scheduled',
    questionCount: 20,
    choicesFormat: 'A-D',
    answerKey: Array.from({ length: 20 }, (_, i) => ['A', 'B', 'C', 'D'][i % 4]),
    examCode: 'IAS1-Q4-B3A',
    template: {
      id: 'standard20',
      name: 'Standard 20 Questions',
      omrLayout: 'Single column, 20 questions, bubble grid A-D',
      columns: 1,
      questionsPerColumn: 20,
      totalQuestions: 20,
    },
    description:
      'Scheduled short quiz for BSIT-3A. Mobile preview is read-only and mirrors the web exam setup.',
    notes:
      'Ensure seat plan and roster sync before activation. This exam remains in Scheduled state until manually activated on web app.',
    version: 1,
    lastModified: '2026-02-16T11:10:00Z',
  },
  {
    id: 'exam-active-003',
    title: 'Final Exam',
    subject: 'Systems Integration and Architecture 1',
    section: 'BSIT-3B',
    examDate: '2026-03-05',
    status: 'Active',
    questionCount: 100,
    choicesFormat: 'A-E',
    answerKey: Array.from({ length: 100 }, (_, i) => ['A', 'B', 'C', 'D', 'E'][i % 5]),
    examCode: 'SIA1-FINAL-B3B',
    template: {
      id: 'standard100',
      name: 'Standard 100 Questions',
      omrLayout: '2 columns, 50 questions per column, bubble grid A-E',
      columns: 2,
      questionsPerColumn: 50,
      totalQuestions: 100,
    },
    description: 'Active final exam.',
    notes: 'This item should be blocked in preview because status is Active.',
    version: 4,
    lastModified: '2026-02-17T05:02:00Z',
  },
];

export function updateMockExamPreview(
  examId: string,
  patch: EditableExamFields & { version: number; lastModified: string }
): ExamPreviewData | null {
  const idx = MOCK_EXAM_PREVIEWS.findIndex((exam) => exam.id === examId);
  if (idx < 0) return null;

  const next = {
    ...MOCK_EXAM_PREVIEWS[idx],
    title: patch.title,
    examDate: patch.examDate,
    description: patch.description,
    notes: patch.notes,
    version: patch.version,
    lastModified: patch.lastModified,
  };

  MOCK_EXAM_PREVIEWS[idx] = next;
  return next;
}
