# Student ID Scanner Implementation

## Overview

The student ID scanner has been implemented in `services/zipgradeScanner.ts` to automatically extract 10-digit student IDs from ZipGrade answer sheets.

## Current Status

⚠️ **KNOWN ISSUE**: The scanner is currently not detecting enough bubbles in the ID region. 

### Problem Analysis

From the logs, we can see:
- Expected: ~100 bubbles in ID region (10 columns × 10 rows)
- Actual: Only 14 bubbles detected
- Root cause: The bubble detection algorithm is optimized for answer bubbles and may be filtering out empty ID bubbles

The issue occurs during the initial bubble detection phase (before ID extraction), where contours are filtered based on:
- Area (size)
- Aspect ratio (width/height)
- Extent (fill ratio)

Empty ID bubbles may have different characteristics than answer bubbles, causing them to be filtered out.

## Potential Solutions

### Option 1: Adjust Bubble Detection Parameters
Modify the bubble detection in `processZipgradeSheet()` to be more lenient for the ID region:
- Lower the `minShapeArea` threshold
- Widen the `aspect` ratio range
- Lower the `minExtent` threshold

### Option 2: Separate ID Detection Pass
Add a dedicated detection pass specifically for the ID region with different parameters:
```typescript
// After initial bubble detection, do a second pass for ID region
const idRegionBubbles = detectBubblesInRegion(
  bestThreshMat,
  idYMin,
  idYMax,
  idXMin,
  idXMax,
  /* more lenient parameters */
);
```

### Option 3: Use Different Threshold for ID Region
The ID bubbles might be better detected with a different thresholding method:
- Try Otsu threshold instead of Adaptive
- Adjust the adaptive threshold block size for the ID region

## How It Works (When Bubbles Are Detected)

### Student ID Grid Structure

The Student ZipGrade ID section is a **10-column × 10-row grid**:
- **Columns**: Represent digit positions (0-9 from left to right)
- **Rows**: Represent digit values (0-9 from top to bottom)
- Students fill **ONE bubble per column** to indicate their ID

### Example from Image

For student ID **"2021111345"**:
```
Column 0: Row 2 → digit 2
Column 1: Row 0 → digit 0
Column 2: Row 2 → digit 2
Column 3: Row 1 → digit 1
Column 4: Row 1 → digit 1
Column 5: Row 1 → digit 1
Column 6: Row 1 → digit 1
Column 7: Row 3 → digit 3
Column 8: Row 4 → digit 4
Column 9: Row 5 → digit 5
```

### Physical Location by Template

The ID region location varies by template type:

| Template | Y Position | Notes |
|----------|-----------|-------|
| 20-item  | 18%-38%   | Below header, above Q1-10 |
| 50-item  | 9%-18%    | Very top of sheet |
| 100-item | 5%-15%    | Top of sheet (estimated) |

## Algorithm

### 1. Region Detection
- Filter bubbles within the ID region based on Y coordinates
- Only consider bubbles with fill ≥ 0.35 (filled bubbles)

### 2. Row Clustering
- Group bubbles into rows using Y-axis clustering
- Expected: 10 rows (one for each digit 0-9)
- Uses same clustering algorithm as answer detection

### 3. Column Detection
- Derive column centroids from full rows (rows with multiple bubbles)
- Expected: 10 columns (one for each digit position)
- Uses `deriveColumnCentroids()` function

### 4. Grid Mapping
- Create a 10×10 grid (rows × columns)
- Map each bubble to its grid position
- Keep the bubble with highest fill for each cell

### 5. ID Extraction
- For each column (digit position):
  - Find the row with highest fill value
  - That row number is the digit
- Pad to 10 digits with zeros if needed

## Code Location

The implementation consists of:

1. **`extractStudentId()` function** (lines ~520-680)
   - Main ID extraction logic
   - Called from main scanner after bubble detection

2. **Integration in `processZipgradeSheet()`** (line ~1398)
   - Replaces hardcoded `"00000000"` with actual extraction
   - Called after answer extraction

## Usage

The scanner automatically extracts student IDs when processing sheets:

```typescript
const result = await ZipgradeScanner.processZipgradeSheet(
  imageUri,
  questionCount,
  templateName
);

console.log(result.studentId); // e.g., "2021111345"
```

## Fallback Behavior

If ID extraction fails (not enough bubbles, unclear marks):
- Returns `"0000000000"` (10 zeros)
- Logs warnings to console for debugging

## Testing Recommendations

1. Test with various ID patterns (all same digit, sequential, random)
2. Test with partially filled IDs (missing digits)
3. Test with over-filled IDs (multiple marks per column)
4. Test with different lighting conditions
5. Test with all three template types (20, 50, 100 items)

## Future Enhancements

Potential improvements:
- Validate ID format (e.g., check against student database)
- Detect and warn about multiple marks in same column
- Confidence scoring for ID extraction
- Support for shorter ID formats (e.g., 8 digits)
