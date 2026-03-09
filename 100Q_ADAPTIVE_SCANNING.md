# 100-Item Adaptive Scanning Implementation

## Problem: Template Coordinates Don't Match Actual Paper

From the test scan:
```
LOG  [100Q-HYBRID] Q1: A=X, B=X, C=0.78, D=0.29, E=0.31 → C (WRONG, should be B)
LOG  [100Q-HYBRID] Q41: A=0.32, B=0.29, C=0.78, D=X, E=X → C (WRONG, should be E)
```

**Issue**: The template coordinates from the web app don't match the actual Gordon College template being scanned. Choices A and B are missed in some blocks, D and E in others.

## Root Cause

The web app template coordinates assume specific bubble positions, but:
1. The mobile app's corner marker detection may be slightly different
2. The template may have variations (different print runs, margins, etc.)
3. Fixed coordinates can't adapt to paper shift or distortion

## Solution: Adaptive Bubble Detection

Instead of using fixed template coordinates, the new approach:

### 1. Use Template Coordinates as Region Hints
- Template coordinates define approximate block locations
- Used to identify which region to search for bubbles

### 2. Find Actual Bubbles in Each Block
- Search a generous region around expected block position
- Find all detected bubbles in that region

### 3. Cluster Bubbles by Position
- Group bubbles by Y position to find rows (questions)
- Sort bubbles by X position within each row (choices A-E)

### 4. Detect Answers from Actual Positions
- Use the detected bubble positions (not template positions)
- Compare fill ratios to determine selected answer

## How It Works

```typescript
// For each block (Q1-10, Q11-20, etc.):
1. Calculate expected block region from template
2. Find all bubbles in that region
3. Cluster bubbles by Y position → rows (questions)
4. For each row:
   - Sort bubbles by X position → choices (A-E)
   - Take first 5 bubbles as A, B, C, D, E
   - Find highest fill ratio → selected answer
```

## Advantages

### vs Fixed Template Coordinates:
- ✅ Adapts to template variations
- ✅ Handles coordinate mismatches
- ✅ Works with paper shift/rotation
- ✅ More robust to printing differences

### vs Pure Contour Detection:
- ✅ Uses template to identify blocks
- ✅ Knows which block is which question range
- ✅ Validates bubble positions
- ✅ More accurate than random clustering

## Expected Results

### Before (Fixed Coordinates):
```
LOG  [100Q-HYBRID] Detected 17/100 answers
- Q1: A=X, B=X, C=0.78 → C (WRONG)
- Q41: A=0.32, B=0.29, C=0.78, D=X, E=X → C (WRONG)
```

### After (Adaptive):
```
LOG  [100Q-HYBRID] Detected 70-85/100 answers
- Q1: A=0.85, B=0.78, C=0.30, D=0.28, E=0.32 → A or B (CLOSER)
- Q41: A=0.30, B=0.28, C=0.32, D=0.75, E=0.82 → E (CORRECT)
```

## Implementation Details

### Block Region Definition
```typescript
// Generous margins around expected position
const blockLeft = firstPx.px - searchRadius * 3;
const blockRight = firstPx.px + searchRadius * 3 + (5 * bubbleSpacing);
const blockTop = firstPx.py - searchRadius;
const blockBottom = lastRowPx.py + searchRadius;
```

### Row Clustering
```typescript
// Group bubbles within 2x bubble radius vertically
if (Math.abs(bubble.y - rowMeanY) < bubbleRY * 2) {
  currentRow.push(bubble);
} else {
  rows.push(currentRow);
  currentRow = [bubble];
}
```

### Choice Assignment
```typescript
// Sort row bubbles left-to-right
const sortedByX = row.sort((a, b) => a.x - b.x);

// First 5 bubbles = A, B, C, D, E
const choices = sortedByX.slice(0, 5).map((b, i) => ({
  choice: 'ABCDE'[i],
  fill: b.fill
}));
```

## Testing Instructions

### CRITICAL: Restart the App

1. **Stop Expo dev server**: Press Ctrl+C
2. **Clear Metro cache**: `npm start -- --clear`
3. **Close app on device**: Swipe away
4. **Reopen and test**: Scan the same answer sheet

### What to Check in Logs

1. **Block bubble counts**:
   ```
   LOG  [100Q-HYBRID] Block Q1-10: 50 bubbles in region
   (should be 40-60 bubbles per block)
   ```

2. **Row detection**:
   ```
   LOG  [100Q-HYBRID] Block Q1-10: Found 10 rows
   (should find 10 rows per block)
   ```

3. **All choices found** (no more "X"):
   ```
   LOG  [100Q-HYBRID] Q1: A=0.85, B=0.78, C=0.30, D=0.28, E=0.32 → A
   (all 5 choices should have values, not X)
   ```

4. **Detection rate**:
   ```
   LOG  [100Q-HYBRID] Detected 70-85/100 answers
   (target: 70-85%, up from 17%)
   ```

## Accuracy Expectations

| Metric | Before (Fixed) | After (Adaptive) |
|--------|----------------|------------------|
| Answers Detected | 17/100 (17%) | 70-85/100 (70-85%) |
| Choices Found | ~50% (many "X") | ~95% (few "X") |
| Correct Answers | ~5/17 (29%) | ~50-65/85 (60-75%) |
| Overall Accuracy | ~5% | ~50-65% |

## Limitations

### Still Not Perfect Because:
1. **Contour detection quality**: Depends on lighting, paper quality
2. **Fill ratio detection**: Can't distinguish lightly vs heavily filled
3. **No brightness sampling**: Can't measure actual darkness of marks

### For Production (>90% accuracy):
- Need brightness-based sampling (like web app)
- Requires native module development (40-60 hours)
- Or use web app for 100-item templates

## Troubleshooting

### If still low accuracy (<50%):

1. **Check block bubble counts**:
   - Should be 40-60 bubbles per block
   - If < 30, lighting is poor or threshold is wrong

2. **Check row detection**:
   - Should find 10 rows per block
   - If < 8, clustering threshold may be too strict

3. **Check choice assignment**:
   - All 5 choices should have values (not X)
   - If many X, bubbles aren't being detected

4. **Check fill ratios**:
   - Filled bubbles should be 0.60-0.95
   - Empty bubbles should be 0.10-0.40
   - If all similar (0.30-0.50), threshold is wrong

## Files Modified

1. `services/hybridScannerFor100Item.ts`:
   - Replaced fixed coordinate matching with adaptive clustering
   - Added block region detection
   - Added row clustering by Y position
   - Added choice assignment by X position
   - ~150 lines changed

2. `100Q_ADAPTIVE_SCANNING.md` (this file):
   - Documents the adaptive approach
   - Explains the algorithm
   - Provides testing instructions

## Next Steps

1. **Immediate**: Restart app and test
2. **Verify**: Check logs for improved detection
3. **Measure**: Record actual accuracy
4. **Tune**: Adjust clustering thresholds if needed
5. **Consider**: Brightness sampling for production

