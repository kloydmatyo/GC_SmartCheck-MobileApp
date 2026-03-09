# 100-Item Template Coordinate Shift Issue

## Problem: Only C, D, E Detected (A, B Missing)

From the logs:
```
LOG  [100Q-HYBRID] Q1: A=X, B=X, C=0.78, D=0.29, E=0.31 → C
LOG  [100Q-HYBRID] Q2: A=X, B=X, C=0.78, D=0.28, E=0.33 → C
LOG  [100Q-HYBRID] Q3: A=X, B=X, C=0.79, D=0.26, E=0.32 → C
LOG  [100Q-HYBRID] Q41: A=0.32, B=0.29, C=0.78, D=X, E=X → C
LOG  [100Q-HYBRID] Q42: A=0.32, B=0.27, C=0.77, D=X, E=X → C
```

**Pattern**: 
- Q1-3: A and B are "X" (not found), C/D/E are found
- Q41-42: A and B are found, D and E are "X" (not found)

This indicates the template coordinates are **horizontally shifted** from the actual bubble positions.

## Root Cause: Template Coordinate Mismatch

The template coordinates from the web app assume a specific paper layout, but the actual Gordon College template may have:
1. Different margins
2. Different bubble spacing
3. Different column positions

### Expected vs Actual Positions

**Template expects** (for Q1-10):
- firstBubbleNX: 24.86 / 197 = 0.126 (12.6% from left)
- Choice A at: 12.6%
- Choice B at: 12.6% + 5.0/197 = 15.1%
- Choice C at: 15.1% + 5.0/197 = 17.6%

**Actual bubbles** (from density):
```
y50-60%: x10:8 x20:12 x30:10 x40:15 x50:5 x60:20 x70:5 x80:20
```

Bubbles are at x10%, x20%, x30%, x40%, x50% (5 columns = 5 choices)

This suggests:
- Choice A at: ~10%
- Choice B at: ~20%
- Choice C at: ~30%
- Choice D at: ~40%
- Choice E at: ~50%

**The template is shifted RIGHT by ~2-3%**, causing A and B to be missed.

## Solution: Adjust Template Coordinates

We need to shift all bubble positions LEFT to match the actual paper layout.

### Calculation

If actual bubbles are at x10%, x20%, x30%, x40%, x50%:
- Spacing: 10% = 0.10 = 19.7mm
- First bubble (A): 10% = 0.10 = 19.7mm from left edge

But the template uses normalized coordinates relative to marker frame (not paper edge):
- Marker TL at: (6.5, 6.5)
- Frame width: 197mm

So first bubble at 19.7mm from paper edge = (19.7 - 6.5) / 197 = 13.2 / 197 = 0.067

**Current template**: firstBubbleNX = 24.86 / 197 = 0.126
**Should be**: firstBubbleNX = 13.2 / 197 = 0.067

**Shift needed**: 0.126 - 0.067 = 0.059 (5.9% or 11.6mm)

## Alternative: Use Detected Bubble Positions

Instead of using fixed template coordinates, we can:
1. Detect all bubbles
2. Cluster by position to find the 5 columns
3. Use detected positions as "template"
4. Match filled vs empty based on fill ratio

This is more robust to template variations.

