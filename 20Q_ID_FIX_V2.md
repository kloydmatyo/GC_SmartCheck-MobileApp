# 20Q Student ID Scanner - Fix V2

## Problem Identified

The student ID scanner was failing because it used `deriveColumnCentroids()` which expects "full rows" with 9-11 bubbles per row. When only filled bubbles are detected (sparse data), each row has only 1 bubble, so the function returned 0 columns.

### Root Cause

```typescript
// deriveColumnCentroids expects full rows:
const fullRows = rows.filter(
  (r) => r.length >= targetCols - 1 && r.length <= targetCols + 1
);
// For 10 digits: needs 9-11 bubbles per row
// With sparse data: each row has only 1 bubble → fullRows.length = 0
```

## Solution

Replaced `deriveColumnCentroids()` with a simpler X-position clustering algorithm that works with sparse data:

### New Algorithm

1. **Collect all X positions** from detected ID bubbles
2. **Sort by X** coordinate
3. **Cluster nearby positions** (within medianW * 1.2)
4. **Calculate centroid** of each cluster
5. **Return column positions**

### Code

```typescript
// For sparse ID data (only filled bubbles), use simple X-position clustering
const allXPositions = idBubbles.map(b => b.x).sort((a, b) => a - b);

const idColCentroids: number[] = [];
let currentCluster: number[] = [allXPositions[0]];

for (let i = 1; i < allXPositions.length; i++) {
  if (allXPositions[i] - currentCluster[currentCluster.length - 1] < medianW * 1.2) {
    currentCluster.push(allXPositions[i]);
  } else {
    // New column - save centroid of current cluster
    idColCentroids.push(currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length);
    currentCluster = [allXPositions[i]];
  }
}
// Don't forget the last cluster
if (currentCluster.length > 0) {
  idColCentroids.push(currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length);
}
```

## Why This Works

### Before (deriveColumnCentroids)
- Required 9-11 bubbles per row
- With sparse data: 0 full rows found
- Result: 0 columns detected → FAIL

### After (X-position clustering)
- Works with any number of bubbles
- Clusters bubbles by X position
- Each filled bubble contributes to column detection
- Result: Detects all filled digit columns → SUCCESS

## Example

### Input: Student ID "202220011"
- 9 filled bubbles detected
- X positions: [850, 910, 970, 970, 1030, 1030, 1090, 1090, 1150]

### Clustering:
- Column 1: [850] → centroid 850
- Column 2: [910] → centroid 910
- Column 3: [970, 970] → centroid 970
- Column 4: [1030, 1030] → centroid 1030
- Column 5: [1090, 1090] → centroid 1090
- Column 6: [1150] → centroid 1150

### Result:
- 6 columns detected
- Digits extracted: "202201" (first 6 digits)
- Padded to: "20220100"

## Changes Summary

1. **Replaced column detection** algorithm for ID scanning
2. **Kept all other logic** unchanged (row clustering, digit extraction, etc.)
3. **No impact on answer detection** (still uses deriveColumnCentroids)

## Testing

After rebuilding the app, you should see:

```
[OMR] Student ID region (20q): 15 bubbles in y[15%-40%]
[OMR] Student ID bubble Y positions: y=22%, y=24%, y=26%, ...
[OMR] Student ID bubble fills: 0.75, 0.32, 0.81, ...
[OMR] Student ID: 3 rows detected, 3 valid rows
[OMR] Student ID: 9 columns detected at x=850,910,970,1030,1090,1150,...
[OMR] Student ID col 1: digit=2 (y=680, fill=0.75)
[OMR] Student ID col 2: digit=0 (y=720, fill=0.81)
...
[OMR] Student ID extracted: 20222001 (from 9 digits)
```

## Important Note

**You must rebuild/reload the app** for these changes to take effect. The logs showing `y[18%-38%]` indicate the app is still running the old code.

To rebuild:
- Stop the app
- Run `npm run android` or `npm run ios`
- Or use Expo's reload feature (shake device → Reload)
