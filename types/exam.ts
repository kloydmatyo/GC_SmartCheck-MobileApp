export interface ExamMetadata {
  examId: string;
  title: string;
  subject?: string;
  section?: string;
  date?: string;
  examCode: string;
  status: "Draft" | "Scheduled" | "Active" | "Completed";
  structureLocked?: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version: number;
}

export interface QuestionSetting {
  questionNumber: number;
  correctAnswer: string;
  points: number;
  choiceLabels?: Record<string, string>;
}

export interface AnswerKeyData {
  id: string;
  examId: string;
  answers: string[];
  questionSettings: QuestionSetting[];
  locked: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version: number;
}

export interface ExamConfiguration {
  metadata: ExamMetadata;
  answerKey: AnswerKeyData | null;
  templateLayout?: {
    name: string;
    totalQuestions: number;
    choiceFormat: "A-D" | "A-E";
    columns: number;
    questionsPerColumn: number;
  };
}

export interface ExamPreviewData extends ExamConfiguration {
  totalQuestions: number;
  choiceFormat: "A-D" | "A-E";
  lastModified: Date;
  description?: string;
  notes?: string;
}

export interface AuditLogEntry {
  action: string;
  timestamp: string;
  actor?: string;
  metadata?: any;
  [key: string]: any; // Allow for flexible audit log structures
}

export interface EditableExamFields {
  title?: string;
  subject?: string;
  examDate?: string;
  description?: string;
  notes?: string;
  expectedVersion?: number;
}

export class ExamPreviewError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ExamPreviewError';
  }
}

export interface ExamPreviewResult {
  data?: ExamPreviewData;
  error?: string;
  fromCache?: boolean;
}
