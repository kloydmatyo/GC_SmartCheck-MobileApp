import { auth, db } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OfflineStorageService } from "@/services/offlineStorageService";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
} from "firebase/firestore";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface Quiz {
  id: string;
  title: string;
  class: string;
  date: string;
  papers: number | null;
  status: "Draft" | "Scheduled" | "Active" | "Completed";
  isDownloaded?: boolean;
}

export default function QuizzesScreen() {
  const router = useRouter();
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [filter, setFilter] = useState<
    "All" | "Draft" | "Scheduled" | "Active" | "Completed"
  >("All");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  // Fetch quizzes from Firebase
  const loadQuizzes = async () => {
    try {
      setLoading(true);
      const currentUser = auth.currentUser;

      if (!currentUser) {
        console.log("No user logged in");
        setQuizzes([]);
        return;
      }

      const q = query(
        collection(db, "exams"),
        where("createdBy", "==", currentUser.uid),
      );

      const querySnapshot = await getDocs(q);
      const examsList: Quiz[] = [];

      // Check which exams are downloaded
      const downloadedExams = await OfflineStorageService.getDownloadedExams();
      const downloadedIds = new Set(downloadedExams.map((e) => e.id));

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Map status to proper case
        let status: "Draft" | "Scheduled" | "Active" | "Completed" = "Draft";
        if (data.status) {
          const statusLower = data.status.toLowerCase();
          switch (statusLower) {
            case "draft":
              status = "Draft";
              break;
            case "scheduled":
              status = "Scheduled";
              break;
            case "active":
              status = "Active";
              break;
            case "completed":
              status = "Completed";
              break;
            default:
              status = "Draft";
          }
        }

        examsList.push({
          id: doc.id,
          title: data.title || "Untitled Exam",
          class: data.subject || data.className || "No Subject",
          date: data.created_at
            ? typeof data.created_at === "string"
              ? new Date(data.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : data.createdAt?.toDate?.()?.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }) || "No Date"
            : "No Date",
          papers: data.scanned_papers || null,
          status: status,
          isDownloaded: downloadedIds.has(doc.id),
        });
      });

      setQuizzes(examsList);
    } catch (error) {
      console.error("Error fetching quizzes:", error);
    } finally {
      setLoading(false);
    }
  };

  // Reload quizzes when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadQuizzes();
      (async () => {
        try {
          const savedDarkMode = await AsyncStorage.getItem(
            DARK_MODE_STORAGE_KEY,
          );
          setDarkModeEnabled(savedDarkMode === "true");
        } catch (error) {
          console.warn("Failed to load dark mode preference:", error);
        }
      })();
    }, []),
  );

  const colors = darkModeEnabled
    ? {
        screenBg: "#111815",
        headerBg: "#1a2520",
        headerBorder: "#2b3b34",
        title: "#e7f1eb",
        primary: "#1f3a2f",
        primaryDark: "#2b3b34",
        cardBg: "#1f2b26",
        cardBorder: "#34483f",
      }
    : {
        screenBg: "#eef1ef",
        headerBg: "#fff",
        headerBorder: "#d8dfda",
        title: "#24362f",
        primary: "#3d5a3d",
        primaryDark: "#2f4a38",
        cardBg: "#3d5a3d",
        cardBorder: "#2f4a38",
      };

  const filteredQuizzes = quizzes.filter((q) => {
    const matchesFilter = filter === "All" ? true : q.status === filter;

    const matchesSearch =
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.class.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Download exam for offline access
  const handleDownloadExam = async (examId: string) => {
    try {
      setDownloadingIds((prev) => new Set(prev).add(examId));

      // Fetch full exam data from Firebase
      const examDoc = await getDoc(doc(db, "exams", examId));
      if (!examDoc.exists()) {
        Alert.alert("Error", "Exam not found");
        return;
      }

      const data = examDoc.data();
      const examData = {
        id: examDoc.id,
        title: data.title || "Untitled Exam",
        description: data.description || "",
        questions: data.questions || [],
        answerKey: data.answerKey || null,
        createdBy: data.createdBy || "",
        createdAt: data.createdAt?.toDate?.() || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || new Date(),
        version: data.version || 1,
      };

      await OfflineStorageService.downloadExam(examData);

      // Update UI
      setQuizzes((prev) =>
        prev.map((q) => (q.id === examId ? { ...q, isDownloaded: true } : q)),
      );

      Alert.alert("Success", "Exam downloaded for offline access!");
    } catch (error: any) {
      console.error("Error downloading exam:", error);

      // Check if error is due to offline
      if (
        error?.message?.includes("offline") ||
        error?.code === "unavailable"
      ) {
        Alert.alert(
          "No Internet Connection",
          "You need to be online to download exams for offline access.",
        );
      } else {
        Alert.alert("Error", "Failed to download exam. Please try again.");
      }
    } finally {
      setDownloadingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(examId);
        return newSet;
      });
    }
  };

  // Remove downloaded exam
  const handleRemoveDownload = async (examId: string) => {
    try {
      await OfflineStorageService.deleteDownloadedExam(examId);

      // Update UI
      setQuizzes((prev) =>
        prev.map((q) => (q.id === examId ? { ...q, isDownloaded: false } : q)),
      );

      Alert.alert("Success", "Offline copy removed");
    } catch (error) {
      console.error("Error removing download:", error);
      Alert.alert("Error", "Failed to remove offline copy");
    }
  };

  const renderQuizCard = ({ item }: { item: Quiz }) => (
    <TouchableOpacity
      style={[
        styles.quizCard,
        { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
      ]}
      onPress={() => router.push(`/(tabs)/exam-preview?examId=${item.id}`)}
    >
      <View style={styles.quizHeader}>
        <View style={styles.titleContainer}>
          <Text style={styles.quizTitle}>{item.title}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.scanBadge}>
          <Text style={styles.scanText}>SCAN</Text>
          <Ionicons name="scan-outline" size={30} color="#e5f4ea" />
        </View>
      </View>
      <Text style={styles.quizClass}>{item.class}</Text>
      <View style={styles.quizMeta}>
        <View style={styles.quizInfo}>
          <Ionicons name="calendar-outline" size={12} color="#cde2d8" />
          <Text style={styles.quizMetaText}>{item.date}</Text>
        </View>
      </View>
      <View style={styles.quizFooter}>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {item.papers ? `${item.papers}` : "--"} PAPERS
          </Text>
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              item.isDownloaded && styles.actionButtonDownloaded,
            ]}
            onPress={() =>
              item.isDownloaded
                ? handleRemoveDownload(item.id)
                : handleDownloadExam(item.id)
            }
            disabled={downloadingIds.has(item.id)}
          >
            {downloadingIds.has(item.id) ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name={
                    item.isDownloaded
                      ? "cloud-done-outline"
                      : "cloud-download-outline"
                  }
                  size={12}
                  color="#fff"
                />
                <Text style={styles.actionText}>
                  {item.isDownloaded ? "Offline" : "Download"}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="share-social-outline" size={12} color="#fff" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const getStatusColor = (status: string): string => {
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
        return "#666";
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.screenBg }]}>
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.headerBg,
              borderBottomColor: colors.headerBorder,
            },
          ]}
        >
          <Text style={[styles.headerTitle, { color: colors.title }]}>Quizzes</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00a550" />
          <Text style={styles.loadingText}>Loading exams...</Text>
        </View>
      </View>
    );
  }

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
        <Text style={[styles.headerTitle, { color: colors.title }]}>Quizzes</Text>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.primary }]}>
        <Ionicons name="search" size={16} color="#d6e9de" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search Quizzes"
          placeholderTextColor="#b8d4c4"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTrigger, { backgroundColor: colors.primary }]}
          onPress={() => setShowFilterMenu((prev) => !prev)}
        >
          <Text style={styles.filterTriggerText}>Filter: {filter}</Text>
          <Ionicons
            name={showFilterMenu ? "chevron-up" : "chevron-down"}
            size={16}
            color="#d7e9df"
          />
        </TouchableOpacity>
        {showFilterMenu && (
          <View style={[styles.filterMenu, { backgroundColor: colors.primaryDark }]}>
            {(
              ["All", "Draft", "Scheduled", "Active", "Completed"] as const
            ).map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterMenuItem,
                  filter === status && styles.filterMenuItemActive,
                ]}
                onPress={() => {
                  setFilter(status);
                  setShowFilterMenu(false);
                }}
              >
                <Text
                  style={[
                    styles.filterMenuText,
                    filter === status && styles.filterMenuTextActive,
                  ]}
                >
                  {status}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Quizzes List */}
      <FlatList
        data={filteredQuizzes}
        renderItem={renderQuizCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="book-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No exams found</Text>
            <Text style={styles.emptySubtext}>
              Create your first exam to get started
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[
          styles.newQuizButton,
          { backgroundColor: colors.primary, shadowColor: colors.primary },
        ]}
        onPress={() => router.push("/(tabs)/create-quiz")}
      >
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.newQuizText}>New Quiz</Text>
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
    paddingHorizontal: 14,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#24362f",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3d5a3d",
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: "#eaf6ef",
    fontSize: 14,
  },
  filterContainer: {
    position: "relative",
    paddingHorizontal: 8,
    paddingBottom: 6,
    zIndex: 10,
  },
  filterTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#3d5a3d",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
  },
  filterTriggerText: {
    color: "#eaf6ef",
    fontSize: 13,
    fontWeight: "700",
  },
  filterMenu: {
    marginTop: 6,
    backgroundColor: "#2f4a38",
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: "#355b49",
  },
  filterMenuItem: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterMenuItemActive: {
    backgroundColor: "#2f8a74",
  },
  filterMenuText: {
    color: "#d7e9df",
    fontSize: 13,
    fontWeight: "600",
  },
  filterMenuTextActive: {
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 90,
  },
  quizCard: {
    backgroundColor: "#3d5a3d",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#2f4a38",
  },
  quizHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  quizTitle: {
    fontSize: 27,
    fontWeight: "800",
    color: "#ecf7f1",
    marginBottom: 6,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  scanBadge: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 6,
  },
  scanText: {
    color: "#d1e6db",
    fontSize: 9,
    fontWeight: "700",
  },
  quizClass: {
    fontSize: 13,
    color: "#cce2d7",
    marginBottom: 6,
  },
  quizMeta: {
    marginBottom: 10,
  },
  quizFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quizInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quizMetaText: {
    fontSize: 12,
    color: "#d5e9de",
  },
  countBadge: {
    backgroundColor: "#2d4f3e",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  countBadgeText: {
    color: "#d8ebdf",
    fontSize: 10,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1f3449",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  actionButtonDownloaded: {
    backgroundColor: "#00a550",
  },
  actionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#ccc",
    marginTop: 4,
  },
  newQuizButton: {
    position: "absolute",
    right: 14,
    bottom: 66,
    backgroundColor: "#3d5a3d",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 6,
    shadowColor: "#3d5a3d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  newQuizText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
