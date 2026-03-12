import ConfirmationModal from "@/components/common/ConfirmationModal";
import { auth, db } from "@/config/firebase";
import { NetworkService } from "@/services/networkService";
import { OfflineStorageService } from "@/services/offlineStorageService";
import { ResultsService } from "@/services/resultsService";
import { SyncService, type SyncResult } from "@/services/syncService";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

type SummaryStats = {
  scans: number;
  averageScore: number;
  classes: number;
};

type RecentScan = {
  id: string;
  studentName: string;
  examLabel: string;
  timeLabel: string;
  score: number;
  color: string;
  textColor: string;
};

const MOCK_RECENT_SCANS: RecentScan[] = [
  {
    id: "mock-scan-1",
    studentName: "Jess Taylor",
    examLabel: "BSIT 3B - Chapter Test",
    timeLabel: "12m ago",
    score: 95,
    color: "#D8F3E7",
    textColor: "#20A86B",
  },
  {
    id: "mock-scan-2",
    studentName: "Sarah Davis",
    examLabel: "BSIT 3B - Chapter Test",
    timeLabel: "27m ago",
    score: 55,
    color: "#F9D7D9",
    textColor: "#E24E5C",
  },
  {
    id: "mock-scan-3",
    studentName: "Marco Reyes",
    examLabel: "BSCS 2A - Midterm Exam",
    timeLabel: "1h ago",
    score: 84,
    color: "#F5E8B8",
    textColor: "#D68B11",
  },
  {
    id: "mock-scan-4",
    studentName: "Nina Flores",
    examLabel: "BSCS 2A - Midterm Exam",
    timeLabel: "2h ago",
    score: 91,
    color: "#D8F3E7",
    textColor: "#20A86B",
  },
];

const emptyStats: SummaryStats = {
  scans: 0,
  averageScore: 0,
  classes: 0,
};

const statCards = [
  {
    key: "scans",
    label: "Scans",
    icon: "document-text-outline" as const,
    route: "/(tabs)/quizzes",
  },
  {
    key: "averageScore",
    label: "Avg Score",
    icon: "stats-chart-outline" as const,
    route: null,
  },
  {
    key: "classes",
    label: "Classes",
    icon: "folder-open-outline" as const,
    route: "/(tabs)/classes",
  },
] as const;

function formatHeaderDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatRelativeTime(dateLike: string) {
  const target = new Date(dateLike);
  if (Number.isNaN(target.getTime())) {
    return "Just now";
  }

  const diffMs = Date.now() - target.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getScoreTone(score: number) {
  if (score >= 85) {
    return { badge: "#D8F3E7", text: "#20A86B" };
  }
  if (score >= 70) {
    return { badge: "#F5E8B8", text: "#D68B11" };
  }
  return { badge: "#F9D7D9", text: "#E24E5C" };
}

function formatLastSync(lastSync: Date | null) {
  if (!lastSync) return "Never";

  const now = Date.now();
  const diffMs = now - lastSync.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HomeScreen() {
  const router = useRouter();
  const syncBannerOffset = useState(new Animated.Value(-16))[0];
  const syncBannerOpacity = useState(new Animated.Value(0))[0];
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SummaryStats>(emptyStats);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const displayRecentScans = recentScans.length
    ? recentScans
    : MOCK_RECENT_SCANS;

  const animateSyncBannerOut = useCallback(() => {
    Animated.parallel([
      Animated.timing(syncBannerOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(syncBannerOffset, {
        toValue: -16,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setShowSyncBanner(false);
      }
    });
  }, [syncBannerOffset, syncBannerOpacity]);

  const showSyncBannerTemporarily = useCallback(() => {
    setShowSyncBanner(true);
    syncBannerOpacity.setValue(0);
    syncBannerOffset.setValue(-16);

    Animated.parallel([
      Animated.timing(syncBannerOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(syncBannerOffset, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [syncBannerOffset, syncBannerOpacity]);

  useEffect(() => {
    let mounted = true;
    let hideBannerTimer: ReturnType<typeof setTimeout> | null = null;

    const loadSyncStatus = async () => {
      const stats = await OfflineStorageService.getStorageStats();
      if (!mounted) return;

      setPendingCount(stats.pendingUpdatesCount);
      setLastSync(stats.lastSync);
      setIsSyncing(SyncService.isSyncInProgress());
      setIsOnline(NetworkService.getConnectionStatus());

      showSyncBannerTemporarily();
      if (hideBannerTimer) {
        clearTimeout(hideBannerTimer);
      }
      hideBannerTimer = setTimeout(() => {
        if (mounted) {
          animateSyncBannerOut();
        }
      }, 2200);
    };

    NetworkService.initialize();
    SyncService.initialize();
    loadSyncStatus();

    const unsubscribeNetwork = NetworkService.addListener((connected) => {
      if (!mounted) return;
      setIsOnline(connected);
      loadSyncStatus();
    });

    const unsubscribeSync = SyncService.addSyncListener(
      (_result: SyncResult) => {
        if (!mounted) return;
        setIsSyncing(false);
        loadSyncStatus();
      },
    );

    const interval = setInterval(loadSyncStatus, 30000);

    return () => {
      mounted = false;
      unsubscribeNetwork();
      unsubscribeSync();
      clearInterval(interval);
      if (hideBannerTimer) {
        clearTimeout(hideBannerTimer);
      }
    };
  }, [animateSyncBannerOut, showSyncBannerTemporarily]);

  const loadHome = useCallback(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);

        const currentUser = auth.currentUser;
        if (!currentUser) {
          if (active) {
            setStats(emptyStats);
            setRecentScans([]);
          }
          return;
        }

        const userProfileSnap = await getDoc(doc(db, "users", currentUser.uid));
        const userProfile = userProfileSnap.exists()
          ? userProfileSnap.data()
          : null;
        const fullName = String(
          userProfile?.fullName || currentUser.displayName || "",
        ).trim();
        const email = String(
          userProfile?.email || currentUser.email || "",
        ).trim();
        const fallbackName = email ? email.split("@")[0] : "";
        const firstName = (fullName || fallbackName).split(" ")[0];

        if (active) {
          setTeacherName(firstName || "Teacher");
          setTeacherEmail(email);
        }

        const [classesSnapshot, unifiedResults] = await Promise.all([
          getDocs(
            query(
              collection(db, "classes"),
              where("createdBy", "==", currentUser.uid),
            ),
          ),
          ResultsService.getUnifiedResults(),
        ]);

        const classDocs = classesSnapshot.docs
          .map((doc) => doc.data())
          .filter((item) => !item.isArchived);
        const scanRows = unifiedResults.rows.filter(
          (item) => item.source === "scan",
        );

        const averageScore =
          scanRows.length > 0
            ? Math.round(
                scanRows.reduce((sum, item) => sum + item.percentage, 0) /
                  scanRows.length,
              )
            : 0;

        const recent = scanRows.slice(0, 4).map((scan) => {
          const tone = getScoreTone(scan.percentage);
          return {
            id: scan.id,
            studentName: scan.studentName,
            examLabel: `${scan.classLabel} - ${scan.examLabel}`,
            timeLabel: formatRelativeTime(scan.dateValue),
            score: scan.percentage,
            color: tone.badge,
            textColor: tone.text,
          };
        });

        if (!active) {
          return;
        }

        setStats({
          scans: scanRows.length,
          averageScore,
          classes: classDocs.length,
        });

        setRecentScans(
          recent.map((item) => ({
            id: item.id,
            studentName: item.studentName,
            examLabel: item.examLabel,
            timeLabel: item.timeLabel,
            score: item.score,
            color: item.color,
            textColor: item.textColor,
          })),
        );
      } catch (error) {
        console.error("Error loading home screen:", error);
        if (active) {
          setStats(emptyStats);
          setRecentScans([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadHome);

  const syncVisual = (() => {
    if (!isOnline) {
      return {
        color: "#F2A54A",
        icon: "cloud-offline-outline" as keyof typeof Ionicons.glyphMap,
        text: "Offline",
      };
    }

    if (isSyncing) {
      return {
        color: "#3B82F6",
        icon: "sync-outline" as keyof typeof Ionicons.glyphMap,
        text: "Syncing...",
      };
    }

    if (pendingCount > 0) {
      return {
        color: "#F2C45A",
        icon: "cloud-upload-outline" as keyof typeof Ionicons.glyphMap,
        text: `${pendingCount} pending`,
      };
    }

    return {
      color: "#1FC27D",
      icon: "cloud-done-outline" as keyof typeof Ionicons.glyphMap,
      text: lastSync ? `Synced ${formatLastSync(lastSync)}` : "Synced to Web",
    };
  })();

  const handleLogout = async () => {
    try {
      setLogoutConfirmVisible(false);
      await signOut(auth);
      router.replace("/sign-in");
    } catch (error) {
      console.error("Error signing out:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to log out",
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.topRow}>
            <View style={styles.topSpacer} />
            {showSyncBanner ? (
              <Animated.View
                style={[
                  styles.syncPill,
                  {
                    opacity: syncBannerOpacity,
                    transform: [{ translateY: syncBannerOffset }],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.syncPillTouch}
                  activeOpacity={0.85}
                  onPress={animateSyncBannerOut}
                >
                  <View
                    style={[
                      styles.syncIconWrap,
                      { backgroundColor: `${syncVisual.color}1A` },
                    ]}
                  >
                    {isSyncing ? (
                      <ActivityIndicator
                        size="small"
                        color={syncVisual.color}
                      />
                    ) : (
                      <Ionicons
                        name={syncVisual.icon}
                        size={14}
                        color={syncVisual.color}
                      />
                    )}
                  </View>
                  <Text style={styles.syncText}>{syncVisual.text}</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <View style={styles.topSpacer} />
            )}
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => setSettingsMenuVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="settings-outline" size={20} color="#111827" />
            </TouchableOpacity>
          </View>

          <View style={styles.greetingBlock}>
            <Text style={styles.dateText}>{formatHeaderDate(new Date())}</Text>
            <Text style={styles.greetingText}>Good morning, {teacherName}</Text>
          </View>

          <View style={styles.statsRow}>
            {statCards.map((card) => (
              <TouchableOpacity
                key={card.key}
                style={[
                  styles.statCard,
                  styles.statCardStatic,
                  Platform.OS === "web"
                    ? ({ cursor: card.route ? "pointer" : "auto" } as any)
                    : null,
                ]}
                activeOpacity={card.route ? 0.82 : 1}
                disabled={!card.route}
                onPress={() => {
                  if (card.route) {
                    router.push(card.route);
                  }
                }}
              >
                <Ionicons name={card.icon} size={22} color="#19B97C" />
                {loading ? (
                  <ActivityIndicator
                    style={styles.statLoader}
                    size="small"
                    color="#19B97C"
                  />
                ) : (
                  <Text style={styles.statValue}>
                    {card.key === "averageScore"
                      ? `${stats.averageScore}%`
                      : stats[card.key as keyof SummaryStats]}
                  </Text>
                )}
                <Text style={styles.statLabel}>{card.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.quickScanButton}
            onPress={() => router.push(`/scanner?quick=${Date.now()}`)}
            activeOpacity={0.9}
          >
            <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
            <Text style={styles.quickScanText}>Quick Scan</Text>
          </TouchableOpacity>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Scans</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/quizzes")}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listWrap}>
            {loading ? (
              <>
                <View style={styles.placeholderCard} />
                <View style={styles.placeholderCard} />
                <View style={styles.placeholderCard} />
              </>
            ) : (
              displayRecentScans.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.scanCard}
                  onPress={() => router.push("/(tabs)/quizzes")}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      styles.scoreBubble,
                      { backgroundColor: item.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scoreBubbleText,
                        { color: item.textColor },
                      ]}
                    >
                      {item.score}
                    </Text>
                  </View>
                  <View style={styles.scanTextWrap}>
                    <Text style={styles.scanName} numberOfLines={1}>
                      {item.studentName}
                    </Text>
                    <View style={styles.scanMetaRow}>
                      <Text style={styles.scanMeta} numberOfLines={1}>
                        {item.examLabel}
                      </Text>
                      <Text style={styles.scanMetaDot}>•</Text>
                      <Text style={styles.scanTime}>{item.timeLabel}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#C5CBD6" />
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={settingsMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSettingsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setSettingsMenuVisible(false)}
        >
          <View style={styles.accountMenu}>
            <View style={styles.accountMenuHeader}>
              <Text style={styles.accountMenuTitle}>Teacher Account</Text>
              <Text style={styles.accountMenuEmail} numberOfLines={1}>
                {teacherEmail ||
                  auth.currentUser?.email ||
                  "teacher@school.edu"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.accountMenuAction}
              onPress={() => {
                setSettingsMenuVisible(false);
                setLogoutConfirmVisible(true);
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#D7426B" />
              <Text style={styles.accountMenuActionText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ConfirmationModal
        visible={logoutConfirmVisible}
        title="Log Out"
        message="Are you sure you want to log out of your account?"
        cancelText="Cancel"
        confirmText="Log Out"
        destructive
        onCancel={() => setLogoutConfirmVisible(false)}
        onConfirm={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F7F8",
  },
  container: {
    flex: 1,
    backgroundColor: "#F7F7F8",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 120,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  topSpacer: {
    width: 28,
  },
  syncPill: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECEEF2",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#0E1628",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  syncPillTouch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  syncIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  syncText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5A6475",
  },
  settingsButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    paddingTop: 84,
    paddingRight: 24,
    alignItems: "flex-end",
  },
  accountMenu: {
    width: 246,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
  },
  accountMenuHeader: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F5",
  },
  accountMenuTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1D2433",
  },
  accountMenuEmail: {
    marginTop: 6,
    fontSize: 12,
    color: "#7E8797",
  },
  accountMenuAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  accountMenuActionText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#D7426B",
  },
  greetingBlock: {
    marginBottom: 28,
  },
  dateText: {
    fontSize: 13,
    color: "#858D9D",
    marginBottom: 6,
  },
  greetingText: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    color: "#1D2433",
    letterSpacing: -0.8,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statCard: {
    width: "31.5%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E9ECF1",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 8,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  statCardStatic: {
    opacity: 1,
  },
  statLoader: {
    marginTop: 14,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1D2433",
    marginTop: 14,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#9AA2B1",
    textAlign: "center",
  },
  quickScanButton: {
    height: 62,
    borderRadius: 18,
    backgroundColor: "#1FC27D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
    shadowColor: "#1FC27D",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  quickScanText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1D2433",
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#35C78A",
  },
  listWrap: {
    gap: 14,
  },
  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  scoreBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  scoreBubbleText: {
    fontSize: 16,
    fontWeight: "800",
  },
  scanTextWrap: {
    flex: 1,
    gap: 2,
  },
  scanName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222938",
  },
  scanMeta: {
    fontSize: 13,
    color: "#8B93A3",
    flexShrink: 1,
  },
  scanMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  scanMetaDot: {
    fontSize: 12,
    color: "#A8AFBC",
    marginHorizontal: 7,
  },
  scanTime: {
    fontSize: 12,
    color: "#A8AFBC",
  },
  placeholderCard: {
    height: 76,
    backgroundColor: "#EEF1F5",
    borderRadius: 18,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#202738",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: "#8B93A3",
    textAlign: "center",
  },
});
