/**
 * Student Validation Service
 * Handles student ID validation with API calls, offline fallback, and logging
 * Requirements: 1-12 (Student ID Validation Pipeline)
 */

import { auth, db } from "@/config/firebase";
import { doc, getDoc, collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { 
  StudentExtended, 
  ValidationResult, 
  ValidationStatus,
  ValidationLog 
} from "@/types/student";

// Validation configuration
const VALIDATION_CONFIG = {
  API_TIMEOUT: 5000, // 5 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  ID_FORMAT_REGEX: /^\d{8}$/, // 8-digit student ID format
};

export class StudentValidationService {
  /**
   * REQ 1-12: Comprehensive student ID validation with fallback
   */
  static async validateStudentId(
    studentId: string,
    sectionId?: string
  ): Promise<ValidationResult> {
    const timestamp = new Date().toISOString();

    try {
      // REQ 2: Local regex validation for ID format
      if (!this.isValidIdFormat(studentId)) {
        const result: ValidationResult = {
          studentId,
          status: 'INVALID_FORMAT',
          isValid: false,
          message: 'Invalid student ID format. Must be 8 digits.',
          timestamp,
          source: 'local'
        };
        
        // REQ 8: Log validation event
        await this.logValidation(studentId, 'INVALID_FORMAT', 'grading');
        
        return result;
      }

      // REQ 1, 5, 11: API call with timeout and retry
      const apiResult = await this.validateWithAPI(studentId, sectionId);
      
      if (apiResult) {
        // REQ 8: Log successful validation
        await this.logValidation(studentId, apiResult.status, 'grading', {
          source: 'api',
          validationTime: new Date().toISOString()
        });
        
        return apiResult;
      }

      // REQ 6: Fallback to offline cached validation
      const cachedResult = await this.validateWithCache(studentId, sectionId);
      
      // REQ 8: Log cache fallback
      await this.logValidation(studentId, cachedResult.status, 'grading', {
        source: 'cache',
        reason: 'api_timeout_or_failure'
      });

      return cachedResult;

    } catch (error) {
      console.error('Validation error:', error);
      
      // REQ 6: Ultimate fallback to cache on error
      const fallbackResult = await this.validateWithCache(studentId, sectionId);
      
      // REQ 8: Log error  
      await this.logValidation(studentId, 'VALIDATION_ERROR', 'grading', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return fallbackResult;
    }
  }

  /**
   * REQ 2: Local regex validation for ID format
   */
  static isValidIdFormat(studentId: string): boolean {
    return VALIDATION_CONFIG.ID_FORMAT_REGEX.test(studentId);
  }

  /**
   * REQ 1, 5, 10, 11, 12: API validation with timeout, retry, and security
   */
  private static async validateWithAPI(
    studentId: string,
    sectionId?: string,
    attempt: number = 1
  ): Promise<ValidationResult | null> {
    try {
      // REQ 12: Secure API with authentication
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn('User not authenticated for API validation');
        return null;
      }

      // REQ 5: Timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), VALIDATION_CONFIG.API_TIMEOUT);

      try {
        // REQ 1, 10: API call (Firestore query with optimization)
        const studentsRef = collection(db, 'students');
        const q = query(studentsRef, where('student_id', '==', studentId));
        
        const querySnapshot = await Promise.race([
          getDocs(q),
          new Promise<never>((_: any, reject: any) => 
            setTimeout(() => reject(new Error('Timeout')), VALIDATION_CONFIG.API_TIMEOUT)
          )
        ]);

        clearTimeout(timeoutId);

        if (querySnapshot.empty) {
          return {
            studentId,
            status: 'INVALID_ID',
            isValid: false,
            message: 'Student ID not found in database',
            timestamp: new Date().toISOString(),
            source: 'api'
          };
        }

        const studentDoc = querySnapshot.docs[0];
        const studentData = studentDoc.data() as StudentExtended;

        // REQ 4: Inactive student detection
        if (!studentData.is_active) {
          return {
            studentId,
            status: 'INACTIVE_STUDENT',
            isValid: false,
            message: 'Student account is inactive',
            timestamp: new Date().toISOString(),
            source: 'api',
            studentData
          };
        }

        // REQ 3: Section verification logic
        if (sectionId && studentData.section !== sectionId) {
          return {
            studentId,
            status: 'NOT_IN_SECTION',
            isValid: false,
            message: 'Student not enrolled in this section',
            timestamp: new Date().toISOString(),
            source: 'api',
            studentData
          };
        }

        // Valid student
        return {
          studentId,
          status: 'VALID',
          isValid: true,
          message: 'Student ID validated successfully',
          timestamp: new Date().toISOString(),
          source: 'api',
          studentData
        };

      } catch (error) {
        clearTimeout(timeoutId);
        
        // REQ 11: Retry mechanism for temporary failures
        if (attempt < VALIDATION_CONFIG.RETRY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, VALIDATION_CONFIG.RETRY_DELAY));
          return this.validateWithAPI(studentId, sectionId, attempt + 1);
        }
        
        throw error;
      }

    } catch (error) {
      console.error(`API validation failed (attempt ${attempt}):`, error);
      return null;
    }
  }

  /**
   * REQ 6: Offline cached validation fallback
   */
  private static async validateWithCache(
    studentId: string,
    sectionId?: string
  ): Promise<ValidationResult> {
    try {
      const { StudentDatabaseService } = await import('./studentDatabaseService');
      const student = await StudentDatabaseService.getStudentById(studentId);

      if (!student) {
        return {
          studentId,
          status: 'INVALID_ID',
          isValid: false,
          message: 'Student ID not found in offline cache',
          timestamp: new Date().toISOString(),
          source: 'cache'
        };
      }

      // Check section if provided
      if (sectionId && student.section !== sectionId) {
        return {
          studentId,
          status: 'NOT_IN_SECTION',
          isValid: false,
          message: `Student not enrolled in section ${sectionId}`,
          studentData: student,
          timestamp: new Date().toISOString(),
          source: 'cache'
        };
      }

      // Check if active
      if (!student.is_active) {
        return {
          studentId,
          status: 'INACTIVE_STUDENT',
          isValid: false,
          message: 'Student account is inactive',
          studentData: student,
          timestamp: new Date().toISOString(),
          source: 'cache'
        };
      }

      return {
        studentId,
        status: 'OFFLINE_CACHED',
        isValid: true,
        message: 'Student validated from offline cache',
        studentData: student,
        timestamp: new Date().toISOString(),
        source: 'cache'
      };
    } catch (error) {
      console.error('[Validation] Cache validation error:', error);
      return {
        studentId,
        status: 'VALIDATION_ERROR',
        isValid: false,
        message: 'Offline cache unavailable',
        timestamp: new Date().toISOString(),
        source: 'cache'
      };
    }
  }

  /**
   * REQ 8: Log validation event to backend
   */
  private static async logValidation(
    studentId: string,
    status: ValidationStatus,
    attemptedAction: 'grading' | 'lookup' | 'import',
    additionalInfo?: Record<string, any>
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      
      const logEntry: Omit<ValidationLog, 'id'> = {
        studentId,
        status,
        timestamp: new Date().toISOString(),
        userId: currentUser?.uid,
        attemptedAction,
        additionalInfo
      };

      // In production, this would write to Firestore or analytics service
      console.log('[VALIDATION LOG]', logEntry);
      
      // REQ 8: Persist to Firestore backend logging
      await addDoc(collection(db, 'validation_logs'), logEntry);

    } catch (error) {
      console.error('Failed to log validation:', error);
      // Don't throw - logging failure shouldn't break validation
    }
  }

  /**
   * REQ 9, 10: Batch validation for multiple students (optimized)
   */
  static async validateBatch(
    studentIds: string[],
    sectionId?: string
  ): Promise<ValidationResult[]> {
    // Process in parallel with concurrency limit
    const BATCH_SIZE = 10;
    const results: ValidationResult[] = [];

    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const batch = studentIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(id => this.validateStudentId(id, sectionId))
      );
      results.push(...batchResults);
    }

    return results;
  }
}
