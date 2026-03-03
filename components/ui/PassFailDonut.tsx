/**
 * PassFailDonut
 * SVG donut chart showing pass vs fail ratio with a centre label.
 * Uses react-native-svg (already installed).
 *
 * Props:
 *   passCount  – number of students who passed
 *   failCount  – number of students who failed
 *   size       – diameter of the donut in dp (default 120)
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Circle, G, Svg } from "react-native-svg";

const PASS_COLOR = "#00a550";
const FAIL_COLOR = "#e74c3c";
const TRACK_COLOR = "#e0d8c0";

interface Props {
  passCount: number;
  failCount: number;
  size?: number;
}

export default function PassFailDonut({
  passCount,
  failCount,
  size = 120,
}: Props) {
  const total = passCount + failCount;
  const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;
  const failRate = 100 - passRate;

  const radius = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = size * 0.16;
  const circumference = 2 * Math.PI * radius;

  // pass arc
  const passDash = total > 0 ? (passCount / total) * circumference : 0;
  // fail arc starts where pass ends
  const failDash = total > 0 ? (failCount / total) * circumference : 0;
  const failOffset = -passDash;

  // rotate so the chart starts at the top
  const startRotation = -90;

  return (
    <View style={styles.wrapper}>
      {/* Donut */}
      <View style={{ position: "relative", width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation={startRotation} origin={`${cx},${cy}`}>
            {/* Track */}
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={TRACK_COLOR}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Fail arc (drawn first so pass sits on top) */}
            {failDash > 0 && (
              <Circle
                cx={cx}
                cy={cy}
                r={radius}
                stroke={FAIL_COLOR}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${failDash} ${circumference - failDash}`}
                strokeDashoffset={failOffset}
                strokeLinecap="round"
              />
            )}
            {/* Pass arc */}
            {passDash > 0 && (
              <Circle
                cx={cx}
                cy={cy}
                r={radius}
                stroke={PASS_COLOR}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${passDash} ${circumference - passDash}`}
                strokeDashoffset={0}
                strokeLinecap="round"
              />
            )}
          </G>
        </Svg>
        {/* Centre label */}
        <View style={[styles.centre, { width: size, height: size }]}>
          {total === 0 ? (
            <Text style={styles.centreNA}>N/A</Text>
          ) : (
            <>
              <Text style={[styles.centrePct, { color: PASS_COLOR }]}>
                {passRate}%
              </Text>
              <Text style={styles.centreLabel}>Pass</Text>
            </>
          )}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: PASS_COLOR }]} />
          <Text style={styles.legendText}>
            Passed: {passCount} ({passRate}%)
          </Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: FAIL_COLOR }]} />
          <Text style={styles.legendText}>
            Failed: {failCount} ({failRate}%)
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 10,
  },
  centre: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centrePct: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 26,
  },
  centreLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "600",
  },
  centreNA: {
    fontSize: 16,
    color: "#bbb",
    fontWeight: "700",
  },
  legend: {
    gap: 5,
    alignSelf: "stretch",
    paddingHorizontal: 4,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: "#555",
  },
});
