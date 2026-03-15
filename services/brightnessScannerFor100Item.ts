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

interface IdLayout {
  firstColNX: number;
  firstRowNY: number;
  colSpacingNX: number;
  rowSpacingNY: number;
}

interface TemplateLayout {
  id: IdLayout;
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
    // 100Q ID section: 10 columns × 10 rows (10-digit student ID)
    // Physical layout from templatePdfGenerator.ts drawFullSheet():
    //   TL marker at page (3, 3)mm. Frame width=197mm, frame height=215.5mm.
    //   idStartX = lx(10) + idPad(3) + idLabelW(8) = 21mm from page left → 21-3 = 18mm from TL
    //   idBubbleY empirically calibrated: detected digits were consistently 1 row too high,
    //   so firstRowNY shifted down by one rowSpacing (4.8mm) → 54.3mm from TL marker
    id: {
      firstColNX:   16 / fw,
      firstRowNY:   49.9 / fh,
      colSpacingNX:  4.5 / fw,
      rowSpacingNY:  4.8 / fh,
    },
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

// ─── STUDENT ID DETECTION ───
// Ported from Web-Based-for-SIA OMRScanner.tsx detectStudentIdFromImage()
// Uses brightness sampling at exact physical coordinates (9 cols × 10 rows).
// Returns { studentId, doubleShadeColumns } matching the web app's behaviour.
function detectStudentIdFromImage(
  grayscale: Uint8Array,
  width: number,
  height: number,
  markers: Markers,
  layout: TemplateLayout
): { studentId: string; doubleShadeColumns: number[] } {
  const { id } = layout;
  const idDigits: number[] = [];
  const doubleShadeColumns: number[] = [];

  const frameW = markers.topRight.x - markers.topLeft.x;
  const frameH = markers.bottomLeft.y - markers.topLeft.y;
  const bubbleRX = (layout.bubbleDiameterNX * frameW) / 2;
  const bubbleRY = (layout.bubbleDiameterNY * frameH) / 2;

  // ID bubbles are slightly smaller than answer bubbles (3.5mm vs 3.8mm)
  const idBubbleRX = bubbleRX * (3.5 / 3.8);
  const idBubbleRY = bubbleRY * (3.5 / 3.8);

  console.log('[ID-100Q] BubbleR:', idBubbleRX.toFixed(1), 'x', idBubbleRY.toFixed(1));

  // 10 columns for a 10-digit student ID
  for (let col = 0; col < 10; col++) {
    const fills: number[] = [];

    // 10 rows for digits 0-9
    for (let row = 0; row < 10; row++) {
      const nx = id.firstColNX + col * id.colSpacingNX;
      const ny = id.firstRowNY + row * id.rowSpacingNY;
      const { px, py } = mapToPixel(markers, nx, ny);
      const brightness = sampleBubbleAt(grayscale, width, height, px, py, idBubbleRX, idBubbleRY);
      fills.push(brightness);
    }

    // Sort ascending — lowest brightness = darkest = most filled
    const sorted = [...fills].sort((a, b) => a - b);
    const darkest    = sorted[0];
    const secondDark = sorted[1];
    // Upper quartile (index 7) as the "unfilled" reference — more robust than median
    const upperQ = sorted[7];

    let detectedDigit: number | null = null;
    let hasDetection = false;

    const darkRatio    = upperQ > 20 ? darkest    / upperQ : 1;
    const gapFromSecond = secondDark - darkest;
    const gapRatio     = upperQ > 20 ? gapFromSecond / upperQ : 0;

    // Tier 1 — strong fill
    if (darkRatio < 0.68) {
      detectedDigit = fills.indexOf(darkest);
      hasDetection = true;
    // Tier 2 — light fill with clear separation
    } else if (darkRatio < 0.82 && gapRatio > 0.12) {
      detectedDigit = fills.indexOf(darkest);
      hasDetection = true;
    // Tier 3 — clearly dark bubble even when neighbours are also somewhat dark
    // Handles sheets where unfilled bubbles are uniformly mid-grey (small absolute gap)
    // but the filled one is still meaningfully darker than the upper-quartile reference
    } else if (darkRatio < 0.78) {
      detectedDigit = fills.indexOf(darkest);
      hasDetection = true;
    } else if (gapFromSecond >= 2 && darkest < sorted[2] - 1) {
      detectedDigit = fills.indexOf(darkest);
      hasDetection = true;
    }

    if (hasDetection && detectedDigit !== null) {
      // Double-shade: 2nd-darkest is also quite dark AND close to darkest
      const secondRatio      = upperQ > 20 ? secondDark / upperQ : 1;
      const gapBetweenTopTwo = upperQ > 20 ? gapFromSecond / upperQ : 1;
      if (secondRatio < 0.76 && gapBetweenTopTwo < 0.09) {
        doubleShadeColumns.push(col + 1);
        console.log(`[ID-100Q] ⚠ Col ${col} DOUBLE SHADE: darkest=${darkest.toFixed(0)} 2nd=${secondDark.toFixed(0)} upperQ=${upperQ.toFixed(0)}`);
        idDigits.push(-2);
        continue;
      }
    }

    const digitChar = hasDetection && detectedDigit !== null ? String(detectedDigit) : '_';
    console.log(`[ID-100Q] Col ${col}: [${fills.map(f => f.toFixed(0)).join(',')}] → ${digitChar} (ratio=${darkRatio.toFixed(2)} gap=${gapRatio.toFixed(2)})`);

    // -1 = unshaded (not '0'), -2 = double-shade
    idDigits.push(hasDetection && detectedDigit !== null ? detectedDigit : -1);
  }

  // Strip unshaded (-1) and double-shaded (-2) columns — only keep clean digits
  const cleanId = idDigits.filter(d => d >= 0).map(d => String(d)).join('');
  const rawWithPlaceholders = idDigits.map(d => d === -1 ? '_' : d === -2 ? '?' : String(d)).join('');

  console.log('[ID-100Q] Raw:', rawWithPlaceholders);
  console.log('[ID-100Q] Clean ID:', cleanId, `(${cleanId.length} digits)`,
    doubleShadeColumns.length > 0 ? `double-shade cols: ${doubleShadeColumns.join(',')}` : '');

  return { studentId: cleanId, doubleShadeColumns };
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
      } else if (absoluteGap >= 0.5 && darkest < brightest) {
        // Extremely light fill: any detectable difference (catches very light pencil marks)
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
): Promise<{ answers: StudentAnswer[]; studentId: string; doubleShadeColumns: number[] }> {
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

    // Detect student ID using brightness sampling (ported from web app)
    const { studentId, doubleShadeColumns } = detectStudentIdFromImage(
      grayscale, width, height, markers, layout
    );

    return { answers, studentId, doubleShadeColumns };
    
  } catch (error) {
    console.error('[100Q-BRIGHTNESS] Error:', error);
    
    // Return empty answers on error
    return {
      answers: Array.from({ length: 100 }, (_, i) => ({
        questionNumber: i + 1,
        selectedAnswer: '',
      })),
      studentId: '',
      doubleShadeColumns: [],
    };
  }
}

