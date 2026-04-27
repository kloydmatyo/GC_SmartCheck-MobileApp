/**
 * columnMapper — Self-calibrating column anchor detection
 *
 * Finds the 15 small (2×2mm) column-marker squares in the warped image.
 * Each marker anchors its column group's A/B/C/D/E bubble positions.
 *
 * All dimensions derived from templatePdfGenerator.ts CSS:
 *   bubble-compact: 3.2mm, container: 4mm, gap: 0.3mm
 *   → center-to-center spacing: 4.3mm = 16.4px at 3.81px/mm
 *   marker-to-bubble-A offset: 12.6mm = 48px
 *   row spacing: 3.8mm = 14.5px
 */

import { WARP_W, WARP_H } from "./perspectiveWarp";

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

// ── Constants derived from template CSS ──────────────────────────────────────

const PX_PER_MM = WARP_W / 210; // 800/210 = 3.81 px/mm

/** Bubble center-to-center horizontal spacing: 4.3mm */
export const BUBBLE_SPACING_X = Math.round(4.3 * PX_PER_MM); // 16px

/** Row center-to-center vertical spacing: 3.8mm */
export const ROW_SPACING_Y = Math.round(3.8 * PX_PER_MM); // 14px

/** Number of bubble choices per question */
export const CHOICES = 5;

/** Offset from marker center to bubble-A center: 12.6mm */
const MARKER_TO_BUBBLE_A_X = Math.round(12.6 * PX_PER_MM); // 48px

/** Offset from marker center-Y to first row bubble center-Y: ~4.1mm */
const MARKER_TO_FIRST_ROW_Y = Math.round(4.1 * PX_PER_MM); // 16px

/** Column marker size: 2mm = ~7.6px. Search range: */
const MARKER_MIN_PX = 5;
const MARKER_MAX_PX = 14;

/** Column group width: ~32.8mm = ~125px */
const COL_GROUP_WIDTH_PX = Math.round(32.8 * PX_PER_MM);

/** Column group gap: 2.5mm = ~9.5px */
const COL_GROUP_GAP_PX = Math.round(2.5 * PX_PER_MM);

/** Bubble diameter: 3.2mm = ~12px */
export const BUBBLE_DIAMETER_PX = Math.round(3.2 * PX_PER_MM);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ColumnGroupAnchor {
  markerX: number;     // detected marker center-x in warped image
  markerY: number;     // detected marker center-y
  bubbleXs: number[];  // x-positions of A, B, C, D, E bubble centers
  firstRowY: number;   // y-position of first question row bubble center
  colIndex: number;    // 0-4
  bandIndex: number;   // 0-2
  detected: boolean;   // true if marker was actually found, false if estimated
}

// ── Marker Detection ─────────────────────────────────────────────────────────

/**
 * Detect the 15 column-marker squares and compute all bubble positions.
 */
export async function detectColumnMarkers(warpedImageUri: string): Promise<ColumnGroupAnchor[]> {
  const mats: any[] = [];

  try {
    load();
    const { CC, CA, DT, OT, RM, TT } = T;

    const { File } = require("expo-file-system");
    const uri = warpedImageUri.startsWith("file://") ? warpedImageUri : `file://${warpedImageUri}`;
    const b64 = await new File(uri).base64();
    const src = CV.base64ToMat(b64); mats.push(src);

    // Grayscale + threshold
    const gray = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(gray);
    CV.invoke("cvtColor", src, gray, CC.COLOR_BGR2GRAY);
    const thresh = CV.createObject(OT.Mat, 0, 0, DT.CV_8U); mats.push(thresh);
    CV.invoke("threshold", gray, thresh, 50, 255, TT.THRESH_BINARY_INV);

    // Find contours
    const contours = CV.createObject(OT.MatVector);
    const hier = CV.createObject(OT.Mat, 0, 0, DT.CV_32S);
    mats.push(contours, hier);
    CV.invoke("findContoursWithHierarchy", thresh, contours, hier, RM.RETR_EXTERNAL, CA.CHAIN_APPROX_SIMPLE);

    const cData = CV.toJSValue(contours) as any;
    const count = cData?.array?.length ?? 0;

    // Collect ALL small square candidates
    interface Candidate { cx: number; cy: number; w: number; h: number; area: number; }
    const candidates: Candidate[] = [];

    for (let i = 0; i < count; i++) {
      const contour = CV.copyObjectFromVector(contours, i);
      const r = CV.toJSValue(CV.invoke("boundingRect", contour)) as any;
      const w = r.width, h = r.height;

      // Size filter: must be small square matching 2mm marker
      if (w < MARKER_MIN_PX || w > MARKER_MAX_PX) continue;
      if (h < MARKER_MIN_PX || h > MARKER_MAX_PX) continue;
      const asp = w / h;
      if (asp < 0.55 || asp > 1.45) continue;

      // Solidity filter
      let fill = 0.5;
      try {
        const ca = CV.invoke("contourArea", contour) as any;
        fill = (typeof ca === "number" ? ca : ca?.value ?? 0) / (w * h);
      } catch {}
      if (fill < 0.55) continue;

      // Exclude the 4 large corner markers (they're ~23px, much bigger)
      if (w > MARKER_MAX_PX - 1 && h > MARKER_MAX_PX - 1) continue;

      candidates.push({ cx: r.x + w / 2, cy: r.y + h / 2, w, h, area: w * h });
    }

    console.log(`[ColumnMapper] Found ${candidates.length} small square candidates`);

    // Now match candidates to expected 5×3 grid pattern
    return matchCandidatesToGrid(candidates);
  } catch (err) {
    console.error("[ColumnMapper] Detection error:", err);
    return generateFallbackAnchors();
  } finally {
    try { for (const m of mats) { try { m?.delete?.(); } catch {} } CV?.clearBuffers?.(); } catch {}
  }
}

