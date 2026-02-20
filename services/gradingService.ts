import { AnswerKey, GradingResult, ScanResult } from "../types/scanning";

export class GradingService {
  /**
   * Grade scanned answers against answer key
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
   * Calculate grade statistics
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
   * Export results to CSV format
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
}
