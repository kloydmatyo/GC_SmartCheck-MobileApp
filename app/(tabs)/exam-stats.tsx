import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  DashboardDateFilter,
  DashboardService,
  ExamDashboardStats,
} from "@/services/dashboardService";

// ── Skeleton placeholder block ────────────────────────────────────────────
function SkeletonBox({
  width,
  height,
  style,
}: {
  width: number | string;
  height: number;
  style?: object;
}) {
  return (
    <View
      style={[
        { width, height, backgroundColor: "#ddd8c8", borderRadius: 6 },
        style,
      ]}
    />
  );
}

// ── Skeleton layout matching the real content ────────────────────────────
function StatsSkeleton() {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={false}
    >
      {/* Cards row 1 */}
      <View style={styles.row}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.card, styles.cardGreen]}>
            <SkeletonBox width={22} height={22} style={{ borderRadius: 11 }} />
            <SkeletonBox width={56} height={28} style={{ marginTop: 6 }} />
            <SkeletonBox width={72} height={12} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
      {/* Cards row 2 */}
      <View style={styles.row}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.card, styles.cardGreen]}>
            <SkeletonBox width={22} height={22} style={{ borderRadius: 11 }} />
            <SkeletonBox width={48} height={28} style={{ marginTop: 6 }} />
            <SkeletonBox width={88} height={12} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
      {/* Hi/Lo box */}
      <View style={styles.hiloBox}>
        {[0, 1].map((i) => (
          <View key={i} style={styles.hiloItem}>
            <SkeletonBox width={22} height={22} style={{ borderRadius: 11 }} />
            <SkeletonBox width={56} height={24} style={{ marginTop: 6 }} />
            <SkeletonBox width={80} height={12} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
      {/* Distribution box */}
      <View style={styles.distBox}>
        <SkeletonBox width={140} height={16} style={{ marginBottom: 12 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.distRow, { marginBottom: 10 }]}>
            <SkeletonBox width={78} height={10} />
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <SkeletonBox width={`${60 - i * 8}%`} height={10} />
            </View>
            <SkeletonBox width={54} height={10} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Date-filter chip options ─────────────────────────────────────────────
const DATE_FILTERS: { label: string; value: DashboardDateFilter }[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
];

// ── Main screen ───────────────────────────────────────────────────────────
export default function ExamStatsScreen() {
  const router = useRouter();
  const { examId, examTitle } = useLocalSearchParams<{
    examId: string;
    examTitle: string;
  }>();

  const [stats, setStats] = useState<ExamDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>("all");
  const [sortByCount, setSortByCount] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const subscribe = useCallback(
    (isRefresh = false) => {
      unsubscribeRef.current?.();
      if (!isRefresh) setLoading(true);
      setError(null);

      const dateFrom =
        dateFilter === "today"
          ? (() => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              return d;
            })()
          : dateFilter === "week"
            ? (() => {
                const d = new Date();
                d.setDate(d.getDate() - 7);
                return d;
              })()
            : undefined;

      const unsub = DashboardService.subscribeExamStats(
        examId as string,
        (newStats) => {
          setStats(newStats);
          setLoading(false);
          setRefreshing(false);
        },
        (err) => {
          setError(
            err.message || "Failed to load stats. Check your connection.",
          );
          setLoading(false);
          setRefreshing(false);
        },
        dateFrom,
      );
      unsubscribeRef.current = unsub;
    },
    [examId, dateFilter],
  );

  useEffect(() => {
    if (!examId) return;
    subscribe();
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [examId, dateFilter, subscribe]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    subscribe(true);
  }, [subscribe]);

  const title = examTitle
    ? decodeURIComponent(examTitle)
    : (stats?.examTitle ?? "Exam Stats");

  // Grade definitions — may be reordered by sort toggle
  const BASE_GRADES: {
    label: string;
    key: keyof NonNullable<typeof stats>["distribution"];
    color: string;
  }[] = [
    { label: "A  ≥90%", key: "A", color: "#00a550" },
    { label: "B  80–89%", key: "B", color: "#4a90e2" },
    { label: "C  70–79%", key: "C", color: "#f5a623" },
    { label: "D  60–69%", key: "D", color: "#e67e22" },
    { label: "F  <60%", key: "F", color: "#e74c3c" },
  ];

  const grades =
    sortByCount && stats
      ? [...BASE_GRADES].sort(
          (a, b) => stats.distribution[b.key] - stats.distribution[a.key],
        )
      : BASE_GRADES;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#24362f" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Date filter chips */}
      <View style={styles.filterRow}>
        {DATE_FILTERS.map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.filterChip,
              dateFilter === value && styles.filterChipActive,
            ]}
            onPress={() => setDateFilter(value)}
          >
            <Text
              style={[
                styles.filterChipText,
                dateFilter === value && styles.filterChipTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error fallback */}
      {error && !loading ? (
        <View style={styles.errorCenter}>
          <Ionicons name="cloud-offline-outline" size={52} color="#e74c3c" />
          <Text style={styles.errorTitle}>Could Not Load Stats</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => subscribe()}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <StatsSkeleton />
      ) : !stats || stats.totalGraded === 0 ? (
        <View style={styles.emptyCenter}>
          <Ionicons name="bar-chart-outline" size={52} color="#ccc" />
          <Text style={styles.emptyTitle}>No Results Yet</Text>
          <Text style={styles.emptySubtitle}>
            {dateFilter !== "all"
              ? "No scans found for this date range."
              : "Scan answer sheets for this exam to see performance metrics."}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#00a550"]}
              tintColor="#00a550"
            />
          }
        >
          {/* Summary Cards Row 1 */}
          <View style={styles.row}>
            <View style={[styles.card, styles.cardGreen]}>
              <Ionicons name="people" size={22} color="#00a550" />
              <Text style={styles.cardValue}>{stats.totalGraded}</Text>
              <Text style={styles.cardLabel}>Total Graded</Text>
            </View>
            <View style={[styles.card, styles.cardGreen]}>
              <Ionicons name="stats-chart" size={22} color="#00a550" />
              <Text style={styles.cardValue}>{stats.classAverage}%</Text>
              <Text style={styles.cardLabel}>Class Average</Text>
            </View>
          </View>

          {/* Summary Cards Row 2 */}
          <View style={styles.row}>
            <View style={[styles.card, styles.cardPass]}>
              <Ionicons name="checkmark-circle" size={22} color="#00a550" />
              <Text style={styles.cardValue}>{stats.passCount}</Text>
              <Text style={styles.cardLabel}>Passed ({stats.passRate}%)</Text>
            </View>
            <View style={[styles.card, styles.cardFail]}>
              <Ionicons name="close-circle" size={22} color="#e74c3c" />
              <Text style={[styles.cardValue, { color: "#e74c3c" }]}>
                {stats.failCount}
              </Text>
              <Text style={styles.cardLabel}>
                Failed ({100 - stats.passRate}%)
              </Text>
            </View>
          </View>

          {/* Highest / Lowest */}
          <View style={styles.hiloBox}>
            <View style={styles.hiloItem}>
              <Ionicons name="arrow-up-circle" size={22} color="#00a550" />
              <Text style={styles.hiloValue}>{stats.highestPercentage}%</Text>
              <Text style={styles.hiloLabel}>Highest Score</Text>
            </View>
            <View style={styles.hiloDivider} />
            <View style={styles.hiloItem}>
              <Ionicons name="arrow-down-circle" size={22} color="#e74c3c" />
              <Text style={[styles.hiloValue, { color: "#e74c3c" }]}>
                {stats.lowestPercentage}%
              </Text>
              <Text style={styles.hiloLabel}>Lowest Score</Text>
            </View>
          </View>

          {/* Distribution Chart */}
          <View style={styles.distBox}>
            <View style={styles.distHeader}>
              <Text style={styles.distTitle}>Score Distribution</Text>
              {/* Sort toggle */}
              <TouchableOpacity
                style={[
                  styles.sortToggle,
                  sortByCount && styles.sortToggleActive,
                ]}
                onPress={() => setSortByCount((v) => !v)}
              >
                <Ionicons
                  name="swap-vertical"
                  size={13}
                  color={sortByCount ? "#fff" : "#555"}
                />
                <Text
                  style={[
                    styles.sortToggleText,
                    sortByCount && styles.sortToggleTextActive,
                  ]}
                >
                  {sortByCount ? "Sorted by count" : "Sort by count"}
                </Text>
              </TouchableOpacity>
            </View>
            {(() => {
              const dist = stats.distribution;
              const total = stats.totalGraded;
              const maxCount = Math.max(
                dist.A,
                dist.B,
                dist.C,
                dist.D,
                dist.F,
                1,
              );
              return grades.map(({ label, key, color }) => (
                <View key={key} style={styles.distRow}>
                  <Text style={styles.distLabel}>{label}</Text>
                  <View style={styles.distBarBg}>
                    <View
                      style={[
                        styles.distBarFill,
                        {
                          width: `${Math.round((dist[key] / maxCount) * 100)}%`,
                          backgroundColor: color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.distCount}>
                    {dist[key]} (
                    {total > 0 ? Math.round((dist[key] / total) * 100) : 0}%)
                  </Text>
                </View>
              ));
            })()}
          </View>

          {/* Last updated */}
          <Text style={styles.updatedText}>
            Last updated:{" "}
            {stats.lastUpdated.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backBtn: {
    padding: 4,
    width: 36,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#24362f",
    textAlign: "center",
  },
  // ── Date filter chips ────────────────────────────────────────────────────
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#ebebeb",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#c8c0a8",
    backgroundColor: "#f5f2eb",
  },
  filterChipActive: {
    backgroundColor: "#24362f",
    borderColor: "#24362f",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#555",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  // ── Error state ──────────────────────────────────────────────────────────
  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#444",
    marginTop: 8,
  },
  errorSubtitle: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#24362f",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  // ── Empty state ──────────────────────────────────────────────────────────
  emptyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#999",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#bbb",
    textAlign: "center",
  },
  // ── Scroll content ───────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 2,
  },
  cardGreen: {
    backgroundColor: "#f0ead6",
    borderColor: "#d4c5a0",
  },
  cardPass: {
    backgroundColor: "#e8f5ee",
    borderColor: "#a8d8b9",
  },
  cardFail: {
    backgroundColor: "#fdf0f0",
    borderColor: "#f0b8b8",
  },
  cardValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  cardLabel: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  hiloBox: {
    flexDirection: "row",
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d4c5a0",
    overflow: "hidden",
  },
  hiloItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    gap: 4,
  },
  hiloDivider: {
    width: 1,
    backgroundColor: "#d4c5a0",
    marginVertical: 10,
  },
  hiloValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  hiloLabel: {
    fontSize: 12,
    color: "#666",
  },
  // ── Distribution chart ───────────────────────────────────────────────────
  distBox: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d4c5a0",
    padding: 16,
    gap: 10,
  },
  distHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  distTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  sortToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#b8b0a0",
    backgroundColor: "#ede8da",
  },
  sortToggleActive: {
    backgroundColor: "#24362f",
    borderColor: "#24362f",
  },
  sortToggleText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#555",
  },
  sortToggleTextActive: {
    color: "#fff",
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  distLabel: {
    fontSize: 11,
    color: "#555",
    width: 78,
  },
  distBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: "#e0d8c0",
    borderRadius: 5,
    overflow: "hidden",
  },
  distBarFill: {
    height: 10,
    borderRadius: 5,
  },
  distCount: {
    fontSize: 11,
    color: "#555",
    width: 58,
    textAlign: "right",
  },
  updatedText: {
    fontSize: 11,
    color: "#aaa",
    textAlign: "center",
    marginTop: 4,
  },
});
