import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { QueryDocumentSnapshot } from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import GradeBarChart from "@/components/ui/GradeBarChart";
import PassFailDonut from "@/components/ui/PassFailDonut";
import {
  DashboardDateFilter,
  DashboardService,
  ExamDashboardStats,
  ScanResultRow,
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
      {/* Donut skeleton */}
      <View style={styles.donutBox}>
        <SkeletonBox
          width={120}
          height={120}
          style={{ borderRadius: 60, alignSelf: "center" }}
        />
        <SkeletonBox
          width={100}
          height={10}
          style={{ marginTop: 10, alignSelf: "center" }}
        />
        <SkeletonBox
          width={80}
          height={10}
          style={{ marginTop: 6, alignSelf: "center" }}
        />
      </View>
    </ScrollView>
  );
}

// ── Grade colour helper ──────────────────────────────────────────────────
function gradeColor(grade: string): string {
  switch (grade) {
    case "A":
      return "#00a550";
    case "B":
      return "#4a90e2";
    case "C":
      return "#f0a500";
    case "D":
      return "#e07030";
    case "F":
    default:
      return "#e74c3c";
  }
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
  const [chartType, setChartType] = useState<"bar" | "donut">("bar");
  const [chartWidth, setChartWidth] = useState(320);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ── Paginated scan results state ─────────────────────────────────────────
  const [scanResults, setScanResults] = useState<ScanResultRow[]>([]);
  const [lastDocSnapshot, setLastDocSnapshot] =
    useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const onChartLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setChartWidth(w);
  }, []);

  // ── Derive a Date lower-bound from the active filter ───────────────────────
  const getDateFrom = useCallback((): Date | undefined => {
    if (dateFilter === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (dateFilter === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d;
    }
    return undefined;
  }, [dateFilter]);

  // ── Paginated scan results loader ───────────────────────────────────────
  const loadInitialResults = useCallback(async () => {
    if (!examId) return;
    try {
      const paged = await DashboardService.getPagedResults(
        examId as string,
        null,
        getDateFrom(),
      );
      setScanResults(paged.items);
      setLastDocSnapshot(paged.lastDoc);
      setHasMore(paged.hasMore);
    } catch {
      // non-blocking
    }
  }, [examId, getDateFrom]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !examId) return;
    setLoadingMore(true);
    try {
      const paged = await DashboardService.getPagedResults(
        examId as string,
        lastDocSnapshot,
        getDateFrom(),
      );
      setScanResults((prev) => [...prev, ...paged.items]);
      setLastDocSnapshot(paged.lastDoc);
      setHasMore(paged.hasMore);
    } catch {
      // non-blocking
    } finally {
      setLoadingMore(false);
    }
  }, [examId, getDateFrom, hasMore, loadingMore, lastDocSnapshot]);

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

  // Reset and reload paginated results whenever exam or date filter changes
  useEffect(() => {
    setScanResults([]);
    setLastDocSnapshot(null);
    setHasMore(false);
    setLoadingMore(false);
    if (!examId) return;
    loadInitialResults();
  }, [examId, dateFilter, loadInitialResults]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setScanResults([]);
    setLastDocSnapshot(null);
    setHasMore(false);
    subscribe(true);
    loadInitialResults();
  }, [subscribe, loadInitialResults]);

  const title = examTitle
    ? decodeURIComponent(examTitle)
    : (stats?.examTitle ?? "Exam Stats");

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

          {/* Chart section */}
          <View style={styles.distBox} onLayout={onChartLayout}>
            {/* Header row: title + chart-type toggle + sort toggle */}
            <View style={styles.distHeader}>
              <Text style={styles.distTitle}>Score Distribution</Text>
              <View style={styles.headerControls}>
                {/* Chart type pills */}
                <View style={styles.chartTypePills}>
                  <TouchableOpacity
                    style={[
                      styles.chartTypePill,
                      chartType === "bar" && styles.chartTypePillActive,
                    ]}
                    onPress={() => setChartType("bar")}
                  >
                    <Ionicons
                      name="bar-chart"
                      size={12}
                      color={chartType === "bar" ? "#fff" : "#555"}
                    />
                    <Text
                      style={[
                        styles.chartTypePillText,
                        chartType === "bar" && styles.chartTypePillTextActive,
                      ]}
                    >
                      Bar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.chartTypePill,
                      chartType === "donut" && styles.chartTypePillActive,
                    ]}
                    onPress={() => setChartType("donut")}
                  >
                    <Ionicons
                      name="pie-chart"
                      size={12}
                      color={chartType === "donut" ? "#fff" : "#555"}
                    />
                    <Text
                      style={[
                        styles.chartTypePillText,
                        chartType === "donut" && styles.chartTypePillTextActive,
                      ]}
                    >
                      Donut
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Sort toggle (bar chart only) */}
                {chartType === "bar" && (
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
                      {sortByCount ? "Sorted" : "Sort"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Bar chart */}
            {chartType === "bar" && (
              <GradeBarChart
                distribution={stats.distribution}
                total={stats.totalGraded}
                sortByCount={sortByCount}
                width={chartWidth - 32}
              />
            )}

            {/* Donut chart — pass/fail ratio */}
            {chartType === "donut" && (
              <View style={styles.donutInner}>
                <PassFailDonut
                  passCount={stats.passCount}
                  failCount={stats.failCount}
                  size={140}
                />
              </View>
            )}
          </View>

          {/* Last updated */}
          <Text style={styles.updatedText}>
            Last updated:{" "}
            {stats.lastUpdated.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>

          {/* Individual Scan Results with pagination */}
          <View style={styles.resultsSection}>
            <Text style={styles.resultsSectionTitle}>Individual Results</Text>
            {scanResults.length === 0 ? (
              <Text style={styles.resultsEmpty}>
                No individual results available.
              </Text>
            ) : (
              <>
                {scanResults.map((row, i) => (
                  <View key={row.docId || String(i)} style={styles.resultItem}>
                    <View style={styles.resultLeft}>
                      <Text style={styles.resultStudentId}>
                        {row.studentId || "—"}
                      </Text>
                      <Text style={styles.resultDate}>
                        {row.dateScanned
                          ? new Date(row.dateScanned).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" },
                            )
                          : "—"}
                      </Text>
                    </View>
                    <View style={styles.resultRight}>
                      <Text style={styles.resultScore}>
                        {row.score}/{row.totalPoints}
                      </Text>
                      <Text style={styles.resultPct}>{row.percentage}%</Text>
                      <View
                        style={[
                          styles.resultGradeBadge,
                          {
                            backgroundColor: gradeColor(row.gradeEquivalent),
                          },
                        ]}
                      >
                        <Text style={styles.resultGradeText}>
                          {row.gradeEquivalent}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
                {hasMore && (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.loadMoreText}>Load More</Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

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
  donutBox: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d4c5a0",
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  donutInner: {
    alignItems: "center",
    paddingVertical: 8,
  },
  distHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
    flexWrap: "wrap",
    gap: 6,
  },
  distTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  chartTypePills: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#b8b0a0",
    overflow: "hidden",
  },
  chartTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "#ede8da",
  },
  chartTypePillActive: {
    backgroundColor: "#24362f",
  },
  chartTypePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#555",
  },
  chartTypePillTextActive: {
    color: "#fff",
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
  // ── Individual results & pagination ──────────────────────────────────────────────
  resultsSection: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d4c5a0",
    padding: 16,
    gap: 8,
  },
  resultsSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  resultsEmpty: {
    fontSize: 13,
    color: "#aaa",
    textAlign: "center",
    paddingVertical: 12,
  },
  resultItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e8e0c8",
  },
  resultLeft: {
    flex: 1,
    gap: 2,
  },
  resultStudentId: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  resultDate: {
    fontSize: 11,
    color: "#888",
  },
  resultRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultScore: {
    fontSize: 12,
    color: "#555",
  },
  resultPct: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    minWidth: 40,
    textAlign: "right",
  },
  resultGradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resultGradeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  loadMoreBtn: {
    backgroundColor: "#24362f",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  loadMoreText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
