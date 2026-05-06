/**
 * 200-item scanner adapter.
 *
 * A 200-item exam is two 100-item pages. Each page uses the exact same
 * brightness scanner as the 100-item template; page 2 is only renumbered to
 * Q101-Q200 after scanning.
 */

import { StudentAnswer } from "../types/scanning";
import { scan100ItemWithBrightness } from "./brightnessScannerFor100Item";

const SCANNER_200Q_VERSION = "200Q-reuses-100Q-v12";

interface Markers {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

function blankPageAnswers(pageNumber: 1 | 2): StudentAnswer[] {
  const questionOffset = pageNumber === 1 ? 0 : 100;

  return Array.from({ length: 100 }, (_, index) => ({
    questionNumber: questionOffset + index + 1,
    selectedAnswer: "",
  }));
}

function offsetPageAnswers(
  answers: StudentAnswer[],
  pageNumber: 1 | 2,
): StudentAnswer[] {
  const questionOffset = pageNumber === 1 ? 0 : 100;
  const byLocalQuestion = new Map<number, StudentAnswer>();

  for (const answer of answers) {
    if (answer.questionNumber < 1 || answer.questionNumber > 100) continue;
    byLocalQuestion.set(answer.questionNumber, answer);
  }

  return Array.from({ length: 100 }, (_, index) => {
    const localQuestion = index + 1;
    const answer = byLocalQuestion.get(localQuestion);

    return {
      questionNumber: questionOffset + localQuestion,
      selectedAnswer: answer?.selectedAnswer ?? "",
    };
  });
}

function summarizeChoiceCounts(answers: StudentAnswer[]): string {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let blank = 0;

  for (const answer of answers) {
    if (answer.selectedAnswer && counts[answer.selectedAnswer] !== undefined) {
      counts[answer.selectedAnswer]++;
    } else {
      blank++;
    }
  }

  return `A=${counts.A}, B=${counts.B}, C=${counts.C}, D=${counts.D}, E=${counts.E}, blank=${blank}`;
}

export async function scan200ItemPage(
  imageUri: string,
  markers: Markers,
  pageNumber: 1 | 2,
  choicesPerQuestion: 4 | 5 = 4,
): Promise<{ studentId: string; answers: StudentAnswer[] }> {
  const questionOffset = pageNumber === 1 ? 0 : 100;
  console.log(
    `[200Q-100Q][${SCANNER_200Q_VERSION}] Page ${pageNumber}: scanning with 100-item brightness scanner (Q${questionOffset + 1}-${questionOffset + 100})`,
  );

  try {
    const result = await scan100ItemWithBrightness(
      imageUri,
      markers,
      choicesPerQuestion,
      true,
    );
    const pageAnswers = offsetPageAnswers(result.answers, pageNumber);
    const detectedCount = pageAnswers.filter((a) => a.selectedAnswer).length;

    console.log(
      `[200Q-100Q] Page ${pageNumber}: Detected ${detectedCount}/100 answers; ${summarizeChoiceCounts(pageAnswers)}`,
    );

    return {
      studentId: result.studentId,
      answers: pageAnswers,
    };
  } catch (error) {
    console.error(`[200Q-100Q] Page ${pageNumber} error:`, error);
    return {
      studentId: "000000000",
      answers: blankPageAnswers(pageNumber),
    };
  }
}
