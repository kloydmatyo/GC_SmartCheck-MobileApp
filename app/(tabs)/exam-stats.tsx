import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

import ReportPdfViewer from "@/components/pdf/ReportPdfViewer";
import SendScoresModal from "@/components/scores/SendScoresModal";
import {
  DashboardDateFilter,
  DashboardService,
  ExamDashboardStats,
} from "@/services/dashboardService";
import {
  ExportDateFilter,
  ExportFormat,
  GradeExportService,
} from "@/services/gradeExportService";
import { ReportPdfService } from "@/services/reportPdfService";

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
        {
          width,
          height,
          backgroundColor: "#EDF1F5",
          borderRadius: 8,
        },
        style,
      ]}
    />
  );
}

function StatsSkeleton() {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={false}
    >
      <View style={styles.row}>
        {[0, 1].map((i) => (
          <View key={i} style={styles.card}>
            <SkeletonBox width={24} height={24} style={{ borderRadius: 12 }} />
            <SkeletonBox width={68} height={30} style={{ marginTop: 8 }} />
            <SkeletonBox width={90} height={12} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      <View style={styles.row}>
        {[0, 1].map((i) => (
          <View key={i} style={styles.card}>
            <SkeletonBox width={24} height={24} style={{ borderRadius: 12 }} />
            <SkeletonBox width={68} height={30} style={{ marginTop: 8 }} />
            <SkeletonBox width={96} height={12} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      <View style={styles.hiloBox}>
        {[0, 1].map((i) => (
          <View key={i} style={styles.hiloItem}>
            <SkeletonBox width={24} height={24} style={{ borderRadius: 12 }} />
            <SkeletonBox width={64} height={24} style={{ marginTop: 8 }} />
            <SkeletonBox width={90} height={12} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      <View style={styles.distBox}>
        <SkeletonBox width={150} height={18} style={{ marginBottom: 8 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.distRow, { marginBottom: 10 }]}>
            <SkeletonBox width={82} height={12} />
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <SkeletonBox width={`${68 - i * 8}%`} height={10} />
            </View>
            <SkeletonBox width={56} height={12} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const DATE_FILTERS: { label: string; value: DashboardDateFilter }[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
];

const BASE_GRADES: {
  label: string;
  key: keyof ExamDashboardStats["distribution"];
  color: string;
}[] = [
  { label: "A  >=90%", key: "A", color: "#20BE7B" },
  { label: "B  80-89%", key: "B", color: "#3B82F6" },
  { label: "C  70-79%", key: "C", color: "#F59E0B" },
  { label: "D  60-69%", key: "D", color: "#F97316" },
  { label: "F  <60%", key: "F", color: "#EF4444" },
];

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
  const [exporting, setExporting] = useState(false);
  const [exportStage, setExportStage] = useState("");
  const [exportPercent, setExportPercent] = useState(0);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportViewerVisible, setReportViewerVisible] = useState(false);
  const [reportHtml, setReportHtml] = useState("");
  const [reportViewerTitle, setReportViewerTitle] = useState("");
  const [sendScoresVisible, setSendScoresVisible] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  const title = examTitle
    ? decodeURIComponent(examTitle)
    : (stats?.examTitle ?? "Exam Stats");

  const grades =
    sortByCount && stats
      ? [...BASE_GRADES].sort(
          (a, b) => stats.distribution[b.key] - stats.distribution[a.key],
        )
      : BASE_GRADES;

  const handleExport = useCallback(() => {
    if (!examId || exporting) return;

    const filterLabel =
      dateFilter === "today"
        ? "Today's records"
        : dateFilter === "week"
          ? "This week's records"
          : "All records";

    Alert.alert("Export Grades", `Format? Exporting ${filterLabel}.`, [
      { text: "CSV", onPress: () => void doExport("csv") },
      { text: "Excel", onPress: () => void doExport("excel") },
      { text: "PDF", onPress: () => void doExport("pdf") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [dateFilter, examId, exporting]);

  const doExport = async (format: ExportFormat) => {
    setExporting(true);
    setExportStage("Starting export...");
    setExportPercent(0);

    try {
      const result = await GradeExportService.exportExamGrades(examId as string, {
        format,
        dateFilter: dateFilter as ExportDateFilter,
        onProgress: (stage, percent) => {
          setExportStage(stage);
          setExportPercent(percent);
        },
      });

      if (result.success) {
        Toast.show({
          type: "success",
          text1: "Export Complete",
          text2: `${result.recordCount ?? 0} records exported as ${format.toUpperCase()}.`,
          visibilityTime: 3500,
        });
      } else {
        Toast.show({
          type: "error",
          text1: "Export Failed",
          text2: result.message,
          visibilityTime: 4000,
        });
      }
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Export Error",
        text2: err.message ?? "Something went wrong.",
        visibilityTime: 4000,
      });
    } finally {
      setExporting(false);
      setExportStage("");
      setExportPercent(0);
    }
  };

  const handleGenerateReport = useCallback(async () => {
    if (!examId || reportGenerating) return;

    setReportGenerating(true);
    try {
      const result = await ReportPdfService.generateClassSummaryReport(
        examId as string,
      );

      if (result.success && result.previewHtml) {
        setReportViewerTitle(`${title} - Class Summary`);
        setReportHtml(result.previewHtml);
        setReportViewerVisible(true);
      } else {
        Toast.show({
          type: "error",
          text1: "Report Failed",
          text2: result.message,
          visibilityTime: 4000,
        });
      }
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Report Error",
        text2: err.message ?? "Something went wrong.",
        visibilityTime: 4000,
      });
    } finally {
      setReportGenerating(false);
    }
  }, [examId, reportGenerating, title]);

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
          setError(err.message || "Failed to load stats. Check your connection.");
          setLoading(false);
          setRefreshing(false);
        },
        dateFrom,
      );

      unsubscribeRef.current = unsub;
    },
    [dateFilter, examId],
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

  return (
    <View style={styles.container}>
      <ReportPdfViewer
        visible={reportViewerVisible}
        onClose={() => setReportViewerVisible(false)}
        html={reportHtml}
        title={reportViewerTitle}
        fileName="GC_ClassSummary"
      />

      <SendScoresModal
        visible={sendScoresVisible}
        onClose={() => setSendScoresVisible(false)}
        examId={examId as string}
        examLabel={title}
      />

      {exporting && (
        <View style={styles.exportOverlay}>
          <View style={styles.exportCard}>
            <ActivityIndicator size="large" color="#20BE7B" />
            <Text style={styles.exportStageText}>{exportStage}</Text>
            <View style={styles.exportBarBg}>
              <View
                style={[styles.exportBarFill, { width: `${exportPercent}%` }]}
              />
            </View>
            <Text style={styles.exportPercentText}>{exportPercent}%</Text>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => setSendScoresVisible(true)}
            style={styles.iconButton}
            disabled={!stats || stats.totalGraded === 0}
          >
            <Ionicons
              name="mail-outline"
              size={20}
              color={!stats || stats.totalGraded === 0 ? "#C7CDD6" : "#20BE7B"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleGenerateReport}
            style={styles.iconButton}
            disabled={reportGenerating || !stats || stats.totalGraded === 0}
          >
            {reportGenerating ? (
              <ActivityIndicator size="small" color="#20BE7B" />
            ) : (
              <Ionicons
                name="document-text-outline"
                size={20}
                color={!stats || stats.totalGraded === 0 ? "#C7CDD6" : "#20BE7B"}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleExport}
            style={styles.iconButton}
            disabled={exporting || !stats || stats.totalGraded === 0}
          >
            <Ionicons
              name={exporting ? "hourglass-outline" : "download-outline"}
              size={20}
              color={!stats || stats.totalGraded === 0 ? "#C7CDD6" : "#1F2937"}
            />
          </TouchableOpacity>
        </View>
      </View>

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

      {error && !loading ? (
        <View style={styles.errorCenter}>
          <Ionicons name="cloud-offline-outline" size={52} color="#EF4444" />
          <Text style={styles.errorTitle}>Could Not Load Stats</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => subscribe()}>
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <StatsSkeleton />
      ) : !stats || stats.totalGraded === 0 ? (
        <View style={styles.emptyCenter}>
          <Ionicons name="bar-chart-outline" size={52} color="#C7CDD6" />
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
              colors={["#20BE7B"]}
              tintColor="#20BE7B"
            />
          }
        >
          <View style={styles.row}>
            <View style={styles.card}>
              <Ionicons name="people-outline" size={22} color="#20BE7B" />
              <Text style={styles.cardValue}>{stats.totalGraded}</Text>
              <Text style={styles.cardLabel}>Total Graded</Text>
            </View>
            <View style={styles.card}>
              <Ionicons name="stats-chart-outline" size={22} color="#20BE7B" />
              <Text style={styles.cardValue}>{stats.classAverage}%</Text>
              <Text style={styles.cardLabel}>Class Average</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.card, styles.cardPass]}>
              <Ionicons name="checkmark-circle-outline" size={22} color="#20BE7B" />
              <Text style={styles.cardValue}>{stats.passCount}</Text>
              <Text style={styles.cardLabel}>Passed ({stats.passRate}%)</Text>
            </View>
            <View style={[styles.card, styles.cardFail]}>
              <Ionicons name="close-circle-outline" size={22} color="#EF4444" />
              <Text style={[styles.cardValue, { color: "#EF4444" }]}>
                {stats.failCount}
              </Text>
              <Text style={styles.cardLabel}>Failed ({100 - stats.passRate}%)</Text>
            </View>
          </View>

          <View style={styles.hiloBox}>
            <View style={styles.hiloItem}>
              <Ionicons name="arrow-up-circle-outline" size={22} color="#20BE7B" />
              <Text style={styles.hiloValue}>{stats.highestPercentage}%</Text>
              <Text style={styles.hiloLabel}>Highest Score</Text>
            </View>
            <View style={styles.hiloDivider} />
            <View style={styles.hiloItem}>
              <Ionicons name="arrow-down-circle-outline" size={22} color="#EF4444" />
              <Text style={[styles.hiloValue, { color: "#EF4444" }]}>
                {stats.lowestPercentage}%
              </Text>
              <Text style={styles.hiloLabel}>Lowest Score</Text>
            </View>
          </View>

          <View style={styles.distBox}>
            <View style={styles.distHeader}>
              <Text style={styles.distTitle}>Score Distribution</Text>
              <TouchableOpacity
                style={[
                  styles.sortToggle,
                  sortByCount && styles.sortToggleActive,
                ]}
                onPress={() => setSortByCount((value) => !value)}
              >
                <Ionicons
                  name="swap-vertical"
                  size={13}
                  color={sortByCount ? "#FFFFFF" : "#6B7280"}
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
              const maxCount = Math.max(dist.A, dist.B, dist.C, dist.D, dist.F, 1);

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
                    {dist[key]} ({total > 0 ? Math.round((dist[key] / total) * 100) : 0}%)
                  </Text>
                </View>
              ));
            })()}
          </View>

          <Text style={styles.updatedText}>
            Last updated:{" "}
            {stats.lastUpdated.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF2",
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
    marginHorizontal: 10,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF2",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D9E4DC",
    backgroundColor: "#FFFFFF",
  },
  filterChipActive: {
    backgroundColor: "#E9F8F1",
    borderColor: "#20BE7B",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  filterChipTextActive: {
    color: "#109B67",
  },
  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1F2937",
    marginTop: 8,
  },
  errorSubtitle: {
    fontSize: 13,
    color: "#8E97A6",
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#20BE7B",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  emptyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1F2937",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#8E97A6",
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    backgroundColor: "#FFFFFF",
  },
  cardPass: {
    borderColor: "#D9F1E4",
  },
  cardFail: {
    borderColor: "#F5D9DD",
  },
  cardValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1F2937",
  },
  cardLabel: {
    fontSize: 12,
    color: "#8E97A6",
    textAlign: "center",
  },
  hiloBox: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
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
    backgroundColor: "#E8EBF0",
    marginVertical: 10,
  },
  hiloValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1F2937",
  },
  hiloLabel: {
    fontSize: 12,
    color: "#8E97A6",
  },
  distBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
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
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
  },
  sortToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D9E4DC",
    backgroundColor: "#F7F8FA",
  },
  sortToggleActive: {
    backgroundColor: "#20BE7B",
    borderColor: "#20BE7B",
  },
  sortToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
  },
  sortToggleTextActive: {
    color: "#FFFFFF",
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  distLabel: {
    width: 82,
    fontSize: 11,
    color: "#6B7280",
  },
  distBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: "#EEF2F5",
    borderRadius: 5,
    overflow: "hidden",
  },
  distBarFill: {
    height: 10,
    borderRadius: 5,
  },
  distCount: {
    width: 58,
    textAlign: "right",
    fontSize: 11,
    color: "#6B7280",
  },
  updatedText: {
    fontSize: 11,
    color: "#98A2B3",
    textAlign: "center",
    marginTop: 4,
  },
  exportOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  exportCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 14,
    minWidth: 240,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  exportStageText: {
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    fontWeight: "600",
  },
  exportBarBg: {
    width: "100%",
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  exportBarFill: {
    height: 8,
    backgroundColor: "#20BE7B",
    borderRadius: 4,
  },
  exportPercentText: {
    fontSize: 12,
    color: "#20BE7B",
    fontWeight: "800",
  },
});
