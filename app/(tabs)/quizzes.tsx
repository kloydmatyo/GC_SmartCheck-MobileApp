import { auth, db } from "@/config/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    TextInput,
    StyleSheet,
    Text,
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
}

export default function QuizzesScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<
    "All" | "Draft" | "Scheduled" | "Active" | "Completed"
  >("All");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

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

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        examsList.push({
          id: doc.id,
          title: data.title || "Untitled Exam",
          class: data.course_subject || "No Subject",
          date: data.created_at
            ? new Date(data.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "No Date",
          papers: data.scanned_papers || null,
          status: data.status || "Draft",
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
    }, []),
  );

  const filteredQuizzes = quizzes.filter((q) => {
    const matchesFilter = filter === "All" ? true : q.status === filter;

    const matchesSearch =
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.class.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const renderQuizCard = ({ item }: { item: Quiz }) => (
    <TouchableOpacity
      style={styles.quizCard}
      onPress={() => router.push(`/(tabs)/exam-preview?examId=${item.id}`)}
    >
      <View style={styles.quizHeader}>
        <Text style={styles.quizTitle}>{item.title}</Text>
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
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="share-social-outline" size={12} color="#fff" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="download-outline" size={12} color="#fff" />
            <Text style={styles.actionText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Quizzes</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00a550" />
          <Text style={styles.loadingText}>Loading exams...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quizzes</Text>
      </View>

      <View style={styles.searchContainer}>
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
          style={styles.filterTrigger}
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
          <View style={styles.filterMenu}>
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
        style={styles.newQuizButton}
        onPress={() => router.push("/(tabs)/create-quiz")}
      >
        <Ionicons name="add-circle-outline" size={18} color="#fff" />
        <Text style={styles.newQuizText}>New Quiz</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f2f0",
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
    backgroundColor: "#3f6b54",
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
    backgroundColor: "#3f6b54",
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
    backgroundColor: "#2f5a45",
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
    backgroundColor: "#3f6b54",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#355b49",
  },
  quizHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  quizTitle: {
    fontSize: 27,
    fontWeight: "800",
    color: "#ecf7f1",
    flex: 1,
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
    right: 10,
    bottom: 14,
    backgroundColor: "#2f8a74",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    elevation: 3,
  },
  newQuizText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
});

