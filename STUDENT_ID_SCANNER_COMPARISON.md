# Student ID Scanner: Mobile vs Web Comparison

## Current Status

The mobile and web versions use **DIFFERENT APPROACHES** for student ID scanning:

### Mobile Version (React Native + OpenCV)
**Approach**: Nearest-Digit Y-Position Mapping
- Detects filled bubbles using OpenCV contour detection
- Clusters bubbles into columns (X-axis)
- Calculates expected Y-positions for each digit 0-9 based on region bounds
- For each column, finds the filled bubble and maps to nearest digit by Y-distance
- **Pros**: Robust to sparse data, consistent results
- **Cons**: Requires accurate Y-region bounds calibration

**Y-Region Bounds**:
- 20Q: y ∈ [20%, 32%] (12% span = 1.2% per digit)
- 50Q: y ∈ [9%, 18%] (9% span = 0.9% per digit)

**Key Code** (zipgradeScanner.ts, lines ~1430-1550):
```typescript
// Calculate expected Y-positions for each digit 0-9
const digitYPositions: number[] = [];
for (let digit = 0; digit < 10; digit++) {
  const yFraction = digit / 9;
  const expectedY = idRegion.yMin * paperH + (idRegion.yMax - idRegion.yMin) * paperH * yFraction;
  digitYPositions.push(expectedY);
}

// For each column, find nearest digit by Y-distance
for (let digit = 1; digit < 10; digit++) {
  const distance = Math.abs(bestBubble.y - digitYPositions[digit]);
  if (distance < minDistance) {
    minDistance = distance;
    nearestDigit = digit;
  }
}
```

---

### Web Version (Next.js + Canvas)
**Approach**: Brightness-Based Sampling
- Uses marker-based coordinate mapping (mapToPixel)
- Samples brightness at each expected bubble position (10 rows × 9 columns)
- Compares darkest vs. brightest bubbles to detect filled digit
- Uses tiered thresholds: strong fill (< 68% of reference) or light fill (< 82% + gap > 12%)
- **Pros**: Handles light pencil marks, detects double-shading
- **Cons**: Requires accurate marker detection and layout calibration

**Key Code** (OMRScanner.tsx, lines ~1991-2090):
```typescript
// Sample brightness at each bubble position
for (let row = 0; row < 10; row++) {
  const nx = id.firstColNX + col * id.colSpacingNX;
  const ny = id.firstRowNY + row * id.rowSpacingNY;
  const { px, py } = mapToPixel(markers, nx, ny);
  const brightness = sampleBubbleAt(grayscale, width, height, px, py, idBubbleRX, idBubbleRY);
  fills.push(brightness);
}

// Find darkest bubble (lowest brightness = most filled)
const darkest = sorted[0];
const upperQ = sorted[7]; // unfilled reference
const darkRatio = darkest / upperQ;

if (darkRatio < 0.68) {
  detectedDigit = fills.indexOf(darkest);
}
```

---

## Key Differences

| Aspect | Mobile | Web |
|--------|--------|-----|
| **Detection Method** | Y-position clustering | Brightness sampling |
| **Bubble Detection** | OpenCV contours | Canvas pixel sampling |
| **Coordinate System** | Paper-space percentages | Marker-based normalized coords |
| **Filled Bubble ID** | Nearest Y-distance | Darkest brightness |
| **Light Marks** | May miss faint marks | Detects light pencil (Tier 2) |
| **Double-Shading** | Not detected | Detected & flagged |
| **Calibration** | Y-region bounds | Marker positions + layout |
| **Robustness** | Sparse data OK | Requires dense sampling |

---

## Synchronization Issues

### Problem 1: Different Y-Region Bounds
- **Mobile**: 20Q uses y ∈ [20%, 32%]
- **Web**: Uses marker-based coordinates (different reference frame)
- **Impact**: Same physical sheet may produce different results

### Problem 2: Different Digit Detection Logic
- **Mobile**: Nearest Y-distance (can be ambiguous if bubbles are misaligned)
- **Web**: Darkest brightness (more robust to alignment issues)
- **Impact**: Different accuracy on same sheet

### Problem 3: Different Handling of Edge Cases
- **Mobile**: No double-shading detection
- **Web**: Detects and flags double-shading
- **Impact**: Web provides more feedback, mobile silently picks one

---

## Recommendation: Unified Approach

To ensure consistency, we should **adopt the web version's brightness-based approach** for the mobile version because:

1. **More Robust**: Brightness comparison is less sensitive to alignment errors
2. **Better Feedback**: Can detect double-shading and light marks
3. **Marker-Based**: Uses the same registration marks already detected for answers
4. **Proven**: Already working well in web version

### Implementation Steps

1. **Extract the brightness sampling logic** from web version
2. **Adapt for OpenCV** (convert canvas sampling to OpenCV pixel access)
3. **Use same marker-based coordinates** as answer detection
4. **Implement tiered thresholds** (strong fill vs. light fill)
5. **Add double-shading detection** for consistency

---

## Current Test Results

### Mobile (Nearest-Digit Mapping)
- **Test 1**: Expected "202220011" → Got "65555555" ❌
- **Issue**: Y-region bounds may be incorrect or bubbles are misaligned

### Web (Brightness Sampling)
- **Status**: Working well (no recent test data provided)
- **Advantage**: Uses marker-based coordinates (more reliable)

---

## Next Steps

1. ✅ Document the differences (this file)
2. ⏳ Decide on unified approach (recommend web's brightness method)
3. ⏳ Implement unified approach in mobile
4. ⏳ Test both versions with same sheet
5. ⏳ Verify consistency across multiple scans

---

## Files to Update

### Mobile
- `GC_SmartCheck-MobileApp/services/zipgradeScanner.ts` (lines ~1430-1550)
  - Replace nearest-digit mapping with brightness sampling
  - Use marker-based coordinates like web version

### Web
- `Web-Based-for-SIA/src/components/scanning/OMRScanner.tsx` (lines ~1991-2090)
  - Already using brightness sampling ✅
  - No changes needed (reference implementation)

---

## References

- Mobile: `20Q_ID_NEAREST_DIGIT_FIX.md` - Current implementation
- Web: `OMRScanner.tsx` lines 1991-2090 - Reference implementation
- Template: `templatePdfGenerator.ts` - Physical layout specs
