import { AnswerKey, GradingResult, ScanResult } from "../types/scanning";
import { GradingResultExtended, GradeStatus, ValidationResult, ValidationStatus } from "../types/student";
import { StudentValidationService } from "./studentValidationService";
import { auth, db } from "@/config/firebase";
import { collection, addDoc } from "firebase/firestore";

export class GradingService {
  /**
   * REQ 9, 13-21: Grade with validation - prevents grading if invalid
   */
  static async gradeWithValidation(
    scanResult: ScanResult,
    answerKey: AnswerKey[],
    sectionId?: string
  ): Promise<GradingResultExtended> {
    const timestamp = new Date().toISOString();

    // REQ 9: Validate student ID before grading
    const validationResult = await StudentValidationService.validateStudentId(
      scanResult.studentId,
      sectionId
    );

    // REQ 13, 14, 15: Handle NULL grade assignment based on validation status
    if (!validationResult.isValid) {
      return await this.createNullGradeResult(scanResult, validationResult, timestamp);
    }

    // Student is valid - proceed with grading
    const gradingResult = this.gradeAnswers(scanResult, answerKey);

    return {
      studentId: gradingResult.studentId,
      score: gradingResult.score,
      totalPoints: gradingResult.totalPoints,
      percentage: gradingResult.percentage,
      gradeStatus: 'GRADED',
      validationStatus: validationResult.status,
      gradedAt: timestamp,
      reviewRequired: false
    };
  }

  /**
   * REQ 13, 14, 15, 17, 19: Create NULL grade result for invalid students
   */
  private static async createNullGradeResult(
    scanResult: ScanResult,
    validationResult: ValidationResult,
    timestamp: string
  ): GradingResultExtended {
    // REQ 14: Map validation status to grade status with status flag
    const gradeStatusMap: Record<ValidationStatus, GradeStatus> = {
      'INVALID_ID': 'NULL_INVALID_ID',
      'INACTIVE_STUDENT': 'NULL_INACTIVE',
      'NOT_IN_SECTION': 'NULL_NOT_IN_SECTION',
      'INVALID_FORMAT': 'NULL_INVALID_ID',
      'VALIDATION_ERROR': 'PENDING',
      'VALID': 'GRADED',
      'OFFLINE_CACHED': 'GRADED'
    };

    // REQ 19: Backend reason code mapping
    const reasonCodes: Record<ValidationStatus, string> = {
      'INVALID_ID': 'ERR_STUDENT_NOT_FOUND',
      'INACTIVE_STUDENT': 'ERR_STUDENT_INACTIVE',
      'NOT_IN_SECTION': 'ERR_STUDENT_WRONG_SECTION',
      'INVALID_FORMAT': 'ERR_INVALID_ID_FORMAT',
      'VALIDATION_ERROR': 'ERR_VALIDATION_FAILED',
      'VALID': 'OK',
      'OFFLINE_CACHED': 'OK_OFFLINE'
    };

    const gradeStatus = gradeStatusMap[validationResult.status];
    const reasonCode = reasonCodes[validationResult.status];

    // REQ 16: Log invalid grading attempt
    await this.logInvalidGradingAttempt(scanResult.studentId, validationResult, timestamp);

    // REQ 15, 21: Create NULL grade with review required flag
    return {
      studentId: scanResult.studentId,
      score: null,
      totalPoints: 0,
      percentage: null,
      gradeStatus,
      validationStatus: validationResult.status,
      reasonCode,
      gradedAt: timestamp,
      reviewRequired: true // REQ 21: Flag for review screen
    };
  }

  /**
   * REQ 16: Log invalid grading attempt
   */
  private static async logInvalidGradingAttempt(
    studentId: string,
    validationResult: ValidationResult,
    timestamp: string
  ): Promise<void> {
    const logEntry = {
      studentId,
      validationStatus: validationResult.status,
      message: validationResult.message,
      timestamp,
      action: 'grading_prevented',
      source: validationResult.source
    };

    console.log('[INVALID_GRADING_ATTEMPT]', logEntry);
    
    // REQ 16: Persist to Firestore backend logging
    await addDoc(collection(db, 'invalid_grading_logs'), logEntry);
  }

  /**
   * Original grading method (now used internally)
   */
  static gradeAnswers(
    scanResult: ScanResult,
    answerKey: AnswerKey[],
  ): GradingResult {
    const details = scanResult.answers.map((studentAnswer) => {
      const correctAnswer = answerKey.find(
        (key) => key.questionNumber === studentAnswer.questionNumber,
      );

      if (!correctAnswer) {
        return {
          questionNumber: studentAnswer.questionNumber,
          studentAnswer: studentAnswer.selectedAnswer,
          correctAnswer: "N/A",
          isCorrect: false,
          points: 0,
        };
      }

      const isCorrect =
        studentAnswer.selectedAnswer === correctAnswer.correctAnswer;

      return {
        questionNumber: studentAnswer.questionNumber,
        studentAnswer: studentAnswer.selectedAnswer,
        correctAnswer: correctAnswer.correctAnswer,
        isCorrect,
        points: isCorrect ? correctAnswer.points : 0,
      };
    });

    const score = details.reduce((total, detail) => total + detail.points, 0);
    const totalPoints = answerKey.reduce((total, key) => total + key.points, 0);
    const correctAnswers = details.filter((detail) => detail.isCorrect).length;
    const percentage =
      totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

    return {
      studentId: scanResult.studentId,
      examId: "", // filled by gradeStorageService / exam selector
      score,
      totalPoints,
      percentage,
      gradeEquivalent: GradingService.computeGradeEquivalent(percentage),
      correctAnswers,
      totalQuestions: scanResult.answers.length,
      dateScanned: new Date().toISOString(),
      status: "pending" as const,
      details,
    };
  }

