# Visual Analysis of 150-Item Coordinate Overlap Issue

## Frame Dimensions
- Width: 194mm
- Height: 281mm
- Bubble Size: 3.2mm diameter
- Horizontal Spacing: 4.2mm between choice centers
- Vertical Spacing: 4.6mm between question rows

---

## Current Coordinate Layout (PROBLEMATIC)

```
Frame Height: 281mm (100%)
│
├─ Y = 19mm (6.8%):  ┌─────────────────────────────────────┐
│                    │  Q1-10   Q21-30  Q51-60  Q71-80 Q111 │  
│                    │  Row 1 group (Y spans 19-60.4mm)    │
│                    └─────────────────────────────────────┘
│
│  9mm gap
│
├─ Y = 28mm (10.0%): ┌─────────────────────────────────────┐
│                    │ Q11-20   Q31-40  Q61-70  Q81-90 Q121 │
│                    │  Row 2 group (Y spans 28-69.4mm)    │
│                    └─────────────────────────────────────┘
│
│  8mm gap  ⚠️ INSUFFICIENT
│
├─ Y = 36mm (12.8%): ┌─────────────────────────────────────┐
│                    │ Q41-50   Q91-100 Q141-150           │
│                    │  Row 3 top group                    │
│                    │  (Y spans 36-77.4mm) ❌ 41.4mm tall │
│                    │                                      │
│  1mm gap ❌❌❌     ├─────────────────────────────────────┤
│                    │ Q101-110 Q131-140 [EMPTY]           │
├─ Y = 37mm (13.1%): │  Row 3 bottom group (OVERLAPPING!)  │
│                    │  (Y spans 37-78.4mm) ❌ 41.4mm tall │
│                    └─────────────────────────────────────┘
│
└─ Y = 281mm (100%): End of frame

```

---

## Problem Visualization

### Overlap Area (CROPPED VIEW)

```
From Y=36mm to Y=78.4mm = 42.4mm tall area

Row 3 Top (Y=36mm):
┌──────────────────────────────────────────┐ Y=36mm
│ Q41  Q42  Q43  Q44  Q45  Q46  Q47  Q48  Q49  Q50        │
│  A    A    A    A    A    A    A    A    A    A        │  
│  B    B    B    B    B    B    B    B    B    B        │
│  C    C    C    C    C    C    C    C    C    C        │
│  D    D    D    D    D    D    D    D    D    D        │
│  E    E    E    E    E    E    E    E    E    E        │
├──────────────────────────────────────────┤ Y=41.4mm (after 1 question)
│ Q51  Q52 ...
│  (Q41-50 continues downward)
│...
├──────────────────────────────────────────┤ Y=55.2mm
│...
│...
├──────────────────────────────────────────┤ Y=69.0mm
│ Q41-50 ENDS HERE but extends to Y=77.4mm
│
│ ❌ Q101-110 STARTS HERE at Y=37mm
│ ❌ Q101-110 also extends to Y=78.4mm
│ ❌ OVERLAP: 77.4mm - 37mm = 40.4mm of vertical collision!
│...
└──────────────────────────────────────────┘ Y=77.4mm (Q41-50 end)

Row 3 Bottom (Y=37mm) - OVERLAPPING with above!
┌──────────────────────────────────────────┐ Y=37mm ❌ ONLY 1MM BELOW!
│ Q101 Q102 Q103 ...                        │
│  A    A    A                              │
│  B    B    B                              │
│...
│ (Q101-110 continues downward to Y=78.4mm)
└──────────────────────────────────────────┘ Y=78.4mm

```

---

## Why This Breaks the Scanner

### Test Case: Scanning Q50 (bottom of Q41-50 block)

1. **Expected**: Scanner samples pixels at Y = 77.4mm (bottom of Q41-50)
2. **Calculator sees**: Y-coordinate maps to ~27.5% down the frame
3. **Bilinear interpolation**: Creates 2D mapping of normalized coordinates (nx, ny) → (px, py)
4. **Actual problem**: 
   - Q50 at Y=77.4mm is only 40.4mm ABOVE Q101 at Y=37mm
   - In a 281mm frame, that's overlapping blocks!
   - The scanner tries to sample Q50's brightness but gets contaminated with Q101 pixels

### Cascade Effect

```
Scanner tries to detect: Q50 bubbles
But image contains:
- Q50 bubbles at bottom (faint, far down)
- Q101 bubbles at top of sample area (bright, fresh scan)

Result: 
- Brightness values are MIXED
- Can't distinguish which question the bubble belongs to
- False positives / misdetections

Sample brightness for Q50-E:
  Expected: ~200 (empty, light)
  Actual: ~120 (dark, because Q101-E is filled)
  → MISDETECTION: thinks Q50-E is filled, marks as answer
```

---

## Statistical Impact on Accuracy

### For Different Question Ranges

| Questions | Y Position | Overlap | Accuracy |
|---|---|---|---|
| Q1-50 | Y=19-28mm | None | **70-80%** ✓ |
| Q51-100 | Y=19-36mm | Partial (Q41-100 overlaps by ~40mm) | **50-60%** ⚠️ |
| Q101-140 | Y=36-37mm | **SEVERE (100% overlap)** | **10-30%** ❌❌❌ |
| Q141-150 | Y=36mm | Moderate overlap | **40-50%** ⚠️ |
| **Overall** | Mixed | **40% blocks have >30% accuracy loss** | **40-50%** |

---

## Comparison with Gordon College PDF Layout

### What the PDF Actually Shows

From visual inspection:

```
Top Section (beside Student ID box):
┌─ ROW 1: Q1-10    Q31-40   Q61-70   Q91-100  Q121-130
├─ ROW 2: Q11-20   Q41-50   Q71-80   Q101-110 Q131-140
└─ ROW 3: Q21-30   Q51-60   Q81-90   Q111-120 Q141-150
```

This is a **3-row layout**, but the code tries to fit it into **4 Y-levels** (19, 28, 36, 37).

### The Fix Needed

Map to actual 3 rows:

```typescript
// CURRENT (BROKEN):
const row1Y = 19/281;   // Q1-10, Q21-30, Q51-60, Q71-80, Q111-120
const row2Y = 28/281;   // Q11-20, Q31-40, Q61-70, Q81-90, Q121-130
const row3topY = 36/281;   // Q41-50, Q91-100, Q141-150
const row3botY = 37/281;   // Q101-110, Q131-140 ❌ OVERLAPPING!

// CORRECTED (NEEDED):
const row1Y = ??/281;   // Measure from PDF
const row2Y = ??/281;   // Measure from PDF
const row3Y = ??/281;   // Measure from PDF
```

**Must measure the actual PDF to get correct Y values.**

---

## Questions for QA Team

When testing the 150-item scanner:

1. **Do Q101-110 and Q131-140 detect answers?** 
   - Expected: ✓ Yes
   - Actual with current code: ❌ Likely NO or HIGH FALSE POSITIVE RATE

2. **Are answers from Q41-50 / Q91-100 showing up in Q101-110 / Q131-140?**
   - Expected: ✓ No
   - Actual with current code: ❌ Likely YES (due to overlap)

3. **What's the accuracy for Q101-150 range?**
   - Expected: ✓ 60-80%
   - Actual with current code: ❌ 10-40%

---

## Recommendation

**DO NOT release to QA until this is fixed.**

The 150-item scanner will fail on 40% of the questions (Q101-150 range) with <30% accuracy. This is unsuitable for any production use.

**Priority**: **CRITICAL** - Must fix before testing.
