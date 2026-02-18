import { auth, db } from "@/config/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
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

  const filteredQuizzes =
    filter === "All" ? quizzes : quizzes.filter((q) => q.status === filter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "#00a550";
      case "Completed":
        return "#4a90e2";
      case "Scheduled":
        return "#ff9800";
      case "Draft":
        return "#9e9e9e";
      default:
        return "#666";
    }
  };

  const renderQuizCard = ({ item }: { item: Quiz }) => (
    <TouchableOpacity
      style={styles.quizCard}
      onPress={() => router.push(`/(tabs)/exam-preview?examId=${item.id}`)}
    >
      <View style={styles.quizHeader}>
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
      <Text style={styles.quizClass}>{item.class}</Text>
      <View style={styles.quizFooter}>
        <View style={styles.quizInfo}>
          <Ionicons name="calendar-outline" size={14} color="#666" />
          <Text style={styles.quizInfoText}>{item.date}</Text>
        </View>
        <View style={styles.quizInfo}>
          <Ionicons name="document-outline" size={14} color="#666" />
          <Text style={styles.quizInfoText}>
            {item.papers ? `${item.papers} Papers` : "-- Papers"}
          </Text>
        </View>
        <Ionicons name="chevron-forward-outline" size={16} color="#999" />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Quizzes</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push("/(tabs)/generator")}
          >
            <Ionicons name="add-circle" size={28} color="#00a550" />
          </TouchableOpacity>
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
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push("/(tabs)/generator")}
        >
          <Ionicons name="add-circle" size={28} color="#00a550" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(["All", "Draft", "Scheduled", "Active", "Completed"] as const).map(
          (status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterTab,
                filter === status && styles.filterTabActive,
              ]}
              onPress={() => setFilter(status)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === status && styles.filterTextActive,
                ]}
              >
                {status}
              </Text>
            </TouchableOpacity>
          ),
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  addButton: {
    padding: 4,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: "#fff",
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
  },
  filterTabActive: {
    backgroundColor: "#00a550",
  },
  filterText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  filterTextActive: {
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  quizCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  quizHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  quizTitle: {
    fontSize: 16,
    fontWeight: "bold",
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
    fontSize: 12,
    fontWeight: "600",
  },
  quizClass: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  quizFooter: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  quizInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quizInfoText: {
    fontSize: 12,
    color: "#666",
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
});
