# 20Q Student ID Manual Mapping Guide

## Current Problem

The scanner is detecting "09877758" instead of "202220011". The digit mapping is incorrect.

## Bubble Positions from Logs

```
Y positions: y=37%, y=24%, y=24%, y=24%, y=24%, y=24%, y=24%, y=23%, y=23%, y=23%, y=23%, y=22%, y=22%, y=22%, y=20%, y=20%
```

For student ID "202220011", the expected digits are:
- Position 1: 2
- Position 2: 0
- Position 3: 2
- Position 4: 2
- Position 5: 2
- Position 6: 0
- Position 7: 0
- Position 8: 1
- Position 9: 1

## Mapping Configuration

The student ID section needs to be mapped based on the ACTUAL template layout. Here's where to configure it:

### File Location
`GC_SmartCheck-MobileApp/services/zipgradeScanner.ts`

### Current Mapping (Line ~1407)
```typescript
const idRegion = detectedQ === 20 
  ? { yMin: 0.15, yMax: 0.40, numDigits: 10 } // 20q: wider range to capture all ID bubbles
  : { yMin: 0.09, yMax: 0.18, numDigits: 10 }; // 50q: top region, 10 digits
```

### Digit Mapping Logic (Line ~1523)
```typescript
// Map Y position to digit (0-9) based on position within ID region
const idRegionHeight = (idRegion.yMax - idRegion.yMin) * paperH;
const bubbleYInRegion = bestBubble.y - (idRegion.yMin * paperH);
const digitIdx = Math.floor((bubbleYInRegion / idRegionHeight) * 10);
```

## Analysis of Current Scan

From the logs, bubbles are at y=20-37% of paper height. Let's calculate what digits they should map to:

### ID Region: 15%-40% (25% total height)

For a bubble at y=24%:
- bubbleYInRegion = 24% - 15% = 9% of paper
- digitIdx = floor((9% / 25%) * 10) = floor(3.6) = 3

But the log shows `digit=8` for y=826 (which is 24% of 3429px paper height).

**The calculation is WRONG!**

## Root Cause

The template PDF generator creates the ID section with digits 0-9 arranged vertically, but the ACTUAL Y positions on the scanned sheet don't match the expected 15%-40% range.

Looking at the bubble density grid:
```
y20-30%: x20:3 x30:4 x40:3 x50:4 x60:2 x70:1  (17 bubbles - this is the ID!)
```

The ID bubbles are concentrated at y=20-30%, NOT y=15-40%.

## Manual Mapping Solution

### Option 1: Adjust Y Range (Recommended)

Change the ID region to match the actual bubble positions:

```typescript
const idRegion = detectedQ === 20 
  ? { yMin: 0.19, yMax: 0.31, numDigits: 10 } // 20q: y19-31% (actual bubble range)
  : { yMin: 0.09, yMax: 0.18, numDigits: 10 }; // 50q: unchanged
```

### Option 2: Use Lookup Table

Create a digit lookup table based on actual Y positions:

```typescript
// For 20Q templates, map Y% to digit based on observed positions
const digitLookup20Q = [
  { yMin: 0.19, yMax: 0.20, digit: 0 },  // Top row
  { yMin: 0.20, yMax: 0.21, digit: 1 },
  { yMin: 0.21, yMax: 0.22, digit: 2 },
  { yMin: 0.22, yMax: 0.23, digit: 3 },
  { yMin: 0.23, yMax: 0.24, digit: 4 },
  { yMin: 0.24, yMax: 0.25, digit: 5 },
  { yMin: 0.25, yMax: 0.26, digit: 6 },
  { yMin: 0.26, yMax: 0.27, digit: 7 },
  { yMin: 0.27, yMax: 0.28, digit: 8 },
  { yMin: 0.28, yMax: 0.31, digit: 9 },  // Bottom row
];
```

## Recommended Fix

Based on the logs showing bubbles at y=20-24%, and the expected ID "202220011":

- y=20% → digit 0
- y=22% → digit 1  
- y=24% → digit 2

This suggests the ID section spans y=19-29% (10% total), with each digit occupying 1% of paper height.

### Updated Configuration

```typescript
const idRegion = detectedQ === 20 
  ? { yMin: 0.19, yMax: 0.29, numDigits: 10 } // 20q: y19-29% (10% span, 1% per digit)
  : { yMin: 0.09, yMax: 0.18, numDigits: 10 }; // 50q: unchanged
```

## Testing

After changing the Y range, rebuild and scan. You should see:

```
[OMR] Student ID col 1: digit=2 (y=834, yInRegion=320, fill=0.93)
[OMR] Student ID col 2: digit=0 (y=690, yInRegion=176, fill=0.70)
[OMR] Student ID col 3: digit=2 (y=826, yInRegion=312, fill=0.66)
...
[OMR] Student ID extracted: 202220011 (from 9 digits)
```

## Alternative: Disable Auto-Detection

If manual mapping is too difficult, you can disable student ID auto-detection for 20Q templates and require manual entry:

```typescript
if (detectedQ === 20 || detectedQ === 50) {
  // TEMPORARY: Disable auto-detection for 20Q
  if (detectedQ === 20) {
    console.log('[OMR] Student ID: Auto-detection disabled for 20Q (manual entry required)');
  } else {
    // ... existing 50Q detection code ...
  }
}
```

This way, users can manually enter the ID after scanning (which is what's happening now anyway).
