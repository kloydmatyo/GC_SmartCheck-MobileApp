# Q1-10 Detection Debug Notes

## Current Issue

The scanner detects only **8 rows** for Q1-10 instead of 10, causing an off-by-2 error where:
- Q3 answer → recorded at Q1
- Q4 answer → recorded at Q2
- Q5 answer → recorded at Q3
- etc.

## Root Cause Analysis

### Evidence 1: Wrong Region Coordinates

**From the logs:**
```
LOG  [OMR] Region 1 (Q1-10): X[5.0%-22.0%] (82-360px) Y[35.0%-65.0%] (544-1011px)
LOG  [OMR] Q1+10: 56 bubbles, 8 rows (8 full)
```

**From the code:**
```typescript
{ xMin: 0.10, xMax: 0.32, yMin: 0.50, yMax: 0.90, startQ: 1, numQ: 10 }
```

The logs show OLD coordinates (5%-22%, 35%-65%) but the code has NEW coordinates (10%-32%, 50%-90%).

### Evidence 2: Wrong Image Rotation

**From the logs:**
```
LOG  [OMR] Image is portrait (2736x3648, aspect=0.75) but 100q sheet should be landscape. Rotating 90° clockwise...
LOG  [OMR] After rotation: 3648x2736
```

**From the code:**
```typescript
// Only for 50q sheets - 20q and 100q sheets should NOT be rotated
if (qCount === 50) {
  // rotation logic...
}
```

The logs show the image is being rotated, but the current code does NOT rotate 100-item sheets.

### Conclusion

**The app is running OLD CODE. It was not restarted after the last code changes.**

Both the region coordinates AND the rotation logic are outdated in the running app.

## Action Required

**CRITICAL: RESTART THE APP** to load the updated code:

1. Stop the Expo dev server (Ctrl+C in terminal)
2. Close the app completely on the device (swipe away from recent apps)
3. Clear Metro bundler cache: `npm start -- --clear`
4. Reopen the app on the device
5. Test scanning again

The app is currently running old code with:
- Wrong region coordinates (35%-65% instead of 50%-90%)
- Wrong rotation logic (rotating 100-item sheets when it shouldn't)

After restart, both issues will be fixed.

## Expected Behavior After Restart

With the correct code loaded, the scanner should:
1. **NOT rotate** the 100-item image (keep it portrait)
2. Use correct region coordinates (X:10-32%, Y:50-90%)
3. Detect 10 rows for Q1-10 (not 8)
4. Map answers to correct question numbers
5. Improve accuracy significantly

The logs should show:
```
LOG  [OMR] Image is portrait (2736x3648, aspect=0.75)
// NO rotation message for 100q sheets
LOG  [OMR] Region 1 (Q1-10): X[10.0%-32.0%] Y[50.0%-90.0%]
LOG  [OMR] Q1+10: XX bubbles, 10 rows
```

## Bubble Density Analysis

From the logs, bubbles in the Q1-10 region (X:10-32%, Y:50-90%):

```
y50-60%: x10:5 x20:5 x30:5  → Q1-Q2 area
y60-70%: x10:20 x20:16 x30:16  → Q3-Q4 area (dense!)
y70-80%: x10:8 x20:5 x30:4  → Q5-Q6 area
y80-90%: x10:20 x20:16 x30:16  → Q7-Q10 area (dense!)
```

This shows good bubble coverage across the Y:50-90% range, confirming the coordinates are correct.

## Why Only 8 Rows Were Detected

Possible reasons:
1. **Wrong region bounds** (35%-65% instead of 50%-90%) - CONFIRMED
2. Some rows have too few bubbles to cluster (unlikely based on density)
3. Row clustering threshold too strict (rowGap = medianH * 0.65)

## Next Steps

1. **Immediate**: Restart app to load new coordinates
2. **Test**: Scan the same answer sheet again
3. **Verify**: Check logs for:
   - Region bounds should show Y[50.0%-90.0%]
   - Should detect 10 rows (not 8)
   - Answers should map to correct question numbers

4. **If still wrong**: Adjust row clustering threshold or add debug logging to see which rows are being detected

## Expected Test Results

With correct coordinates and 10 rows detected:
- Q1: E (currently shows A)
- Q2: B (currently correct)
- Q3: C (currently shows B)
- Q4: E (currently shows C)
- Q5: E (currently correct)
- Q6: E (currently shows B)
- Q7-10: E (currently empty/wrong)

## Long-Term Fix

Even with correct coordinates, the contour-based detection has limitations:
- Accuracy: ~40-60% (too low for production)
- Needs: Brightness-based bubble sampling (like web app)
- Estimated work: 13-19 hours

But for now, restarting the app should significantly improve the results.
