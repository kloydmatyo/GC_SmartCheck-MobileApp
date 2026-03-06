# Brightness Scanning Analysis

## Current Scan Results

### Blocks with GOOD detection (brightness ~100-120 for filled):
- Q21-30: Strong fills detected (C=112, A=116, E=177, E=106)
- Q31-40: Strong fills detected (E=173, E=173, E=142, D=144)
- Q41-50: Moderate fills (E=189, E=192, A=169, E=178)
- Q71-80: Good fills (A=151, A=164, E=150, E=93)
- Q81-90: Strong fills (C=104, D=104, D=98)
- Q91-100: Good fills (E=168, E=163, E=173)

### Blocks with WEAK detection (brightness 195-220, too light):
- Q1-10: All values 199-219 (NO strong fills detected)
- Q11-20: All values 208-216 (NO strong fills detected)
- Q51-60: All values 175-204 (marginal fills)
- Q61-70: Mixed 143-204 (some fills, but inconsistent)

## Pattern Analysis

The blocks are arranged in the form like this:
```
        [Q41-50]  [Q71-80]
        
[Q1-10] [Q21-30] [Q51-60] [Q81-90]
[Q11-20][Q31-40] [Q61-70] [Q91-100]
```

**Working blocks**: Q21-30, Q31-40, Q41-50, Q71-80, Q81-90, Q91-100
**Problem blocks**: Q1-10, Q11-20, Q51-60, Q61-70

Notice: The leftmost column (Q1-10, Q11-20) and third column (Q51-60, Q61-70) are problematic.

## Hypothesis

The issue is likely **horizontal (X-axis) misalignment** for columns 1 and 3:
- Column 1 (Q1-10, Q11-20): Scanner may be sampling to the LEFT of the bubbles
- Column 3 (Q51-60, Q61-70): Scanner may be sampling to the LEFT of the bubbles
- Column 2 (Q21-30, Q31-40): WORKING CORRECTLY
- Column 4 (Q81-90, Q91-100): WORKING CORRECTLY

## Pixel Coordinate Analysis

From logs:
```
Q1-10:   px=(832, 2396)  ← Column 1
Q21-30:  px=(1138, 2395) ← Column 2 (WORKING) 
Q51-60:  px=(1445, 2394) ← Column 3
Q81-90:  px=(1751, 2393) ← Column 4 (WORKING)

Column spacing:
Q1→Q21:  306px (1138-832)
Q21→Q51: 307px (1445-1138)
Q51→Q81: 306px (1751-1445)
```

Spacing is consistent! So the issue is not spacing, but the **absolute starting position**.

## Solution

Need to shift ALL columns slightly to the RIGHT to hit the bubble centers instead of the left edges.

The working columns (2 and 4) suggest we need to add ~2-3mm to all X coordinates.
