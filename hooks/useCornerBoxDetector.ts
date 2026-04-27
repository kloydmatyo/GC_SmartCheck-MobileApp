/**
 * useCornerBoxDetector — Detects 4 black corner boxes on 150Q answer sheets
 *
 * Strategy: threshold at 40/255 → findContours → filter for small square blobs
 * in each corner quadrant. Much more reliable than edge detection because the
 * black boxes have extreme contrast and predictable size/position.
 */

import { CameraView } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type FrameQuality =
  | "searching"  // no corners found
  | "partial"    // 1–3 corners found
  | "found"      // all 4 corners, validating
  | "aligning"   // valid, waiting for centering/angle
  | "locked"     // stable, counting down
  | "ready";     // 12 frames stable, fire capture

export interface CornerBox {
  x: number; y: number;  // center of black square
  w: number; h: number;  // size of black square
  quadrant: "TL" | "TR" | "BL" | "BR";
}

export interface DetectedCorners {
  TL: CornerBox | null;
  TR: CornerBox | null;
  BL: CornerBox | null;
  BR: CornerBox | null;
}

export interface FrameResult {
  quality: FrameQuality;
  corners: DetectedCorners;
  /** Normalized quad (0-1) defined by corner box centers */
  normalizedQuad: {
    TL: { x: number; y: number };
    TR: { x: number; y: number };
    BL: { x: number; y: number };
    BR: { x: number; y: number };
  } | null;
  stableFrames: number;  // 0–12
  guidance: string;
  readyToCapture: boolean;
}

// ── Config ───────────────────────────────────────────────────────────────────

export const DETECTION_CONFIG = {
  BLACK_THRESHOLD: 40,      // pixels darker than this = black candidate
  MIN_BOX_PX: 8,            // minimum corner box size
  MAX_BOX_PX: 35,           // maximum corner box size
  ASPECT_MIN_BOX: 0.7,      // minimum box aspect ratio (square-ish)
  ASPECT_MAX_BOX: 1.3,      // maximum box aspect ratio
  MIN_AREA_RATIO: 0.30,     // paper quad min area fraction of frame
  MAX_AREA_RATIO: 0.92,     // paper quad max area fraction
  CENTER_TOLERANCE: 0.15,   // max centroid offset from frame center
  ASPECT_MIN: 0.60,         // paper quad min aspect (w/h)
  ASPECT_MAX: 0.80,         // paper quad max aspect (w/h, portrait A4)
  MAX_TILT_DEG: 20,         // max top-edge tilt from horizontal
  STABILITY_FRAMES: 12,     // consecutive stable frames needed
  STABILITY_PX: 8,          // max corner drift per frame
  POLL_INTERVAL_MS: 500,    // probe capture interval
  PROBE_QUALITY: 0.3,       // probe photo quality
};

// ── OpenCV lazy loader ───────────────────────────────────────────────────────

let OpenCV: any = null;
let OT: any = null; // OpenCV Types

const loadOpenCV = () => {
  if (OpenCV) return true;
  try {
    const opencv = require("react-native-fast-opencv");
    OpenCV = opencv.OpenCV;
    OT = {
      ColorConversionCodes: opencv.ColorConversionCodes,
      ContourApproximationModes: opencv.ContourApproximationModes,
      DataTypes: opencv.DataTypes,
      ObjectType: opencv.ObjectType,
      RetrievalModes: opencv.RetrievalModes,
      ThresholdTypes: opencv.ThresholdTypes,
    };
    return true;
  } catch {
    return false;
  }
};

// ── Geometry ─────────────────────────────────────────────────────────────────

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ── Core detection ───────────────────────────────────────────────────────────

