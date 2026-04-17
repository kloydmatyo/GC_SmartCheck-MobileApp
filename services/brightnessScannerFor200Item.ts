/**
 * Brightness-Based Scanner for 200-Item Templates (2-Stage)
 * 
 * Each page of a 200-item exam has the SAME physical layout as a 100-item sheet.
 * - Page 1: Scans Q1–100
 * - Page 2: Scans Q101–200 (same bubble positions, question numbers offset by 100)
 * 
 * Both pages have a Student ZipGrade ID grid used for linking/merging.
 * 
 * This module wraps the existing 100-item brightness scanner and applies
 * an offset for Page 2.
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
function mapToPixel(
  markers: Markers,
  nx: number,
  ny: number
): { px: number; py: number } {
  const topX = markers.topLeft.x + nx * (markers.topRight.x - markers.topLeft.x);
  const topY = markers.topLeft.y + nx * (markers.topRight.y - markers.topLeft.y);
  const botX = markers.bottomLeft.x + nx * (markers.bottomRight.x - markers.bottomLeft.x);
  const botY = markers.bottomLeft.y + nx * (markers.bottomRight.y - markers.bottomLeft.y);
  return {
    px: topX + ny * (botX - topX),
    py: topY + ny * (botY - topY),
  };
}

// ─── BUBBLE SAMPLING ───
function sampleBubbleAt(
  grayscale: Uint8Array,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number
): number {
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

  // Cross pattern for center precision
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

  if (count === 0) return 255;
  return sum / count;
}

// ─── TEMPLATE LAYOUT (same as 100-item) ───
// 100-question full page: frame 197×215.5mm
function get100ItemTemplateLayout(): TemplateLayout {
  const fw = 197, fh = 215.5;
  
  return {
    answerBlocks: [
      // Top row (beside ID section)
      {
        startQ: 41, endQ: 50,
        firstBubbleNX: 89.35 / fw,
        firstBubbleNY: 47 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 71, endQ: 80,
        firstBubbleNX: 154.85 / fw,
        firstBubbleNY: 47 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      // Bottom grid – row 0
      {
        startQ: 1, endQ: 10,
        firstBubbleNX: 24.86 / fw,
        firstBubbleNY: 102 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 21, endQ: 30,
        firstBubbleNX: 70.02 / fw,
        firstBubbleNY: 102 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 51, endQ: 60,
        firstBubbleNX: 115.18 / fw,
        firstBubbleNY: 102 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 81, endQ: 90,
        firstBubbleNX: 160.34 / fw,
        firstBubbleNY: 102 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      // Bottom grid – row 1
      {
        startQ: 11, endQ: 20,
        firstBubbleNX: 24.86 / fw,
        firstBubbleNY: 159 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 31, endQ: 40,
        firstBubbleNX: 70.02 / fw,
        firstBubbleNY: 161 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 61, endQ: 70,
        firstBubbleNX: 115.18 / fw,
        firstBubbleNY: 161 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 91, endQ: 100,
        firstBubbleNX: 160.34 / fw,
        firstBubbleNY: 161 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
    ],
    bubbleDiameterNX: 3.8 / fw,
    bubbleDiameterNY: 3.8 / fh,
  };
}

// ─── ANSWER DETECTION ───
function detectAnswersFromImage(
  grayscale: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout,
  numQuestions: number,
  choicesPerQuestion: number,
  questionOffset: number
): StudentAnswer[] {
  const answers: StudentAnswer[] = [];
  const choiceLabels = 'ABCDE'.slice(0, choicesPerQuestion).split('');

  const frameW = markers.topRight.x - markers.topLeft.x;
  const frameH = markers.bottomLeft.y - markers.topLeft.y;
  const bubbleRX = (layout.bubbleDiameterNX * frameW) / 2;
  const bubbleRY = (layout.bubbleDiameterNY * frameH) / 2;

  console.log(`[200Q-BRIGHTNESS] Frame: ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR: ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px, offset=${questionOffset}`);

  for (const block of layout.answerBlocks) {
    const firstPx = mapToPixel(markers, block.firstBubbleNX, block.firstBubbleNY);
    const offsetStartQ = block.startQ + questionOffset;
    const offsetEndQ = block.endQ + questionOffset;
    console.log(`[200Q-BRIGHTNESS] Block Q${offsetStartQ}-${offsetEndQ}: firstBubble px=(${Math.round(firstPx.px)},${Math.round(firstPx.py)})`);

    for (let q = block.startQ; q <= block.endQ && q <= numQuestions; q++) {
      const rowInBlock = q - block.startQ;
      const fills: { choice: string; brightness: number }[] = [];

      for (let c = 0; c < choicesPerQuestion; c++) {
        const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
        const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
        const { px, py } = mapToPixel(markers, nx, ny);
        const brightness = sampleBubbleAt(grayscale, width, height, px, py, bubbleRX, bubbleRY);
        fills.push({ choice: choiceLabels[c], brightness });
      }

      // Sort ascending by brightness — darkest first
      const sorted = [...fills].sort((a, b) => a.brightness - b.brightness);
      const darkest = sorted[0].brightness;
      const secondDark = sorted.length >= 2 ? sorted[1].brightness : 255;
      const thirdDark = sorted.length >= 3 ? sorted[2].brightness : 255;
      const brightest = sorted[sorted.length - 1].brightness;

      let selectedChoice = '';

      const ref = brightest;
      const darkRatio = ref > 20 ? darkest / ref : 1;
      const gapFromSecond = secondDark - darkest;
      const gapRatio = ref > 20 ? gapFromSecond / ref : 0;
      const absoluteGap = secondDark - darkest;
      const gapFromThird = thirdDark - darkest;
      const median = sorted[Math.floor(sorted.length / 2)].brightness;

      if (darkRatio < 0.68) {
        selectedChoice = sorted[0].choice;
      } else if (darkRatio < 0.88 && gapRatio > 0.12) {
        selectedChoice = sorted[0].choice;
      } else if (darkRatio < 0.93 && gapRatio > 0.07 && absoluteGap >= 12) {
        selectedChoice = sorted[0].choice;
      } else if (absoluteGap >= 18 && gapFromThird >= 8) {
        selectedChoice = sorted[0].choice;
      } else if (absoluteGap >= 3 && darkest < median - 2) {
        selectedChoice = sorted[0].choice;
      } else if (absoluteGap >= 1 && darkest < brightest) {
        selectedChoice = sorted[0].choice;
      }

      // Apply question offset for Page 2
      const actualQ = q + questionOffset;

      if (q <= block.startQ + 2 || q === block.endQ || !selectedChoice) {
        console.log(`[200Q-BRIGHTNESS] Q${actualQ}: ${fills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')} → ${selectedChoice || '?'} (darkRatio=${darkRatio.toFixed(2)} absGap=${absoluteGap.toFixed(0)})`);
      }

      answers.push({
        questionNumber: actualQ,
        selectedAnswer: selectedChoice,
      });
    }
  }

  answers.sort((a, b) => a.questionNumber - b.questionNumber);
  return answers;
}

// ─── MAIN EXPORT ───

/**
 * Scan a single page of a 200-item exam.
 * 
 * @param imageUri - URI of the captured image
 * @param markers - Corner registration markers detected by OpenCV
 * @param pageNumber - 1 for Q1-100, 2 for Q101-200
 * @returns StudentAnswer[] with question numbers appropriate to the page
 */