  /**
   * Compute letter grade from percentage
   */
  static computeGradeEquivalent(percentage: number): string {
    if (percentage >= 90) return "A";
    if (percentage >= 80) return "B";
    if (percentage >= 70) return "C";
    if (percentage >= 60) return "D";
    return "F";
  }

  /**
   * Get default answer key for testing
   */
  static getDefaultAnswerKey(): AnswerKey[] {
    const answers = ["A", "B", "C", "D"];
    return Array.from({ length: 20 }, (_, index) => ({
      questionNumber: index + 1,
      correctAnswer: answers[Math.floor(Math.random() * answers.length)],
      points: 1,
    }));
  }

  /**
   * REQ 17: Calculate grade statistics (excludes NULL grades)
   */
  static calculateStatisticsExtended(results: GradingResultExtended[]) {
    // REQ 17: Filter out NULL grades from statistics
    const validResults = results.filter(r => r.gradeStatus === 'GRADED' && r.score !== null);

    if (validResults.length === 0) {
      return {
        averageScore: 0,
        averagePercentage: 0,
        highestScore: 0,
        lowestScore: 0,
        totalStudents: 0,
        gradedCount: 0,
        nullGradeCount: results.filter(r => r.score === null).length,
        pendingReviewCount: results.filter(r => r.reviewRequired).length
      };
    }

    const scores = validResults.map((r) => r.score!);
    const percentages = validResults.map((r) => r.percentage!);

    return {
      averageScore: Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length,
      ),
      averagePercentage: Math.round(
        percentages.reduce((a, b) => a + b, 0) / percentages.length,
      ),
      highestScore: Math.max(...scores),
      lowestScore: Math.min(...scores),
      totalStudents: results.length,
      gradedCount: validResults.length,
      nullGradeCount: results.filter(r => r.score === null).length,
      pendingReviewCount: results.filter(r => r.reviewRequired).length
    };
  }

  /**
   * Original statistics method
   */
  static calculateStatistics(results: GradingResult[]) {
    if (results.length === 0) {
      return {
        averageScore: 0,
        averagePercentage: 0,
        highestScore: 0,
        lowestScore: 0,
        totalStudents: 0,
      };
    }

    const scores = results.map((r) => r.score);
    const percentages = results.map((r) => r.percentage);

    return {
      averageScore: Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length,
      ),
      averagePercentage: Math.round(
        percentages.reduce((a, b) => a + b, 0) / percentages.length,
      ),
      highestScore: Math.max(...scores),
      lowestScore: Math.min(...scores),
      totalStudents: results.length,
    };
  }

  /**
   * REQ 17: Export results to CSV (includes NULL grade status)
   */
  static exportToCSVExtended(results: GradingResultExtended[]): string {
    const headers = [
      "Student ID",
      "Score",
      "Total Points",
      "Percentage",
      "Grade Status",
      "Validation Status",
      "Reason Code",
      "Graded At",
      "Review Required"
    ];
    
    const rows = results.map((result) => [
      result.studentId,
      result.score !== null ? result.score.toString() : 'NULL',
      result.totalPoints.toString(),
      result.percentage !== null ? `${result.percentage}%` : 'NULL',
      result.gradeStatus,
      result.validationStatus,
      result.reasonCode || '',
      result.gradedAt,
      result.reviewRequired ? 'YES' : 'NO'
    ]);

    return [headers, ...rows].map((row) => row.join(",")).join("\n");
  }

  /**
   * Original CSV export method
   */
  static exportToCSV(results: GradingResult[]): string {
    const headers = [
      "Student ID",
      "Score",
      "Total Points",
      "Percentage",
      "Correct Answers",
      "Total Questions",
    ];
    const rows = results.map((result) => [
      result.studentId,
      result.score.toString(),
      result.totalPoints.toString(),
      `${result.percentage}%`,
      result.correctAnswers.toString(),
      result.totalQuestions.toString(),
    ]);

    return [headers, ...rows].map((row) => row.join(",")).join("\n");
  }

  /**
   * REQ 21: Get results that require review
   */
  static getResultsRequiringReview(results: GradingResultExtended[]): GradingResultExtended[] {
    return results.filter(r => r.reviewRequired);
  }

  /**
   * REQ 18, 19: Get instructor notification data
   */
  static getInvalidGradingSummary(results: GradingResultExtended[]): {
    totalInvalid: number;
    byReason: Record<string, number>;
    requiresReview: GradingResultExtended[];
  } {
    const invalidResults = results.filter(r => r.score === null);

    const byReason: Record<string, number> = {};
    invalidResults.forEach(r => {
      const reason = r.reasonCode || 'UNKNOWN';
      byReason[reason] = (byReason[reason] || 0) + 1;
    });

    return {
      totalInvalid: invalidResults.length,
      byReason,
      requiresReview: this.getResultsRequiringReview(results)
    };
  }
}
