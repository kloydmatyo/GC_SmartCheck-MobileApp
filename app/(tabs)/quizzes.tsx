import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
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
  status: "Active" | "Completed" | "Upcoming";
}

export default function QuizzesScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<
    "All" | "Active" | "Completed" | "Upcoming"
  >("All");

  const quizzes: Quiz[] = [
    {
      id: "1",
      title: "Midterm - BS1T3B",
      class: "Systems Integration and Architecture 1",
      date: "Feb 4, 2026",
      papers: 23,
      status: "Active",
    },
    {
      id: "2",
      title: "Quiz 3 - BS1T3B",
      class: "Systems Integration and Architecture 1",
      date: "Feb 4, 2026",
      papers: 32,
      status: "Completed",
    },
    {
      id: "3",
      title: "Quiz 4 - BS1T3B",
      class: "Systems Integration and Architecture 1",
      date: "Feb 6, 2026",
      papers: null,
      status: "Upcoming",
    },
    {
      id: "4",
      title: "Final Exam - BS2T1A",
      class: "Database Management Systems",
      date: "Feb 10, 2026",
      papers: null,
      status: "Upcoming",
    },
  ];

  const filteredQuizzes =
    filter === "All" ? quizzes : quizzes.filter((q) => q.status === filter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "#00a550";
      case "Completed":
        return "#4a90e2";
      case "Upcoming":
        return "#e74c3c";
      default:
        return "#666";
    }
  };

  const renderQuizCard = ({ item }: { item: Quiz }) => (
    <TouchableOpacity style={styles.quizCard}>
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
      </View>
    </TouchableOpacity>
  );

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
        {(["All", "Active", "Completed", "Upcoming"] as const).map((status) => (
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
        ))}
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
            <Text style={styles.emptyText}>No quizzes found</Text>
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
});
