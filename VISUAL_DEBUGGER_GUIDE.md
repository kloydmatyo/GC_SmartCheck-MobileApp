# Visual Debugger for Student ID Scanning

## Overview

The camera scanner now includes a visual debugger overlay that shows exactly where the scanner is looking for student ID bubbles and answer bubbles.

## What You'll See

When you open the camera scanner, you'll see colored rectangles overlaid on the camera view:

### For 20Q Templates

- **Blue rectangle (top)**: Student ID scanning region (y=19%-29%)
  - This is where the scanner looks for the 10-digit student ID
  - Spans the full width of the sheet (x=10%-90%)
  
- **Red rectangle (left)**: Q1-10 answer region
  - First column of answers
  
- **Green rectangle (right)**: Q11-20 answer region
  - Second column of answers

### For 50Q Templates

- **Blue rectangle (top)**: Student ID scanning region (y=9%-18%)
  - 10-digit student ID section
  - Spans the full width (x=15%-85%)
  
- **Red, Green, Yellow rectangles**: Answer regions for Q1-50
  - Multiple regions for the 50 questions

## How to Use the Visual Debugger

### 1. Align the Sheet

When scanning, make sure:
- The **blue Student ID rectangle** covers the ID section on your sheet
- The **red and green rectangles** cover the answer bubbles
- All four corner markers are visible within the frame

### 2. Check ID Region Alignment

If the student ID is being scanned incorrectly:

1. **Look at the blue rectangle** - does it cover the ID bubbles on your sheet?
2. **If it's too high or too low**, you need to adjust the Y-range in the code
3. **If it's too narrow or wide**, adjust the X-range

### 3. Adjust the Scanning Region

**File**: `GC_SmartCheck-MobileApp/components/scanner/CameraScanner.tsx`

**For 20Q** (around line 85):
```typescript
{
  x: 0.10,      // Left edge (10% from left)
  xEnd: 0.90,   // Right edge (90% from left)
  y: 0.19,      // Top edge (19% from top)
  yEnd: 0.29,   // Bottom edge (29% from top)
  label: "Student ID",
  color: "rgba(0,150,255,0.4)",
}
```

**For 50Q** (around line 105):
```typescript
{
  x: 0.15,      // Left edge (15% from left)
  xEnd: 0.85,   // Right edge (85% from left)
  y: 0.09,      // Top edge (9% from top)
  yEnd: 0.18,   // Bottom edge (18% from top)
  label: "Student ID",
  color: "rgba(0,150,255,0.4)",
}
```

### 4. Match Scanner Logic

**IMPORTANT**: The visual debugger shows where the scanner SHOULD look, but the actual scanning logic is in a different file.

**Scanner Logic File**: `GC_SmartCheck-MobileApp/services/zipgradeScanner.ts` (around line 1410)

```typescript
const idRegion = detectedQ === 20 
  ? { yMin: 0.19, yMax: 0.29, numDigits: 10 } // Must match visual debugger!
  : { yMin: 0.09, yMax: 0.18, numDigits: 10 };
```

**Make sure these values match!**

## Calibration Process

### Step 1: Visual Check
1. Open camera scanner
2. Point at your 20Q answer sheet
3. Look at the blue "Student ID" rectangle
4. Does it cover the ID bubbles on your sheet?

### Step 2: Adjust Visual Debugger
If the rectangle doesn't align:
1. Open `CameraScanner.tsx`
2. Adjust the `y` and `yEnd` values for the Student ID region
3. Rebuild the app
4. Check alignment again

### Step 3: Update Scanner Logic
Once the visual debugger aligns correctly:
1. Open `zipgradeScanner.ts`
2. Update `yMin` and `yMax` to match the visual debugger
3. Rebuild the app
4. Test scanning

### Step 4: Verify
Scan a test sheet and check the logs:
```
[OMR] Student ID bubble Y positions: y=20%, y=22%, y=24%...
```

These Y positions should fall within your configured range (e.g., 19%-29%).

## Example Calibration

### Problem
Student ID detected as "09877758" instead of "202220011"

### Diagnosis
```
[OMR] Student ID bubble Y positions: y=24%, y=24%, y=24%, y=23%, y=22%, y=20%
```
Bubbles are at y=20-24%, but scanner is configured for y=15-40% (too wide!)

### Solution
1. **Visual debugger**: Set y=0.19, yEnd=0.29 (covers 19%-29%)
2. **Scanner logic**: Set yMin=0.19, yMax=0.29
3. **Rebuild and test**

### Result
```
[OMR] Student ID extracted: 202220011 (from 9 digits)
```

## Tips

- **Start with the visual debugger** - it's easier to see alignment issues
- **Use the bubble density grid** in logs to verify bubble positions
- **Make small adjustments** (±0.01 or ±1%) and test each time
- **Keep visual debugger and scanner logic in sync** - they must match!

## Troubleshooting

### Blue rectangle is too high
- Decrease `y` value (e.g., 0.19 → 0.17)
- Decrease `yMin` in scanner logic

### Blue rectangle is too low
- Increase `y` value (e.g., 0.19 → 0.21)
- Increase `yMin` in scanner logic

### Blue rectangle is too narrow (vertically)
- Increase `yEnd` value (e.g., 0.29 → 0.31)
- Increase `yMax` in scanner logic

### Blue rectangle is too wide (vertically)
- Decrease `yEnd` value (e.g., 0.29 → 0.27)
- Decrease `yMax` in scanner logic

## Current Configuration

### 20Q Template
- **Visual**: y=19%-29% (10% span)
- **Scanner**: yMin=0.19, yMax=0.29
- **Status**: Calibrated based on observed bubble positions

### 50Q Template
- **Visual**: y=9%-18% (9% span)
- **Scanner**: yMin=0.09, yMax=0.18
- **Status**: Working (unchanged from original)

## Next Steps

1. Rebuild the app to see the visual debugger
2. Scan a 20Q sheet and check if the blue rectangle aligns with the ID section
3. If not aligned, adjust the values as described above
4. Once aligned, the student ID should scan correctly!
