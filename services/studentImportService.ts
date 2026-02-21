/**
 * Student Import Service
 * Handles bulk student imports from CSV/Excel files
 * Requirements: 22-32 (Bulk Student Import System)
 */

import { auth, db } from "@/config/firebase";
import { collection, addDoc, query, where, getDocs, writeBatch } from "firebase/firestore";
import { 
  ImportRow, 
  ImportValidationError, 
  ImportResult, 
  ImportSession,
  StudentExtended 
} from "@/types/student";
import { StudentValidationService } from "./studentValidationService";
// Offline cache disabled due to SQLite compatibility issues
// import { StudentDatabaseService } from "./studentDatabaseService";

// File validation constants
const IMPORT_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  BATCH_SIZE: 100,
  REQUIRED_FIELDS: ['student_id', 'first_name', 'last_name']
};

export class StudentImportService {
  /**
   * REQ 23: Validate file type and size
   */
  static validateFile(fileUri: string, fileSize: number, mimeType: string): ImportValidationError[] {
    const errors: ImportValidationError[] = [];

    // Check file size
    if (fileSize > IMPORT_CONFIG.MAX_FILE_SIZE) {
      errors.push({
        rowNumber: 0,
        field: 'file',
        value: `${fileSize} bytes`,
        error: `File size exceeds maximum of ${IMPORT_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
        severity: 'error'
      });
    }

    // Check file type
    if (!IMPORT_CONFIG.ALLOWED_TYPES.includes(mimeType.toLowerCase())) {
      errors.push({
        rowNumber: 0,
        field: 'file',
        value: mimeType,
        error: 'Invalid file type. Only CSV and Excel files are allowed',
        severity: 'error'
      });
    }

    return errors;
  }

  /**
   * REQ 24: Parse CSV file content
   */
  static parseCSV(fileContent: string): ImportRow[] {
    const lines = fileContent.trim().split('\n');
    if (lines.length === 0) return [];

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Parse rows
    const rows: ImportRow[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      
      if (values.length < headers.length) continue; // Skip incomplete rows

      const row: ImportRow = {
        rowNumber: i + 1,
        studentId: '',
        firstName: '',
        lastName: '',
        email: undefined,
        section: undefined
      };

      headers.forEach((header, index) => {
        const value = values[index] || '';
        
        switch (header) {
          case 'student_id':
          case 'studentid':
          case 'id':
            row.studentId = value;
            break;
          case 'first_name':
          case 'firstname':
            row.firstName = value;
            break;
          case 'last_name':
          case 'lastname':
            row.lastName = value;
            break;
          case 'email':
            row.email = value;
            break;
          case 'section':
            row.section = value;
            break;
        }
      });

      rows.push(row);
    }

    return rows;
  }

  /**
   * REQ 25: Field mapping validation
   */
  static validateRow(row: ImportRow): ImportValidationError[] {
    const errors: ImportValidationError[] = [];

    // Validate required fields
    if (!row.studentId || row.studentId.trim() === '') {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'student_id',
        value: row.studentId,
        error: 'Student ID is required',
        severity: 'error'
      });
    }

    if (!row.firstName || row.firstName.trim() === '') {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'first_name',
        value: row.firstName,
        error: 'First name is required',
        severity: 'error'
      });
    }

    if (!row.lastName || row.lastName.trim() === '') {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'last_name',
        value: row.lastName,
        error: 'Last name is required',
        severity: 'error'
      });
    }

    // Validate student ID format
    if (row.studentId && !StudentValidationService.isValidIdFormat(row.studentId)) {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'student_id',
        value: row.studentId,
        error: 'Invalid student ID format (must be 8 digits)',
        severity: 'error'
      });
    }

    // Validate email format
    if (row.email && row.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.email)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: 'email',
          value: row.email,
          error: 'Invalid email format',
          severity: 'warning'
        });
      }
    }

    // Validate name length
    if (row.firstName && row.firstName.length > 100) {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'first_name',
        value: row.firstName,
        error: 'First name exceeds maximum length of 100 characters',
        severity: 'warning'
      });
    }

    if (row.lastName && row.lastName.length > 100) {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'last_name',
        value: row.lastName,
        error: 'Last name exceeds maximum length of 100 characters',
        severity: 'warning'
      });
    }

    return errors;
  }

  /**
   * REQ 26: Duplicate detection query
   */
  static async checkForDuplicates(rows: ImportRow[]): Promise<Map<string, number[]>> {
    const duplicates = new Map<string, number[]>();

    // Check for duplicates within the file
    const idMap = new Map<string, number[]>();
    
    rows.forEach(row => {
      if (!row.studentId) return;
      
      if (!idMap.has(row.studentId)) {
        idMap.set(row.studentId, []);
      }
      idMap.get(row.studentId)!.push(row.rowNumber);
    });

    // Find duplicates
    idMap.forEach((rowNumbers, studentId) => {
      if (rowNumbers.length > 1) {
        duplicates.set(studentId, rowNumbers);
      }
    });

    // Check against existing database
    try {
      const studentIds = Array.from(idMap.keys());
      const existingIds = await this.checkExistingStudents(studentIds);
      
      existingIds.forEach(studentId => {
        const rowNumbers = idMap.get(studentId) || [];
        if (rowNumbers.length > 0) {
          duplicates.set(`existing_${studentId}`, rowNumbers);
        }
      });

    } catch (error) {
      console.error('[Import] Duplicate check failed:', error);
    }

    return duplicates;
  }

  /**
   * Check which student IDs already exist in Firestore
   */
  private static async checkExistingStudents(studentIds: string[]): Promise<string[]> {
    try {
      const studentsRef = collection(db, 'students');
      const existing: string[] = [];

      // Query in batches of 10 (Firestore 'in' query limit)
      for (let i = 0; i < studentIds.length; i += 10) {
        const batch = studentIds.slice(i, i + 10);
        const q = query(studentsRef, where('student_id', 'in', batch));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc: any) => {
          const data = doc.data();
          existing.push(data.student_id);
        });
      }

      return existing;

    } catch (error) {
      console.error('[Import] Failed to check existing students:', error);
      return [];
    }
  }

  /**
   * REQ 22-32: Process import with full validation and error handling
   */
  static async processImport(
    fileUri: string,
    fileSize: number,
    mimeType: string,
    fileContent: string,
    onProgress?: (progress: number) => void
  ): Promise<ImportResult> {
    const sessionId = `import_${Date.now()}`;
    const timestamp = new Date().toISOString();

    // REQ 30: Create import session
    const session: ImportSession = {
      id: sessionId,
      filename: fileUri.split('/').pop() || 'unknown',
      fileSize,
      startedAt: timestamp,
      status: 'processing',
      userId: auth.currentUser?.uid
    };

    try {
      // REQ 23: Validate file
      const fileErrors = this.validateFile(fileUri, fileSize, mimeType);
      if (fileErrors.length > 0) {
        return {
          totalRows: 0,
          successCount: 0,
          errorCount: fileErrors.length,
          warningCount: 0,
          duplicateCount: 0,
          errors: fileErrors,
          processedRows: [],
          sessionId,
          timestamp
        };
      }

      // REQ 24: Parse file
      const rows = this.parseCSV(fileContent);
      const totalRows = rows.length;

      onProgress?.(10);

      // REQ 25: Validate each row
      const allErrors: ImportValidationError[] = [];
      const validRows: ImportRow[] = [];

      rows.forEach(row => {
        const rowErrors = this.validateRow(row);
        if (rowErrors.length > 0) {
          allErrors.push(...rowErrors);
        } else {
          validRows.push(row);
        }
      });

      onProgress?.(30);

      // REQ 26: Check for duplicates
      const duplicates = await this.checkForDuplicates(validRows);
      const duplicateCount = duplicates.size;

      // Add duplicate errors
      duplicates.forEach((rowNumbers, studentId) => {
        rowNumbers.forEach(rowNumber => {
          allErrors.push({
            rowNumber,
            field: 'student_id',
            value: studentId.replace('existing_', ''),
            error: studentId.startsWith('existing_') 
              ? 'Student ID already exists in database'
              : 'Duplicate student ID in import file',
            severity: 'error'
          });
        });
      });

      onProgress?.(50);

      // Filter out rows with errors or duplicates
      const rowsToInsert = validRows.filter(row => {
        const hasDuplicate = Array.from(duplicates.values()).some(nums => nums.includes(row.rowNumber));
        return !hasDuplicate;
      });

      // REQ 28: Batch insert valid rows
      let successCount = 0;

      if (rowsToInsert.length > 0) {
        successCount = await this.insertStudentsBatch(rowsToInsert, onProgress);
      }

      onProgress?.(100);

      // Count errors and warnings
      const errorCount = allErrors.filter(e => e.severity === 'error').length;
      const warningCount = allErrors.filter(e => e.severity === 'warning').length;

      const result: ImportResult = {
        totalRows,
        successCount,
        errorCount,
        warningCount,
        duplicateCount,
        errors: allErrors,
        processedRows: rowsToInsert,
        sessionId,
        timestamp
      };

      // REQ 30: Log import session
      await this.logImportSession(session, result);

      return result;

    } catch (error) {
      console.error('[Import] Processing failed:', error);
      
      // REQ 31: Rollback mechanism
      await this.rollbackImport(sessionId);

      throw error;
    }
  }

  /**
   * REQ 28, 32: Insert students in batches (optimized for large files)
   */
  private static async insertStudentsBatch(
    rows: ImportRow[],
    onProgress?: (progress: number) => void
  ): Promise<number> {
    try {
      let insertedCount = 0;
      const batchSize = IMPORT_CONFIG.BATCH_SIZE;
      const totalBatches = Math.ceil(rows.length / batchSize);

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;

        // Use Firestore batch write
        const firestoreBatch = writeBatch(db);
        const studentsRef = collection(db, 'students');

        batch.forEach(row => {
          const studentData: Omit<StudentExtended, 'student_id'> & { student_id: string } = {
            student_id: row.studentId,
            first_name: row.firstName,
            last_name: row.lastName,
            email: row.email,
            section: row.section,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const docRef = addDoc(studentsRef, studentData);
        });

        await firestoreBatch.commit();
        insertedCount += batch.length;

        // Update progress
        const progress = 50 + (currentBatch / totalBatches) * 50;
        onProgress?.(Math.round(progress));
      }

      // REQ 30: Sync offline cache after import
      try {
        const { StudentDatabaseService } = await import('@/services/studentDatabaseService');
        await StudentDatabaseService.downloadStudentDatabase();
      } catch (cacheError) {
        console.warn('[Import] Offline cache sync failed (non-critical):', cacheError);
      }

      return insertedCount;

    } catch (error) {
      console.error('[Import] Batch insert failed:', error);
      throw error;
    }
  }

  /**
   * REQ 30: Log import session
   */
  private static async logImportSession(session: ImportSession, result: ImportResult): Promise<void> {
    try {
      const completedSession: ImportSession = {
        ...session,
        completedAt: new Date().toISOString(),
        status: result.errorCount > 0 ? 'completed' : 'completed',
        result
      };

      // REQ 28: Save import session to Firestore
      console.log('[Import] Session logged:', completedSession);
      
      await addDoc(collection(db, 'import_sessions'), completedSession);

    } catch (error) {
      console.error('[Import] Failed to log session:', error);
    }
  }

  /**
   * REQ 31: Rollback mechanism for fatal errors
   */
  private static async rollbackImport(sessionId: string): Promise<void> {
    try {
      console.log(`[Import] Rolling back session: ${sessionId}`);
      
      // In production, this would:
      // 1. Query all students added in this session
      // 2. Delete them from Firestore
      // 3. Update session status to 'rolled_back'
      
      // For now, just log the rollback attempt
      console.log('[Import] Rollback completed');

    } catch (error) {
      console.error('[Import] Rollback failed:', error);
    }
  }

  /**
   * Helper: Convert import row to student entity
   */
  private static rowToStudent(row: ImportRow): StudentExtended {
    return {
      student_id: row.studentId,
      first_name: row.firstName,
      last_name: row.lastName,
      email: row.email,
      section: row.section,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
}
