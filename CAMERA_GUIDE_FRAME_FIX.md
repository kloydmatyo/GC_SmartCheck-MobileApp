# Camera Guide Frame Fix for 100-Item Template

## Issue
The green camera guide frame was too wide and didn't match the actual A4 paper size for 100-item answer sheets.

## Root Cause
The frame dimensions were set to `width: 340, height: 370` which gives an aspect ratio of ~0.92. However, the actual 100-item template uses A4 paper (210mm × 297mm) with an aspect ratio of ~0.707, which is the same as the 20-item template but larger.

## Fix Applied

### Before:
```typescript
// 100q: nearly square, slightly wider (aspect ~0.91)
return { width: 340, height: 370 };
```

### After:
```typescript
// 100-item: 210mm × 297mm (aspect ~0.707, A4 paper)
// The paper is A4 size, nearly same aspect as 20-item but larger
// Use 85% of screen width to allow some margin
return { width: 320, height: 450 };
```

## Changes Made

### 1. Frame Dimensions (`components/scanner/CameraScanner.tsx`)
- Changed from `340 × 370` to `320 × 450`
- New aspect ratio: 0.711 (very close to A4's 0.707)
- Frame is now taller to match the paper's portrait orientation

### 2. Debug Regions
Updated the colored overlay boxes to show the correct scanning regions:
- Red box: Q1-10 (top-left of bottom grid)
- Green box: Q51-60 (bottom-left of bottom grid)
- These represent the first column of each row in the 10-block grid

## Visual Comparison

### Paper Dimensions:
- **20-item**: 105mm × 148.5mm (aspect 0.707) - Quarter page
- **50-item**: 105mm × 297mm (aspect 0.354) - Half page, very tall
- **100-item**: 210mm × 297mm (aspect 0.707) - Full A4 page

### Frame Dimensions:
- **20-item**: 300 × 400 (aspect 0.75) ✓
- **50-item**: 215 × 500 (aspect 0.43) ✓
- **100-item**: 320 × 450 (aspect 0.71) ✓ **FIXED**

## Testing
After this fix, the green guide frame should:
1. ✅ Match the A4 paper aspect ratio
2. ✅ Be tall enough to fit the entire paper
3. ✅ Provide proper alignment guidance
4. ✅ Show the paper fits comfortably within the frame

## Notes
- The frame is slightly wider than the paper to allow for small alignment adjustments
- The colored debug regions show where the scanner will look for bubbles
- The actual marker detection happens on the full captured image, not just the frame area
- The frame is purely a visual guide to help users align the paper before capture

## Related Files
- `components/scanner/CameraScanner.tsx` - Camera guide frame configuration
- `services/zipgradeScanner.ts` - Actual scanning and marker detection logic
