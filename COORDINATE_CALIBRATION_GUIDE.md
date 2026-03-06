# 100-Item Template Coordinate Calibration Guide

## Current Issue Analysis

Based on scan logs, we have:
- **Perfect matches**: Q76-80, Q81-84 (proves detection logic works)
- **Blind spot**: Q71-75 (all returning 255 = sampling outside image)
- **Systematic shifts**: Other sections show column/row drift

## Pixel Coordinates from Logs

```
Frame: 1460x1546px (from markers)
Image: 2736x3648px (original)

Block positions (firstBubble px):
- Q41-50:  px=(2388, 827)  ← Top row, left block
- Q71-80:  px=(2874, 826)  ← Top row, right block (OUT OF BOUNDS!)
- Q1-10:   px=(1551, 1215) ← Bottom grid, column 1
- Q21-30:  px=(1886, 1213) ← Bottom grid, column 2
- Q51-60:  px=(2221, 1212) ← Bottom grid, column 3
- Q81-90:  px=(2555, 1210) ← Bottom grid, column 4
- Q11-20:  px=(1179, 1616) ← Bottom grid row 2, column 1
- Q31-40:  px=(1513, 1614) ← Bottom grid row 2, column 2
- Q61-70:  px=(1848, 1611) ← Bottom grid row 2, column 3
- Q91-100: px=(2183, 1609) ← Bottom grid row 2, column 4
```

## Problem Identification

1. **Q71-80 X coordinate (2874px) exceeds image width (2736px)**
   - This causes sampling from white space → all 255 values
   - Need to shift left by ~140-200px

2. **Column spacing in bottom grid is consistent**
   - Q1→Q21: 335px (1886-1551)
   - Q21→Q51: 335px (2221-1886)
   - Q51→Q81: 334px (2555-2221)
   - Average: 335px between columns

3. **Top row spacing should match bottom grid**
   - Q41→Q71 should also be ~335px
   - Currently: 2874-2388 = 486px (TOO WIDE!)
   - Should be: 2388+335 = 2723px

## Calibration Strategy

### Method 1: Proportional Adjustment (Applied)
Adjust X coordinates to maintain consistent column spacing:
- Keep Q1, Q21, Q51, Q81 positions (they work well)
- Adjust Q71 to be 335px right of Q41
- Recalculate normalized coordinates

### Method 2: Measure from Physical Template
If you have the physical template:
1. Measure distance from left edge of frame to first bubble of each column
2. Measure bubble spacing within each column
3. Update the mm values in the code

### Method 3: Visual Debugging
Add debug output to show where scanner is looking:
- Export annotated image with sampling points
- Verify alignment with actual bubbles

## Next Steps

1. Test with the adjusted coordinates
2. If Q71-75 still fail, try Method 2 or 3
3. Fine-tune individual blocks based on accuracy results
4. Consider adding auto-calibration using detected bubble positions