/**
 * Match detected candidates to the 5×3 marker grid using clustering.
 *
 * Strategy: find 5 X-clusters and 3 Y-clusters among the candidates.
 * Each intersection = one column group anchor.
 */
function matchCandidatesToGrid(candidates: Candidate[]): ColumnGroupAnchor[] {
  if (candidates.length < 5) {
    console.warn(`[ColumnMapper] Only ${candidates.length} candidates, using fallback`);
    return generateFallbackAnchors();
  }

  // Sort candidates by X to find 5 column clusters
  const sortedByX = [...candidates].sort((a, b) => a.cx - b.cx);

  // Expected column group X spacing: COL_GROUP_WIDTH + COL_GROUP_GAP ≈ 135px
  const groupSpacing = COL_GROUP_WIDTH_PX + COL_GROUP_GAP_PX;

  // Cluster by X: group candidates within 20px of each other
  const xClusters: Candidate[][] = [];
  let currentCluster: Candidate[] = [sortedByX[0]];

  for (let i = 1; i < sortedByX.length; i++) {
    if (sortedByX[i].cx - currentCluster[currentCluster.length - 1].cx < 25) {
      currentCluster.push(sortedByX[i]);
    } else {
      xClusters.push(currentCluster);
      currentCluster = [sortedByX[i]];
    }
  }
  xClusters.push(currentCluster);

  // We need exactly 5 X-clusters (one per column group)
  // If we have more, take the 5 most populated or best-spaced
  let colClusters: Candidate[][];
  if (xClusters.length >= 5) {
    // Sort by population, take top 5, then re-sort by X
    colClusters = xClusters
      .sort((a, b) => b.length - a.length)
      .slice(0, 5)
      .sort((a, b) => {
        const avgA = a.reduce((s, c) => s + c.cx, 0) / a.length;
        const avgB = b.reduce((s, c) => s + c.cx, 0) / b.length;
        return avgA - avgB;
      });
  } else {
    colClusters = xClusters;
  }

  // For each column cluster, find 3 Y-clusters (bands)
  const anchors: ColumnGroupAnchor[] = [];

  for (let col = 0; col < Math.min(colClusters.length, 5); col++) {
    const cluster = colClusters[col];
    const avgX = cluster.reduce((s, c) => s + c.cx, 0) / cluster.length;

    // Sort by Y and find 3 band clusters
    const sortedByY = [...cluster].sort((a, b) => a.cy - b.cy);

    // Try to find 3 Y positions
    const yPositions: number[] = [];
    const yClusters: Candidate[][] = [];
    let yCluster: Candidate[] = [sortedByY[0]];

    for (let i = 1; i < sortedByY.length; i++) {
      if (sortedByY[i].cy - yCluster[yCluster.length - 1].cy < 30) {
        yCluster.push(sortedByY[i]);
      } else {
        yClusters.push(yCluster);
        yCluster = [sortedByY[i]];
      }
    }
    yClusters.push(yCluster);

    // Take up to 3 Y clusters sorted by Y
    const bandClusters = yClusters.slice(0, 3).sort((a, b) => {
      const avgA = a.reduce((s, c) => s + c.cy, 0) / a.length;
      const avgB = b.reduce((s, c) => s + c.cy, 0) / b.length;
      return avgA - avgB;
    });

    for (let band = 0; band < Math.min(bandClusters.length, 3); band++) {
      const bc = bandClusters[band];
      const mx = bc.reduce((s, c) => s + c.cx, 0) / bc.length;
      const my = bc.reduce((s, c) => s + c.cy, 0) / bc.length;

      anchors.push(buildAnchor(mx, my, col, band, true));
    }

    // If fewer than 3 bands found, estimate missing ones
    if (bandClusters.length < 3 && bandClusters.length > 0) {
      const foundYs = bandClusters.map(bc => bc.reduce((s, c) => s + c.cy, 0) / bc.length);
      // Estimate band spacing from found bands or use default
      const bandSpacing = foundYs.length >= 2
        ? (foundYs[foundYs.length - 1] - foundYs[0]) / (foundYs.length - 1)
        : Math.round(55 * PX_PER_MM); // ~55mm between bands

      for (let band = 0; band < 3; band++) {
        if (band < bandClusters.length) continue; // already added
        const estY = foundYs[0] + band * bandSpacing;
        anchors.push(buildAnchor(avgX, estY, col, band, false));
      }
    }
  }

  // If fewer than 5 columns found, estimate missing ones
  if (anchors.length < 15) {
    const existing = anchors.filter(a => a.detected);
    if (existing.length >= 3) {
      // Estimate column spacing from existing
      const colXs = [...new Set(existing.map(a => a.colIndex))].sort();
      if (colXs.length >= 2) {
        const xs = colXs.map(ci => {
          const colAnchors = existing.filter(a => a.colIndex === ci);
          return colAnchors.reduce((s, a) => s + a.markerX, 0) / colAnchors.length;
        });
        const avgSpacing = (xs[xs.length - 1] - xs[0]) / (colXs.length - 1);

        for (let col = 0; col < 5; col++) {
          for (let band = 0; band < 3; band++) {
            if (anchors.some(a => a.colIndex === col && a.bandIndex === band)) continue;
            const estX = xs[0] + col * avgSpacing;
            const bandAnchors = existing.filter(a => a.bandIndex === band);
            const estY = bandAnchors.length > 0
              ? bandAnchors.reduce((s, a) => s + a.markerY, 0) / bandAnchors.length
              : 0;
            if (estY > 0) anchors.push(buildAnchor(estX, estY, col, band, false));
          }
        }
      }
    }
  }

  // Sort by band then column
  anchors.sort((a, b) => a.bandIndex * 10 + a.colIndex - (b.bandIndex * 10 + b.colIndex));

  console.log(`[ColumnMapper] ${anchors.filter(a => a.detected).length}/15 markers detected, ${anchors.length} total anchors`);
  return anchors.length > 0 ? anchors : generateFallbackAnchors();
}

