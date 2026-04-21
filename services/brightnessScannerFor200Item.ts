/**
 * Brightness-Based Scanner for 200-Item Templates (2-Stage)
 * 
 * Each page of a 200-item exam has the SAME physical layout as a 100-item sheet.
 * - Page 1: Scans Q1–100
 * - Page 2: Scans Q101–200 (same bubble positions, question numbers offset by 100)
 * 
 * Both pages have a Student ZipGrade ID grid used for linking/merging.
 * 
 * This module is a thin wrapper around the proven 100-item brightness scanner.
 * It delegates all scanning to `scan100ItemWithBrightness` and then applies
 * the question-number offset for Page 2.
 */

import { StudentAnswer } from "../types/scanning";
import { scan100ItemWithBrightness } from "./brightnessScannerFor100Item";

// ─── TYPES ───

interface Markers {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

// ─── MAIN EXPORT ───

/**
 * Scan a single page of a 200-item exam.
 * 
 * Delegates to the battle-tested 100-item brightness scanner and applies
 * a question-number offset for Page 2.
 * 
 * @param imageUri - URI of the captured image
 * @param markers - Corner registration markers detected by OpenCV
 * @param pageNumber - 1 for Q1-100, 2 for Q101-200
 * @returns StudentAnswer[] with question numbers appropriate to the page
 */
export async function scan200ItemPage(
  imageUri: string,
  markers: Markers,
  pageNumber: 1 | 2,
  choicesPerQuestion: 4 | 5 = 5,
): Promise<StudentAnswer[]> {
  const questionOffset = pageNumber === 1 ? 0 : 100;
  console.log(`[200Q-BRIGHTNESS] Starting brightness scan for Page ${pageNumber} (offset=${questionOffset})`);
  
  try {
    // Delegate to the proven 100-item scanner
    const answers = await scan100ItemWithBrightness(
      imageUri,
      markers,
      choicesPerQuestion,
      true,
    );
    
    // Apply question-number offset for Page 2
    if (questionOffset > 0) {
      for (const answer of answers) {
        answer.questionNumber += questionOffset;
      }
    }
    
    const detectedCount = answers.filter(a => a.selectedAnswer).length;
    console.log(`[200Q-BRIGHTNESS] Page ${pageNumber}: Detected ${detectedCount}/100 answers (Q${questionOffset + 1}-${questionOffset + 100})`);
    
    return answers;
    
  } catch (error) {
    console.error(`[200Q-BRIGHTNESS] Page ${pageNumber} error:`, error);
    
    // Return empty answers on error with correct question numbering
    return Array.from({ length: 100 }, (_, i) => ({
      questionNumber: i + 1 + questionOffset,
      selectedAnswer: '',
    }));
  }
}
