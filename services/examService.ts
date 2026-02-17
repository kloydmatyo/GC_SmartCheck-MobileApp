import { ExamPreviewData } from "../types/exam";

export class ExamService {
  /**
   * Fetch exam configuration by ID
   * TODO: Replace with actual Firebase API call
   */
  static async getExamById(examId: string): Promise<ExamPreviewData | null> {
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Mock data based on provided Firebase structure
      const mockExam: ExamPreviewData = {
        metadata: {
          examId: "013RTQdjH3OVpTDO6L3m",
          title: "MALBO SI FRANZ",
          subject: "Computer",
          section: "whyci",
          date: "2026-02-19",
          examCode: "4CP",
          status: "Draft",
          createdAt: new Date("2026-02-17T00:29:02.000Z"),
          updatedAt: new Date("2026-02-17T00:29:02.000Z"),
          createdBy: "BiAzr8e3k4ZkAWur0jQzhAcPg2X2",
          version: 1,
        },
        answerKey: {
          id: "ak_013RTQdjH3OVpTDO6L3m_1771288141307",
          examId: "013RTQdjH3OVpTDO6L3m",
          answers: [
            "E",
            "D",
            "D",
            "E",
            "E",
            "D",
            "E",
            "D",
            "C",
            "C",
            "D",
            "E",
            "D",
            "D",
            "D",
            "E",
            "D",
            "C",
            "D",
            "D",
          ],
          questionSettings: Array.from({ length: 20 }, (_, i) => ({
            questionNumber: i + 1,
            correctAnswer: [
              "E",
              "D",
              "D",
              "E",
              "E",
              "D",
              "E",
              "D",
              "C",
              "C",
              "D",
              "E",
              "D",
              "D",
              "D",
              "E",
              "D",
              "C",
              "D",
              "D",
            ][i],
            points: 1,
            choiceLabels: {},
          })),
          locked: false,
          createdAt: new Date("2026-02-17T00:29:02.000Z"),
          updatedAt: new Date("2026-02-17T00:29:02.000Z"),
          createdBy: "BiAzr8e3k4ZkAWur0jQzhAcPg2X2",
          version: 1,
        },
        templateLayout: {
          name: "Standard Template",
          totalQuestions: 20,
          choiceFormat: "A-E",
          columns: 2,
          questionsPerColumn: 10,
        },
        totalQuestions: 20,
        choiceFormat: "A-E",
        lastModified: new Date("2026-02-17T00:29:02.000Z"),
      };

      return mockExam;
    } catch (error) {
      console.error("Error fetching exam:", error);
      return null;
    }
  }

  /**
   * Check if user is authorized to view exam
   * TODO: Implement actual authorization logic
   */
  static async isAuthorized(userId: string, examId: string): Promise<boolean> {
    // Mock authorization - always return true for now
    return true;
  }

  /**
   * Format date for display
   */
  static formatDate(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  /**
   * Get status color
   */
  static getStatusColor(status: string): string {
    switch (status) {
      case "Draft":
        return "#9e9e9e";
      case "Scheduled":
        return "#ff9800";
      case "Active":
        return "#00a550";
      case "Completed":
        return "#4a90e2";
      default:
        return "#666";
    }
  }
}
