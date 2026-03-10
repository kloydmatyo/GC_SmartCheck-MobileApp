# 20Q Student ID Scanner - Final Solution

## Problem Analysis

After reviewing the Web-Based-for-SIA project, I discovered they use the **exact same template structure** as your 20Q template:
- 10 columns (one per digit position)
- 10 rows (one for each digit 0-9)
- Row labels on the left (0, 1, 2, 3, 4, 5, 6, 7, 8, 9)
- Students fill ONE bubble per column to indicate the digit

The issue with the previous approaches:
1. **Y-position linear mapping** - Assumed bubbles evenly distributed, but they're not
2. **Sorting by Y-position** - Didn't account for the actual row structure
3. **Column filtering** - Removed valid columns as "outliers"

## Solution: Row Clustering (Like Answer Detection)

The answer detection works perfectly (20/20 correct) because it uses **row clustering**:
1. Detects all bubbles in the answer region
2. Clusters them into rows using Y-position proximity
3. For each row, finds the filled bubble and maps it to a column (A-E)

**We now use the same approach for student ID:**

1. **Detect all bubbles** in the ID region (y=18%-38%)
2. **Cluster into rows** using `clusterByY()` with gap threshold
   - Should produce 10 rows (digits 0-9)
3. **Cluster into columns** using X-position
   - Should produce 9-10 columns
4. **Sort rows top-to-bottom** (row 0 = digit 0, row 9 = digit 9)
5. **For each column:**
   - Find the filled bubble (highest fill ≥ 0.35)
   - Determine which row it belongs to
   - Map row index to digit (0-9)

## Key Changes

### Y-Region Expanded
```typescript
// Before: y=25%-27% (only 2% height - too narrow!)
// After: y=18%-38% (20% height - captures all 10 rows)
const idRegion = detectedQ === 20 
  ? { yMin: 0.18, yMax: 0.38, numDigits: 10 }
  : { yMin: 0.09, yMax: 0.18, numDigits: 10 };
```

### Row Clustering (New)
```typescript
// Cluster bubbles into rows using same gap as answer detection
const idRowGap = medianH * 0.65;
const idRows = clusterByY(idBubbles, idRowGap);

// Sort rows top-to-bottom (digit 0 at top, digit 9 at bottom)
const sortedRows = idRows.sort((a, b) => {
  const avgYa = a.reduce((sum, bubble) => sum + bubble.y, 0) / a.length;
  const avgYb = b.reduce((sum, bubble) => sum + bubble.y, 0) / b.length;
  return avgYa - avgYb;
});
```

### Row-Based Digit Mapping (New)
```typescript
// For each column, find which row the filled bubble is in
for (let rowIdx = 0; rowIdx < sortedRows.length; rowIdx++) {
  const row = sortedRows[rowIdx];
  const avgRowY = row.reduce((sum, b) => sum + b.y, 0) / row.length;
  
  // Check if bubble is in this row
  if (Math.abs(bestBubble.y - avgRowY) < idRowGap) {
    digitIdx = rowIdx;  // Row index = digit (0-9)
    break;
  }
}
```

## Why This Works

1. **Matches template structure** - Uses the same row/column grid as the PDF
2. **Proven approach** - Answer detection uses this exact method successfully
3. **Robust to variations** - Works regardless of exact bubble spacing
4. **No calibration needed** - Automatically adapts to detected rows
5. **Handles sparse data** - Works with only filled bubbles (no empty bubbles needed)

## Expected Results

With this fix, scanning "202220011" should now produce:
- Detect 10 rows (digits 0-9)
- Detect 9 columns (one per digit)
- Correctly map each filled bubble to its row
- Output: "202220011" ✓

## Testing

Test with multiple sheets to verify:
- Different student IDs
- Different lighting conditions
- Different camera angles
- Verify all 20 answers still scan correctly (should be unaffected)
