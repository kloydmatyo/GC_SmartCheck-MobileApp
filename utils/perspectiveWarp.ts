/**
 * perspectiveWarp — Warps the captured image to a flat 800×1131 top-down view
 * using the 4 detected corner square centers.
 *
 * 800×1131 = A4 at 3.81 px/mm (210mm × 297mm), giving consistent coordinates
 * for the fixed-grid bubble detector.
 */

import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import type { CornerDetectionResult } from "./cornerDetector";

let CV: any = null;
let T: any = null;

const load = () => {
  if (CV) return;
  const o = require("react-native-fast-opencv");
  CV = o.OpenCV;
  T = { DT: o.DataTypes, OT: o.ObjectType };
};

/** Standard output size: A4 at ~3.81 px/mm */
export const WARP_W = 800;
export const WARP_H = 1131;

export interface WarpResult {
  uri: string;      // URI of the warped image
  success: boolean;
  error?: string;
}

/**
 * Warp the source image using 4 corner centers to a flat 800×1131 output.
 * Falls back to the original URI if warp fails.
 */
export async function warpSheet(
  imageUri: string,
  corners: CornerDetectionResult,
): Promise<WarpResult> {
  if (!corners.TL || !corners.TR || !corners.BL || !corners.BR) {
    return { uri: imageUri, success: false, error: "Missing corners" };
  }

  const mats: any[] = [];

  try {
    load();
    const { DT, OT } = T;

    const uri = imageUri.startsWith("file://") ? imageUri : `file://${imageUri}`;
    const b64 = await new File(uri).base64();
    const src = CV.base64ToMat(b64); mats.push(src);

    // Source points: corner square centers
    const srcPts = CV.createObject(OT.Point2fVector); mats.push(srcPts);
    const dstPts = CV.createObject(OT.Point2fVector); mats.push(dstPts);

    // Order: TL, TR, BR, BL (clockwise)
    const srcCoords = [
      corners.TL, corners.TR, corners.BR, corners.BL,
    ];
    // Destination: map corner centers to their correct positions in the output.
    // Corner squares are at 13mm from paper edge (8mm margin + 2mm offset + 3mm half-size)
    // At 3.81 px/mm → 50px from output edge.
    const margin = 50;
    const dstCoords = [
      { cx: margin, cy: margin },
      { cx: WARP_W - margin, cy: margin },
      { cx: WARP_W - margin, cy: WARP_H - margin },
      { cx: margin, cy: WARP_H - margin },
    ];

    for (let i = 0; i < 4; i++) {
      CV.invoke("pushBack", srcPts, CV.createObject(OT.Point2f, srcCoords[i]!.cx, srcCoords[i]!.cy));
      CV.invoke("pushBack", dstPts, CV.createObject(OT.Point2f, dstCoords[i].cx, dstCoords[i].cy));
    }

    const M = CV.invoke("getPerspectiveTransform", srcPts, dstPts); mats.push(M);
    const out = CV.createObject(OT.Mat, WARP_H, WARP_W, DT.CV_8U); mats.push(out);
    const outSize = CV.createObject(OT.Size, WARP_W, WARP_H); mats.push(outSize);

    CV.invoke("warpPerspective", src, out, M, outSize);

    // Encode to JPEG
    const outJs = CV.toJSValue(out, "jpeg") as any;
    if (!outJs?.base64) {
      return { uri: imageUri, success: false, error: "Encode failed" };
    }

    const outUri = FileSystem.cacheDirectory + `warped_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(outUri, outJs.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log(`[Warp] Success: ${WARP_W}×${WARP_H}`);
    return { uri: outUri, success: true };
  } catch (err) {
    console.error("[Warp] Error:", err);
    return { uri: imageUri, success: false, error: String(err) };
  } finally {
    try { for (const m of mats) { try { m?.delete?.(); } catch {} } CV?.clearBuffers?.(); } catch {}
  }
}
