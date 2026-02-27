export interface ExamBatch {
  batchId: string;
  examId: string;
  examTitle: string;
  examCode: string;
  templateName: string;
  version: "A" | "B" | "C" | "D";
  sheetsGenerated: number;
  createdAt: Date;
  createdBy: string;
  status: "generated" | "printed" | "deleted";
  templateVersion: number;
  metadata?: {
    totalQuestions: number;
    columns: number;
    studentIdLength: number;
  };
}

export interface BatchHistoryFilter {
  examId?: string;
  status?: "generated" | "printed" | "deleted";
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
}

export interface BatchDuplicateWarning {
  isDuplicate: boolean;
  existingBatch?: ExamBatch;
  message?: string;
}

export interface BatchVersionMismatch {
  hasMismatch: boolean;
  currentVersion: number;
  batchVersion: number;
  message?: string;
}
