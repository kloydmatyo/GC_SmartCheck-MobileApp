/**
 * Brightness-Based Scanner for 100-Item Templates
 * 
 * This scanner uses brightness sampling instead of contour detection
 * to achieve >99% accuracy for 100-item answer sheets.
 * 
 * Ported from Web-Based-for-SIA/src/components/scanning/OMRScanner.tsx
 * 
 * Key differences from contour-based scanning:
 * - Samples pixel brightness at calculated positions
 * - Uses bilinear coordinate mapping for perspective correction
 * - Compares brightness values within each question
 * - More robust to lighting variations and small bubbles
 */

import { StudentAnswer } from "../types/scanning";

// ─── TYPES ───

interface Markers {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
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
// Maps normalized coordinates (0-1) to pixel coordinates
// Handles perspective distortion using bilinear interpolation
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

// ─── BUBBLE SAMPLING ───
// Returns the mean brightness of the bubble interior (0-255)
// Lower value = darker = more likely filled
function sampleBubbleAt(
  grayscale: Uint8Array,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number
): number {
  // Sample the center of the bubble using an elliptical mask
  // Use inner 50% to safely avoid the printed circle outline
  let sum = 0, count = 0;
  const innerRX = radiusX * 0.50;
  const innerRY = radiusY * 0.50;
  const step = Math.max(1, Math.floor(Math.min(innerRX, innerRY) / 4));

  for (let dy = -Math.ceil(innerRY); dy <= Math.ceil(innerRY); dy += step) {
    for (let dx = -Math.ceil(innerRX); dx <= Math.ceil(innerRX); dx += step) {
      if (innerRX > 0 && innerRY > 0 && (dx * dx) / (innerRX * innerRX) + (dy * dy) / (innerRY * innerRY) > 1) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        sum += grayscale[py * imgW + px];
        count++;
      }
    }
  }