interface Candidate { cx: number; cy: number; w: number; h: number; area: number; }

/** Build a ColumnGroupAnchor from a marker position */
function buildAnchor(mx: number, my: number, col: number, band: number, detected: boolean): ColumnGroupAnchor {
  const bubbleXs = Array.from({ length: CHOICES }, (_, i) =>
    Math.round(mx + MARKER_TO_BUBBLE_A_X + i * BUBBLE_SPACING_X)
  );
  return {
    markerX: mx,
    markerY: my,
    bubbleXs,
    firstRowY: Math.round(my + MARKER_TO_FIRST_ROW_Y),
    colIndex: col,
    bandIndex: band,
    detected,
  };
}

/** Fallback grid using estimated positions (last resort) */
function generateFallbackAnchors(): ColumnGroupAnchor[] {
  console.warn("[ColumnMapper] Using fallback grid — accuracy may be low");

  // Estimated from CSS: page margin 8mm, content starts ~8mm from body edge
  // First column group marker at approximately x=9mm, y varies by band
  const startX = Math.round(9 * PX_PER_MM); // ~34px
  const colSpacing = COL_GROUP_WIDTH_PX + COL_GROUP_GAP_PX; // ~135px

  // Band Y positions estimated from CSS layout
  // These ARE approximate — the self-calibration should override them
  const bandYs = [
    Math.round(90 * PX_PER_MM),  // ~343px (band 1 marker)
    Math.round(115 * PX_PER_MM), // ~438px (band 2 marker)
    Math.round(140 * PX_PER_MM), // ~533px (band 3 marker)
  ];

  const anchors: ColumnGroupAnchor[] = [];
  for (let band = 0; band < 3; band++) {
    for (let col = 0; col < 5; col++) {
      const mx = startX + col * colSpacing;
      const my = bandYs[band];
      anchors.push(buildAnchor(mx, my, col, band, false));
    }
  }
  return anchors;
}

/**
 * Map a bubble's x-position to column A/B/C/D/E.
 */
export function mapToColumn(
  bubbleX: number,
  bubbleXs: number[],
): { column: string; index: number; distance: number } {
  const labels = ["A", "B", "C", "D", "E"];
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < bubbleXs.length; i++) {
    const d = Math.abs(bubbleX - bubbleXs[i]);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return { column: labels[bestIdx], index: bestIdx, distance: bestDist };
}
