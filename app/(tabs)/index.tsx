import { auth, db } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import React, { useCallback, useState } from "react";
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
import ScannerScreen from "../../components/scanner/ScannerScreen";

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: any): string => {
  const parsed = toDate(value);
  if (!parsed) return "No date";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const normalizeStatus = (
  value: any,
): "Draft" | "Scheduled" | "Active" | "Completed" => {
  switch (String(value || "").toLowerCase()) {
    case "scheduled":
      return "Scheduled";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    default:
      return "Draft";
  }
};

export default function HomeScreen() {
  const [showScanner, setShowScanner] = useState(false);
  const router = useRouter();
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  const [stats, setStats] = useState({
    totalExams: 0,
    totalStudents: 0,
    totalSheets: 0,
  });
  const [recentExams, setRecentExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Faculty User");

  const loadDashboard = useCallback(() => {
    let cancelled = false;
    (async () => {
    try {
      setLoading(true);
      const savedDarkMode = await AsyncStorage.getItem(DARK_MODE_STORAGE_KEY);
      if (!cancelled) {
        setDarkModeEnabled(savedDarkMode === "true");
      }

      const currentUser = auth.currentUser;
      if (!currentUser) return;

      // Fetch user display name
      if (currentUser.displayName) {
        setUserName(currentUser.displayName);
      }

      // Fetch exams
      const examsQuery = query(
        collection(db, "exams"),
        where("createdBy", "==", currentUser.uid),
      );
      const examsSnapshot = await getDocs(examsQuery);
      const exams = examsSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          const createdDate = toDate(data.created_at || data.createdAt);
          return {
            id: doc.id,
            title: data.title || "Untitled",
            subject: data.subject || "",
            date: formatDate(data.created_at || data.createdAt),
            papers: data.scanned_papers || null,
            status: normalizeStatus(data.status),
            isArchived: data.isArchived || false,
            createdAtTs: createdDate ? createdDate.getTime() : 0,
            createdAtDate: createdDate,
            generated_sheets: data.generated_sheets || [],
          };
        })
        .filter((e) => !e.isArchived)
        .sort((a, b) => b.createdAtTs - a.createdAtTs);

      // Total answer sheets
      const totalSheets = exams.reduce((sum, exam) => {
        if (Array.isArray(exam.generated_sheets)) {
          return (
            sum +
            exam.generated_sheets.reduce(
              (s: number, sheet: any) => s + (sheet.sheet_count || 0),
              0,
            )
          );
        }
        return sum;
      }, 0);

      // Total exams (non-archived)
      const totalExams = exams.length;

      // Fetch students from classes
      let totalStudents = 0;
      try {
        const classesQuery = query(
          collection(db, "classes"),
          where("createdBy", "==", currentUser.uid),
        );
        const classesSnapshot = await getDocs(classesQuery);
        totalStudents = classesSnapshot.docs.reduce((sum, doc) => {
          const data = doc.data();
          if (!data.isArchived) {
            return sum + (data.students?.length || 0);
          }
          return sum;
        }, 0);
      } catch (e) {
        console.warn("Could not fetch students:", e);
      }

      setStats({ totalExams, totalStudents, totalSheets });
      setRecentExams(exams.slice(0, 3));
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      if (!cancelled) setLoading(false);
    }
    })();
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(loadDashboard);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Draft":
        return "#9e9e9e";
      case "Scheduled":
        return "#ff9800";
      case "Active":
        return "#00a550";
      case "Completed":
        return "#4a90e2";
      default:
        return "#9e9e9e";
    }
  };

  if (showScanner) {
    return <ScannerScreen onClose={() => setShowScanner(false)} />;
  }

  const colors = darkModeEnabled
    ? {
        screenBg: "#111815",
        headerBg: "#1a2520",
        headerBorder: "#2b3b34",
        title: "#e7f1eb",
        subtitle: "#9db1a6",
        icon: "#dce8e1",
        primary: "#3f6b54",
        cardBg: "#1f2b26",
        cardBorder: "#34483f",
        cardIconBg: "#2a3a33",
        value: "#8fd1ad",
        examTitle: "#e3eee8",
        examMeta: "#a3b6ab",
        surfaceAccent: "#2f8a74",
        quickActionBg: "#1f3a2f",
        quickActionBorder: "#4f7a67",
        quickActionText: "#e8f6ee",
      }
    : {
        screenBg: "#eef1ef",
        headerBg: "#fff",
        headerBorder: "#d8dfda",
        title: "#24362f",
        subtitle: "#6c7d74",
        icon: "#24362f",
        primary: "#3d5a3d",
        cardBg: "#f0ead6",
        cardBorder: "#8cb09a",
        cardIconBg: "#dbe7df",
        value: "#2f6a50",
        examTitle: "#333",
        examMeta: "#666",
        surfaceAccent: "#2f8a74",
        quickActionBg: "#3d5a3d",
        quickActionBorder: "#3d5a3d",
        quickActionText: "#ffffff",
      };

  return (
    <View style={[styles.container, { backgroundColor: colors.screenBg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.headerBg,
            borderBottomColor: colors.headerBorder,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Image
            source={require("@/assets/images/gordon-college-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.headerTitle, { color: colors.title }]}>GCSC</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={18} color={colors.icon} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="person-circle-outline" size={18} color={colors.icon} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeText, { color: colors.title }]}>
            Welcome back, {userName}.
          </Text>
          <Text style={[styles.subtitleText, { color: colors.subtitle }]}>
            Ready to grade some papers?
          </Text>
        </View>

        {/* Start Scanning */}
        <TouchableOpacity
          style={[styles.scanButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowScanner(true)}
        >
          <Ionicons name="document-text-outline" size={20} color="#fff" />
          <Text style={styles.scanButtonText}>Start Scanning Papers</Text>
        </TouchableOpacity>

        {/* Stats Row */}
        <View style={styles.statsContainer}>
          <View
            style={[
              styles.statCard,
              { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
            ]}
          >
            <View
              style={[
                styles.statIconContainer,
                { backgroundColor: colors.cardIconBg },
              ]}
            >
              <Ionicons name="book-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.statValue, { color: colors.value }]}>
              {loading ? "-" : stats.totalExams}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtitle }]}>
              Total Exams
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
            ]}
          >
            <View
              style={[
                styles.statIconContainer,
                { backgroundColor: colors.cardIconBg },
              ]}
            >
              <Ionicons name="people-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.statValue, { color: colors.value }]}>
              {loading ? "-" : stats.totalStudents}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtitle }]}>
              Total Students
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
            ]}
          >
            <View
              style={[
                styles.statIconContainer,
                { backgroundColor: colors.cardIconBg },
              ]}
            >
              <Ionicons name="document-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.statValue, { color: colors.value }]}>
              {loading ? "-" : stats.totalSheets}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtitle }]}>
              Answer Sheets
            </Text>
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

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>
            Quick Actions
          </Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[
                styles.quickActionCard,
                {
                  backgroundColor: colors.quickActionBg,
                  borderColor: colors.quickActionBorder,
                },
              ]}
              onPress={() => router.push("/(tabs)/create-quiz")}
            >
              <View style={styles.quickActionIconWrap}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.quickActionText, { color: colors.quickActionText }]}>Create Exam</Text>
              <Text style={[styles.quickActionSubtext, { color: colors.quickActionText }]}>Start a new quiz setup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickActionCard,
                {
                  backgroundColor: colors.quickActionBg,
                  borderColor: colors.quickActionBorder,
                },
              ]}
              onPress={() => router.push("/(tabs)/students")}
            >
              <View style={styles.quickActionIconWrap}>
                <Ionicons name="people-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.quickActionText, { color: colors.quickActionText }]}>Students</Text>
              <Text style={[styles.quickActionSubtext, { color: colors.quickActionText }]}>Manage class rosters</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickActionCard,
                {
                  backgroundColor: colors.quickActionBg,
                  borderColor: colors.quickActionBorder,
                },
              ]}
              onPress={() => router.push("/(tabs)/generator")}
            >
              <View style={styles.quickActionIconWrap}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.quickActionText, { color: colors.quickActionText }]}>Answer Sheets</Text>
              <Text style={[styles.quickActionSubtext, { color: colors.quickActionText }]}>Generate sheet templates</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickActionCard,
                {
                  backgroundColor: colors.quickActionBg,
                  borderColor: colors.quickActionBorder,
                },
              ]}
              onPress={() => router.push("/(tabs)/quizzes")}
            >
              <View style={styles.quickActionIconWrap}>
                <Ionicons name="book-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.quickActionText, { color: colors.quickActionText }]}>All Exams</Text>
              <Text style={[styles.quickActionSubtext, { color: colors.quickActionText }]}>Browse saved quizzes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickActionCard,
                styles.quickActionCardWide,
                styles.quickActionCenterCard,
                {
                  backgroundColor: colors.quickActionBg,
                  borderColor: colors.quickActionBorder,
                },
              ]}
              onPress={() => router.push("/(tabs)/batch-history")}
            >
              <Text style={[styles.quickActionCenterText, { color: colors.quickActionText }]}>Batch History</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Exams */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>
            Recent Exams
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/quizzes")}>
            <Text style={[styles.viewAllText, { color: colors.title }]}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.examsContainer}>
          {loading ? (
            <>
              <View style={[styles.examSkeleton, { backgroundColor: colors.cardIconBg }]} />
              <View style={[styles.examSkeleton, { backgroundColor: colors.cardIconBg }]} />
              <View style={[styles.examSkeleton, { backgroundColor: colors.cardIconBg }]} />
            </>
          ) : recentExams.length === 0 ? (
            <View
              style={[
                styles.emptyExams,
                { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
              ]}
            >
              <Ionicons name="document-outline" size={36} color={colors.subtitle} />
              <Text style={[styles.emptyExamsText, { color: colors.subtitle }]}>
                No exams yet
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/create-quiz")}
              >
                <Text style={[styles.emptyExamsLink, { color: colors.surfaceAccent }]}>
                  Create your first exam
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            recentExams.map((exam) => (
              <TouchableOpacity
                key={exam.id}
                style={[
                  styles.examCard,
                  { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
                ]}
                onPress={() =>
                  router.push(`/(tabs)/exam-preview?examId=${exam.id}`)
                }
              >
                <View style={styles.examHeader}>
                  <Text
                    style={[styles.examTitle, { color: colors.examTitle }]}
                    numberOfLines={1}
                  >
                    {exam.title}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(exam.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>{exam.status}</Text>
                  </View>
                </View>
                <Text
                  style={[styles.examSubject, { color: colors.subtitle }]}
                  numberOfLines={1}
                >
                  {exam.subject}
                </Text>
                <View style={styles.examFooter}>
                  <View style={styles.examInfo}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={colors.examMeta}
                    />
                    <Text style={[styles.examInfoText, { color: colors.examMeta }]}>
                      {exam.date}
                    </Text>
                  </View>
                  <View style={styles.examInfo}>
                    <Ionicons
                      name="document-outline"
                      size={14}
                      color={colors.examMeta}
                    />
                    <Text style={[styles.examInfoText, { color: colors.examMeta }]}>
                      {exam.papers ? `${exam.papers} Papers` : "-- Papers"}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.examBottomAccent,
                    { backgroundColor: colors.surfaceAccent },
                  ]}
                />
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* New Quiz FAB — floating bottom right */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: darkModeEnabled ? "#1f3a2f" : colors.primary,
            shadowColor: darkModeEnabled ? "#000" : colors.primary,
            borderWidth: darkModeEnabled ? 1 : 0,
            borderColor: darkModeEnabled ? "#4f7a67" : "transparent",
          },
        ]}
        onPress={() => router.push("/(tabs)/create-quiz")}
      >
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.fabText}>New Quiz</Text>
      </TouchableOpacity>
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
  scrollContent: {
    paddingBottom: 20,
  },
  welcomeSection: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2a3b33",
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: "700",
  },

  // Stats
  statsContainer: {
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
    fontSize: 22,
    fontWeight: "800",
    color: "#2f6a50",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: "#435950",
    textAlign: "center",
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
  },
  quickActionCard: {
    width: "48.5%",
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    borderWidth: 1,
    borderColor: "#8cb09a",
    minHeight: 96,
  },
  quickActionCardWide: {
    width: "100%",
  },
  quickActionCenterCard: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3d5a3d",
    textAlign: "left",
  },
  quickActionSubtext: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.85,
  },
  quickActionCenterText: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  quickActionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#dbe7df",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#24362f",
  },
  viewAllText: {
    fontSize: 14,
    color: "#24362f",
    fontWeight: "700",
  },

  // Exam cards
  examsContainer: {
    paddingHorizontal: 10,
    gap: 8,
  },
  examSkeleton: {
    height: 80,
    backgroundColor: "#dbe7df",
    borderRadius: 12,
    marginBottom: 8,
  },
  emptyExams: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#8cb09a",
    gap: 6,
  },
  emptyExamsText: {
    fontSize: 15,
    color: "#666",
    fontWeight: "600",
  },
  emptyExamsLink: {
    fontSize: 13,
    color: "#2f8a74",
    fontWeight: "700",
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
    fontSize: 16,
    fontWeight: "800",
    color: "#333",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  examSubject: {
    fontSize: 12,
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

  // FAB
  fab: {
    position: "absolute",
    bottom: 66,
    right: 14,
    flexDirection: "row",
    backgroundColor: "#3d5a3d",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    gap: 8,
    elevation: 6,
    shadowColor: "#3d5a3d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  fabText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
