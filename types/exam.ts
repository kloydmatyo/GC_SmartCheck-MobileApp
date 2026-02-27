export interface ExamMetadata {
  examId: string;
  title: string;
  subject?: string;
  section?: string;
  date?: string;
  examCode: string;
  status: "Draft" | "Scheduled" | "Active" | "Completed";
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
  answerKey: AnswerKeyData;
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
}
