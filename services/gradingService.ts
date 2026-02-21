import { AnswerKey, GradingResult, ScanResult } from "../types/scanning";

export class GradingService {
  /**
   * Grade scanned answers against answer key
   */
  static gradeAnswers(
    scanResult: ScanResult,
    answerKey: AnswerKey[],
  ): GradingResult {
    const details = answerKey.map((key) => {
      const studentAnswer = scanResult.answers.find(
        (ans) => ans.questionNumber === key.questionNumber,
      );

      if (!studentAnswer || !studentAnswer.selectedAnswer) {
        return {
          questionNumber: key.questionNumber,
          studentAnswer: "----",
          correctAnswer: key.correctAnswer,
          isCorrect: false,
          points: 0,
        };
      }

      const isCorrect =
        studentAnswer.selectedAnswer === key.correctAnswer;

      return {
        questionNumber: key.questionNumber,
        studentAnswer: studentAnswer.selectedAnswer,
        correctAnswer: key.correctAnswer,
        isCorrect,
        points: isCorrect ? key.points : 0,
      };
    });

    const score = details.reduce((total, detail) => total + detail.points, 0);
    const totalPoints = answerKey.reduce((total, key) => total + key.points, 0);
    const correctAnswers = details.filter((detail) => detail.isCorrect).length;
    const percentage =
      totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

    return {
      studentId: scanResult.studentId,
      score,
      totalPoints,
      percentage,
      correctAnswers,
      totalQuestions: scanResult.answers.length,
      details,
    };
  }

  /**
   * Get default answer key for testing
   */
  static getDefaultAnswerKey(): AnswerKey[] {
    const answers = ["A", "B", "C", "D", "E"];
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
