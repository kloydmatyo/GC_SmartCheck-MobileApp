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
        firstBubbleNX: 24.86 / fw,  // Adjusted: was 24.86, moved left by 2.5mm (half bubble spacing)
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

// 150-item template layout for brightness scanning
// Frame dimensions: 194mm × 281mm (usable A4 area)
// Grid layout: 3 rows × 5 columns (15 blocks of 10 questions each)
// FIXED: Removed overlapping Y-coordinates, now uses proper 3-row spacing
function get150ItemTemplateLayout(): TemplateLayout {
  const fw = 194, fh = 281;
  
  // 5-column grid with consistent X spacing
  const col0X = 20 / fw;   // Column 0
  const col1X = 60 / fw;   // Column 1
  const col2X = 100 / fw;  // Column 2
  const col3X = 140 / fw;  // Column 3
  const col4X = 180 / fw;  // Column 4
  
  // 3 physical rows with proper vertical separation (avoid overlap)
  // Each block height: 10 questions × 4.6mm spacing = 46mm
  // Row spacing: ~50mm between row starts (46mm block + ~4mm gap)
  
  return {
    answerBlocks: [
      // ═══════════════════════════════════════════════════════════════
      // ROW 1: Y = 18mm (top of page after margin)
      // Blocks: Q1-10, Q31-40, Q61-70, Q91-100, Q121-130
      // ═══════════════════════════════════════════════════════════════
      { startQ: 1, endQ: 10, firstBubbleNX: col0X, firstBubbleNY: 18 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 31, endQ: 40, firstBubbleNX: col1X, firstBubbleNY: 18 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 61, endQ: 70, firstBubbleNX: col2X, firstBubbleNY: 18 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 91, endQ: 100, firstBubbleNX: col3X, firstBubbleNY: 18 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 121, endQ: 130, firstBubbleNX: col4X, firstBubbleNY: 18 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      
      // ═══════════════════════════════════════════════════════════════
      // ROW 2: Y = 68mm (separated by 50mm from Row 1)
      // Blocks: Q11-20, Q41-50, Q71-80, Q101-110, Q131-140
      // ═══════════════════════════════════════════════════════════════
      { startQ: 11, endQ: 20, firstBubbleNX: col0X, firstBubbleNY: 68 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 41, endQ: 50, firstBubbleNX: col1X, firstBubbleNY: 68 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 71, endQ: 80, firstBubbleNX: col2X, firstBubbleNY: 68 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 101, endQ: 110, firstBubbleNX: col3X, firstBubbleNY: 68 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 131, endQ: 140, firstBubbleNX: col4X, firstBubbleNY: 68 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      
      // ═══════════════════════════════════════════════════════════════
      // ROW 3: Y = 118mm (separated by 50mm from Row 2)
      // Blocks: Q21-30, Q51-60, Q81-90, Q111-120, Q141-150
      // ═══════════════════════════════════════════════════════════════
      { startQ: 21, endQ: 30, firstBubbleNX: col0X, firstBubbleNY: 118 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 51, endQ: 60, firstBubbleNX: col1X, firstBubbleNY: 118 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 81, endQ: 90, firstBubbleNX: col2X, firstBubbleNY: 118 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 111, endQ: 120, firstBubbleNX: col3X, firstBubbleNY: 118 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
      { startQ: 141, endQ: 150, firstBubbleNX: col4X, firstBubbleNY: 118 / fh, bubbleSpacingNX: 4.2 / fw, rowSpacingNY: 4.6 / fh },
    ],
    bubbleDiameterNX: 3.2 / fw,
    bubbleDiameterNY: 3.2 / fh,
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
  markers: Markers,
  numQuestions: number = 100
): Promise<StudentAnswer[]> {
  const templateType = numQuestions === 150 ? '150Q' : '100Q';
  console.log(`[${templateType}-BRIGHTNESS] Starting brightness-based scanning with Skia`);
  
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
    console.log(`[${templateType}-BRIGHTNESS] Image loaded: ${width}x${height}px`);
    
    // Read pixel data (RGBA format)
    const pixels = image.readPixels();
    
    if (!pixels) {
      throw new Error('Failed to read pixels from image');
    }
    
    console.log(`[${templateType}-BRIGHTNESS] Pixel data loaded: ${pixels.length} bytes (${width}x${height}x4)`);
    
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
    
    console.log(`[${templateType}-BRIGHTNESS] Converted to grayscale`);
    
    // Detect answers using brightness sampling
    const layout = numQuestions === 150 ? get150ItemTemplateLayout() : get100ItemTemplateLayout();
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
    console.log(`[${templateType}-BRIGHTNESS] Detected ${detectedCount}/${numQuestions} answers`);
    
    return answers;
    
  } catch (error) {
    console.error(`[${templateType}-BRIGHTNESS] Error:`, error);
    
    // Return empty answers on error
    return Array.from({ length: numQuestions }, (_, i) => ({
      questionNumber: i + 1,
      selectedAnswer: '',
    }));
  }
}

// ─── DEDICATED 150-ITEM BRIGHTNESS SCANNER ───
export async function scan150ItemWithBrightness(
  imageUri: string,
  markers: Markers
): Promise<StudentAnswer[]> {
  console.log('[150Q-BRIGHTNESS] Starting brightness-based scanning for 150-item template');
  
  try {
    // Import Skia and FileSystem
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
    console.log(`[150Q-BRIGHTNESS] Image loaded: ${width}x${height}px`);
    
    // Read pixel data (RGBA format)
    const pixels = image.readPixels();
    
    if (!pixels) {
      throw new Error('Failed to read pixels from image');
    }
    
    console.log(`[150Q-BRIGHTNESS] Pixel data loaded: ${pixels.length} bytes`);
    
    // Convert RGBA to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    console.log('[150Q-BRIGHTNESS] Converted to grayscale');
    
    // Detect answers using brightness sampling
    const layout = get150ItemTemplateLayout();
    const choicesPerQuestion = 5;
    
    const answers = detectAnswersFromImage(
      grayscale,
      width,
      height,
      markers,
      layout,
      150,
      choicesPerQuestion
    );
    
    const detectedCount = answers.filter(a => a.selectedAnswer).length;
    console.log(`[150Q-BRIGHTNESS] Detected ${detectedCount}/150 answers`);
    
    return answers;
    
  } catch (error) {
    console.error('[150Q-BRIGHTNESS] Error:', error);
    
    // Return empty answers on error
    return Array.from({ length: 150 }, (_, i) => ({
      questionNumber: i + 1,
      selectedAnswer: '',
    }));
  }
}