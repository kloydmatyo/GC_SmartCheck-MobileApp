# 20Q Student ID Scanning - Troubleshooting Guide

## Current Status

The 20Q student ID scanner has been updated with more lenient detection thresholds to handle real-world scanning conditions.

## What Changed

### Before
- Required 10 bubbles minimum
- Required 8 valid rows
- Required all 10 columns detected
- Narrow Y range (18%-38%)

### After
- Requires 5 bubbles minimum
- Requires 3 valid rows
- Requires 3 columns minimum
- Wider Y range (15%-40%)
- Enhanced logging for debugging

## How to Test

1. **Generate a 20Q template** with the student ID section
2. **Fill in a student ID** (e.g., 202220011)
3. **Scan the sheet** and check the logs

## Reading the Logs

Look for these key log messages:

```
[OMR] Student ID region (20q): X bubbles in y[15%-40%]
[OMR] Student ID bubble Y positions: y=20%, y=22%, ...
[OMR] Student ID bubble fills: 0.75, 0.32, 0.81, ...
[OMR] Student ID: X rows detected, Y valid rows
[OMR] Student ID: Z columns detected at x=850,910,970,...
[OMR] Student ID col 1: digit=2 (y=680, fill=0.75)
[OMR] Student ID extracted: 20222001 (from 8 digits)
```

## Common Issues

### Issue 1: "insufficient bubbles (X/5 minimum)"

**Cause**: Not enough bubbles detected in the ID region

**Solutions**:
- Check if ID bubbles are being detected at all (look at bubble density grid)
- Verify ID section is in the correct Y range (should be y15-40%)
- Ensure good lighting and focus when scanning
- Check if ID bubbles are similar size to answer bubbles

### Issue 2: "insufficient valid rows (X/3 minimum)"

**Cause**: Bubbles aren't clustering into distinct rows

**Solutions**:
- Check the Y positions of detected bubbles
- Verify bubbles are aligned in horizontal rows
- May need to adjust `idRowGap` calculation

### Issue 3: "insufficient columns (X/3 minimum)"

**Cause**: Can't derive column centroids from the detected rows

**Solutions**:
- Need at least 3 rows with multiple bubbles each
- Check if bubbles are aligned in vertical columns
- Verify at least 3 digits are filled in the ID

### Issue 4: Only detecting filled bubbles

**Cause**: Empty bubbles may be too faint to detect

**This is expected behavior**. The scanner works with filled bubbles only:
- Requires at least 3 digits to be filled
- Extracts partial IDs (e.g., "20200000" from "202")
- User can manually correct after scanning

## Debugging Steps

1. **Check bubble density grid**:
   ```
   y20-30%: x20:1 x30:3 x40:2 x50:2 x70:2 x90:1
   ```
   - ID bubbles should appear in y15-40% range
   - Should see bubbles across x20-80% (the ID columns)

2. **Check bubble Y positions**:
   ```
   [OMR] Student ID bubble Y positions: y=22%, y=24%, y=26%, ...
   ```
   - Should see multiple Y values in the 15-40% range
   - Values should cluster into distinct rows

3. **Check bubble fills**:
   ```
   [OMR] Student ID bubble fills: 0.75, 0.32, 0.81, ...
   ```
   - Filled bubbles: 0.6-0.9
   - Empty bubbles: 0.1-0.4
   - Mix of both is ideal

4. **Check column detection**:
   ```
   [OMR] Student ID: 5 columns detected at x=850,910,970,1030,1090
   ```
   - Should see evenly spaced X values
   - Number of columns = number of digits detected

## Expected Behavior

### Full ID (all 10 digits filled)
```
[OMR] Student ID region (20q): 100 bubbles in y[15%-40%]
[OMR] Student ID: 10 rows detected, 10 valid rows
[OMR] Student ID: 10 columns detected
[OMR] Student ID extracted: 2022200110 (from 10 digits)
```

### Partial ID (only filled bubbles detected)
```
[OMR] Student ID region (20q): 11 bubbles in y[15%-40%]
[OMR] Student ID: 4 rows detected, 4 valid rows
[OMR] Student ID: 4 columns detected
[OMR] Student ID extracted: 20220000 (from 4 digits)
```

### Failed detection
```
[OMR] Student ID region (20q): 3 bubbles in y[15%-40%]
[OMR] Student ID: insufficient bubbles (3/5 minimum)
[OMR] Final studentId: 00000000
```

## Next Steps

If ID scanning still doesn't work after these changes:

1. **Verify template layout**: Check that ID section is actually at y15-40%
2. **Check bubble detection**: Ensure ID bubbles are being detected in `allBubbles`
3. **Adjust Y range**: May need to expand to y10-45% if bubbles are outside current range
4. **Adjust thresholds**: May need to lower minimum requirements further

## Manual Override

Users can always manually enter/edit the student ID after scanning, so failed auto-detection is not critical.
