# 20Q Student ID Scanner Feature

## Overview

Added student ID scanning capability to 20-question templates without disrupting existing answer detection logic.

## Changes Made

### 1. Template PDF Generator (`templatePdfGenerator.ts`)

The 20Q template already included a 10-digit Student ZipGrade ID section in the PDF layout. No changes were needed to the template structure.

**Location**: Between the Name/Date fields and the answer blocks
**Format**: 10 columns × 10 rows (digits 0-9)

### 2. Scanner Service (`zipgradeScanner.ts`)

Added student ID extraction logic for 20Q templates with lenient detection thresholds:

**Key Features**:
- Scans ID region at Y: 15%-40% of paper height (wider range to capture all bubbles)
- Detects columns using centroid-based approach (minimum 3 columns)
- Maps filled bubbles to digits 0-9 based on row position
- Works with partial IDs (minimum 3 digits detected)
- Falls back to "00000000" if detection fails

**Region Specifications**:
```typescript
20q: { yMin: 0.15, yMax: 0.40, numDigits: 10 }  // Wider range, more lenient
50q: { yMin: 0.09, yMax: 0.18, numDigits: 10 }  // Top region (unchanged)
```

## Implementation Details

### Scanning Algorithm

1. **Filter bubbles** in the ID region (Y: 15%-40%, X: 10%-90%)
2. **Cluster into rows** using the same row gap logic as answers
3. **Accept sparse rows** (1+ bubbles per row, since only filled bubbles may be detected)
4. **Derive column centroids** from valid rows (minimum 3 rows required)
5. **Extract digits** by finding the filled bubble in each column
6. **Map Y position to digit** (rows 0-9 from top to bottom)
7. **Pad to 8 digits** if fewer columns detected

### Lenient Thresholds

To handle real-world scanning conditions where not all bubbles are detected:

- **Minimum bubbles**: 5 (down from 10)
- **Minimum rows**: 3 (down from 8)
- **Minimum columns**: 3 (down from 10)
- **Row validation**: Accept rows with 1+ bubbles (down from 8-12)

### Enhanced Logging

Added detailed logging to help debug ID detection:
- Bubble Y positions as percentages
- Fill values for all ID bubbles
- Number of columns detected and their X positions
- Digit extraction results for each column

### Safety Measures

- Uses existing helper functions (`clusterByY`, `deriveColumnCentroids`)
- Same fill threshold (0.35) as answer detection
- Comprehensive logging for debugging
- Graceful fallback to default ID if detection fails
- No changes to answer region mapping or detection logic

## Known Limitations

- May only detect filled bubbles (empty bubbles might be too faint)
- Requires at least 3 digits to be filled for successful detection
- Works best with clear, well-lit scans

## Testing Checklist

- [ ] 20Q templates generate with ID section
- [ ] Scanner detects filled ID bubbles correctly
- [ ] Partial IDs work (3-9 digits filled)
- [ ] Answer detection still works (Q1-20)
- [ ] Corner markers still detected properly
- [ ] Falls back gracefully when ID is blank
- [ ] 50Q and 100Q templates unaffected

## Compatibility

- **20Q**: Now scans student IDs with lenient thresholds ✅
- **50Q**: Unchanged, continues to scan IDs ✅
- **100Q**: Unchanged, no ID scanning ✅

## Code Isolation

The student ID scanning logic is:
- Executed AFTER answer extraction (no interference)
- Uses the same bubble detection data (no additional processing)
- Completely separate from answer region mapping
- Only active for 20Q and 50Q templates

## Rollback Plan

If issues arise, simply revert the student ID extraction section in `zipgradeScanner.ts` (lines ~1400-1550). The answer detection logic remains completely unchanged.
