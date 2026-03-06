# 100-Item Template Rotation Fix

## Issue
The scanner was incorrectly rotating 100-item answer sheets by 90°, treating them as landscape when they are actually portrait (A4).

## Root Cause
The auto-rotation logic had incorrect assumptions:
```typescript
// WRONG CODE:
else if (qCount === 100 && !isLandscape) {
  // 100q sheets are wide (aspect ~0.91), should be landscape
  console.log("...but 100q sheet should be landscape. Rotating 90° clockwise...");
}
```

This was based on a misunderstanding of the template dimensions. The marker frame is 197×215.5mm (aspect 0.91), but the PAPER itself is A4 portrait (210×297mm, aspect 0.707).

## Fix Applied

### Before:
- 100-item sheets were being rotated from portrait to landscape
- This caused all coordinates to be wrong
- Bubbles were not detected in correct positions

### After:
```typescript
// CORRECT CODE:
// Only rotate 50q sheets (which are very tall and narrow)
// 20q and 100q sheets are both portrait and should NOT be rotated
if (qCount === 50) {
  const imgAspect = srcJs.cols / srcJs.rows;
  const isLandscape = imgAspect > 1.0;
  if (isLandscape) {
    // Rotate 50q sheet from landscape to portrait
  }
}
// 100q sheets: NO ROTATION
```

## Template Orientations

| Template | Paper Size | Aspect Ratio | Orientation | Auto-Rotate? |
|----------|-----------|--------------|-------------|--------------|
| 20-item | 105×148.5mm | 0.707 | Portrait | ❌ No |
| 50-item | 105×297mm | 0.354 | Portrait (tall) | ✅ Yes (if captured landscape) |
| 100-item | 210×297mm (A4) | 0.707 | Portrait | ❌ No |

## Additional Fixes

### Layout Coordinates Updated
Also updated the scanning regions to match the actual paper layout:

**Before:**
```typescript
{ xMin: 0.05, xMax: 0.22, yMin: 0.35, yMax: 0.65, startQ: 1, numQ: 10 }
```

**After:**
```typescript
// Q1-10: Bottom-left, row 0
{ xMin: 0.05, xMax: 0.22, yMin: 0.48, yMax: 0.73, startQ: 1, numQ: 10 },
// Q11-20: Bottom-left, row 1  
{ xMin: 0.05, xMax: 0.22, yMin: 0.73, yMax: 0.95, startQ: 11, numQ: 10 },
```

## Testing
After this fix:
1. ✅ 100-item sheets should NOT be rotated
2. ✅ Image should remain in portrait orientation
3. ✅ Coordinates should align with actual bubble positions
4. ✅ Q1-10 should be detected in bottom-left area
5. ✅ Q11-20 should be detected below Q1-10

## Files Modified
- `services/zipgradeScanner.ts` - Removed incorrect 100q rotation logic
- `services/zipgradeScanner.ts` - Updated layout coordinates for Q1-20
- `components/scanner/CameraScanner.tsx` - Updated visual overlay positions

## Note
You may need to **restart the app** or **reload the JavaScript bundle** for these changes to take effect.