export async function scan200ItemPage(
  imageUri: string,
  markers: Markers,
  pageNumber: 1 | 2
): Promise<StudentAnswer[]> {
  const questionOffset = pageNumber === 1 ? 0 : 100;
  console.log(`[200Q-BRIGHTNESS] Starting brightness scan for Page ${pageNumber} (offset=${questionOffset})`);
  
  try {
    const { Skia } = require('@shopify/react-native-skia');
    const FileSystem = require('expo-file-system/legacy');
    
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
    console.log(`[200Q-BRIGHTNESS] Page ${pageNumber} image: ${width}x${height}px`);
    
    const pixels = image.readPixels();
    
    if (!pixels) {
      throw new Error('Failed to read pixels from image');
    }
    
    // Convert RGBA to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
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
      choicesPerQuestion,
      questionOffset
    );
    
    const detectedCount = answers.filter(a => a.selectedAnswer).length;
    console.log(`[200Q-BRIGHTNESS] Page ${pageNumber}: Detected ${detectedCount}/100 answers (Q${questionOffset + 1}-${questionOffset + 100})`);
    
    return answers;
    
  } catch (error) {
    console.error(`[200Q-BRIGHTNESS] Page ${pageNumber} error:`, error);
    
    // Return empty answers on error
    const questionOffset2 = pageNumber === 1 ? 0 : 100;
    return Array.from({ length: 100 }, (_, i) => ({
      questionNumber: i + 1 + questionOffset2,
      selectedAnswer: '',
    }));
  }
}
