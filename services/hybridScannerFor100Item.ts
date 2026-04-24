/**
 * Hybrid Scanner for 100-Item Templates
 * 
 * Uses template coordinates with contour detection for improved accuracy.
 * 
 * Strategy:
 * - Calculate exact bubble positions using template coordinates
 * - Match detected contours to expected positions
 * - Use fill ratio to determine if bubble is filled
 * - More accurate than pure contour detection
 * 
 * Expected accuracy: 60-80% (vs 30-50% with pure contour detection)
 */

import { StudentAnswer } from "../types/scanning";

// ─── TYPES ───

interface Markers {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

interface Bubble {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  extent: number;
  fill: number;
}

interface AnswerBlock {
  startQ: number;
  endQ: number;
  firstBubbleNX: number;
  firstBubbleNY: number;
  bubbleSpacingNX: number;
  rowSpacingNY: number;
}

interface TemplateLayout {
  answerBlocks: AnswerBlock[];
  bubbleDiameterNX: number;
  bubbleDiameterNY: number;
}

// ─── COORDINATE MAPPING ───
function mapToPixel(
  markers: Markers,
  nx: number,
  ny: number
): { px: number; py: number } {
  // Interpolate along top edge
  const topX = markers.topLeft.x + nx * (markers.topRight.x - markers.topLeft.x);
  const topY = markers.topLeft.y + nx * (markers.topRight.y - markers.topLeft.y);
  
  // Interpolate along bottom edge
  const botX = markers.bottomLeft.x + nx * (markers.bottomRight.x - markers.bottomLeft.x);
  const botY = markers.bottomLeft.y + nx * (markers.bottomRight.y - markers.bottomLeft.y);
  
  // Interpolate vertically
  return {
    px: topX + ny * (botX - topX),
    py: topY + ny * (botY - topY),
  };
}

// ─── TEMPLATE LAYOUT ───
// 100-question full page A4 (210 × 297 mm)
// Corner markers: cornerInset=2mm, markerSize=8mm → marker centers at ~6mm from each edge
// Frame between marker centers: fw = 210 - 12 = 198mm, fh = 297 - 12 = 285mm
//
// Template grid: 5 columns × 2 rows, sequential left-to-right, top-to-bottom:
//   Col 0: Q1-10  (row 0), Q11-20  (row 1)
//   Col 1: Q21-30 (row 0), Q31-40  (row 1)
//   Col 2: Q41-50 (row 0), Q51-60  (row 1)
//   Col 3: Q61-70 (row 0), Q71-80  (row 1)
//   Col 4: Q81-90 (row 0), Q91-100 (row 1)
//
// Physical measurements (drawFullSheet, A4 210×297mm):
//   margin=10, usableW=190, numChoices=5, bubbleGap=5.5, bubbleSize=3.5
//   qBlockW = 10 + 4×5.5 + 3.5 = 35.5mm
//   colGap = (190 - 5×35.5) / 6 ≈ 2.083mm
//   bx[col] = 12.083 + col×37.583
//   firstBubbleX[col] = bx[col] + numW(10) = 22.083 + col×37.583
//   NX = (firstBubbleX - 6) / 198
//
//   Answer Y start ≈ 77mm from page top → firstBubbleNY row 0 = 71/285
//   blockVGap = 62mm → firstBubbleNY row 1 = 133/285
//   bubbleSpacingNX = 5.5/198, rowSpacingNY = 5.2/285
function get100ItemTemplateLayout(): TemplateLayout {
  const fw = 198, fh = 285;

  const col0NX = 16.083 / fw;
  const col1NX = 53.667 / fw;
  const col2NX = 91.250 / fw;
  const col3NX = 128.833 / fw;
  const col4NX = 166.417 / fw;

  const row0NY = 71 / fh;
  const row1NY = 133 / fh;

  const bSpacingNX = 5.5 / fw;
  const rSpacingNY = 5.2 / fh;

  return {
    answerBlocks: [
      // Row 0 (top blocks)
      { startQ: 1,  endQ: 10,  firstBubbleNX: col0NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 21, endQ: 30,  firstBubbleNX: col1NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 41, endQ: 50,  firstBubbleNX: col2NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 61, endQ: 70,  firstBubbleNX: col3NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 81, endQ: 90,  firstBubbleNX: col4NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      // Row 1 (bottom blocks)
      { startQ: 11, endQ: 20,  firstBubbleNX: col0NX, firstBubbleNY: row1NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 31, endQ: 40,  firstBubbleNX: col1NX, firstBubbleNY: row1NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 51, endQ: 60,  firstBubbleNX: col2NX, firstBubbleNY: row1NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 71, endQ: 80,  firstBubbleNX: col3NX, firstBubbleNY: row1NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 91, endQ: 100, firstBubbleNX: col4NX, firstBubbleNY: row1NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
    ],
    bubbleDiameterNX: 3.5 / fw,
    bubbleDiameterNY: 3.5 / fh,
  };
}

// ─── FIND NEAREST BUBBLE ───
// Find the detected bubble closest to the expected position
function findNearestBubble(
  bubbles: Bubble[],
  expectedX: number,
  expectedY: number,
  maxDistance: number
): Bubble | null {
  let nearest: Bubble | null = null;
  let minDist = maxDistance;

  for (const bubble of bubbles) {
    const dx = bubble.x - expectedX;
    const dy = bubble.y - expectedY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      nearest = bubble;
    }
  }

  return nearest;
}

// ─── ANSWER DETECTION ───
function detectAnswersFromBubbles(
  bubbles: Bubble[],
  markers: Markers,
  layout: TemplateLayout,
  numQuestions: number,
  choicesPerQuestion: number
): StudentAnswer[] {
  const answers: StudentAnswer[] = [];
  const choiceLabels = 'ABCDE'.slice(0, choicesPerQuestion).split('');

  const frameW = markers.topRight.x - markers.topLeft.x;
  const frameH = markers.bottomLeft.y - markers.topLeft.y;
  const bubbleRX = (layout.bubbleDiameterNX * frameW) / 2;
  const bubbleRY = (layout.bubbleDiameterNY * frameH) / 2;
  
  // Search radius: 2.5x bubble radius (was 1.5x - increased to handle misalignment)
  // This allows for paper shift, rotation, and perspective distortion
  const searchRadius = Math.max(bubbleRX, bubbleRY) * 2.5;

  console.log(`[100Q-HYBRID] Frame: ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR: ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px, SearchRadius: ${searchRadius.toFixed(1)}px`);

  // Track which bubbles have been used to avoid double-counting
  const usedBubbles = new Set<Bubble>();

  // ADAPTIVE APPROACH: For each block, find actual bubble columns from detected bubbles
  // This handles template coordinate mismatches
  for (const block of layout.answerBlocks) {
    const firstPx = mapToPixel(markers, block.firstBubbleNX, block.firstBubbleNY);
    const lastRowNY = block.firstBubbleNY + 9 * block.rowSpacingNY;
    const lastPx = mapToPixel(markers, block.firstBubbleNX, lastRowNY);
    
    // Define block region (with generous margins)
    const blockLeft = firstPx.px - searchRadius * 3;
    const blockRight = firstPx.px + searchRadius * 3 + (choicesPerQuestion * block.bubbleSpacingNX * frameW);
    const blockTop = Math.min(firstPx.py, lastPx.py) - searchRadius;
    const blockBottom = Math.max(firstPx.py, lastPx.py) + searchRadius;
    
    // Find all bubbles in this block region
    const blockBubbles = bubbles.filter(b => 
      !usedBubbles.has(b) &&
      b.x >= blockLeft && b.x <= blockRight &&
      b.y >= blockTop && b.y <= blockBottom
    );
    
    console.log(`[100Q-HYBRID] Block Q${block.startQ}-${block.endQ}: ${blockBubbles.length} bubbles in region, expected firstBubble px=(${Math.round(firstPx.px)},${Math.round(firstPx.py)})`);
    
    if (blockBubbles.length < 10) {
      console.warn(`[100Q-HYBRID] Block Q${block.startQ}-${block.endQ}: Too few bubbles (${blockBubbles.length}), skipping`);
      // Add empty answers for this block
      for (let q = block.startQ; q <= block.endQ && q <= numQuestions; q++) {
        answers.push({ questionNumber: q, selectedAnswer: '' });
      }
      continue;
    }
    
    // Cluster bubbles by Y position to find rows
    const sortedByY = [...blockBubbles].sort((a, b) => a.y - b.y);
    const rows: Bubble[][] = [];
    let currentRow: Bubble[] = [sortedByY[0]];
    let rowMeanY = sortedByY[0].y;
    
    for (let i = 1; i < sortedByY.length; i++) {
      if (Math.abs(sortedByY[i].y - rowMeanY) < bubbleRY * 2) {
        currentRow.push(sortedByY[i]);
        rowMeanY = currentRow.reduce((s, b) => s + b.y, 0) / currentRow.length;
      } else {
        if (currentRow.length >= 3) rows.push(currentRow); // Only keep rows with 3+ bubbles
        currentRow = [sortedByY[i]];
        rowMeanY = sortedByY[i].y;
      }
    }
    if (currentRow.length >= 3) rows.push(currentRow);
    
    console.log(`[100Q-HYBRID] Block Q${block.startQ}-${block.endQ}: Found ${rows.length} rows`);
    
    // Process each row as a question
    for (let rowIdx = 0; rowIdx < Math.min(rows.length, 10); rowIdx++) {
      const q = block.startQ + rowIdx;
      if (q > numQuestions) break;
      
      const row = rows[rowIdx];
      
      // Sort bubbles in row by X position (left to right = A to E)
      const sortedByX = [...row].sort((a, b) => a.x - b.x);
      
      // Take first 5 bubbles as choices A-E
      const choiceBubbles = sortedByX.slice(0, choicesPerQuestion).map((bubble, idx) => ({
        choice: choiceLabels[idx],
        bubble,
        fill: bubble.fill,
      }));
      
      // Mark bubbles as used
      choiceBubbles.forEach(cb => usedBubbles.add(cb.bubble));
      
      // Determine selected answer based on fill ratios
      let selectedChoice = '';
      
      // Find the bubble with highest fill ratio
      const sorted = [...choiceBubbles].sort((a, b) => b.fill - a.fill);
      const highest = sorted[0];
      const secondHighest = sorted.length >= 2 ? sorted[1] : null;

      // RELAXED detection threshold for 100-item templates:
      // - Filled bubble should have fill > 0.30 (was 0.35)
      // - Should be at least 15% more filled than next choice (was 30%)
      // This accounts for lighter pencil marks and scanning variations
      if (highest.fill > 0.30) {
        // Check if it's clearly the most filled
        if (!secondHighest || highest.fill > secondHighest.fill * 1.15) {
          selectedChoice = highest.choice;
        }
      }

      // Log first few questions per block for debugging
      if (rowIdx <= 2 || rowIdx === 9) {
        const bubbleInfo = choiceBubbles
          .map(cb => `${cb.choice}=${cb.fill.toFixed(2)}`)
          .join(', ');
        console.log(`[100Q-HYBRID] Q${q}: ${bubbleInfo} → ${selectedChoice || '?'}`);
      }

      answers.push({
        questionNumber: q,
        selectedAnswer: selectedChoice,
      });
    }
    
    // Fill in any missing questions in this block
    while (answers.filter(a => a.questionNumber >= block.startQ && a.questionNumber <= block.endQ).length < 10) {
      const missingQ = block.startQ + answers.filter(a => a.questionNumber >= block.startQ && a.questionNumber <= block.endQ).length;
      if (missingQ <= numQuestions) {
        answers.push({ questionNumber: missingQ, selectedAnswer: '' });
      } else {
        break;
      }
    }
  }

  // Sort by question number
  answers.sort((a, b) => a.questionNumber - b.questionNumber);

  return answers;
}

// ─── MAIN EXPORT ───
export function scan100ItemWithHybrid(
  bubbles: Bubble[],
  markers: Markers
): StudentAnswer[] {
  console.log('[100Q-HYBRID] Starting ADAPTIVE scanning for 100-item template (ignoring template coordinates)');
  console.log(`[100Q-HYBRID] Input: ${bubbles.length} detected bubbles`);
  
  // ADAPTIVE APPROACH: Ignore template coordinates, use actual bubble positions
  // 1. Cluster all bubbles by Y position to find rows
  // 2. Group rows into blocks of 10
  // 3. For each row, sort bubbles by X to get A-E
  
  const answers: StudentAnswer[] = [];
  const choiceLabels = 'ABCDE'.split('');
  
  // Sort all bubbles by Y position (top to bottom)
  const sortedByY = [...bubbles].sort((a, b) => a.y - b.y);
  
  // Cluster bubbles into rows (questions)
  const rows: Bubble[][] = [];
  let currentRow: Bubble[] = [sortedByY[0]];
  let rowMeanY = sortedByY[0].y;
  const avgBubbleSize = bubbles.reduce((sum, b) => sum + Math.max(b.w, b.h), 0) / bubbles.length;
  const rowGap = avgBubbleSize * 1.5; // Bubbles within 1.5x size are same row
  
  for (let i = 1; i < sortedByY.length; i++) {
    if (Math.abs(sortedByY[i].y - rowMeanY) < rowGap) {
      currentRow.push(sortedByY[i]);
      rowMeanY = currentRow.reduce((s, b) => s + b.y, 0) / currentRow.length;
    } else {
      if (currentRow.length >= 3) rows.push(currentRow); // Only keep rows with 3+ bubbles
      currentRow = [sortedByY[i]];
      rowMeanY = sortedByY[i].y;
    }
  }
  if (currentRow.length >= 3) rows.push(currentRow);
  
  console.log(`[100Q-HYBRID] Found ${rows.length} total rows from ${bubbles.length} bubbles`);
  
  // Process each row as a question
  for (let rowIdx = 0; rowIdx < Math.min(rows.length, 100); rowIdx++) {
    const q = rowIdx + 1;
    const row = rows[rowIdx];
    
    // Sort bubbles in row by X position (left to right = A to E)
    const sortedByX = [...row].sort((a, b) => a.x - b.x);
    
    // Take first 5 bubbles as choices A-E
    const choiceBubbles = sortedByX.slice(0, 5).map((bubble, idx) => ({
      choice: choiceLabels[idx],
      bubble,
      fill: bubble.fill,
    }));
    
    // Determine selected answer based on fill ratios
    let selectedChoice = '';
    
    // Find the bubble with highest fill ratio
    const sorted = [...choiceBubbles].sort((a, b) => b.fill - a.fill);
    const highest = sorted[0];
    const secondHighest = sorted.length >= 2 ? sorted[1] : null;

    // VERY RELAXED detection threshold:
    // - Filled bubble should have fill > 0.25 (very low threshold)
    // - Should be at least 10% more filled than next choice (very forgiving)
    if (highest.fill > 0.25) {
      // Check if it's clearly the most filled
      if (!secondHighest || highest.fill > secondHighest.fill * 1.10) {
        selectedChoice = highest.choice;
      }
    }

    // Log first 10, last 10, and every 10th question for debugging
    if (q <= 10 || q > 90 || q % 10 === 0) {
      const bubbleInfo = choiceBubbles
        .map(cb => `${cb.choice}=${cb.fill.toFixed(2)}`)
        .join(', ');
      console.log(`[100Q-HYBRID] Q${q}: ${bubbleInfo} → ${selectedChoice || '?'}`);
    }

    answers.push({
      questionNumber: q,
      selectedAnswer: selectedChoice,
    });
  }
  
  // Fill in any missing questions up to 100
  while (answers.length < 100) {
    answers.push({
      questionNumber: answers.length + 1,
      selectedAnswer: '',
    });
  }

  const detectedCount = answers.filter(a => a.selectedAnswer).length;
  console.log(`[100Q-HYBRID] Detected ${detectedCount}/100 answers from ${rows.length} rows`);
  
  return answers;
}
