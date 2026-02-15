import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function HomeScreen() {
  const router = useRouter();

  // Mock data - replace with actual data from API/state management
  const userName = "Faculty User";
  const stats = {
    scannedToday: 67,
    totalStudents: 167,
    avgScore: 67,
  };

  const recentExams = [
    {
      id: 1,
      title: "Midterm - BS1T3B",
      subject: "Systems Integration and Architecture 1 (LEC)",
      date: "Feb 4, 2026",
      papers: 23,
      status: "Active",
    },
    {
      id: 2,
      title: "Quiz 3 - BS1T3B",
      subject: "Systems Integration and Architecture 1 (LEC)",
      date: "Feb 4, 2026",
      papers: 32,
      status: "Completed",
    },
    {
      id: 3,
      title: "Quiz 4 - BS1T3B",
      subject: "Systems Integration and Architecture 1 (LEC)",
      date: "Feb 6, 2026",
      papers: null,
      status: "Upcoming",
    },
  ];

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

  return (
    <View style={styles.container}>
      {/* Header */}
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
            <Ionicons name="notifications-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="person-circle-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome back, {userName}.</Text>
          <Text style={styles.subtitleText}>Ready to grade some papers?</Text>
        </View>

        {/* Start Scanning Button */}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => router.push("/(tabs)/scanner")}
        >
          <Ionicons name="document-text" size={24} color="#fff" />
          <Text style={styles.scanButtonText}>Start Scanning Papers</Text>
        </TouchableOpacity>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="checkmark-circle" size={28} color="#00a550" />
            </View>
            <Text style={styles.statValue}>{stats.scannedToday}</Text>
            <Text style={styles.statLabel}>Scanned Today</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="people" size={28} color="#00a550" />
            </View>
            <Text style={styles.statValue}>{stats.totalStudents}</Text>
            <Text style={styles.statLabel}>Total Students</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="stats-chart" size={28} color="#00a550" />
            </View>
            <Text style={styles.statValue}>{stats.avgScore}%</Text>
            <Text style={styles.statLabel}>Avg Score</Text>
          </View>
        </View>

        {/* Recent Exams Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Exams</Text>
          <TouchableOpacity>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        {/* Exam Cards */}
        <View style={styles.examsContainer}>
          {recentExams.map((exam) => (
            <TouchableOpacity key={exam.id} style={styles.examCard}>
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
          ))}
        </View>

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
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 32,
    height: 32,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  headerRight: {
    flexDirection: "row",
    gap: 12,
  },
  iconButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  welcomeSection: {
    padding: 20,
    paddingBottom: 16,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 14,
    color: "#666",
  },
  scanButton: {
    flexDirection: "row",
    backgroundColor: "#00a550",
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#d4c5a0",
  },
  statIconContainer: {
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  viewAllText: {
    fontSize: 14,
    color: "#00a550",
    fontWeight: "500",
  },
  examsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  examCard: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#d4c5a0",
  },
  examHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  examTitle: {
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
  examSubject: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
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
  newQuizButton: {
    flexDirection: "row",
    backgroundColor: "#00a550",
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  newQuizButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
