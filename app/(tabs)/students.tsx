import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface Student {
  id: string;
  studentId: string;
  name: string;
  class: string;
  avgScore: number;
  quizzesTaken: number;
}

export default function StudentsScreen() {
  const [searchQuery, setSearchQuery] = useState("");

  const students: Student[] = [
    {
      id: "1",
      studentId: "20210001",
      name: "Juan Dela Cruz",
      class: "BS1T3B",
      avgScore: 85,
      quizzesTaken: 12,
    },
    {
      id: "2",
      studentId: "20210002",
      name: "Maria Santos",
      class: "BS1T3B",
      avgScore: 92,
      quizzesTaken: 12,
    },
    {
      id: "3",
      studentId: "20210003",
      name: "Pedro Reyes",
      class: "BS2T1A",
      avgScore: 78,
      quizzesTaken: 10,
    },
    {
      id: "4",
      studentId: "20210004",
      name: "Ana Garcia",
      class: "BS2T1A",
      avgScore: 88,
      quizzesTaken: 10,
    },
  ];

  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.studentId.includes(searchQuery) ||
      student.class.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getScoreColor = (score: number) => {
    if (score >= 90) return "#00a550";
    if (score >= 75) return "#4a90e2";
    return "#e74c3c";
  };

  const renderStudentCard = ({ item }: { item: Student }) => (
    <TouchableOpacity style={styles.studentCard}>
      <View style={styles.studentHeader}>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={24} color="#fff" />
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>{item.name}</Text>
          <Text style={styles.studentId}>ID: {item.studentId}</Text>
          <Text style={styles.studentClass}>{item.class}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#666" />
      </View>
      <View style={styles.studentStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Avg Score</Text>
          <Text
            style={[styles.statValue, { color: getScoreColor(item.avgScore) }]}
          >
            {item.avgScore}%
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Quizzes</Text>
          <Text style={styles.statValue}>{item.quizzesTaken}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Students</Text>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add-circle" size={28} color="#00a550" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#666"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search students..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
      </View>

      {/* Stats Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{students.length}</Text>
          <Text style={styles.summaryLabel}>Total Students</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>
            {Math.round(
              students.reduce((sum, s) => sum + s.avgScore, 0) /
                students.length,
            )}
            %
          </Text>
          <Text style={styles.summaryLabel}>Class Average</Text>
        </View>
      </View>

      {/* Students List */}
      <FlatList
        data={filteredStudents}
        renderItem={renderStudentCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No students found</Text>
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: "#333",
  },
  summaryContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#00a550",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#fff",
    opacity: 0.9,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  studentCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  studentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#00a550",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 2,
  },
  studentId: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  studentClass: {
    fontSize: 12,
    color: "#00a550",
    fontWeight: "500",
  },
  studentStats: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#e0e0e0",
    marginHorizontal: 12,
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
