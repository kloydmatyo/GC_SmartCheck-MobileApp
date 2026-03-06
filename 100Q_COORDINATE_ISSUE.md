# 100-Item Template Coordinate Issue

## Problem: Only 5/100 Answers Detected

The hybrid scanner is running but detecting almost nothing:

```
LOG  [100Q-HYBRID] Detected 5/100 answers
LOG  [OMR] Hybrid scanner detected 5/100 answers
```

Most questions show "X" (no bubble found):
```
LOG  [100Q-HYBRID] Q10: A=X, B=X, C=X, D=X, E=X → ?
LOG  [100Q-HYBRID] Q71: A=X, B=X, C=X, D=X, E=X → ?
```

## Root Cause: Wrong Template Coordinates

The template coordinates in `hybridScannerFor100Item.ts` are from a **different 100-item template**, not the Gordon College template.

### Evidence:

**Expected bubble positions** (from template):
```
LOG  [100Q-HYBRID] Block Q1-10: firstBubble px=(848,1244)
LOG  [100Q-HYBRID] Block Q41-50: firstBubble px=(1309,867)
```

**Actual bubble positions** (from density analysis):
```
y20-30%: x40:11 x50:9 x70:11 x80:10
y40-50%: x10:7 x20:9 x30:9 x40:13 x50:12 x60:10 x70:12 x80:16
y70-80%: x10:14 x20:14 x30:15 x40:13 x50:10 x60:19 x70:10 x80:18
```

The template expects bubbles at specific positions, but the actual Gordon College template has bubbles at completely different locations.

## Gordon College Template Layout

From the bubble density analysis, the actual layout is:

### Top Section (y20-40%):
- **Column 1**: x40-50% (Q41-50 or similar)
- **Column 2**: x70-80% (Q71-80 or similar)

### Middle Section (y40-70%):
- **Column 1**: x10-30% (Q1-20 or Q11-30)
- **Column 2**: x40-60% (Q21-40 or Q31-50)
- **Column 3**: x60-80% (Q51-70 or Q61-80)

### Bottom Section (y70-90%):
- **Column 1**: x10-30% (Q1-20 or Q21-40)
- **Column 2**: x40-60% (Q41-60 or Q51-70)
- **Column 3**: x60-80% (Q61-80 or Q71-90)

## Solutions

### Option 1: Measure Actual Template (RECOMMENDED)

**Steps**:
1. Get the Gordon College 100-item template PDF or high-res image
2. Measure exact bubble positions in millimeters
3. Update `hybridScannerFor100Item.ts` with correct coordinates
4. Test and verify

**Time**: 2-3 hours
**Accuracy**: 60-80% (as designed)

### Option 2: Use Web App Template

If the web app uses the same Gordon College template:
1. Copy template coordinates from `Web-Based-for-SIA/src/components/scanning/OMRScanner.tsx`
2. Update `hybridScannerFor100Item.ts`
3. Test and verify

**Time**: 30 minutes
**Accuracy**: 60-80% (if same template)

### Option 3: Reverse-Engineer from Detected Bubbles

Use the detected bubble positions to create a coordinate map:
1. Analyze bubble clusters to identify question blocks
2. Calculate average positions for each question/choice
3. Create template coordinates from averages
4. Test and verify

**Time**: 1-2 hours
**Accuracy**: 40-60% (less precise)

### Option 4: Fall Back to Region-Based Detection

Abandon hybrid scanning for now, improve region-based detection:
1. Define accurate regions based on bubble density
2. Improve clustering and column detection
3. Lower fill thresholds
4. Test and verify

**Time**: 1 hour
**Accuracy**: 30-50% (current approach)

## Immediate Action Required

**We need to know**: Does the web app use the same Gordon College 100-item template?

If YES → Use Option 2 (copy coordinates from web app)
If NO → Use Option 1 (measure actual template)

## Checking Web App Template

Let me check if the web app has Gordon College template coordinates...

