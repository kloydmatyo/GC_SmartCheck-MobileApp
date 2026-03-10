# Testing the Student ID Scanner Fix

## Quick Start

The student ID scanner has been updated to use **nearest-digit mapping** instead of row clustering. This should fix the inconsistent results.

## Test Data

Use this test sheet:
- **Student ID**: 202220011
- **Answers (Q1-10)**: B, D, C, A, E, C, D, A, B, E
- **Answers (Q11-20)**: B, E, C, B, A, E, C, B, E, C

## Expected Results

After scanning:
- ✅ Student ID: **202220011** (not "21110013" or "85522569")
- ✅ Answers: **20/20 correct**
- ✅ Score: **100%**

## What Changed

### Before (Row Clustering)
```
Detected 4 rows instead of 10
Result: "21110013" ❌
```

### After (Nearest-Digit Mapping)
```
Detected 10 columns
Each bubble mapped to nearest digit by Y-position
Result: "202220011" ✅
```

## How to Test

1. **Build the app**:
   ```bash
   npm run build
   # or
   expo build:android
   ```

2. **Run on device/emulator**:
   ```bash
   npm start
   # or
   expo start
   ```

3. **Scan the test sheet**:
   - Open the scanner
   - Point camera at the 20-question template
   - Ensure good lighting
   - Take the photo

4. **Check the logs**:
   - Look for: `[OMR] Student ID extracted: 202220011`
   - Verify: `[OMR] Student ID: 10 columns detected`
   - Check distances are small (< 50px)

## Debug Logging

The scanner logs detailed information:

```
[OMR] Student ID region (20q): 12 bubbles in y[20%-32%]
[OMR] Student ID bubble Y positions: y=26%, y=26%, y=25%, ...
[OMR] Student ID: 10 columns detected at x=699,929,1048,...
[OMR] Student ID: Expected Y positions for digits 0-9: 757, 770, 883, ...
[OMR] Student ID col 1: digit=2 (y=886, expected=883, distance=3, fill=0.99)
[OMR] Student ID col 2: digit=0 (y=757, expected=757, distance=0, fill=0.47)
...
[OMR] Student ID extracted: 202220011 (from 10 digits)
```

### Key Metrics to Check

- **Columns detected**: Should be 10 (one per digit)
- **Distance**: Should be < 50px for each digit (ideally < 20px)
- **Fill**: Should be ≥ 0.35 for filled bubbles
- **Final ID**: Should match expected value

## Troubleshooting

### Issue: Still getting wrong ID

1. **Check Y-region bounds**:
   - Current: y ∈ [20%, 32%] for 20Q
   - If bubbles are outside this range, adjust bounds

2. **Check column detection**:
   - If fewer than 10 columns detected, check X-spacing
   - Columns should be evenly spaced

3. **Check fill values**:
   - If fill < 0.35, bubble may not be dark enough
   - Try better lighting or darker pen

### Issue: Answers are wrong

- **Don't touch answer detection** - it's working perfectly (20/20)
- Only the ID scanning was changed
- If answers are wrong, it's a different issue

### Issue: App crashes

- Check TypeScript compilation: `npx tsc --noEmit`
- Check for missing imports or undefined variables
- Look at console errors in the app

## Reverting the Change

If you need to revert to the old approach:

1. Open `GC_SmartCheck-MobileApp/services/zipgradeScanner.ts`
2. Find the "Extract Student ID" section (around line 1430)
3. Replace with the row-clustering approach from `20Q_ID_ROW_BASED_FIX.md`

## Next Steps

After confirming the fix works:

1. ✅ Test with multiple scans (same sheet, different angles)
2. ✅ Test with different student IDs
3. ✅ Test with 50Q template (if applicable)
4. ✅ Deploy to production

## Questions?

Check these files for more details:
- `20Q_ID_NEAREST_DIGIT_FIX.md` - Technical explanation
- `20Q_ID_FINAL_SOLUTION.md` - Previous analysis
- `VISUAL_DEBUGGER_GUIDE.md` - How to use the visual debugger overlay
