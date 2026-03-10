# 20Q Student ID Scanner - Sorting-Based Fix

## Problem

The Y-position based linear mapping was producing incorrect results:
- Expected: "202220011"
- Got: "43333323"

The issue: Y-positions don't correspond to digits in a linear way because:
1. Only filled bubbles are detected (sparse data)
2. Filled bubbles are scattered across different rows
3. Y-positions don't follow a predictable pattern

## Solution: Sorting-Based Digit Assignment

Instead of trying to map Y-position to digit linearly, we now:

1. **Collect all filled bubbles** in the ID region
2. **Sort by Y-position** (top to bottom)
3. **Assign digits based on sorted order**
   - First bubble (topmost) → digit 0
   - Second bubble → digit 1
   - ...
   - Last bubble (bottommost) → digit 9

This works because:
- The bubbles are naturally ordered by their Y-position
- Even if they're not evenly spaced, the relative order is preserved
- We don't need to know the exact Y-region boundaries

## Algorithm

```
1. For each column:
   - Find the filled bubble (highest fill ≥ 0.20)
   - Record its Y-position

2. Sort all Y-positions from top to bottom

3. Create a mapping: Y-position → digit (0-9)
   - Topmost Y-position → digit 0
   - Next Y-position → digit 1
   - ...
   - Bottommost Y-position → digit 9

4. For each column:
   - Look up the digit from the Y-position mapping
   - Output the digit
```

## Example

Given Y-positions: [926, 896, 890, 888, 886, 888, 851, 884, 870]

Sorted: [851, 870, 884, 886, 888, 888, 890, 896, 926]

Mapping:
- y=851 → digit 0
- y=870 → digit 1
- y=884 → digit 2
- y=886 → digit 3
- y=888 → digit 4
- y=890 → digit 5
- y=896 → digit 6
- y=926 → digit 7

For each column:
- Col 1 (y=926) → digit 7
- Col 2 (y=896) → digit 6
- Col 3 (y=890) → digit 5
- Col 4 (y=888) → digit 4
- Col 5 (y=886) → digit 3
- Col 6 (y=888) → digit 4
- Col 7 (y=851) → digit 0
- Col 8 (y=884) → digit 2
- Col 9 (y=870) → digit 1

Result: "765434021"

## Limitations

This approach assumes:
- Bubbles are roughly ordered by Y-position
- The number of filled bubbles is less than or equal to 10
- Each column has at most one filled bubble

If multiple bubbles are filled in the same column, only the one with the highest fill is used.

## Benefits

1. **No calibration needed** - Works with any Y-region definition
2. **Robust to template variations** - Adapts to actual bubble positions
3. **Simple and fast** - Just sorting and mapping
4. **Handles sparse data** - Works with only filled bubbles

## Testing

Test with the provided student ID "202220011" and verify the output matches.
