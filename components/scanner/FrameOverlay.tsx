/**
 * FrameOverlay — Visual guide for 150Q auto-framing with gyro level
 *
 * Shows an A4-proportioned guide frame sized for ~1ft scanning distance.
 * Includes a bubble level indicator using the device accelerometer.
 * States: searching → partial → found → locked → ready
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polygon, Rect } from "react-native-svg";
import type { FrameResult, FrameState } from "../../hooks/useAutoFramer";
import { FRAMER_CONFIG } from "../../hooks/useAutoFramer";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Colors ───────────────────────────────────────────────────────────────────

const COLORS: Record<FrameState, string> = {
  searching: "rgba(255,255,255,0.5)",
  partial: "#FF5252",
  found: "#FFFFFF",
  locked: "#1D9E75",
  ready: "#1D9E75",
};

// ── A4 Guide Frame ───────────────────────────────────────────────────────────

const A4_RATIO = 297 / 210; // 1.414

function getGuideFrame(screenW: number, screenH: number) {
  const targetW = screenW * 0.90;
  const targetH = targetW * A4_RATIO;
  const x = (screenW - targetW) / 2;
  const y = (screenH - targetH) / 2 - 30;
  return { x, y, w: targetW, h: targetH };
}

// ── Props ────────────────────────────────────────────────────────────────────

interface FrameOverlayProps {
  frameResult: FrameResult;
  previewWidth: number;
  previewHeight: number;
  corners?: {
    TL: { x: number; y: number } | null;
    TR: { x: number; y: number } | null;
    BL: { x: number; y: number } | null;
    BR: { x: number; y: number } | null;
  };
}

export default function FrameOverlay({ frameResult, previewWidth, previewHeight, corners }: FrameOverlayProps) {
  const color = COLORS[frameResult.state];
  const isLocked = frameResult.state === "locked" || frameResult.state === "ready";
  const isSearching = frameResult.state === "searching";
  const progress = frameResult.stableFrames / FRAMER_CONFIG.STABILITY_FRAMES;

  const gf = getGuideFrame(previewWidth, previewHeight);

  // Scan line animation
  const scanAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isLocked) {
      const sweep = Animated.loop(
        Animated.timing(scanAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      );
      sweep.start();
      return () => sweep.stop();
    }
    scanAnim.setValue(0);
  }, [isLocked, scanAnim]);

  // Pulse animation for searching state
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (isSearching) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.7, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
    pulseAnim.setValue(0.5);
  }, [isSearching, pulseAnim]);

  // Map normalized corners to screen
  const nc = frameResult.normalizedCorners;
  const cTL = corners?.TL || (nc.TL ? { x: nc.TL.x * previewWidth, y: nc.TL.y * previewHeight } : null);
  const cTR = corners?.TR || (nc.TR ? { x: nc.TR.x * previewWidth, y: nc.TR.y * previewHeight } : null);
  const cBL = corners?.BL || (nc.BL ? { x: nc.BL.x * previewWidth, y: nc.BL.y * previewHeight } : null);
  const cBR = corners?.BR || (nc.BR ? { x: nc.BR.x * previewWidth, y: nc.BR.y * previewHeight } : null);

  const hasAllCorners = cTL && cTR && cBL && cBR;

  const drawBracket = (pt: {x:number, y:number}, type: string, strokeColor: string, sw: number, dash: string) => {
    const arm = 28;
    const l1x2 = type.includes("L") ? pt.x + arm : pt.x - arm;
    const l2y2 = type.includes("T") ? pt.y + arm : pt.y - arm;
    return (
      <React.Fragment key={`b-${type}`}>
        <Line x1={pt.x} y1={pt.y} x2={l1x2} y2={pt.y} stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeDasharray={dash} />
        <Line x1={pt.x} y1={pt.y} x2={pt.x} y2={l2y2} stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeDasharray={dash} />
      </React.Fragment>
    );
  };

  const renderBracket = (p: {x:number, y:number} | null, staticP: {x:number, y:number}, type: "TL"|"TR"|"BL"|"BR") => {
    if (frameResult.state === "searching") {
      return drawBracket(staticP, type, "rgba(255,255,255,0.5)", 1.5, "8,6");
    }
    if (frameResult.state === "partial") {
      if (p) return drawBracket(p, type, "#FF5252", 3, "0");
      return drawBracket(staticP, type, "rgba(255,255,255,0.3)", 1.5, "4,4");
    }
    if (p) return drawBracket(p, type, color, 3, "0");
    return null;
  };

  const sc = hasAllCorners ? { TL: cTL, TR: cTR, BL: cBL, BR: cBR } : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">

      {/* ── Semi-transparent mask outside the guide frame ── */}
      {(isSearching || frameResult.state === "partial") && (
        <>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(0, gf.y), backgroundColor: "rgba(0,0,0,0.5)" }} />
          <View style={{ position: "absolute", top: gf.y + gf.h, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" }} />
          <View style={{ position: "absolute", top: gf.y, left: 0, width: Math.max(0, gf.x), height: gf.h, backgroundColor: "rgba(0,0,0,0.5)" }} />
          <View style={{ position: "absolute", top: gf.y, right: 0, width: Math.max(0, gf.x), height: gf.h, backgroundColor: "rgba(0,0,0,0.5)" }} />
        </>
      )}

      <Svg width={previewWidth} height={previewHeight} style={StyleSheet.absoluteFill}>

        {/* Dynamic Brackets & Guide */}
        {renderBracket(cTL, { x: gf.x, y: gf.y }, "TL")}
        {renderBracket(cTR, { x: gf.x + gf.w, y: gf.y }, "TR")}
        {renderBracket(cBL, { x: gf.x, y: gf.y + gf.h }, "BL")}
        {renderBracket(cBR, { x: gf.x + gf.w, y: gf.y + gf.h }, "BR")}

        {/* 4/4 Polygon Bounding Box */}
        {hasAllCorners && !isSearching && frameResult.state !== "partial" && (
          <Polygon 
            points={`${cTL.x},${cTL.y} ${cTR.x},${cTR.y} ${cBR.x},${cBR.y} ${cBL.x},${cBL.y}`}
            fill="transparent"
            stroke={color}
            strokeWidth={1.5}
          />
        )}

        {/* Pulsing rings when locked */}
        {isLocked && hasAllCorners && [cTL, cTR, cBL, cBR].map((p, i) => p && (
          <AnimatedCircle key={`cr-${i}`} cx={p.x} cy={p.y} r={12}
            fill="transparent" stroke="#1D9E75" strokeWidth={2} opacity={pulseAnim} />
        ))}

      </Svg>

      {/* Animated scan line when locked */}
      {isLocked && sc && (
        <Animated.View style={{
          position: "absolute", left: sc.TL.x,
          width: sc.TR.x - sc.TL.x, height: 2,
          backgroundColor: "rgba(29,158,117,0.6)",
          transform: [{ translateY: scanAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [sc.TL.y, sc.BL.y],
          })}],
        }} />
      )}

      {/* White flash on capture */}
      {frameResult.state === "ready" && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.18)" }]} />
      )}

      {/* ── Distance hint ── */}
      {isSearching && (
        <View style={[styles.distanceHint, { top: Math.max(10, gf.y - 36) }]}>
          <Text style={styles.distanceText}>Hold phone ~1 foot above sheet</Text>
        </View>
      )}

      {/* ── Guidance pill + progress ── */}
      <View style={styles.guidanceArea}>
        {frameResult.stableFrames > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
          </View>
        )}
        <View style={[styles.pill, { borderColor: color }]}>
          <Text style={[styles.pillText, { color }]}>{frameResult.guidance}</Text>
        </View>
      </View>

      {/* ── State badge ── */}
      {frameResult.state !== "searching" && (
        <View style={[styles.badge, { backgroundColor: color + "25", borderColor: color }]}>
          <View style={[styles.badgeDot, { backgroundColor: color }]} />
          <Text style={[styles.badgeText, { color }]}>
            {frameResult.state === "ready" ? "SCANNING" :
             frameResult.state === "locked" ? "LOCKED" :
             frameResult.state === "found" ? "ALIGNING" : "PARTIAL"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  distanceHint: {
    position: "absolute", left: 0, right: 0, alignItems: "center",
  },
  distanceText: {
    fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.5,
  },
  guidanceArea: {
    position: "absolute", bottom: 140, left: 0, right: 0, alignItems: "center", gap: 6,
  },
  progressTrack: {
    width: 160, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  pill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1.5,
  },
  pillText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  badge: {
    position: "absolute", top: 60, right: 16,
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
});
