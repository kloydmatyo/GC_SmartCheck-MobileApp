/**
 * REAL WORLD TEST ANALYSIS: Q3 Misdetection
 * 
 * Observed Results from App:
 * - Q1: Scanned=E, Key=E (marked wrong, but maybe reader issue)
 * - Q2: Scanned=----, Key=D (not detected)
 * - Q3: Scanned=B, Key=C ❌ WRONG - bubble filled in C but detected as B
 * - Q4: Scanned=E, Key=B (wrong)
 * - Q5: Scanned=E, Key=A (wrong)
 * - Q6: Scanned=----, Key=B (not detected)
 * - Q7: Scanned=C, Key=C ✓ CORRECT
 * - Q8: Scanned=C, Key=D (wrong)
 * 
 * Physical Answer Sheet Analysis:
 * Looking at the filled-in sheet, Q3 has bubble in column C.
 * Scanner detected it as column B instead.
 * 
 * ROOT CAUSE ANALYSIS:
 * The coordinates we set (18, 68, 118mm) might be off from actual template.
 * Need to measure the physical Gordon College PDF to get accurate positions.
 */

// Current code coordinates (our attempted fix):
const CURRENT_COORDINATES = {
  rows: [
    { rowName: "ROW 1", yMm: 18, questions: "Q1-10, Q31-40, Q61-70, Q91-100, Q121-130" },
    { rowName: "ROW 2", yMm: 68, questions: "Q11-20, Q41-50, Q71-80, Q101-110, Q131-140" },
    { rowName: "ROW 3", yMm: 118, questions: "Q21-30, Q51-60, Q81-90, Q111-120, Q141-150" },
  ],
  columns: {
    col0: "20mm",
    col1: "60mm",
    col2: "100mm",
    col3: "140mm",
    col4: "180mm",
  },
  bubbleSpacing: {
    horizontal: "4.2mm (between A-B-C-D-E)",
    vertical: "4.6mm (between questions)",
  }
};

/**
 * PROBLEM: Q3 detected as B instead of C
 * 
 * Q3 is in ROW 2 (Y=68mm), Column 0 (X=20mm)
 * Bubble positions for Q3 should be:
 * - A: 20mm
 * - B: 20 + 4.2 = 24.2mm
 * - C: 20 + 8.4 = 28.4mm ← ACTUAL FILLED
 * - D: 20 + 12.6 = 32.6mm
 * - E: 20 + 16.8 = 36.8mm
 * 
 * But scanner detected B (24.2mm) instead of C (28.4mm).
 * This is a ~4.2mm error (exactly one bubble width!).
 * 
 * HYPOTHESIS:
 * The column 0 X-position (20mm) might be wrong.
 * Or the bubble spacing (4.2mm) might be incorrect.
 * Or the first questions in each row are in different columns than assumed.
 */

// SOLUTION: Need to measure actual Gordon College template
console.log(`
MEASUREMENT NEEDED:

1. Print the Gordon College 150-item template
2. Measure from left edge (0) to center of each bubble column:
   - A column center: __ mm
   - B column center: __ mm
   - C column center: __ mm
   - D column center: __ mm
   - E column center: __ mm
   
   Spacing between columns:
   - A to B: __ mm
   - B to C: __ mm
   - C to D: __ mm
   - D to E: __ mm

3. For each of the 3 physical rows, measure top edge:
   - Row 1 top: __ mm from page top
   - Row 2 top: __ mm from page top
   - Row 3 top: __ mm from page top

4. Measure gap between rows:
   - Row 1 to Row 2: __ mm
   - Row 2 to Row 3: __ mm

CURRENT ESTIMATES (likely wrong):
- Column spacing: 4.2mm
- Row top positions: 18, 68, 118mm
- Column positions: 20, 60, 100, 140, 180mm
`);

/**
 * ALTERNATIVE: Check if block arrangement is wrong
 * 
 * Maybe Q3 is not in Column 0 Position
 * Maybe the physical layout differs from assumed layout
 * 
 * From the physical sheet visible in photo:
 * - Top section has ID box + some answer blocks
 * - Middle section has answer blocks arranged horizontally
 * - Bottom section has answer blocks
 * 
 * The Gordon College PDF we were given shows:
 * Row 1 (top visual): Q1-10, Q31-40, Q61-70, Q91-100, Q121-130
 * Row 2 (middle):    Q11-20, Q41-50, Q71-80, Q101-110, Q131-140
 * Row 3 (bottom):    Q21-30, Q51-60, Q81-90, Q111-120, Q141-150
 * 
 * But is this the ACTUAL layout or just how it appears?
 * The tighter spacing (4.2mm vs 5.0mm) might mean different organization.
 */

console.log(`
HYPOTHESIS FOR Q3→B MISDETECTION:

Scenario 1: Column position off by one bubble width
- If column C is actually at 24.2mm instead of 28.4mm
- And column B is at 20mm instead of 24.2mm
- Then detecting at "column 1" would hit what we call "column B"
- But physically it's column C

Scenario 2: Row position slightly off
- If Q3 is actually in a different row than assumed
- Brightness sampling gets pixels from wrong block

Scenario 3: Block arrangement is different
- Maybe Row 2 doesn't start with Q11-20 in Column 0
- Maybe blocks are offset differently

NEXT STEP:
Must measure the actual physical Gordon College template
to get TRUE coordinates.
`);
