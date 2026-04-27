/**
 * cornerDetector — Finds the 4 large black corner squares on the 150Q sheet
 *
 * Strategy: aggressive threshold (30/255) → contours → filter for solid squares
 * in each image quadrant. These squares have maximum contrast and unique geometry.
 */

import { File } from "expo-file-system";

let CV: any = null;
let T: any = null;

const load = () => {
  if (CV) return;
  const o = require("react-native-fast-opencv");
  CV = o.OpenCV;
  T = {
    CC: o.ColorConversionCodes, CA: o.ContourApproximationModes,
    DT: o.DataTypes, OT: o.ObjectType, RM: o.RetrievalModes, TT: o.ThresholdTypes,
  };
};

export interface CornerSquare {
  cx: number; cy: number;  // center
  w: number; h: number;    // bounding box size
}

export interface CornerDetectionResult {
  TL: CornerSquare | null;
  TR: CornerSquare | null;
  BL: CornerSquare | null;
  BR: CornerSquare | null;
  found: number;           // 0-4
  imgW: number;
  imgH: number;
}

/**
 * Detect the 4 corner squares in an image.
 * Returns pixel coordinates in the source image.
 */
export async function detectCorners(imageUri: string): Promise<CornerDetectionResult> {
  const mats: any[] = [];
  const none: CornerDetectionResult = { TL: null, TR: null, BL: null, BR: null, found: 0, imgW: 0, imgH: 0 };

  try {
    load();
    const { CC, CA, DT, OT, RM, TT } = T;

    const uri = imageUri.startsWith("file://") ? imageUri : `file://${imageUri}`;
    const b64 = await new File(uri).base64();
    const src = CV.base64ToMat(b64); mats.push(src);
    const info = CV.toJSValue(src) as any;
    const W = info.cols, H = info.rows;
    if (!W || !H) return none;

    // Grayscale
    const gray = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(gray);
    CV.invoke("cvtColor", src, gray, CC.COLOR_BGR2GRAY);

    // Threshold — adaptive threshold to handle uneven lighting better
    const thresh = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(thresh);
    const ADAPTIVE_THRESH_MEAN_C = 0; // OpenCV constant
    CV.invoke("adaptiveThreshold", gray, thresh, 255, ADAPTIVE_THRESH_MEAN_C, TT.THRESH_BINARY_INV, 15, 8);

    // Morphological close to fill small gaps in the black squares
    try {
      const kernel = CV.invoke("getStructuringElement", 0, CV.createObject(OT.Size, 3, 3));
      mats.push(kernel);
      const closed = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(closed);
      CV.invoke("morphologyEx", thresh, closed, 3, kernel); // MORPH_CLOSE = 3
      CV.invoke("copyTo", closed, thresh);
    } catch { /* use raw threshold */ }

    // Find contours
    const contours = CV.createObject(OT.MatVector);
    const hier = CV.createObject(OT.Mat, 0, 0, DT.CV_32S);
    mats.push(contours, hier);
    CV.invoke("findContoursWithHierarchy", thresh, contours, hier, RM.RETR_EXTERNAL, CA.CHAIN_APPROX_SIMPLE);

    const cData = CV.toJSValue(contours) as any;
    const count = cData?.array?.length ?? 0;

    // Filter candidates: solid squares of appropriate size
    const minArea = Math.pow(Math.min(W, H) * 0.01, 2); // ~1% of smallest dimension
    const maxArea = Math.pow(Math.min(W, H) * 0.08, 2); // ~8%

    interface Candidate { cx: number; cy: number; w: number; h: number; area: number; solidity: number; }
    const validCandidates: Candidate[] = [];

    for (let i = 0; i < count; i++) {
      const contour = CV.copyObjectFromVector(contours, i);
      const r = CV.toJSValue(CV.invoke("boundingRect", contour)) as any;
      const w = r.width, h = r.height;
      const area = w * h;

      // Size filter
      if (area < minArea || area > maxArea) continue;

      // Must be roughly square (0.7–1.3 aspect)
      const asp = w / h;
      if (asp < 0.7 || asp > 1.3) continue;

      // Must be solid (high fill ratio)
      let contourArea = 0;
      try {
        const ca = CV.invoke("contourArea", contour) as any;
        contourArea = typeof ca === "number" ? ca : ca?.value ?? 0;
      } catch { continue; }
      const solidity = contourArea / area;
      if (solidity < 0.75) continue; // Must be at least 75% filled

      const cx = r.x + w / 2;
      const cy = r.y + h / 2;

      validCandidates.push({ cx, cy, w, h, area, solidity });
    }

    // Find bounding box of all valid candidates to split into quadrants
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (const c of validCandidates) {
      if (c.cx < minX) minX = c.cx;
      if (c.cx > maxX) maxX = c.cx;
      if (c.cy < minY) minY = c.cy;
      if (c.cy > maxY) maxY = c.cy;
    }

    // If no bounding box can be formed, default to image center
    const midX = validCandidates.length > 0 ? (minX + maxX) / 2 : W / 2;
    const midY = validCandidates.length > 0 ? (minY + maxY) / 2 : H / 2;

    const bestPerQuadrant: Record<string, Candidate> = {};
    const quadrantLogs: Record<string, string[]> = { TL: [], TR: [], BL: [], BR: [] };

    for (const c of validCandidates) {
      // Assign to quadrant based on the candidate bounding box
      let q: string;
      if (c.cx < midX && c.cy < midY) q = "TL";
      else if (c.cx >= midX && c.cy < midY) q = "TR";
      else if (c.cx < midX && c.cy >= midY) q = "BL";
      else q = "BR";

      quadrantLogs[q].push(`${Math.round(c.area)}px`);

      // Keep largest per quadrant (corner squares are the biggest solid black squares)
      if (!bestPerQuadrant[q] || c.area > bestPerQuadrant[q].area) {
        bestPerQuadrant[q] = c;
      }
    }

    console.log(`[CornerDetector] Quadrants -> TL: ${quadrantLogs.TL.length} [${quadrantLogs.TL.join(",")}], TR: ${quadrantLogs.TR.length} [${quadrantLogs.TR.join(",")}], BL: ${quadrantLogs.BL.length} [${quadrantLogs.BL.join(",")}], BR: ${quadrantLogs.BR.length} [${quadrantLogs.BR.join(",")}]`);

    const mkCorner = (c?: Candidate): CornerSquare | null =>
      c ? { cx: c.cx, cy: c.cy, w: c.w, h: c.h } : null;

    const result: CornerDetectionResult = {
      TL: mkCorner(bestPerQuadrant.TL),
      TR: mkCorner(bestPerQuadrant.TR),
      BL: mkCorner(bestPerQuadrant.BL),
      BR: mkCorner(bestPerQuadrant.BR),
      found: Object.keys(bestPerQuadrant).length,
      imgW: W, imgH: H,
    };

    console.log(
      `[CornerDetector] ${W}×${H}: ${count} contours, ${result.found}/4 corners found` +
      (result.found > 0 ? ` (${Object.keys(bestPerQuadrant).join(",")})` : "")
    );

    return result;
  } catch (err) {
    console.error("[CornerDetector] Error:", err);
    return none;
  } finally {
    try { for (const m of mats) { try { m?.delete?.(); } catch {} } CV?.clearBuffers?.(); } catch {}
  }
}

