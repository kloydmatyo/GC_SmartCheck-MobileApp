/**
 * GradeBarChart
 * A proper SVG-based horizontal bar chart for grade distribution.
 * Uses react-native-svg (already installed).
 *
 * Props:
 *   distribution  – { A, B, C, D, F } counts
 *   total         – total graded students (for percentage labels)
 *   sortByCount   – if true, bars are sorted descending by count
 *   width         – container width in dp (pass from onLayout)
 */

import { GradeDistribution } from "@/services/dashboardService";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { G, Rect, Svg, Text as SvgText } from "react-native-svg";

// ── Grade metadata ────────────────────────────────────────────────────────
const GRADE_META: {
  key: keyof GradeDistribution;
  label: string;
  color: string;
  range: string;
}[] = [
  { key: "A", label: "A", color: "#00a550", range: "≥90%" },
  { key: "B", label: "B", color: "#4a90e2", range: "80–89%" },
  { key: "C", label: "C", color: "#f5a623", range: "70–79%" },
  { key: "D", label: "D", color: "#e67e22", range: "60–69%" },
  { key: "F", label: "F", color: "#e74c3c", range: "<60%" },
];

// ── Layout constants ──────────────────────────────────────────────────────
const BAR_HEIGHT = 18;
const BAR_GAP = 14;
const LABEL_WIDTH = 52; // left label column
const VALUE_WIDTH = 54; // right value column
const CORNER_RADIUS = 4;

interface Props {
  distribution: GradeDistribution;
  total: number;
  sortByCount?: boolean;
  /** outer width of the card; obtained via onLayout */
  width: number;
}

export default function GradeBarChart({
  distribution,
  total,
  sortByCount = false,
  width,
}: Props) {
  // usable bar area
  const barAreaWidth = Math.max(width - LABEL_WIDTH - VALUE_WIDTH - 32, 40);

  // optionally sort
  const entries = sortByCount
    ? [...GRADE_META].sort((a, b) => distribution[b.key] - distribution[a.key])
    : GRADE_META;

  const maxCount = Math.max(...entries.map((e) => distribution[e.key]), 1);
  const svgHeight = entries.length * (BAR_HEIGHT + BAR_GAP) + 4;

  return (
    <View style={styles.wrapper}>
      {/* Legend row */}
      <View style={styles.legend}>
        {GRADE_META.map(({ key, label, color, range }) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>
              {label} {range}
            </Text>
          </View>
        ))}
      </View>

      {/* Bars */}
      <View style={styles.chartRow}>
        {/* Left labels */}
        <View style={{ width: LABEL_WIDTH }}>
          {entries.map(({ key, label, color }) => (
            <View
              key={key}
              style={[styles.gradeLabel, { height: BAR_HEIGHT + BAR_GAP }]}
            >
              <View style={[styles.gradeBadge, { backgroundColor: color }]}>
                <Text style={styles.gradeBadgeText}>{label}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* SVG bars */}
        <Svg width={barAreaWidth} height={svgHeight}>
          {entries.map(({ key, color }, idx) => {
            const count = distribution[key];
            const fillWidth =
              maxCount > 0
                ? Math.max((count / maxCount) * barAreaWidth, count > 0 ? 6 : 0)
                : 0;
            const y = idx * (BAR_HEIGHT + BAR_GAP) + BAR_GAP / 2;
            return (
              <G key={key}>
                {/* Track */}
                <Rect
                  x={0}
                  y={y}
                  width={barAreaWidth}
                  height={BAR_HEIGHT}
                  rx={CORNER_RADIUS}
                  ry={CORNER_RADIUS}
                  fill="#e0d8c0"
                />
                {/* Fill */}
                {fillWidth > 0 && (
                  <Rect
                    x={0}
                    y={y}
                    width={fillWidth}
                    height={BAR_HEIGHT}
                    rx={CORNER_RADIUS}
                    ry={CORNER_RADIUS}
                    fill={color}
                  />
                )}
                {/* Inline count label (shown if bar is wide enough) */}
                {fillWidth > 26 && (
                  <SvgText
                    x={fillWidth - 6}
                    y={y + BAR_HEIGHT / 2 + 4}
                    fontSize={10}
                    fontWeight="700"
                    fill="#fff"
                    textAnchor="end"
                  >
                    {count}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>

        {/* Right value labels */}
        <View style={{ width: VALUE_WIDTH }}>
          {entries.map(({ key }) => {
            const count = distribution[key];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <View
                key={key}
                style={[styles.valueLabel, { height: BAR_HEIGHT + BAR_GAP }]}
              >
                <Text style={styles.valueLabelText}>
                  {count} ({pct}%)
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  // legend
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: "#666",
  },
  // chart layout
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  gradeLabel: {
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 4,
  },
  gradeBadge: {
    width: 24,
    height: 20,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  valueLabel: {
    justifyContent: "center",
    paddingLeft: 6,
  },
  valueLabelText: {
    fontSize: 10,
    color: "#555",
  },
});
