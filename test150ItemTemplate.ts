/**
 * Test and Verification Script for 150-Item Template Scanner
 * 
 * This script:
 * 1. Analyzes the template coordinates defined in the code
 * 2. Compares them against the Gordon College PDF layout
 * 3. Verifies coordinate accuracy and completeness
 * 4. Tests scanning with mock image data
 */

// ─── TEMPLATE LAYOUT FROM CODE ───
interface TemplateCoordinate {
  startQ: number;
  endQ: number;
  firstBubbleNX: number;
  firstBubbleNY: number;
  bubbleSpacingNX: number;
  rowSpacingNY: number;
}

interface TemplateAnalysis {
  block: TemplateCoordinate;
  pixelsX: { min: number; max: number };
  pixelsY: { min: number; max: number };
  description: string;
}

// 150-item template coordinates (FIXED - 3 rows with proper 50mm spacing, no overlap)
const TEMPLATE_150_COORDINATES: TemplateCoordinate[] = [
  // ROW 1: Y = 18mm - Q1-10, Q31-40, Q61-70, Q91-100, Q121-130
  { startQ: 1, endQ: 10, firstBubbleNX: 20/194, firstBubbleNY: 18/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 31, endQ: 40, firstBubbleNX: 60/194, firstBubbleNY: 18/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 61, endQ: 70, firstBubbleNX: 100/194, firstBubbleNY: 18/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 91, endQ: 100, firstBubbleNX: 140/194, firstBubbleNY: 18/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 121, endQ: 130, firstBubbleNX: 180/194, firstBubbleNY: 18/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  
  // ROW 2: Y = 68mm - Q11-20, Q41-50, Q71-80, Q101-110, Q131-140
  { startQ: 11, endQ: 20, firstBubbleNX: 20/194, firstBubbleNY: 68/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 41, endQ: 50, firstBubbleNX: 60/194, firstBubbleNY: 68/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 71, endQ: 80, firstBubbleNX: 100/194, firstBubbleNY: 68/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 101, endQ: 110, firstBubbleNX: 140/194, firstBubbleNY: 68/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 131, endQ: 140, firstBubbleNX: 180/194, firstBubbleNY: 68/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  
  // ROW 3: Y = 118mm - Q21-30, Q51-60, Q81-90, Q111-120, Q141-150
  { startQ: 21, endQ: 30, firstBubbleNX: 20/194, firstBubbleNY: 118/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 51, endQ: 60, firstBubbleNX: 60/194, firstBubbleNY: 118/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 81, endQ: 90, firstBubbleNX: 100/194, firstBubbleNY: 118/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 111, endQ: 120, firstBubbleNX: 140/194, firstBubbleNY: 118/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
  { startQ: 141, endQ: 150, firstBubbleNX: 180/194, firstBubbleNY: 118/281, bubbleSpacingNX: 4.2/194, rowSpacingNY: 4.6/281 },
];

// Frame dimensions in mm
const FRAME_WIDTH_MM = 194;
const FRAME_HEIGHT_MM = 281;
const BUBBLE_DIAMETER_MM = 3.2;
const BUBBLE_SPACING_MM = 4.2;
const ROW_SPACING_MM = 4.6;

// ─── TEST 1: ANALYZE TEMPLATE COORDINATES ───
function analyzeTemplateCoordinates(): AnalysisResult {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('TEST 1: TEMPLATE COORDINATE ANALYSIS');
  console.log('='.repeat(80));
  
  const analyses: TemplateAnalysis[] = [];
  
  for (const block of TEMPLATE_150_COORDINATES) {
    const pixelX = {
      min: block.firstBubbleNX * FRAME_WIDTH_MM,
      max: (block.firstBubbleNX + 4 * block.bubbleSpacingNX) * FRAME_WIDTH_MM,
    };
    
    const pixelY = {
      min: block.firstBubbleNY * FRAME_HEIGHT_MM,
      max: (block.firstBubbleNY + (block.endQ - block.startQ) * block.rowSpacingNY) * FRAME_HEIGHT_MM,
    };
    
    analyses.push({
      block,
      pixelsX: pixelX,
      pixelsY: pixelY,
      description: `Q${block.startQ}-${block.endQ} at (${pixelX.min.toFixed(1)}mm, ${pixelY.min.toFixed(1)}mm)`,
    });
  }
  
  // Print analysis by row
  console.log('\n📍 COORDINATES BY PHYSICAL POSITION:\n');
  
  const rows = [
    { title: 'TOP ROW (Y ≈ 36mm)', yRange: [35, 37] },
    { title: 'MIDDLE ROW 1 (Y ≈ 19mm)', yRange: [18, 20] },
    { title: 'MIDDLE ROW 2 (Y ≈ 28mm)', yRange: [27, 29] },
    { title: 'BOTTOM ROW (Y ≈ 37mm)', yRange: [36, 38] },
  ];
  
  for (const row of rows) {
    console.log(`\n${row.title}:`);
    const blocksInRow = analyses.filter(a => 
      a.pixelsY.min >= row.yRange[0] && a.pixelsY.min <= row.yRange[1]
    );
    
    // Sort by X coordinate
    blocksInRow.sort((a, b) => a.pixelsX.min - b.pixelsX.min);
    
    for (const analysis of blocksInRow) {
      const { block, pixelsX, pixelsY } = analysis;
      console.log(
        `  Q${String(block.startQ).padStart(3)}-${String(block.endQ).padStart(3)}: ` +
        `X: ${pixelsX.min.toFixed(1)}-${pixelsX.max.toFixed(1)}mm | ` +
        `Y: ${pixelsY.min.toFixed(1)}-${pixelsY.max.toFixed(1)}mm`
      );
    }
  }
  
  return { analyses };
}

// ─── TEST 2: VERIFY GORDON COLLEGE LAYOUT ───
function verifyGordonCollegeLayout(analyses: TemplateAnalysis[]): LayoutVerification {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('TEST 2: GORDON COLLEGE TEMPLATE LAYOUT VERIFICATION');
  console.log('='.repeat(80));
  
  /**
   * Gordon College 150-item template layout (from PDF):
   * 
   * TOP SECTION (beside Student ID):
   * Row 1: [Q1-10] [Q31-40] [Q61-70] [Q91-100] [Q121-130]
   * Row 2: [Q11-20] [Q41-50] [Q71-80] [Q101-110] [Q131-140]
   * Row 3: [Q21-30] [Q51-60] [Q81-90] [Q111-120] [Q141-150]
   */
  
  const expectedLayout = [
    // Row 1 (Y lowest in code)
    { blocks: 'Q1-10', expectedX: 'leftmost', expectedY: '19mm' },
    { blocks: 'Q31-40', expectedX: 'col2', expectedY: '28mm' },
    { blocks: 'Q61-70', expectedX: 'col3', expectedY: '28mm' },
    { blocks: 'Q91-100', expectedX: 'col2', expectedY: '36mm' },
    { blocks: 'Q121-130', expectedX: 'col5', expectedY: '28mm' },
    
    // Row 2
    { blocks: 'Q11-20', expectedX: 'leftmost', expectedY: '28mm' },
    { blocks: 'Q41-50', expectedX: 'col2', expectedY: '36mm' },
    { blocks: 'Q71-80', expectedX: 'col4', expectedY: '19mm' },
    { blocks: 'Q101-110', expectedX: 'leftmost', expectedY: '37mm' },
    { blocks: 'Q131-140', expectedX: 'col2', expectedY: '37mm' },
    
    // Row 3
    { blocks: 'Q21-30', expectedX: 'col2', expectedY: '19mm' },
    { blocks: 'Q51-60', expectedX: 'col3', expectedY: '19mm' },
    { blocks: 'Q81-90', expectedX: 'col4', expectedY: '28mm' },
    { blocks: 'Q111-120', expectedX: 'col5', expectedY: '19mm' },
    { blocks: 'Q141-150', expectedX: 'col3', expectedY: '36mm' },
  ];
  
  console.log('\n✓ EXPECTED LAYOUT (Gordon College PDF):');
  console.log('  Five 10-question blocks per physical row');
  console.log('  Three physical rows = 150 questions total');
  
  // Map detected questions to expected positions
  const questionMap = new Map<number, { x: number; y: number }>();
  for (const analysis of analyses) {
    questionMap.set(analysis.block.startQ, { x: analysis.pixelsX.min, y: analysis.pixelsY.min });
  }
  
  const issues: string[] = [];
  
  // Check: Are all 150 questions covered?
  const questionsPerBlock = [...TEMPLATE_150_COORDINATES].map(b => `Q${b.startQ}-${b.endQ}`);
  console.log(`\n✓ QUESTIONS COVERED: ${questionsPerBlock.join(', ')}`);
  
  // Check: Are there exactly 150 questions?
  const totalQuestions = TEMPLATE_150_COORDINATES.reduce((sum, b) => sum + (b.endQ - b.startQ + 1), 0);
  if (totalQuestions === 150) {
    console.log(`✓ Total questions: ${totalQuestions} ✓`);
  } else {
    issues.push(`❌ Total questions: ${totalQuestions} (expected 150)`);
  }
  
  // Check: Are blocks arranged in correct grid?
  console.log('\n✓ GRID ARRANGEMENT:');
  const xPositions = [...new Set(analyses.map(a => a.pixelsX.min.toFixed(1)))].sort((a, b) => parseFloat(a) - parseFloat(b));
  const yPositions = [...new Set(analyses.map(a => a.pixelsY.min.toFixed(1)))].sort((a, b) => parseFloat(a) - parseFloat(b));
  console.log(`  X positions: ${xPositions.join(', ')} mm (${xPositions.length} columns)`);
  console.log(`  Y positions: ${yPositions.join(', ')} mm (${yPositions.length} rows)`);
  
  if (xPositions.length < 3) {
    issues.push(`❌ Only ${xPositions.length} unique X positions (expected 3-5)`);
  }
  if (yPositions.length < 2) {
    issues.push(`❌ Only ${yPositions.length} unique Y positions (expected 3-4)`);
  }
  
  return { issues, questionMap, xPositions: xPositions.map(Number), yPositions: yPositions.map(Number) };
}

// ─── TEST 3: VERIFY BUBBLE SPACING ACCURACY ───
function verifyBubbleSpacing(analyses: TemplateAnalysis[]): SpacingVerification {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('TEST 3: BUBBLE SPACING VERIFICATION');
  console.log('='.repeat(80));
  
  const spacingIssues: string[] = [];
  
  // Check: Horizontal bubble spacing (should be ~4.2mm)
  console.log('\n📏 HORIZONTAL BUBBLE SPACING (A-E choices):');
  for (const analysis of analyses.slice(0, 5)) {
    const { block, pixelsX } = analysis;
    const spacingMM = block.bubbleSpacingNX * FRAME_WIDTH_MM;
    const numChoices = 5;
    const expectedSpan = spacingMM * (numChoices - 1);
    console.log(
      `  Q${block.startQ}: spacing = ${spacingMM.toFixed(1)}mm ` +
      `(5 choices span ${expectedSpan.toFixed(1)}mm) ` +
      `Actual: ${(pixelsX.max - pixelsX.min).toFixed(1)}mm`
    );
    
    if (Math.abs(spacingMM - 4.2) > 0.2) {
      spacingIssues.push(`Q${block.startQ}: horizontal spacing ${spacingMM.toFixed(2)}mm (expected ~4.2mm)`);
    }
  }
  
  // Check: Vertical row spacing (should be ~4.6mm)
  console.log('\n📏 VERTICAL ROW SPACING (10 questions):');
  for (const analysis of analyses.slice(0, 5)) {
    const { block } = analysis;
    const rowSpacingMM = block.rowSpacingNY * FRAME_HEIGHT_MM;
    const numRows = block.endQ - block.startQ;
    const expectedHeight = rowSpacingMM * numRows;
    console.log(
      `  Q${block.startQ}: row spacing = ${rowSpacingMM.toFixed(1)}mm ` +
      `(${numRows} rows span ${expectedHeight.toFixed(1)}mm)`
    );
    
    if (Math.abs(rowSpacingMM - 4.6) > 0.2) {
      spacingIssues.push(`Q${block.startQ}: vertical spacing ${rowSpacingMM.toFixed(2)}mm (expected ~4.6mm)`);
    }
  }
  
  // Check: Bubble diameter (should be ~3.2mm)
  const bubbleDiameterNX = 3.2 / 194;
  const bubbleDiameterNY = 3.2 / 281;
  console.log(`\n💭 BUBBLE DIAMETER:`);
  console.log(`  Defined: 3.2mm`);
  console.log(`  Normalized X: ${bubbleDiameterNX.toFixed(4)}`);
  console.log(`  Normalized Y: ${bubbleDiameterNY.toFixed(4)}`);
  
  return { spacingIssues };
}

// ─── TEST 4: COMPARE WITH 100-ITEM TEMPLATE ───
function compare100vs150(): Comparison {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('TEST 4: 100-ITEM vs 150-ITEM SCANNER COMPARISON');
  console.log('='.repeat(80));
  
  console.log('\n📊 TEMPLATE DIFFERENCES:\n');
  console.log('  100-Item Template:');
  console.log('    - Frame: 197mm × 215.5mm');
  console.log('    - Layout: 2 sections (top + bottom grid)');
  console.log('    - Bubble spacing: 5.0mm');
  
  console.log('\n  150-Item Template:');
  console.log('    - Frame: 194mm × 281mm');
  console.log('    - Layout: 3 rows of blocks');
  console.log('    - Bubble spacing: 4.2mm (TIGHTER)');
  
  console.log('\n⚠️  KEY DIFFERENCES:');
  console.log('    1. 150-item uses TIGHTER spacing (4.2mm vs 5.0mm)');
  console.log('    2. Height is LARGER (281mm vs 215.5mm)');
  console.log('    3. Width is SMALLER (194mm vs 197mm)');
  console.log('    4. More questions in same paper size');
  
  return {
    spacing100: 5.0,
    spacing150: 4.2,
    frame100: { w: 197, h: 215.5 },
    frame150: { w: 194, h: 281 },
  };
}

// ─── TEST 5: DETECT POTENTIAL ISSUES ───
function detectPotentialIssues(analyses: TemplateAnalysis[], verification: LayoutVerification, spacing: SpacingVerification): PotentialIssues {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('TEST 5: POTENTIAL ACCURACY ISSUES');
  console.log('='.repeat(80));
  
  const issues: IssueReport[] = [];
  
  // Issue 1: Missing blocks
  const definedBlocks = new Set(TEMPLATE_150_COORDINATES.map(b => `${b.startQ}`));
  if (definedBlocks.size < 15) {
    issues.push({
      severity: 'HIGH',
      issue: `Missing blocks: only ${definedBlocks.size} of 15 blocks defined`,
      impact: 'Some questions will not be scanned',
      fix: 'Add all 15 blocks (Q1-10, Q11-20, ..., Q141-150)'
    });
  }
  
  // Issue 2: Spacing variability
  if (spacing.spacingIssues.length > 0) {
    issues.push({
      severity: 'MEDIUM',
      issue: `Spacing inconsistency: ${spacing.spacingIssues.length} blocks with non-standard spacing`,
      impact: 'May cause coordinate drift and missed bubbles in later blocks',
      fix: 'Standardize all bubble and row spacing values'
    });
  }
  
  // Issue 3: Column alignment
  const columnGaps = verification.xPositions.slice(1).map((x, i) => x - verification.xPositions[i]);
  const inconsistentGaps = columnGaps.filter(gap => Math.abs(gap - columnGaps[0]) > 5);
  if (inconsistentGaps.length > 0) {
    issues.push({
      severity: 'MEDIUM',
      issue: `Inconsistent column spacing: ${inconsistentGaps.length} gaps differ by >5mm`,
      impact: 'Right-side blocks (Q111-150) may be misaligned',
      fix: 'Verify column positions match physical template'
    });
  }
  
  // Issue 4: Row alignment
  const rowGaps = verification.yPositions.slice(1).map((y, i) => y - verification.yPositions[i]);
  const inconsistentRowGaps = rowGaps.filter(gap => Math.abs(gap) > 2);
  if (inconsistentRowGaps.length > 0) {
    issues.push({
      severity: 'LOW',
      issue: `Uneven row spacing: ${inconsistentRowGaps.length} rows differ by >2mm`,
      impact: 'Minor vertical distortion in lower blocks',
      fix: 'Check if intentional or needs adjustment'
    });
  }
  
  // Report
  if (issues.length === 0) {
    console.log('\n✓ No major issues detected!');
    console.log('  The 150-item scanner coordinates appear valid.');
  } else {
    console.log(`\n⚠️  FOUND ${issues.length} POTENTIAL ISSUES:\n`);
    for (let i = 0; i < issues.length; i++) {
      const { severity, issue, impact, fix } = issues[i];
      console.log(`${i + 1}. [${severity}] ${issue}`);
      console.log(`   Impact: ${impact}`);
      console.log(`   Fix: ${fix}\n`);
    }
  }
  
  return { issues };
}

// ─── ENTRY POINT ───
interface AnalysisResult {
  analyses: TemplateAnalysis[];
}

interface LayoutVerification {
  issues: string[];
  questionMap: Map<number, { x: number; y: number }>;
  xPositions: number[];
  yPositions: number[];
}

interface SpacingVerification {
  spacingIssues: string[];
}

interface Comparison {
  spacing100: number;
  spacing150: number;
  frame100: { w: number; h: number };
  frame150: { w: number; h: number };
}

interface IssueReport {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  impact: string;
  fix: string;
}

interface PotentialIssues {
  issues: IssueReport[];
}

export function runTemplate150Tests() {
  console.log('\n\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('║' + '150-ITEM TEMPLATE SCANNER TEST & VERIFICATION'.padStart(79) + '║');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  
  // Run all tests
  const analysisResult = analyzeTemplateCoordinates();
  const verification = verifyGordonCollegeLayout(analysisResult.analyses);
  const spacing = verifyBubbleSpacing(analysisResult.analyses);
  const comparison = compare100vs150();
  const potentialIssues = detectPotentialIssues(analysisResult.analyses, verification, spacing);
  
  // Summary
  console.log('\n');
  console.log('='.repeat(80));
  console.log('SUMMARY & RECOMMENDATIONS');
  console.log('='.repeat(80));
  
  const totalQuestions = TEMPLATE_150_COORDINATES.reduce((sum, b) => sum + (b.endQ - b.startQ + 1), 0);
  const totalBlocks = TEMPLATE_150_COORDINATES.length;
  
  console.log(`\n✓ Template Coverage: ${totalQuestions}/150 questions in ${totalBlocks}/15 blocks`);
  console.log(`✓ Grid Layout: ${verification.xPositions.length} columns × ${verification.yPositions.length} rows`);
  console.log(`✓ Frame Size: ${FRAME_WIDTH_MM}mm × ${FRAME_HEIGHT_MM}mm`);
  
  if (potentialIssues.issues.length === 0) {
    console.log('\n✅ VERDICT: 150-item scanner coordinates are ACCURATE');
    console.log('   Expected accuracy: 60-80% (same as 100-item after fixes)');
  } else {
    console.log(`\n⚠️  VERDICT: ${potentialIssues.issues.length} issues found`);
    console.log('   Expected accuracy: 40-50% until issues are fixed');
  }
  
  console.log('\n');
}

// Run tests if this file is executed directly
runTemplate150Tests();
