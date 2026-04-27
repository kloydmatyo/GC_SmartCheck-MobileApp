/**
 * useAutoFramer — Camera auto-framing state machine
 *
 * Polls expo-camera every 500ms, detects 4 corner squares via cornerDetector,
 * validates geometry for ~1ft scanning distance, tracks stability for 8 frames,
 * then signals capture.
 *
 * 5-state flow: searching → partial → found → locked → ready
 */

import { CameraView } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectCorners, estimateMissingCorner, type CornerDetectionResult } from "../utils/cornerDetector";

// ── Types ────────────────────────────────────────────────────────────────────

export type FrameState = "searching" | "partial" | "found" | "locked" | "ready";

export interface FrameResult {
  state: FrameState;
  corners: CornerDetectionResult | null;
  normalizedCorners: {
    TL: { x: number; y: number } | null;
    TR: { x: number; y: number } | null;
    BL: { x: number; y: number } | null;
    BR: { x: number; y: number } | null;
  };
  stableFrames: number;
  guidance: string;
  readyToCapture: boolean;
}

// ── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  POLL_MS: 400,               // slightly faster polling
  PROBE_QUALITY: 0.5,         // higher quality for corner detection
  STABILITY_FRAMES: 4,        // 4 frames × 400ms = ~1.6s stable hold
  STABILITY_PX: 20,           // generous drift tolerance for hand shake

  // Distance validation: accept a wide range
  MIN_AREA_RATIO: 0.15,       // too far → move closer
  IDEAL_MIN_AREA: 0.25,       // ideal range start
  IDEAL_MAX_AREA: 0.80,       // ideal range end
  MAX_AREA_RATIO: 0.90,       // too close → move back

  CENTER_TOLERANCE: 0.20,     // 20% off-center is ok
  ASPECT_MIN: 0.45,           // generous aspect range
  ASPECT_MAX: 0.95,
  MAX_TILT_DEG: 20,           // 20° tilt tolerance
};

// ── Geometry helpers ─────────────────────────────────────────────────────────

const dist = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) =>
  Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);

function validateCorners(c: CornerDetectionResult): { valid: boolean; guidance: string } {
  if (!c.TL || !c.TR || !c.BL || !c.BR) return { valid: false, guidance: "Find all 4 corner boxes" };

  const { imgW, imgH } = c;
  if (!imgW || !imgH) return { valid: false, guidance: "Processing..." };

  // Area check (shoelace formula)
  const pts = [c.TL, c.TR, c.BR, c.BL];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].cx * pts[j].cy - pts[j].cx * pts[i].cy;
  }
  area = Math.abs(area) / 2;
  const areaRatio = area / (imgW * imgH);

  if (areaRatio < CONFIG.MIN_AREA_RATIO)
    return { valid: false, guidance: "Move closer — hold ~1 foot above sheet" };
  if (areaRatio > CONFIG.MAX_AREA_RATIO)
    return { valid: false, guidance: "Move further away — hold ~1 foot above" };

  // Distance guidance for non-ideal range
  if (areaRatio < CONFIG.IDEAL_MIN_AREA)
    return { valid: false, guidance: "A bit closer — sheet should fill the frame" };
  if (areaRatio > CONFIG.IDEAL_MAX_AREA)
    return { valid: false, guidance: "A bit further — sheet is too close" };

  // Centering
  const cx = (c.TL.cx + c.TR.cx + c.BL.cx + c.BR.cx) / 4;
  const cy = (c.TL.cy + c.TR.cy + c.BL.cy + c.BR.cy) / 4;
  const dxN = Math.abs(cx - imgW / 2) / imgW;
  const dyN = Math.abs(cy - imgH / 2) / imgH;
  if (dxN > CONFIG.CENTER_TOLERANCE || dyN > CONFIG.CENTER_TOLERANCE) {
    if (dxN > dyN) return { valid: false, guidance: cx < imgW / 2 ? "Move right ←" : "Move left →" };
    return { valid: false, guidance: cy < imgH / 2 ? "Move down ↓" : "Move up ↑" };
  }

  // Aspect ratio (A4 portrait = 0.707 w/h)
  const topW = dist(c.TL, c.TR);
  const botW = dist(c.BL, c.BR);
  const leftH = dist(c.TL, c.BL);
  const rightH = dist(c.TR, c.BR);
  const aspect = ((topW + botW) / 2) / ((leftH + rightH) / 2);
  if (aspect < CONFIG.ASPECT_MIN || aspect > CONFIG.ASPECT_MAX)
    return { valid: false, guidance: "Ensure full sheet is visible" };

  // Tilt check
  const tilt = Math.abs(Math.atan2(c.TR.cy - c.TL.cy, c.TR.cx - c.TL.cx)) * (180 / Math.PI);
  if (tilt > CONFIG.MAX_TILT_DEG)
    return { valid: false, guidance: "Hold phone more level" };

  // Perspective check: top and bottom widths shouldn't differ too much
  const widthRatio = Math.min(topW, botW) / Math.max(topW, botW);
  if (widthRatio < 0.55)
    return { valid: false, guidance: "Hold phone directly above sheet" };

  return { valid: true, guidance: "Hold still — locking..." };
}

