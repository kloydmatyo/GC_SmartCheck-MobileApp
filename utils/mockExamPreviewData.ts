import { EditableExamFields, ExamPreviewData } from '@/types/exam';

export const MOCK_EXAM_PREVIEWS: ExamPreviewData[] = [
  {
    metadata: {
      examId: 'exam-draft-001',
      title: 'Midterm Exam',
      subject: 'Systems Integration and Architecture 1',
      section: 'BSIT-3B',
      date: '2026-02-25',
      status: 'Draft',
      examCode: 'SIA1-MID-B3B',
      createdAt: new Date('2026-02-17T07:34:00Z'),
      updatedAt: new Date('2026-02-17T07:34:00Z'),
      createdBy: 'admin',
      version: 3,
    },
    answerKey: null,
    totalQuestions: 50,
    choiceFormat: 'A-E',
    description: 'Midterm exam for BSIT-3B covering modules 1 to 5.',
    notes: 'Students must use #2 pencil.',
    lastModified: new Date('2026-02-17T07:34:00Z'),
  },
  {
    metadata: {
      examId: 'exam-scheduled-002',
      title: 'Quiz 4',
      subject: 'Information Assurance and Security 1',
      section: 'BSIT-3A',
      date: '2026-02-28',
      status: 'Scheduled',
      examCode: 'IAS1-Q4-B3A',
      createdAt: new Date('2026-02-16T11:10:00Z'),
      updatedAt: new Date('2026-02-16T11:10:00Z'),
      createdBy: 'admin',
      version: 1,
    },
    answerKey: null,
    totalQuestions: 20,
    choiceFormat: 'A-D',
    description: 'Scheduled short quiz for BSIT-3A.',
    notes: 'Ensure seat plan and roster sync.',
    lastModified: new Date('2026-02-16T11:10:00Z'),
  }
];

export function updateMockExamPreview(
  examId: string,
  patch: EditableExamFields & { version: number; lastModified: Date }
): ExamPreviewData | null {
  const idx = MOCK_EXAM_PREVIEWS.findIndex((exam) => exam.metadata.examId === examId);
  if (idx < 0) return null;

  const next: ExamPreviewData = {
    ...MOCK_EXAM_PREVIEWS[idx],
    metadata: {
      ...MOCK_EXAM_PREVIEWS[idx].metadata,
      title: patch.title || MOCK_EXAM_PREVIEWS[idx].metadata.title,
      date: patch.examDate || MOCK_EXAM_PREVIEWS[idx].metadata.date,
      version: patch.version,
    },
    description: patch.description || MOCK_EXAM_PREVIEWS[idx].description,
    notes: patch.notes || MOCK_EXAM_PREVIEWS[idx].notes,
    lastModified: patch.lastModified,
  };

  MOCK_EXAM_PREVIEWS[idx] = next;
  return next;
}
