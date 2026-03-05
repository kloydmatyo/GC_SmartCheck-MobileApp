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
// 100-question full page 210 × 297 mm
// Frame width (fw) = 197mm, Frame height (fh) = 215.5mm
function get100ItemTemplateLayout(): TemplateLayout {
  const fw = 197, fh = 215.5;
  
  return {
    answerBlocks: [
      // Top row (beside ID section)
      {
        startQ: 41, endQ: 50,
        firstBubbleNX: 89.35 / fw,
        firstBubbleNY: 51 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 71, endQ: 80,
        firstBubbleNX: 154.85 / fw,
        firstBubbleNY: 51 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      // Bottom grid – row 0
      {
        startQ: 1, endQ: 10,
        firstBubbleNX: 24.86 / fw,
        firstBubbleNY: 105 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 21, endQ: 30,
        firstBubbleNX: 70.02 / fw,
        firstBubbleNY: 105 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 51, endQ: 60,
        firstBubbleNX: 115.18 / fw,
        firstBubbleNY: 105 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      {
        startQ: 81, endQ: 90,
        firstBubbleNX: 160.34 / fw,
        firstBubbleNY: 105 / fh,
        bubbleSpacingNX: 5.0 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      // Bottom grid – row 1
      {
        startQ: 11, endQ: 20,
        firstBubbleNX: 24.86 / fw,
        firstBubbleNY: 161 / fh,
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

      // Sort ascending by brightness — darkest (most filled) first
      const sorted = [...fills].sort((a, b) => a.brightness - b.brightness);
      const darkest = sorted[0].brightness;
      const secondDark = sorted.length >= 2 ? sorted[1].brightness : 255;
      const brightest = sorted[sorted.length - 1].brightness;

      let selectedChoice = '';

      // Use the brightest bubble as the "unfilled" reference
      const ref = brightest;
      const darkRatio = ref > 20 ? darkest / ref : 1;
      const gapFromSecond = secondDark - darkest;
      const gapRatio = ref > 20 ? gapFromSecond / ref : 0;

      // Detection with 70% threshold:
      // Primary: darkest must be < 70% of brightest (30%+ drop)
      // Secondary: darkest < 85% of brightest AND strong gap from 2nd (15%+)
      if (darkRatio < 0.70) {
        selectedChoice = sorted[0].choice;
      } else if (darkRatio < 0.85 && gapRatio > 0.15) {
        selectedChoice = sorted[0].choice;
      }

      // Log first few questions per block for debugging
      if (q <= block.startQ + 2 || q === block.endQ) {
        console.log(`[100Q-BRIGHTNESS] Q${q}: ${fills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')} → ${selectedChoice || '?'} (darkRatio=${darkRatio.toFixed(2)} gapRatio=${gapRatio.toFixed(2)} ref=${ref.toFixed(0)})`);
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
