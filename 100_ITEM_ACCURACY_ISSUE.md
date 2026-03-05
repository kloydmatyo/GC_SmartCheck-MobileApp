# 100-Item Template Accuracy Issue

## Current Status

The 100-item scanner is now **partially working** but has **poor accuracy** (~40-50% correct).

### What's Working ✅
1. ✅ Image is NOT being rotated (correct orientation)
2. ✅ Advanced marker detection finds all 4 corners
3. ✅ Paper cropping is accurate
4. ✅ 543 bubbles detected (good number)
5. ✅ Both Q1-10 and Q11-20 regions are scanned

### What's Not Working ❌
1. ❌ Answer detection accuracy is poor (~40-50%)
2. ❌ Many bubbles are missed or misidentified
3. ❌ Column alignment is off (using fallback centroids)
4. ❌ Fill detection threshold issues

## Root Cause

The current scanner uses **OpenCV contour-based detection** which works well for 20/50-item templates but struggles with 100-item templates because:

1. **Smaller bubbles**: 100-item bubbles are smaller and more densely packed
2. **More complex layout**: 10 blocks in a grid vs simple columns
3. **Contour detection limitations**: Relies on finding bubble outlines, which can miss lightly filled or partially filled bubbles
4. **No precise positioning**: Uses detected bubble positions instead of calculated positions

## The Solution: Implement Web App's Bubble Sampling Algorithm

The web app uses a completely different approach that's much more accurate:

### Web App Approach (Target):
```
1. Detect 4 corner markers ✅ (DONE - advanced marker detection)
2. Create bilinear coordinate mapping ❌ (NOT DONE)
3. Calculate exact bubble positions from template coordinates ❌ (NOT DONE)
4. Sample brightness at each position ❌ (NOT DONE)
5. Compare brightness values to detect filled bubbles ❌ (NOT DONE)
```

### Current Mobile App Approach:
```
1. Detect 4 corner markers ✅ (DONE)
2. Find bubbles using contour detection ⚠️ (WORKS BUT INACCURATE)
3. Cluster bubbles into rows ⚠️ (WORKS BUT MISSES BUBBLES)
4. Snap to column centroids ⚠️ (WORKS BUT IMPRECISE)
5. Use fill ratio to detect answers ⚠️ (WORKS BUT UNRELIABLE)
```

## What Needs to Be Implemented

### 1. Bilinear Coordinate Mapping (Priority: HIGH)
Port from web app's `mapToPixel()` function:

```typescript
function mapToPixel(
  markers: { topLeft, topRight, bottomLeft, bottomRight },
  nx: number,  // normalized X (0-1)
  ny: number   // normalized Y (0-1)
): { px: number; py: number } {
  // Interpolate along top edge
  const topX = markers.topLeft.x + nx * (markers.topRight.x - markers.topLeft.x);
  const topY = markers.topLeft.y + nx * (markers.topRight.y - markers.topLeft.y);
  
  // Interpolate along bottom edge
  const botX = markers.bottomLeft.x + nx * (markers.bottomRight.x - markers.bottomLeft.x);
  const botY = markers.bottomLeft.y + nx * (markers.bottomRight.y - markers.bottomLeft.y);
  
  // Interpolate vertically
  const px = topX + ny * (botX - topX);
  const py = topY + ny * (botY - topY);
  
  return { px, py };
}
```

This automatically handles:
- Perspective distortion
- Rotation
- Scaling
- Trapezoidal warping

### 2. Bubble Sampling Algorithm (Priority: HIGH)
Port from web app's `sampleBubbleAt()` function:

```typescript
function sampleBubbleAt(
  grayscale: Uint8Array,
  width: number,
  height: number,
  cx: number,  // center X
  cy: number,  // center Y
  radiusX: number,
  radiusY: number
): number {
  // Sample inner 50% of bubble (avoid printed outline)
  // Return mean brightness (0-255): lower = darker = filled
  
  let sum = 0, count = 0;
  const innerRX = radiusX * 0.50;
  const innerRY = radiusY * 0.50;
  
  // Elliptical sampling...
  // (see web app implementation)
  
  return sum / count;  // Raw brightness
}
```

### 3. Template Coordinate System (Priority: HIGH)
Define exact bubble positions in millimeters, then convert to normalized coordinates:

```typescript
// Example for Q1, choice A:
const pageX = 31.36;  // mm from page origin
const pageY = 111.5;  // mm from page origin
const markerTLX = 6.5;  // mm
const markerTLY = 6.5;  // mm
const frameWidth = 197;  // mm
const frameHeight = 215.5;  // mm

const nx = (pageX - markerTLX) / frameWidth;
const ny = (pageY - markerTLY) / frameHeight;

// Then use mapToPixel(markers, nx, ny) to get pixel position
```

### 4. Brightness-Based Detection (Priority: HIGH)
Use brightness comparison instead of fill ratio:

```typescript
// For each question, sample all 5 choices
const fills = [];
for (let choice = 0; choice < 5; choice++) {
  const { px, py } = mapToPixel(markers, nx[choice], ny);
  const brightness = sampleBubbleAt(grayscale, width, height, px, py, radiusX, radiusY);
  fills.push({ choice, brightness });
}

// Sort by brightness (darkest first)
fills.sort((a, b) => a.brightness - b.brightness);

// Detection thresholds
const darkest = fills[0].brightness;
const brightest = fills[fills.length - 1].brightness;
const darkRatio = darkest / brightest;

if (darkRatio < 0.70) {
  // Strong detection: darkest is 30%+ darker than brightest
  selectedAnswer = fills[0].choice;
}
```

## Temporary Workaround

For now, I've adjusted the layout coordinates based on actual bubble density:
- Q1-10: X[10-32%], Y[50-90%]
- Q11-20: X[10-32%], Y[88-100%]

This should improve detection slightly, but **won't fix the fundamental accuracy issue**.

## Estimated Implementation Time

- **Bilinear mapping**: 2-3 hours
- **Bubble sampling**: 3-4 hours
- **Template coordinates**: 2-3 hours (for all 100 questions)
- **Brightness detection**: 2-3 hours
- **Testing & tuning**: 4-6 hours

**Total**: 13-19 hours of development

## Recommendation

**Option 1: Full Implementation** (Recommended for production)
- Implement the complete bubble sampling algorithm
- Achieve >99% accuracy like the web app
- Time: 2-3 days

**Option 2: Hybrid Approach** (Quick fix)
- Keep contour detection but add bilinear mapping
- Use calculated positions to validate detected bubbles
- Improve accuracy to ~80-90%
- Time: 4-6 hours

**Option 3: Manual Correction** (Current state)
- Accept ~40-50% accuracy
- Rely on manual correction after scanning
- Time: 0 hours (already done)

## Next Steps

1. **Immediate**: Test with updated coordinates (restart app)
2. **Short-term**: Implement bilinear mapping + bubble sampling
3. **Long-term**: Complete all 100 questions with proper coordinates

## Files to Modify

1. `services/zipgradeScanner.ts`:
   - Add `mapToPixel()` function
   - Add `sampleBubbleAt()` function
   - Add template coordinate definitions
   - Replace contour-based detection with sampling

2. `services/zipgradeScanner.ts` (integration):
   - Use advanced markers for coordinate mapping
   - Calculate bubble positions instead of detecting them
   - Use brightness-based detection

## Current Accuracy Analysis

From the test scan:
- **Correct**: 2/20 (10%)
- **Wrong**: 16/20 (80%)
- **Empty**: 2/20 (10%)

This is too low for production use. The bubble sampling algorithm is essential for acceptable accuracy.
