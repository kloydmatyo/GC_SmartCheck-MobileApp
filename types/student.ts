/**
 * Student-related types for Subsystem 2
 */

// ── Student Extended ──────────────────────────────────────────────
export interface StudentExtended {
  student_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  section?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// ── Validation ───────────────────────────────────────────────────
export type ValidationStatus = 
  | 'VALID' 
  | 'INVALID_FORMAT' 
  | 'INVALID_ID' 
  | 'INACTIVE_STUDENT' 
  | 'NOT_IN_SECTION' 
  | 'OFFLINE_CACHED'
  | 'VALIDATION_ERROR';

export interface ValidationResult {
  studentId: string;
  status: ValidationStatus;
  isValid: boolean;
  message: string;
  timestamp: string;
  source: 'api' | 'cache' | 'local';
  studentData?: StudentExtended;
  errorDetails?: string;
}

export interface ValidationLog {
  id: string;
  studentId: string;
  status: ValidationStatus;
  timestamp: string;
  userId?: string;
  attemptedAction: 'grading' | 'lookup' | 'import';
  additionalInfo?: Record<string, any>;
}

// ── Grading with Validation ─────────────────────────────────────
export type GradeStatus = 
  | 'GRADED' 
  | 'NULL_INVALID_ID' 
  | 'NULL_INACTIVE' 
  | 'NULL_NOT_IN_SECTION' 
  | 'PENDING';

export interface GradingResultExtended {
  studentId: string;
  score: number | null;
  totalPoints: number;
  percentage: number | null;
  gradeStatus: GradeStatus;
  validationStatus: ValidationStatus;
  reasonCode?: string;
  gradedAt: string;
  reviewRequired: boolean;
}

// ── Import ───────────────────────────────────────────────────────
export interface ImportRow {
  rowNumber: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email?: string;
  section?: string;
}

export interface ImportValidationError {
  rowNumber: number;
  field: string;
  value: string;
  error: string;
  severity: 'error' | 'warning';
}

export interface ImportResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  warningCount: number;
  duplicateCount: number;
  errors: ImportValidationError[];
  processedRows: ImportRow[];
  sessionId: string;
  timestamp: string;
}

export interface ImportSession {
  id: string;
  filename: string;
  fileSize: number;
  startedAt: string;
  completedAt?: string;
  status: 'processing' | 'completed' | 'failed' | 'rolled_back';
  result?: ImportResult;
  userId?: string;
}

// ── Offline Cache ─────────────────────────────────────────────────
export interface CacheMetadata {
  lastSyncAt: string;
  studentCount: number;
  expiresAt: string;
  isExpired: boolean;
  sizeInBytes: number;
  encryptionEnabled: boolean;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt?: string;
  pendingChanges: number;
  syncErrors: string[];
}

// ── Search & Filter ───────────────────────────────────────────────
export interface StudentSearchParams {
  query?: string;
  section?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'student_id' | 'section';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface PaginatedStudents {
  students: StudentExtended[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
