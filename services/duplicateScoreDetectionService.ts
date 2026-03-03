import { GradingResult } from "../types/scanning";
import { StorageService } from "./storageService";

export interface DuplicateScoreMatch {
  existingResult: GradingResult;
  similarity: number;
  matchType: "exact" | "high" | "moderate";
  matchedFields: string[];
}

export class DuplicateScoreDetectionService {
  /**
   * Check if a scan result is a potential duplicate
   */
  static async checkForDuplicates(
    newResult: GradingResult,
    examId?: string,
  ): Promise<DuplicateScoreMatch | null> {
    try {
      // Get recent scans (last 50)
      const recentScans = await StorageService.getRecentScans(50);

      // Filter by exam if provided
      const relevantScans = examId
        ? recentScans.filter((scan) => (scan as any).examId === examId)
        : recentScans;

      // Check each scan for similarity
      for (const existingScan of relevantScans) {
        const match = this.compareResults(newResult, existingScan);

        if (match) {
          return match;
        }
      }

      return null;
    } catch (error) {
      console.error("[Duplicate Detection] Error checking duplicates:", error);
      return null;
    }
  }

  /**
   * Compare two grading results for similarity
   */
  private static compareResults(
    newResult: GradingResult,
    existingResult: GradingResult,
  ): DuplicateScoreMatch | null {
    const matchedFields: string[] = [];
    let similarityScore = 0;

    // Check student ID match
    if (
      newResult.studentId === existingResult.studentId &&
      newResult.studentId !== "00000000"
    ) {
      matchedFields.push("studentId");
      similarityScore += 40; // High weight for student ID
    }

    // Check score match
    if (newResult.score === existingResult.score) {
      matchedFields.push("score");
      similarityScore += 20;
    }

    // Check answer pattern similarity
    const answerSimilarity = this.calculateAnswerSimilarity(
      newResult.answers.map((a) => a.selectedAnswer),
      existingResult.answers.map((a) => a.selectedAnswer),
    );

    if (answerSimilarity > 0.9) {
      matchedFields.push("answers");
      similarityScore += 30;
    } else if (answerSimilarity > 0.7) {
      matchedFields.push("answers (partial)");
      similarityScore += 15;
    }

    // Check timestamp proximity (within 5 minutes)
    const timeDiff = Math.abs(
      new Date(newResult.timestamp).getTime() -
        new Date(existingResult.timestamp).getTime(),
    );
    if (timeDiff < 5 * 60 * 1000) {
      matchedFields.push("timestamp");
      similarityScore += 10;
    }

    // Determine match type
    let matchType: "exact" | "high" | "moderate" | null = null;

    if (similarityScore >= 80) {
      matchType = "exact";
    } else if (similarityScore >= 60) {
      matchType = "high";
    } else if (similarityScore >= 40) {
      matchType = "moderate";
    }

    if (matchType) {
      return {
        existingResult,
        similarity: similarityScore / 100,
        matchType,
        matchedFields,
      };
    }

    return null;
  }

  /**
   * Calculate similarity between two answer arrays
   */
  private static calculateAnswerSimilarity(
    answers1: string[],
    answers2: string[],
  ): number {
    if (answers1.length !== answers2.length) {
      return 0;
    }

    let matches = 0;
    for (let i = 0; i < answers1.length; i++) {
      if (answers1[i] === answers2[i]) {
        matches++;
      }
    }

    return matches / answers1.length;
  }

  /**
   * Get duplicate warning message
   */
  static getDuplicateWarningMessage(match: DuplicateScoreMatch): string {
    const { matchType, matchedFields, similarity } = match;

    const similarityPercent = Math.round(similarity * 100);

    if (matchType === "exact") {
      return `This scan appears to be an exact duplicate (${similarityPercent}% match). Matched: ${matchedFields.join(", ")}. This may be a re-scan of the same sheet.`;
    } else if (matchType === "high") {
      return `This scan is very similar to a previous scan (${similarityPercent}% match). Matched: ${matchedFields.join(", ")}. Please verify this is not a duplicate.`;
    } else {
      return `This scan has moderate similarity to a previous scan (${similarityPercent}% match). Matched: ${matchedFields.join(", ")}.`;
    }
  }

  /**
   * Check if duplicate should be blocked
   */
  static shouldBlockDuplicate(match: DuplicateScoreMatch): boolean {
    // Block exact duplicates with same student ID
    return (
      match.matchType === "exact" &&
      match.matchedFields.includes("studentId") &&
      match.similarity > 0.95
    );
  }

  /**
   * Merge duplicate results (keep the better one)
   */
  static mergeDuplicates(
    newResult: GradingResult,
    existingResult: GradingResult,
  ): GradingResult {
    // Keep the result with higher confidence
    if (newResult.confidence > existingResult.confidence) {
      return {
        ...newResult,
        metadata: {
          ...newResult.metadata,
          replacedDuplicate: true,
          previousResultId: existingResult.id,
        },
      };
    }

    return existingResult;
  }

  /**
   * Mark result as duplicate override
   */
  static markAsOverride(result: GradingResult): GradingResult {
    return {
      ...result,
      metadata: {
        ...result.metadata,
        duplicateOverride: true,
        overrideTimestamp: new Date().toISOString(),
      },
    };
  }
}
