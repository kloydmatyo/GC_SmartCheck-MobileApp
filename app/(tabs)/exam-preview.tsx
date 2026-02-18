import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { auth } from "../../config/firebase";
import { ExamService } from "../../services/examService";
import { ExamPreviewData } from "../../types/exam";

export default function ExamPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const examId = params.examId as string;

  const [exam, setExam] = useState<ExamPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadExamData();
  }, [examId]);

  const loadExamData = async () => {
    try {
      setLoading(true);
      setError(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError("You must be logged in to view exams.");
        return;
      }

      // Check authorization
      const authorized = await ExamService.isAuthorized(
        currentUser.uid,
        examId,
      );
      if (!authorized) {
        setError("You are not authorized to view this exam.");
        return;
      }

      const examData = await ExamService.getExamById(examId);
      if (!examData) {
        setError("Exam not found. Please check the exam ID.");
        return;
      }

      setExam(examData);
    } catch (err) {
      setError("Failed to load exam data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    Toast.show({
      type: "success",
      text1: "Copied!",
      text2: `${label} copied to clipboard`,
      position: "bottom",
      visibilityTime: 2000,
    });
  };

  const renderAnswerKeyGrid = () => {
    if (!exam) return null;

    const columns = 2;
    const rows = Math.ceil(exam.totalQuestions / columns);
    const grid: number[][] = [];

    for (let i = 0; i < rows; i++) {
      const row: number[] = [];
      for (let j = 0; j < columns; j++) {
        const questionNum = i + j * rows + 1;
        if (questionNum <= exam.totalQuestions) {
          row.push(questionNum);
        }
      }
      grid.push(row);
    }

    return (
      <View style={styles.answerKeyGrid}>
        {grid.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.answerKeyRow}>
            {row.map((questionNum) => {
              const answer = exam.answerKey.answers[questionNum - 1];
              return (
                <View key={questionNum} style={styles.answerKeyItem}>
                  <Text style={styles.questionNumber}>{questionNum}.</Text>
                  <View style={styles.answerBubble}>
                    <Text style={styles.answerText}>{answer}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00a550" />
        <Text style={styles.loadingText}>Loading exam data...</Text>
      </View>
    );
  }

  if (error || !exam) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#e74c3c" />
        <Text style={styles.errorText}>{error || "Exam not found"}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadExamData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backIcon} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exam Preview</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: ExamService.getStatusColor(exam.metadata.status),
            },
          ]}
        >
          <Text style={styles.statusText}>{exam.metadata.status}</Text>
        </View>

        {/* Exam Metadata Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exam Information</Text>

          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Title</Text>
              <Text style={styles.infoValue}>{exam.metadata.title}</Text>
            </View>
          </View>

          {exam.metadata.subject && (
            <View style={styles.infoRow}>
              <Ionicons name="book-outline" size={20} color="#666" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Subject</Text>
                <Text style={styles.infoValue}>{exam.metadata.subject}</Text>
              </View>
            </View>
          )}

          {exam.metadata.section && (
            <View style={styles.infoRow}>
              <Ionicons name="people-outline" size={20} color="#666" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Section</Text>
                <Text style={styles.infoValue}>{exam.metadata.section}</Text>
              </View>
            </View>
          )}

          {exam.metadata.date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color="#666" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Date</Text>
                <Text style={styles.infoValue}>
                  {ExamService.formatDate(new Date(exam.metadata.date))}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="code-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Exam Code</Text>
              <View style={styles.codeContainer}>
                <Text style={styles.examCode}>{exam.metadata.examCode}</Text>
                <TouchableOpacity
                  onPress={() =>
                    copyToClipboard(exam.metadata.examCode, "Exam code")
                  }
                >
                  <Ionicons name="copy-outline" size={18} color="#00a550" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Exam Configuration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration</Text>

          <View style={styles.configGrid}>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Total Questions</Text>
              <Text style={styles.configValue}>{exam.totalQuestions}</Text>
            </View>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Choice Format</Text>
              <Text style={styles.configValue}>{exam.choiceFormat}</Text>
            </View>
          </View>

          {exam.templateLayout && (
            <>
              <View style={styles.configGrid}>
                <View style={styles.configItem}>
                  <Text style={styles.configLabel}>Columns</Text>
                  <Text style={styles.configValue}>
                    {exam.templateLayout.columns}
                  </Text>
                </View>
                <View style={styles.configItem}>
                  <Text style={styles.configLabel}>Questions/Column</Text>
                  <Text style={styles.configValue}>
                    {exam.templateLayout.questionsPerColumn}
                  </Text>
                </View>
              </View>
              <View style={styles.templateInfo}>
                <Ionicons name="grid-outline" size={16} color="#666" />
                <Text style={styles.templateText}>
                  Template: {exam.templateLayout.name}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Answer Key Preview Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Answer Key Preview</Text>
            {exam.answerKey.locked && (
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={12} color="#fff" />
                <Text style={styles.lockedText}>Locked</Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionSubtitle}>Read-only view</Text>
          {renderAnswerKeyGrid()}
        </View>

        {/* Version Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Version Information</Text>

          <View style={styles.versionInfo}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Version:</Text>
              <Text style={styles.versionValue}>v{exam.metadata.version}</Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Last Modified:</Text>
              <Text style={styles.versionValue}>
                {ExamService.formatTimestamp(exam.lastModified)}
              </Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Created:</Text>
              <Text style={styles.versionValue}>
                {ExamService.formatTimestamp(exam.metadata.createdAt)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 20,
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
  backIcon: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  statusText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#999",
    marginBottom: 12,
    fontStyle: "italic",
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e74c3c",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  lockedText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  codeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  examCode: {
    fontSize: 20,
    color: "#00a550",
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  configGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  configItem: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  configLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  configValue: {
    fontSize: 18,
    color: "#333",
    fontWeight: "bold",
  },
  templateInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  templateText: {
    fontSize: 13,
    color: "#666",
  },
  answerKeyGrid: {
    gap: 8,
  },
  answerKeyRow: {
    flexDirection: "row",
    gap: 8,
  },
  answerKeyItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  questionNumber: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
    minWidth: 24,
  },
  answerBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00a550",
    justifyContent: "center",
    alignItems: "center",
  },
  answerText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "bold",
  },
  versionInfo: {
    gap: 8,
  },
  versionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  versionLabel: {
    fontSize: 14,
    color: "#666",
  },
  versionValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: "#e74c3c",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#00a550",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonText: {
    color: "#666",
    fontSize: 16,
  },
});
