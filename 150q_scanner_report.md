# 150-Item Scanner Architecture Report

This report outlines the complete end-to-end lifecycle of a 150-question sheet scan, detailing every component, hook, and service involved in the pipeline.

---

## Phase 1: UI & Auto-Framing

**Files Involved:**
- `components/scanner/CameraScanner.tsx`
- `components/scanner/FrameOverlay.tsx`
- `hooks/useAutoFramer.ts`
- `utils/cornerDetector.ts`

### 1. Visual Guidance (`FrameOverlay.tsx`)
When the scanner opens in 150Q mode, `FrameOverlay` draws an A4-proportioned bounding box that occupies **90% of the screen width**. This visual guide is specifically calibrated so that if the user aligns the paper with the box, the camera will be approximately **1 foot** away from the sheet. This guarantees the captured image has the optimal resolution and perspective.

### 2. Live Probing (`useAutoFramer.ts` & `cornerDetector.ts`)
While the user aims the camera, the `useAutoFramer` hook runs a background loop:
- **Every 400ms**, it grabs a low-resolution frame (Quality: 0.5) from the camera stream.
- It sends this frame to `cornerDetector.ts`.
- `cornerDetector.ts` uses **OpenCV** to convert the image to grayscale and applies an aggressive threshold (80/255). It searches for solid black squares located in the four outer quadrants of the image (the 4 Zipgrade alignment markers).

### 3. Geometry Validation
Once 4 corners are found, `useAutoFramer` validates the geometry to ensure the user is holding the phone correctly:
- **Distance (Area):** The sheet must fill between 15% and 90% of the frame (Ideal: 25-80%).
- **Tilt:** The phone cannot be rotated more than 20° from horizontal.
- **Perspective:** The top and bottom widths cannot differ by more than a 0.55 ratio (prevents extreme angles).
- **Centering:** The sheet must be within 20% of the screen center.

### 4. Auto-Capture Trigger
If all validations pass for **4 consecutive frames (~1.6 seconds)**, the auto-framer locks on, shows a green highlight, and triggers `handleAutoFrameCapture` in `CameraScanner.tsx`.

---

## Phase 2: High-Resolution Capture

**Files Involved:**
- `components/scanner/CameraScanner.tsx`

Once triggered (either by the Auto-Framer or the manual Shutter button):
1. The camera takes a **high-resolution picture** (Quality: 0.85).
2. The UI enters a `isProcessing` state (showing "Scanning...").
3. The image URI is passed to `processCapturedPhoto()`, which delegates the work to the core backend engine: `ZipgradeScanner.processZipgradeSheet()`.

---

## Phase 3: Alignment & Routing

**Files Involved:**
- `services/zipgradeScanner.ts`

1. **Initialization:** The image is loaded into OpenCV.
2. **Marker Detection:** The system performs a heavy, high-accuracy contour scan to find the exact, pixel-perfect center coordinates of the 4 corner alignment markers.
3. **Template Routing:** It counts the number of timing tracks/regions to confirm the sheet type. Upon recognizing the 150-question template, it bypasses the legacy contour-based extraction and routes the image and the 4 corner coordinates directly to the brightness scanner.

---

## Phase 4: Brightness-Based OMR Extraction

**Files Involved:**
- `services/brightnessScannerFor100Item.ts` (specifically `scan150ItemWithBrightness` and `get150ItemTemplateLayout`)

This is the most critical part of the pipeline. Unlike older methods that try to find bubbles using shape detection (which fails when bubbles are small and close together), the 150Q pipeline uses a **deterministic pixel-sampling approach**.

### 1. Skia Image Processing
The high-res image is loaded using `@shopify/react-native-skia`. The entire image is converted into a raw flat array of grayscale pixels (Uint8Array) in memory. This is vastly faster and more memory-efficient than running OpenCV algorithms on a 12-megapixel image.

### 2. The 150Q Template Layout map
`get150ItemTemplateLayout()` defines the exact mathematical position of every single bubble on the page.
- It knows there are 5 columns (Q1-30, Q31-60, etc.).
- It defines the `X` and `Y` coordinates of every choice (A, B, C, D, E) as a **percentage** relative to the 4 corner markers.
- It defines the bubble radius as exactly `0.007` (0.7%) of the paper width.

### 3. Perspective Warping & Sampling
Inside `detectAnswersFromImage`:
- The system takes the 4 real-world corner coordinates found in Phase 3.
- It creates a **Perspective Transform Matrix**.
- For all 750 bubbles (150 questions × 5 choices), it uses the matrix to map the theoretical percentage coordinates into **exact X/Y pixel coordinates** on the skewed, captured image.
- It samples the pixels within the calculated radius for each bubble.

### 4. Darkness Evaluation
- It calculates the average brightness of the paper background.
- It calculates the darkness of the pixels inside each bubble.
- If a bubble's darkness crosses the dynamically calculated threshold compared to the paper background, it is marked as **Selected**.
- If multiple bubbles in a row cross the threshold, the darkest one is chosen (or marked as a multiple-choice error based on settings).

---

## Phase 5: Fallback & Validation

**Files Involved:**
- `services/zipgradeScanner.ts`
- `components/scanner/CameraScanner.tsx`

### 1. The Catastrophic Fallback
If the Brightness Scanner returns fewer than 80 detected answers, `zipgradeScanner.ts` assumes the alignment markers were warped or completely wrong. In this edge case, it falls back to the legacy OpenCV contour-region method to try and salvage the scan.

### 2. Final Quality Gate
The final array of 150 answers is returned to `CameraScanner.tsx`.
- The scanner checks how many answers are "blank".
- If **more than 25% (37+ questions)** are blank, the scanner rejects the result entirely, assuming the image was blurry or taken in pitch darkness. It alerts the user to retake the photo.
- If low-light caused the failure, the scanner automatically activates the flashlight (`torch`) for the next attempt.
- If it passes, `onScanComplete` fires, saving the grades to RealmDB and navigating the user to the results screen.
