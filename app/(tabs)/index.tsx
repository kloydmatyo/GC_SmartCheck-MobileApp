import { auth, db } from "@/config/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

import HistoryList from "@/components/scanner/HistoryList";
import ScannerScreen from "@/components/scanner/ScannerScreen";
import {
    DashboardService,
    HomeDashboardStats,
} from "@/services/dashboardService";

interface RecentExam {
  id: string;
  title: string;
  subject: string;
  date: string;
  papers: number | null;
  status: string;
}

export default function HomeScreen() {
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const router = useRouter();
  const [userName, setUserName] = useState("Faculty");
  const [stats, setStats] = useState<HomeDashboardStats>({
    scannedToday: 0,
    avgScoreToday: 0,
    passRateToday: 0,
    totalAllTime: 0,
    totalStudentsGraded: 0,
    highestScore: 0,
    lowestScore: 0,
    distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
  });
  const [recentExams, setRecentExams] = useState<RecentExam[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingExams, setLoadingExams] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [examsError, setExamsError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ── Resolve faculty full name from Firestore ──────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserName(
            data.fullName ??
              user.displayName ??
              user.email?.split("@")[0] ??
              "Faculty",
          );
        } else {
          setUserName(
            user.displayName ?? user.email?.split("@")[0] ?? "Faculty",
          );
        }
      } catch {
        setUserName(user.displayName ?? user.email?.split("@")[0] ?? "Faculty");
      }
    });
    return unsubscribe;
  }, []);

  // ── Real-time home dashboard stats via onSnapshot ─────────────────────
  const subscribeStats = useCallback(() => {
    // Clean up previous listener
    unsubscribeRef.current?.();
    setLoadingStats(true);
    setStatsError(null);

    const unsubscribe = DashboardService.subscribeHomeStats(
      (newStats) => {
        setStats(newStats);
        setLoadingStats(false);
        setRefreshing(false);
      },
      (err) => {
        setStatsError(err.message || "Failed to load stats.");
        setLoadingStats(false);
        setRefreshing(false);
      },
    );
    unsubscribeRef.current = unsubscribe;
  }, []);

  // ── Load recent exams from Firestore (this instructor only) ───────────
  const loadRecentExams = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoadingExams(false);
      return;
    }
    setLoadingExams(true);
    setExamsError(null);
    try {
      const q = query(
        collection(db, "exams"),
        where("createdBy", "==", uid),
        orderBy("created_at", "desc"),
      );
      const snap = await getDocs(q);
      const exams: RecentExam[] = snap.docs.slice(0, 5).map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title ?? "Untitled Exam",
          subject: data.subject ?? data.course_subject ?? "—",
          date: data.created_at
            ? new Date(data.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—",
          papers: data.scanned_papers ?? null,
          status: data.status ?? "Draft",
        };
      });
      setRecentExams(exams);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load exams.";
      setExamsError(msg);
    } finally {
      setLoadingExams(false);
      setRefreshing(false);
    }
  }, []);
  // ── Pull-to-refresh handler ──────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    subscribeStats();
    loadRecentExams();
  }, [subscribeStats, loadRecentExams]);
  // ── Subscribe on focus, unsubscribe on blur ───────────────────────────
  useFocusEffect(
    useCallback(() => {
      subscribeStats();
      loadRecentExams();
      return () => {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
      };
    }, [subscribeStats, loadRecentExams]),
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "#00a550";
      case "Completed":
        return "#4a90e2";
      case "Upcoming":
        return "#e74c3c";
      case "Scheduled":
        return "#ff9800";
      case "Draft":
        return "#9e9e9e";
      default:
        return "#666";
    }
  };

  if (showScanner) {
    return <ScannerScreen onClose={() => setShowScanner(false)} />;
  }

  if (showHistory) {
    return <HistoryList onClose={() => setShowHistory(false)} />;
  }
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require("@/assets/images/gordon-college-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>GCSC</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={18} color="#24362f" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="person-circle-outline" size={18} color="#24362f" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
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
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome back, {userName}.</Text>
          <Text style={styles.subtitleText}>Ready to grade some papers?</Text>
        </View>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => setShowScanner(true)}
        >
          <Ionicons name="document-text-outline" size={20} color="#fff" />
          <Text style={styles.scanButtonText}>Start Scanning Papers</Text>
        </TouchableOpacity>

        {/* Stats error banner */}
        {statsError && !loadingStats && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#e74c3c" />
            <Text style={styles.errorBannerText} numberOfLines={2}>
              {statsError}
            </Text>
            <TouchableOpacity onPress={subscribeStats}>
              <Text style={styles.errorRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Stats Grid — 2x2 */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons
              name="checkmark-circle"
              size={24}
              color="#00a550"
              style={styles.statIcon}
            />
            {loadingStats ? (
              <View style={styles.skeletonValue} />
            ) : (
              <Text style={styles.statValue}>{stats.scannedToday}</Text>
            )}
            <Text style={styles.statLabel}>Scanned Today</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="people"
              size={24}
              color="#00a550"
              style={styles.statIcon}
            />
            {loadingStats ? (
              <View style={styles.skeletonValue} />
            ) : (
              <Text style={styles.statValue}>{stats.totalStudentsGraded}</Text>
            )}
            <Text style={styles.statLabel}>Total Graded</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="stats-chart"
              size={24}
              color="#00a550"
              style={styles.statIcon}
            />
            {loadingStats ? (
              <View style={styles.skeletonValue} />
            ) : (
              <Text style={styles.statValue}>{stats.avgScoreToday}%</Text>
            )}
            <Text style={styles.statLabel}>Avg Score</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="trending-up"
              size={24}
              color="#00a550"
              style={styles.statIcon}
            />
            {loadingStats ? (
              <View style={styles.skeletonValue} />
            ) : (
              <Text style={styles.statValue}>{stats.passRateToday}%</Text>
            )}
            <Text style={styles.statLabel}>Pass Rate</Text>
          </View>
        </View>

        {/* Highest / Lowest Score */}
        {!loadingStats && stats.totalStudentsGraded > 0 && (
          <View style={styles.hiloRow}>
            <View style={styles.hiloCard}>
              <Ionicons name="arrow-up-circle" size={20} color="#00a550" />
              <Text style={styles.hiloValue}>{stats.highestScore}%</Text>
              <Text style={styles.hiloLabel}>Highest Score</Text>
            </View>
            <View style={styles.hiloDivider} />
            <View style={styles.hiloCard}>
              <Ionicons name="arrow-down-circle" size={20} color="#e74c3c" />
              <Text style={[styles.hiloValue, { color: "#e74c3c" }]}>
                {stats.lowestScore}%
              </Text>
              <Text style={styles.hiloLabel}>Lowest Score</Text>
            </View>
          </View>
        )}

        {/* Score Distribution Summary */}
        {!loadingStats &&
          stats.totalStudentsGraded > 0 &&
          (() => {
            const dist = stats.distribution;
            const total = stats.totalStudentsGraded;
            const maxCount = Math.max(
              dist.A,
              dist.B,
              dist.C,
              dist.D,
              dist.F,
              1,
            );
            const grades: {
              label: string;
              key: keyof typeof dist;
              color: string;
            }[] = [
              { label: "A (≥90%)", key: "A", color: "#00a550" },
              { label: "B (80–89%)", key: "B", color: "#4a90e2" },
              { label: "C (70–79%)", key: "C", color: "#f5a623" },
              { label: "D (60–69%)", key: "D", color: "#e67e22" },
              { label: "F (<60%)", key: "F", color: "#e74c3c" },
            ];
            return (
              <View style={styles.distSection}>
                <Text style={styles.distTitle}>Score Distribution</Text>
                {grades.map(({ label, key, color }) => (
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
                ))}
              </View>
            );
          })()}

        {/* Recent Exams Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Exams</Text>
          <TouchableOpacity>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.examsContainer}>
          {loadingExams ? (
            // Skeleton placeholders for exam cards
            <View style={{ gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.examCardSkeleton}>
                  <View style={styles.skeletonTitle} />
                  <View style={styles.skeletonSubject} />
                  <View style={styles.skeletonMeta} />
                </View>
              ))}
            </View>
          ) : examsError ? (
            <View style={styles.examsErrorState}>
              <Ionicons
                name="cloud-offline-outline"
                size={36}
                color="#e74c3c"
              />
              <Text style={styles.examsErrorText}>{examsError}</Text>
              <TouchableOpacity
                style={styles.examsRetryBtn}
                onPress={loadRecentExams}
              >
                <Ionicons name="refresh" size={14} color="#fff" />
                <Text style={styles.examsRetryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : recentExams.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={40} color="#ccc" />
              <Text style={styles.emptyStateText}>No exams yet</Text>
              <Text style={styles.emptyStateSubText}>
                Create a quiz and start scanning
              </Text>
            </View>
          ) : (
            recentExams.map((exam) => (
              <TouchableOpacity
                key={exam.id}
                style={styles.examCard}
                onPress={() =>
                  router.push(
                    `/(tabs)/exam-stats?examId=${exam.id}&examTitle=${encodeURIComponent(exam.title)}` as any,
                  )
                }
              >
                <View style={styles.examHeader}>
                  <Text style={styles.examTitle}>{exam.title}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(exam.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>{exam.status}</Text>
                  </View>
                </View>
                <Text style={styles.examSubject}>{exam.subject}</Text>
                <View style={styles.examFooter}>
                  <View style={styles.examInfo}>
                    <Ionicons name="calendar-outline" size={14} color="#666" />
                    <Text style={styles.examInfoText}>{exam.date}</Text>
                  </View>
                  <View style={styles.examInfo}>
                    <Ionicons name="document-outline" size={14} color="#666" />
                    <Text style={styles.examInfoText}>
                      {exam.papers ? `${exam.papers} Papers` : "-- Papers"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* New History Button */}
        <TouchableOpacity
          style={styles.newQuizButton}
          onPress={() => setShowHistory(true)}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.newQuizButtonText}>History</Text>
        </TouchableOpacity>

        {/* New Quiz Button */}
        <TouchableOpacity
          style={styles.newQuizButton}
          onPress={() => router.push("/(tabs)/generator")}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.newQuizButtonText}>New Quiz</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef1ef",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
    elevation: 2,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 30,
    height: 30,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#24362f",
  },
  headerRight: {
    flexDirection: "row",
    gap: 12,
  },
  iconButton: {
    padding: 6,
  },
  content: {
    flex: 1,
  },
  welcomeSection: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#2a3b33",
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 15,
    color: "#6c7d74",
  },
  scanButton: {
    flexDirection: "row",
    backgroundColor: "#3d5a3d",
    marginHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    elevation: 3,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    width: "47%",
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#8cb09a",
    elevation: 2,
  },
  statIcon: {
    marginBottom: 6,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2f6a50",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: "#435950",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#24362f",
  },
  viewAllText: {
    fontSize: 15,
    color: "#24362f",
    fontWeight: "700",
  },
  examsContainer: {
    paddingHorizontal: 10,
    gap: 8,
  },
  examCard: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#5d6c62",
    overflow: "hidden",
  },
  examHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  examTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#333",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  examSubject: {
    fontSize: 13,
    color: "#4e6057",
    marginBottom: 8,
  },
  examFooter: {
    flexDirection: "row",
    gap: 16,
  },
  examInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  examInfoText: {
    fontSize: 12,
    color: "#666",
  },
  examBottomAccent: {
    height: 4,
    backgroundColor: "#2f8a74",
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  newQuizButton: {
    flexDirection: "row",
    backgroundColor: "#2f8a74",
    alignSelf: "flex-end",
    marginRight: 10,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    elevation: 3,
  },
  newQuizButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  hiloRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d4c5a0",
    overflow: "hidden",
  },
  hiloCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    gap: 4,
  },
  hiloDivider: {
    width: 1,
    backgroundColor: "#d4c5a0",
    marginVertical: 10,
  },
  hiloValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
  },
  hiloLabel: {
    fontSize: 12,
    color: "#666",
  },
  distSection: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d4c5a0",
    padding: 14,
  },
  distTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 10,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  distLabel: {
    fontSize: 11,
    color: "#555",
    width: 72,
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
    width: 56,
    textAlign: "right",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
    marginTop: 12,
  },
  emptyStateSubText: {
    fontSize: 13,
    color: "#bbb",
    marginTop: 4,
  },
  // ── Error banner (stats) ────────────────────────────────────────────────
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff3f3",
    borderWidth: 1,
    borderColor: "#f0b8b8",
    borderRadius: 10,
    marginHorizontal: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#c0392b",
  },
  errorRetryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#24362f",
  },
  // ── Skeleton values inside stat cards ────────────────────────────────────
  skeletonValue: {
    width: 52,
    height: 26,
    backgroundColor: "#d0d8d4",
    borderRadius: 5,
    marginBottom: 2,
  },
  // ── Exam card skeletons ─────────────────────────────────────────────────
  examCardSkeleton: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#5d6c62",
    gap: 8,
  },
  skeletonTitle: {
    width: "60%",
    height: 16,
    backgroundColor: "#ddd8c8",
    borderRadius: 5,
  },
  skeletonSubject: {
    width: "40%",
    height: 12,
    backgroundColor: "#e5e0d0",
    borderRadius: 5,
  },
  skeletonMeta: {
    width: "30%",
    height: 10,
    backgroundColor: "#ece8da",
    borderRadius: 5,
  },
  // ── Exams section error state ────────────────────────────────────────────
  examsErrorState: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  examsErrorText: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  examsRetryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#24362f",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  examsRetryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