function cornersStable(prev: CornerDetectionResult | null, curr: CornerDetectionResult): boolean {
  if (!prev?.TL || !prev?.TR || !prev?.BL || !prev?.BR) return false;
  if (!curr.TL || !curr.TR || !curr.BL || !curr.BR) return false;
  for (const q of ["TL", "TR", "BL", "BR"] as const) {
    if (dist(prev[q]!, curr[q]!) > CONFIG.STABILITY_PX) return false;
  }
  return true;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseAutoFramerOptions {
  cameraRef: React.RefObject<CameraView>;
  enabled: boolean;
  onReadyToCapture?: () => void;
}

export function useAutoFramer({ cameraRef, enabled, onReadyToCapture }: UseAutoFramerOptions) {
  const [frameResult, setFrameResult] = useState<FrameResult>({
    state: "searching",
    corners: null,
    normalizedCorners: { TL: null, TR: null, BL: null, BR: null },
    stableFrames: 0,
    guidance: "Align sheet inside the frame",
    readyToCapture: false,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const stableRef = useRef(0);
  const lastCornersRef = useRef<CornerDetectionResult | null>(null);
  const readyFiredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const normalize = (c: CornerDetectionResult) => ({
    TL: c.TL ? { x: c.TL.cx / c.imgW, y: c.TL.cy / c.imgH } : null,
    TR: c.TR ? { x: c.TR.cx / c.imgW, y: c.TR.cy / c.imgH } : null,
    BL: c.BL ? { x: c.BL.cx / c.imgW, y: c.BL.cy / c.imgH } : null,
    BR: c.BR ? { x: c.BR.cx / c.imgW, y: c.BR.cy / c.imgH } : null,
  });

  const runProbe = useCallback(async () => {
    if (!enabled || !cameraRef.current || busyRef.current) return;
    busyRef.current = true;

    try {
      const probe = await cameraRef.current.takePictureAsync({
        quality: CONFIG.PROBE_QUALITY, base64: false, skipProcessing: true,
      });
      if (!probe) { busyRef.current = false; return; }

      let corners = await detectCorners(probe.uri);
      try { await FileSystem.deleteAsync(probe.uri, { idempotent: true }); } catch {}

      if (corners.found === 3) corners = estimateMissingCorner(corners);

      const nc = corners.imgW > 0 ? normalize(corners) : { TL: null, TR: null, BL: null, BR: null };

      if (corners.found === 0) {
        stableRef.current = 0; readyFiredRef.current = false;
        lastCornersRef.current = null;
        setFrameResult({ state: "searching", corners: null, normalizedCorners: nc, stableFrames: 0, guidance: "Point camera at answer sheet", readyToCapture: false });
        return;
      }

      if (corners.found < 4) {
        stableRef.current = 0; readyFiredRef.current = false;
        lastCornersRef.current = corners;
        setFrameResult({ state: "partial", corners, normalizedCorners: nc, stableFrames: 0, guidance: `${corners.found}/4 corners found — adjust position`, readyToCapture: false });
        return;
      }

      // All 4 found — validate geometry + distance
      const v = validateCorners(corners);
      if (!v.valid) {
        stableRef.current = 0; readyFiredRef.current = false;
        lastCornersRef.current = corners;
        setFrameResult({ state: "found", corners, normalizedCorners: nc, stableFrames: 0, guidance: v.guidance, readyToCapture: false });
        return;
      }

      // Stability check
      const stable = cornersStable(lastCornersRef.current, corners);
      lastCornersRef.current = corners;
      stableRef.current = stable ? stableRef.current + 1 : 1;

      const sc = stableRef.current;
      if (sc >= CONFIG.STABILITY_FRAMES && !readyFiredRef.current) {
        readyFiredRef.current = true;
        setFrameResult({ state: "ready", corners, normalizedCorners: nc, stableFrames: sc, guidance: "✓ Locked — scanning now...", readyToCapture: true });
        setTimeout(() => onReadyToCapture?.(), 200);
      } else if (sc < CONFIG.STABILITY_FRAMES) {
        setFrameResult({ state: "locked", corners, normalizedCorners: nc, stableFrames: sc, guidance: "Hold still — locking...", readyToCapture: false });
      }
    } catch (err) {
      console.warn("[AutoFramer] Probe error:", err);
      stableRef.current = 0; readyFiredRef.current = false;
    } finally {
      busyRef.current = false;
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
      }, CONFIG.POLL_MS);
    };
    schedule();
    return () => { cancelled = true; clearTimer(); };
  }, [clearTimer, enabled, runProbe]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const reset = useCallback(() => {
    stableRef.current = 0;
    lastCornersRef.current = null;
    readyFiredRef.current = false;
    setFrameResult({ state: "searching", corners: null, normalizedCorners: { TL: null, TR: null, BL: null, BR: null }, stableFrames: 0, guidance: "Point camera at answer sheet", readyToCapture: false });
  }, []);

  return { frameResult, reset };
}

export { CONFIG as FRAMER_CONFIG };