  // Also sample the exact center cross pattern for extra precision
  // This catches small-pencil fills that are concentrated at center
  for (let r = 0; r <= Math.floor(innerRX * 0.7); r++) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        sum += grayscale[py * imgW + px];
        count++;
      }
    }
  }

  if (count === 0) return 255; // default = bright = unfilled
  return sum / count; // raw brightness: low = dark = filled
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
//   colGap = (190 - 5×35.5) / 6 = 12.5/6 ≈ 2.083mm
//   bx[col] = 10 + 2.083 + col×37.583 = 12.083 + col×37.583
//   firstBubbleX[col] = bx[col] + numW(10) = 22.083 + col×37.583
//   NX = (firstBubbleX - 6) / 198:
//     Col 0: 16.083/198 = 0.0812
//     Col 1: 53.667/198 = 0.2710
//     Col 2: 91.250/198 = 0.4609
//     Col 3: 128.833/198 = 0.6507
//     Col 4: 166.417/198 = 0.8405
//
//   Answer Y start (currentY after header+ID): ≈ 77mm from page top
//   firstBubbleNY row 0 = (77 - 6) / 285 = 71/285 = 0.2491
//   blockVGap = 10×5.2 + 10 = 62mm
//   firstBubbleNY row 1 = (77 + 62 - 6) / 285 = 133/285 = 0.4667
//
//   bubbleSpacingNX = 5.5 / 198 = 0.02778
//   rowSpacingNY    = 5.2 / 285 = 0.01825
function get100ItemTemplateLayout(): TemplateLayout {
  const fw = 198, fh = 285;

  // Column first-bubble NX values
  const col0NX = 16.083 / fw;
  const col1NX = 53.667 / fw;
  const col2NX = 91.250 / fw;
  const col3NX = 128.833 / fw;
  const col4NX = 166.417 / fw;

  // Row first-bubble NY values
  const row0NY = 71 / fh;
  const row1NY = 133 / fh;

  const bSpacingNX = 5.5 / fw;
  const rSpacingNY = 5.2 / fh;

  return {
    answerBlocks: [
      // Row 0 (top blocks) — Q1-10, Q21-30, Q41-50, Q61-70, Q81-90
      { startQ: 1,  endQ: 10,  firstBubbleNX: col0NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 21, endQ: 30,  firstBubbleNX: col1NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 41, endQ: 50,  firstBubbleNX: col2NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 61, endQ: 70,  firstBubbleNX: col3NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      { startQ: 81, endQ: 90,  firstBubbleNX: col4NX, firstBubbleNY: row0NY, bubbleSpacingNX: bSpacingNX, rowSpacingNY: rSpacingNY },
      // Row 1 (bottom blocks) — Q11-20, Q31-40, Q51-60, Q71-80, Q91-100
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

// ─── ANSWER DETECTION ───
// Detects answers using brightness sampling
function detectAnswersFromImage(
  grayscale: Uint8Array,
  width: number,
  height: number,
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

  console.log(`[100Q-BRIGHTNESS] Frame: ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR: ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px`);

  for (const block of layout.answerBlocks) {
    const firstPx = mapToPixel(markers, block.firstBubbleNX, block.firstBubbleNY);
    console.log(`[100Q-BRIGHTNESS] Block Q${block.startQ}-${block.endQ}: firstBubble px=(${Math.round(firstPx.px)},${Math.round(firstPx.py)})`);

    for (let q = block.startQ; q <= block.endQ && q <= numQuestions; q++) {
      const rowInBlock = q - block.startQ;
      const fills: { choice: string; brightness: number }[] = [];

      // Sample all choices for this question
      for (let c = 0; c < choicesPerQuestion; c++) {
        const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
        const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
        const { px, py } = mapToPixel(markers, nx, ny);
        const brightness = sampleBubbleAt(grayscale, width, height, px, py, bubbleRX, bubbleRY);
        fills.push({ choice: choiceLabels[c], brightness });
      }

      // Debug: Log all brightness values for first question in each block
      if (q === block.startQ) {
        console.log(`[100Q-BRIGHTNESS] Q${q} all choices: ${fills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')}`);
      }

      // Sort ascending by brightness — darkest (most filled) first
      const sorted = [...fills].sort((a, b) => a.brightness - b.brightness);
      const darkest = sorted[0].brightness;
      const secondDark = sorted.length >= 2 ? sorted[1].brightness : 255;
      const thirdDark = sorted.length >= 3 ? sorted[2].brightness : 255;
      const brightest = sorted[sorted.length - 1].brightness;

      let selectedChoice = '';

      // Use the brightest bubble as the "unfilled" reference
      const ref = brightest;
      const darkRatio = ref > 20 ? darkest / ref : 1;
      const gapFromSecond = secondDark - darkest;
      const gapRatio = ref > 20 ? gapFromSecond / ref : 0;
      const absoluteGap = secondDark - darkest;
      const gapFromThird = thirdDark - darkest;

      // Detection with balanced thresholds:
      // Primary: darkest must be < 68% of brightest (32%+ drop) - strong fill
      // Secondary: darkest < 88% of brightest AND strong gap from 2nd (12%+) - clear fill
      // Tertiary: darkest < 93% of brightest AND moderate gap (7%+) AND absolute gap >= 12 - light fill
      // Quaternary: absolute gap >= 18 AND darkest clearly darker than 3rd (gap >= 8) - handles noise
      // Quinary: very light fills - absolute gap >= 3 AND darkest is clearly below median
      // Final: extremely light fills - any detectable difference (catches 1-unit differences)
      const median = sorted[Math.floor(sorted.length / 2)].brightness;
      
      if (darkRatio < 0.68) {
        // Strong fill: darkest is 32%+ darker than brightest
        selectedChoice = sorted[0].choice;
      } else if (darkRatio < 0.88 && gapRatio > 0.12) {
        // Clear fill: darkest is 12%+ darker AND has strong separation from 2nd
        selectedChoice = sorted[0].choice;
      } else if (darkRatio < 0.93 && gapRatio > 0.07 && absoluteGap >= 12) {
        // Light fill: darkest is 7%+ darker AND has absolute gap of 12+ units
        selectedChoice = sorted[0].choice;
      } else if (absoluteGap >= 18 && gapFromThird >= 8) {
        // Noise handling: clear separation from both 2nd and 3rd darkest
        selectedChoice = sorted[0].choice;
      } else if (absoluteGap >= 3 && darkest < median - 2) {
        // Very light fill: at least 3 units darker AND clearly below median
        selectedChoice = sorted[0].choice;
      } else if (absoluteGap >= 1 && darkest < brightest) {
        // Extremely light fill: any detectable 1+ unit difference (catches very light pencil marks)
        selectedChoice = sorted[0].choice;
      }

      // Log first few questions per block for debugging
      if (q <= block.startQ + 2 || q === block.endQ || !selectedChoice) {
        console.log(`[100Q-BRIGHTNESS] Q${q}: ${fills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')} → ${selectedChoice || '?'} (darkRatio=${darkRatio.toFixed(2)} gapRatio=${gapRatio.toFixed(2)} absGap=${absoluteGap.toFixed(0)} ref=${ref.toFixed(0)})`);
      }

      answers.push({
        questionNumber: q,
        selectedAnswer: selectedChoice,
      });
    }
  }

  // Sort by question number
  answers.sort((a, b) => a.questionNumber - b.questionNumber);

  return answers;
}

// ─── MAIN EXPORT ───
export async function scan100ItemWithBrightness(
  imageUri: string,
  markers: Markers
): Promise<StudentAnswer[]> {
  console.log('[100Q-BRIGHTNESS] Starting brightness-based scanning with Skia');
  
  try {
    // Import Skia and FileSystem (using legacy API for compatibility)
    const { Skia } = require('@shopify/react-native-skia');
    const FileSystem = require('expo-file-system/legacy');
    
    // Load image with Skia
    const normalizedUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: 'base64',
    });
    
    const imageData = Skia.Data.fromBase64(base64);
    const image = Skia.Image.MakeImageFromEncoded(imageData);
    
    if (!image) {
      throw new Error('Failed to load image with Skia');
    }
    
    const width = image.width();
    const height = image.height();
    console.log(`[100Q-BRIGHTNESS] Image loaded: ${width}x${height}px`);
    
    // Read pixel data (RGBA format)
    const pixels = image.readPixels();
    
    if (!pixels) {
      throw new Error('Failed to read pixels from image');
    }
    
    console.log(`[100Q-BRIGHTNESS] Pixel data loaded: ${pixels.length} bytes (${width}x${height}x4)`);
    
    // Convert RGBA to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      // Convert to grayscale using standard formula
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    console.log(`[100Q-BRIGHTNESS] Converted to grayscale`);
    
    // Detect answers using brightness sampling
    const layout = get100ItemTemplateLayout();
    const numQuestions = 100;
    const choicesPerQuestion = 5;
    
    const answers = detectAnswersFromImage(
      grayscale,
      width,
      height,
      markers,
      layout,
      numQuestions,
      choicesPerQuestion
    );
    
    const detectedCount = answers.filter(a => a.selectedAnswer).length;
    console.log(`[100Q-BRIGHTNESS] Detected ${detectedCount}/100 answers`);
    
    return answers;
    
  } catch (error) {
    console.error('[100Q-BRIGHTNESS] Error:', error);
    
    // Return empty answers on error
    return Array.from({ length: 100 }, (_, i) => ({
      questionNumber: i + 1,
      selectedAnswer: '',
    }));
  }
}