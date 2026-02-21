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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome back, {userName}.</Text>
          <Text style={styles.subtitleText}>Ready to grade some papers?</Text>
        </View>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => router.push("/(tabs)/scanner")}
        >
          <Ionicons name="document-text-outline" size={20} color="#fff" />
          <Text style={styles.scanButtonText}>Start Scanning Papers</Text>
        </TouchableOpacity>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#3d5a3d" />
            </View>
            <Text style={styles.statValue}>{stats.scannedToday}</Text>
            <Text style={styles.statLabel}>Scanned Today</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="people-outline" size={18} color="#3d5a3d" />
            </View>
            <Text style={styles.statValue}>{stats.totalStudents}</Text>
            <Text style={styles.statLabel}>Total Students</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="bar-chart-outline" size={18} color="#3d5a3d" />
            </View>
            <Text style={styles.statValue}>{stats.avgScore}%</Text>
            <Text style={styles.statLabel}>Avg Score</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Exams</Text>
          <TouchableOpacity>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>

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
              <View style={styles.examBottomAccent} />
            </TouchableOpacity>
          ))}
        </View>

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
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 10,
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#8cb09a",
    elevation: 2,
  },
  statIconContainer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#dbe7df",
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 17,
    fontWeight: "700",
  },
});