async function detectCornerBoxes(imageUri: string): Promise<{
  corners: DetectedCorners;
  imgW: number;
  imgH: number;
}> {
  const mats: any[] = [];
  const empty: DetectedCorners = { TL: null, TR: null, BL: null, BR: null };

  try {
    if (!loadOpenCV()) return { corners: empty, imgW: 0, imgH: 0 };

    const { ColorConversionCodes, ContourApproximationModes, DataTypes, ObjectType, RetrievalModes, ThresholdTypes } = OT;

    // Load image
    const uri = imageUri.startsWith("file://") ? imageUri : `file://${imageUri}`;
    const fileObj = new (require("expo-file-system").File)(uri);
    const b64 = await fileObj.base64();
    const src = OpenCV.base64ToMat(b64);
    mats.push(src);

    const srcJs = OpenCV.toJSValue(src) as any;
    const imgW: number = srcJs.cols;
    const imgH: number = srcJs.rows;
    if (!imgW || !imgH) return { corners: empty, imgW: 0, imgH: 0 };

    // Grayscale
    const gray = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8U);
    mats.push(gray);
    OpenCV.invoke("cvtColor", src, gray, ColorConversionCodes.COLOR_BGR2GRAY);

    // Binary threshold: dark pixels (<40) become white (foreground)
    const thresh = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8U);
    mats.push(thresh);
    OpenCV.invoke("threshold", gray, thresh, DETECTION_CONFIG.BLACK_THRESHOLD, 255, ThresholdTypes.THRESH_BINARY_INV);

    // Find contours of black blobs
    const contours = OpenCV.createObject(ObjectType.MatVector);
    const hierarchy = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_32S);
    mats.push(contours, hierarchy);
    OpenCV.invoke("findContoursWithHierarchy", thresh, contours, hierarchy, RetrievalModes.RETR_EXTERNAL, ContourApproximationModes.CHAIN_APPROX_SIMPLE);

    const cData = OpenCV.toJSValue(contours) as any;
    const count = cData?.array?.length ?? 0;

    // Quadrant boundaries (each corner box should be in its respective quadrant)
    const midX = imgW / 2;
    const midY = imgH / 2;

    // Candidates per quadrant (keep best = largest valid box)
    const candidates: Record<string, CornerBox & { area: number }> = {};

    for (let i = 0; i < count; i++) {
      const contour = OpenCV.copyObjectFromVector(contours, i);
      const rect = OpenCV.toJSValue(OpenCV.invoke("boundingRect", contour)) as any;
      const w = rect.width ?? 0;
      const h = rect.height ?? 0;
      if (w <= 0 || h <= 0) continue;

      // Size filter
      if (w < DETECTION_CONFIG.MIN_BOX_PX || w > DETECTION_CONFIG.MAX_BOX_PX) continue;
      if (h < DETECTION_CONFIG.MIN_BOX_PX || h > DETECTION_CONFIG.MAX_BOX_PX) continue;

      // Aspect ratio filter (must be roughly square)
      const aspect = w / h;
      if (aspect < DETECTION_CONFIG.ASPECT_MIN_BOX || aspect > DETECTION_CONFIG.ASPECT_MAX_BOX) continue;

      // Fill ratio — corner boxes are solid black, so fill should be high
      const area = w * h;
      let fill = 0.5;
      try {
        const contourArea = OpenCV.invoke("contourArea", contour) as any;
        fill = (typeof contourArea === "number" ? contourArea : contourArea?.value ?? 0) / area;
      } catch { /* use default */ }
      if (fill < 0.6) continue; // Must be at least 60% filled (solid square)

      const cx = (rect.x ?? 0) + w / 2;
      const cy = (rect.y ?? 0) + h / 2;

      // Determine quadrant
      let quadrant: "TL" | "TR" | "BL" | "BR";
      if (cx < midX && cy < midY) quadrant = "TL";
      else if (cx >= midX && cy < midY) quadrant = "TR";
      else if (cx < midX && cy >= midY) quadrant = "BL";
      else quadrant = "BR";

      // Keep the best (largest) candidate per quadrant
      if (!candidates[quadrant] || area > candidates[quadrant].area) {
        candidates[quadrant] = { x: cx, y: cy, w, h, quadrant, area };
      }
    }

    const corners: DetectedCorners = {
      TL: candidates.TL ? { x: candidates.TL.x, y: candidates.TL.y, w: candidates.TL.w, h: candidates.TL.h, quadrant: "TL" } : null,
      TR: candidates.TR ? { x: candidates.TR.x, y: candidates.TR.y, w: candidates.TR.w, h: candidates.TR.h, quadrant: "TR" } : null,
      BL: candidates.BL ? { x: candidates.BL.x, y: candidates.BL.y, w: candidates.BL.w, h: candidates.BL.h, quadrant: "BL" } : null,
      BR: candidates.BR ? { x: candidates.BR.x, y: candidates.BR.y, w: candidates.BR.w, h: candidates.BR.h, quadrant: "BR" } : null,
    };

    return { corners, imgW, imgH };
  } catch (err) {
    console.warn("[CornerDetector] Detection error:", err);
    return { corners: empty, imgW: 0, imgH: 0 };
  } finally {
    try {
      for (const m of mats) { try { m?.delete?.(); } catch {} }
      OpenCV?.clearBuffers?.();
    } catch {}
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateQuad(corners: DetectedCorners, imgW: number, imgH: number): { valid: boolean; quality: FrameQuality; guidance: string } {
  const { TL, TR, BL, BR } = corners;
  const found = [TL, TR, BL, BR].filter(Boolean).length;

  if (found === 0) return { valid: false, quality: "searching", guidance: "Point camera at answer sheet" };
  if (found < 4) {
    const missing = [];
    if (!TL) missing.push("top-left");
    if (!TR) missing.push("top-right");
    if (!BL) missing.push("bottom-left");
    if (!BR) missing.push("bottom-right");
    return { valid: false, quality: "partial", guidance: `Move closer \u2014 find ${missing.join(", ")} corner` };
  }

  // All 4 found — validate geometry
  const frameArea = imgW * imgH;

  // Quad area (shoelace)
  const pts = [TL!, TR!, BR!, BL!];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  area = Math.abs(area) / 2;
  const areaRatio = area / frameArea;

  if (areaRatio < DETECTION_CONFIG.MIN_AREA_RATIO) return { valid: false, quality: "found", guidance: "Move closer to the sheet" };
  if (areaRatio > DETECTION_CONFIG.MAX_AREA_RATIO) return { valid: false, quality: "found", guidance: "Move further away" };

  // Centering
  const cx = (TL!.x + TR!.x + BL!.x + BR!.x) / 4;
  const cy = (TL!.y + TR!.y + BL!.y + BR!.y) / 4;
  const dxN = Math.abs(cx - imgW / 2) / imgW;
  const dyN = Math.abs(cy - imgH / 2) / imgH;

  if (dxN > DETECTION_CONFIG.CENTER_TOLERANCE || dyN > DETECTION_CONFIG.CENTER_TOLERANCE) {
    if (dxN > dyN) return { valid: false, quality: "found", guidance: cx < imgW / 2 ? "Move phone right" : "Move phone left" };
    return { valid: false, quality: "found", guidance: cy < imgH / 2 ? "Move phone down" : "Move phone up" };
  }

  // Aspect ratio (portrait paper: w/h should be ~0.707)
  const topW = dist(TL!, TR!);
  const botW = dist(BL!, BR!);
  const leftH = dist(TL!, BL!);
  const rightH = dist(TR!, BR!);
  const avgW = (topW + botW) / 2;
  const avgH = (leftH + rightH) / 2;
  const aspect = avgW / avgH;

  if (aspect < DETECTION_CONFIG.ASPECT_MIN || aspect > DETECTION_CONFIG.ASPECT_MAX) {
    return { valid: false, quality: "found", guidance: "Make sure full sheet is visible" };
  }

  // Tilt check
  const tiltDeg = Math.abs(Math.atan2(TR!.y - TL!.y, TR!.x - TL!.x)) * (180 / Math.PI);
  if (tiltDeg > DETECTION_CONFIG.MAX_TILT_DEG) {
    return { valid: false, quality: "found", guidance: "Hold phone more level" };
  }

  return { valid: true, quality: "aligning", guidance: "Hold still \u2014 locking corners..." };
}

// ── Stability ────────────────────────────────────────────────────────────────

function cornersStable(prev: DetectedCorners, curr: DetectedCorners): boolean {
  for (const q of ["TL", "TR", "BL", "BR"] as const) {
    const p = prev[q];
    const c = curr[q];
    if (!p || !c) return false;
    if (dist(p, c) > DETECTION_CONFIG.STABILITY_PX) return false;
  }
  return true;
}

// ── Guidance text map ────────────────────────────────────────────────────────

const GUIDANCE_LOCKED = (n: number) => `Hold still \u00b7 ${n}/${DETECTION_CONFIG.STABILITY_FRAMES}`;
const GUIDANCE_READY = "\u2713 Locked \u2014 scanning now...";

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseCornerBoxDetectorOptions {
  cameraRef: React.RefObject<CameraView>;
  enabled: boolean;
  onReadyToCapture?: () => void;
}

export function useCornerBoxDetector({ cameraRef, enabled, onReadyToCapture }: UseCornerBoxDetectorOptions) {
  const [frameResult, setFrameResult] = useState<FrameResult>({
    quality: "searching",
    corners: { TL: null, TR: null, BL: null, BR: null },
    normalizedQuad: null,
    stableFrames: 0,
    guidance: "Point camera at answer sheet",
    readyToCapture: false,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const stableCountRef = useRef(0);
  const lastCornersRef = useRef<DetectedCorners>({ TL: null, TR: null, BL: null, BR: null });
  const readyFiredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const runProbe = useCallback(async () => {
    if (!enabled || !cameraRef.current || inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const probe = await cameraRef.current.takePictureAsync({
        quality: DETECTION_CONFIG.PROBE_QUALITY,
        base64: false,
        skipProcessing: true,
      });
      if (!probe) { inFlightRef.current = false; return; }

      const { corners, imgW, imgH } = await detectCornerBoxes(probe.uri);

      // Cleanup probe
      try { await FileSystem.deleteAsync(probe.uri, { idempotent: true }); } catch {}

      const foundCount = [corners.TL, corners.TR, corners.BL, corners.BR].filter(Boolean).length;

      if (foundCount === 0) {
        stableCountRef.current = 0;
        lastCornersRef.current = corners;
        readyFiredRef.current = false;
        setFrameResult({
          quality: "searching", corners, normalizedQuad: null,
          stableFrames: 0, guidance: "Point camera at answer sheet", readyToCapture: false,
        });
        inFlightRef.current = false;
        return;
      }

      // Build normalized quad
      const nQuad = (corners.TL && corners.TR && corners.BL && corners.BR && imgW > 0 && imgH > 0) ? {
        TL: { x: corners.TL.x / imgW, y: corners.TL.y / imgH },
        TR: { x: corners.TR.x / imgW, y: corners.TR.y / imgH },
        BL: { x: corners.BL.x / imgW, y: corners.BL.y / imgH },
        BR: { x: corners.BR.x / imgW, y: corners.BR.y / imgH },
      } : null;

      if (foundCount < 4) {
        stableCountRef.current = 0;
        lastCornersRef.current = corners;
        readyFiredRef.current = false;
        setFrameResult({
          quality: "partial", corners, normalizedQuad: nQuad,
          stableFrames: 0, guidance: `Move closer \u2014 find all 4 corner boxes (${foundCount}/4)`, readyToCapture: false,
        });
        inFlightRef.current = false;
        return;
      }

      // All 4 found — validate
      const validation = validateQuad(corners, imgW, imgH);

      if (!validation.valid) {
        stableCountRef.current = 0;
        lastCornersRef.current = corners;
        readyFiredRef.current = false;
        setFrameResult({
          quality: validation.quality, corners, normalizedQuad: nQuad,
          stableFrames: 0, guidance: validation.guidance, readyToCapture: false,
        });
        inFlightRef.current = false;
        return;
      }

      // Valid — check stability
      const isStable = cornersStable(lastCornersRef.current, corners);
      lastCornersRef.current = corners;

      if (isStable) {
        stableCountRef.current += 1;
      } else {
        stableCountRef.current = 1;
      }

      const sc = stableCountRef.current;
      const needed = DETECTION_CONFIG.STABILITY_FRAMES;
      const isReady = sc >= needed;

      if (isReady && !readyFiredRef.current) {
        readyFiredRef.current = true;
        setFrameResult({
          quality: "ready", corners, normalizedQuad: nQuad,
          stableFrames: sc, guidance: GUIDANCE_READY, readyToCapture: true,
        });
        setTimeout(() => onReadyToCapture?.(), 400);
      } else if (!isReady) {
        setFrameResult({
          quality: "locked", corners, normalizedQuad: nQuad,
          stableFrames: sc, guidance: GUIDANCE_LOCKED(sc), readyToCapture: false,
        });
      }
    } catch (err) {
      console.warn("[CornerDetector] Probe error:", err);
      stableCountRef.current = 0;
      readyFiredRef.current = false;
    } finally {
      inFlightRef.current = false;
    }
  }, [cameraRef, enabled, onReadyToCapture]);

  // Polling loop
  useEffect(() => {
    if (!enabled) { clearTimer(); return; }
    let cancelled = false;
    const schedule = () => {
      clearTimer();
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        await runProbe();
        if (!cancelled && enabled) schedule();
      }, DETECTION_CONFIG.POLL_INTERVAL_MS);
    };
    schedule();
    return () => { cancelled = true; clearTimer(); };
  }, [clearTimer, enabled, runProbe]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const reset = useCallback(() => {
    stableCountRef.current = 0;
    lastCornersRef.current = { TL: null, TR: null, BL: null, BR: null };
    readyFiredRef.current = false;
    setFrameResult({
      quality: "searching", corners: { TL: null, TR: null, BL: null, BR: null },
      normalizedQuad: null, stableFrames: 0, guidance: "Point camera at answer sheet", readyToCapture: false,
    });
  }, []);

  return { frameResult, reset };
}
