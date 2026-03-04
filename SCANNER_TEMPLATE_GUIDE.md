# Zipgrade Scanner Template Guide

## Overview

Each Zipgrade template has **different physical dimensions** and **unique scanning areas**. The scanner automatically detects which template is being used based on:

1. Registration marker positions and aspect ratio
2. Total bubble count
3. Question count passed from exam data

## Physical Specifications

### 20-Item Sheet

- **Dimensions**: 91 × 107 mm
- **Aspect Ratio**: ~0.85 (nearly square)
- **Markers**: TL(7,19) BR(98,126)
- **Layout**: Horizontal - 2 columns side-by-side
- **Student ID**: None

### 50-Item Sheet

- **Dimensions**: 91 × 211 mm
- **Aspect Ratio**: ~0.43 (very tall/narrow)
- **Markers**: TL(7,19) BR(98,230)
- **Layout**: Vertical - stacked sections
- **Student ID**: Yes (top section)
- **Note**: TWICE the height of 20-item, same width

### 100-Item Sheet

- **Dimensions**: 197 × 215.5 mm
- **Aspect Ratio**: ~0.91 (nearly square but wider)
- **Markers**: TL(6.5,6.5) BR(203.5,222)
- **Layout**: Horizontal - 4 columns across
- **Student ID**: Yes (top section)
- **Note**: TWICE the width of 50-item, similar height to 20-item

## Scanning Regions

All coordinates are fractions (0.0 to 1.0) of the detected paper dimensions.

### 20-Item Scanning Areas

```
┌─────────────────────────────────────┐
│                                     │ 0%
│         [Registration Marks]        │
│                                     │
├─────────────┬───────────────────────┤ 28%
│   Q1-10     │      Q11-20          │
│   (A-E)     │      (A-E)           │
│             │                      │
│  26%-50%    │     54%-84%          │
│             │                      │
│             │                      │
│             │                      │
└─────────────┴───────────────────────┘ 95%
  Left Column    Right Column
```

**Regions:**

- Left (Q1-10): X: 26%-50%, Y: 28%-95%
- Right (Q11-20): X: 54%-84%, Y: 28%-95%

### 50-Item Scanning Areas

```
┌─────────────────────────────────────┐
│    [Registration Marks]             │ 0%
├─────────────────────────────────────┤
│      STUDENT ID GRID (8 digits)     │ 9%-18%
├───────────┬───────────┬─────────────┤
│  Q1-10    │  Q11-20   │   Q21-30   │ 20%
│  (A-E)    │  (A-E)    │   (A-E)    │
│           │           │            │
│  8%-36%   │  38%-66%  │  68%-96%   │
│           │           │            │
│           │           │            │
├───────────┴───────────┼─────────────┤ 52%
│                       │            │
│   [Key Version]       │  Q31-40    │ 54%
│   (skip)              │  (A-E)     │
│                       │            │
│                       │  38%-66%   │
│                       │            │
│                       ├─────────────┤
│                       │  Q41-50    │
│                       │  (A-E)     │
│                       │            │
│                       │  68%-96%   │
└───────────────────────┴─────────────┘ 86%
```

**Regions:**

- Student ID: Y: 9%-18% (full width)
- Top section (Q1-30): Y: 20%-52%
  - Q1-10: X: 8%-36%
  - Q11-20: X: 38%-66%
  - Q21-30: X: 68%-96%
- Bottom section (Q31-50): Y: 54%-86%
  - Q31-40: X: 38%-66%
  - Q41-50: X: 68%-96%

### 100-Item Scanning Areas

```
┌──────────┬──────────┬──────────┬──────────┐
│          [Registration Marks]            │ 0%
├──────────────────────────────────────────┤
│        STUDENT ID GRID (8 digits)        │ 3%-12%
├──────────┬──────────┬──────────┬──────────┤
│  Q1-25   │  Q26-50  │  Q51-75  │ Q76-100 │ 15%
│  (A-E)   │  (A-E)   │  (A-E)   │  (A-E)  │
│          │          │          │         │
│  3%-26%  │  27%-49% │  51%-73% │ 74%-97% │
│          │          │          │         │
│          │          │          │         │
│          │          │          │         │
│          │          │          │         │
│          │          │          │         │
│          │          │          │         │
│          │          │          │         │
└──────────┴──────────┴──────────┴──────────┘ 95%
```

**Regions:**

- Student ID: Y: 3%-12% (full width)
- Answer section: Y: 15%-95%
  - Q1-25: X: 3%-26%
  - Q26-50: X: 27%-49%
  - Q51-75: X: 51%-73%
  - Q76-100: X: 74%-97%

## Key Differences

| Feature                  | 20-Item        | 50-Item              | 100-Item     |
| ------------------------ | -------------- | -------------------- | ------------ |
| **Orientation**          | Horizontal     | Vertical             | Horizontal   |
| **Columns**              | 2              | 3 (top) + 2 (bottom) | 4            |
| **Student ID**           | ❌ No          | ✅ Yes               | ✅ Yes       |
| **Aspect Ratio**         | ~0.85 (square) | ~0.43 (tall)         | ~0.91 (wide) |
| **Questions per Column** | 10             | 10                   | 25           |
| **Layout Strategy**      | Side-by-side   | Stacked sections     | Wide columns |

## Scanner Detection Logic

The scanner uses multiple signals to identify the template:

1. **Registration Markers** (most reliable)
   - Calculates aspect ratio from marker positions
   - Matches against known specifications (±15% tolerance)

2. **Bubble Count**
   - 20q: ~100 bubbles (20 × 5 options)
   - 50q: ~300 bubbles (50 × 5 options + 50 ID bubbles)
   - 100q: ~600 bubbles (100 × 5 options + 100 ID bubbles)

3. **Question Count** (from exam data)
   - Passed from Firestore exam configuration
   - Used as initial hint for detection

## Implementation Notes

- All scanning regions are defined in `services/zipgradeScanner.ts`
- The `getLayoutRegions()` function returns different regions based on question count
- Each template's regions are optimized for its unique physical layout
- Coordinates are relative to detected paper boundaries (after marker-based cropping)

## Testing Recommendations

When testing with physical sheets:

1. Ensure registration markers are clearly visible
2. Align sheet within camera frame (see alignment guide in app)
3. Adequate lighting to avoid shadows
4. Hold camera steady to prevent blur
5. Sheet should be flat (no wrinkles or folds)

The scanner will log detected aspect ratio and sheet type for debugging.