/**
 * Estimate a missing corner using the other 3 + known A4 aspect ratio.
 */
export function estimateMissingCorner(corners: CornerDetectionResult): CornerDetectionResult {
  const { TL, TR, BL, BR } = corners;
  const present = [TL, TR, BL, BR].filter(Boolean);
  if (present.length >= 4 || present.length < 3) return corners;

  const result = { ...corners };
  const dummySize = present[0]!.w;

  if (!TL && TR && BL && BR) {
    result.TL = { cx: TR.cx + BL.cx - BR.cx, cy: TR.cy + BL.cy - BR.cy, w: dummySize, h: dummySize };
  } else if (!TR && TL && BL && BR) {
    result.TR = { cx: TL.cx + BR.cx - BL.cx, cy: TL.cy + BR.cy - BL.cy, w: dummySize, h: dummySize };
  } else if (!BL && TL && TR && BR) {
    result.BL = { cx: TL.cx + BR.cx - TR.cx, cy: TL.cy + BR.cy - TR.cy, w: dummySize, h: dummySize };
  } else if (!BR && TL && TR && BL) {
    result.BR = { cx: TR.cx + BL.cx - TL.cx, cy: TR.cy + BL.cy - TL.cy, w: dummySize, h: dummySize };
  }
  result.found = 4;
  return result;
}
