import StatusManager from "@/components/exam/StatusManager";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { NetworkService } from "@/services/networkService";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
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
  const refreshKey = params.refresh as string; // Add refresh trigger
  const goToQuizzes = () => router.replace("/(tabs)/quizzes");

  const [exam, setExam] = useState<ExamPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [headerTopPadding, setHeaderTopPadding] = useState(56);
  const loadRequestRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    const top =
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 16 : 56;
    setHeaderTopPadding(top);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
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
      bg: "#111815",
      headerBg: "#1a2520",
      border: "#34483f",
      cardBg: "#1f2b26",
      cardSoft: "#2a3a33",
      title: "#e7f1eb",
      text: "#b9c9c0",
      icon: "#8fd1ad",
      accent: "#9bd8b8",
    }
    : {
      bg: "#eef1ef",
      headerBg: "#3d5a3d",
      border: "#2f4a38",
      cardBg: "#3d5a3d",
      cardSoft: "#2d4a2d",
      title: "#e8f6ee",
      text: "#b8d4b8",
      icon: "#8fd1ad",
      accent: "#8fd1ad",
    };

  useEffect(() => {
    loadExamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, refreshKey]); // Reload when refreshKey changes

  const loadExamData = async () => {
    const requestId = ++loadRequestRef.current;
    try {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setLoading(true);
      setError(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setError("You must be logged in to view exams.");
        return;
      }

      // Check if we're online
      const online = await NetworkService.isOnline();
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setIsOffline(!online);

      // Fetch exam data (getExamById handles online/offline and cache/staging logic)
      const examData = await ExamService.getExamById(examId);

      if (!mountedRef.current || requestId !== loadRequestRef.current) return;

      if (!examData) {
        setError("Exam not found or not available offline.");
        return;
      }

      setExam(examData);
    } catch (err) {
      console.error("Error loading exam preview:", err);
      if (mountedRef.current && requestId === loadRequestRef.current) {
        setError("Failed to load exam data. Please try again.");
      }
    } finally {
      if (mountedRef.current && requestId === loadRequestRef.current) {
        setLoading(false);
      }
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

    // Check if there are any answers
    const hasAnswers = exam.answerKey.answers.some(
      (answer) => answer && answer.trim() !== "",
    );

    if (!hasAnswers) {
      return (
        <View
          style={[
            styles.noAnswersContainer,
            darkModeEnabled && {
              backgroundColor: "#3a3120",
              borderColor: "#8c6b2f",
            },
          ]}
        >
          <Ionicons name="alert-circle-outline" size={48} color="#ff9800" />
          <Text style={[styles.noAnswersText, darkModeEnabled && { color: "#ffd88a" }]}>No answers set yet</Text>
          <Text style={[styles.noAnswersSubtext, darkModeEnabled && { color: "#ffd88a" }]}>
            Click Edit Answer Key below to set the correct answers
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.answerKeyGrid}>
        {grid.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.answerKeyRow}>
            {row.map((questionNum) => {
              const answer = exam.answerKey.answers[questionNum - 1] || "";
              const hasAnswer = answer && answer.trim() !== "";
              return (
                <View
                  key={questionNum}
                  style={[
                    styles.answerKeyItem,
                    {
                      backgroundColor: darkModeEnabled ? "#2a3a33" : colors.cardSoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.questionNumber,
                      darkModeEnabled && { color: "#b9c9c0" },
                    ]}
                  >
                    {questionNum}.
                  </Text>
                  <View
                    style={[
                      styles.answerBubble,
                      darkModeEnabled && { backgroundColor: "#2f6d58" },
                      !hasAnswer && styles.answerBubbleEmpty,
                      darkModeEnabled && !hasAnswer && { backgroundColor: "#46514c" },
                    ]}
                  >
                    <Text style={styles.answerText}>
                      {hasAnswer ? answer : "?"}
                    </Text>
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
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#00a550" />
        <Text style={[styles.loadingText, { color: colors.text }]}>Loading exam data...</Text>
      </View>
    );
  }

  if (error || !exam) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <Ionicons name="alert-circle-outline" size={64} color="#e74c3c" />
        <Text style={styles.errorText}>{error || "Exam not found"}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadExamData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={goToQuizzes}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: headerTopPadding,
            backgroundColor: colors.headerBg,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity style={styles.backIcon} onPress={goToQuizzes}>
          <Ionicons name="arrow-back" size={24} color={colors.title} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.title }]}>Exam Preview</Text>
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
          </View>
        )}
        {!isOffline && <View style={styles.placeholder} />}
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
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Exam Information</Text>

          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={20} color={colors.icon} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.text }]}>Title</Text>
              <Text style={[styles.infoValue, { color: colors.title }]}>{exam.metadata.title}</Text>
            </View>
          </View>

          {exam.metadata.subject && (
            <View style={styles.infoRow}>
              <Ionicons name="book-outline" size={20} color={colors.icon} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.text }]}>Subject</Text>
                <Text style={[styles.infoValue, { color: colors.title }]}>{exam.metadata.subject}</Text>
              </View>
            </View>
          )}

          {exam.metadata.section && (
            <View style={styles.infoRow}>
              <Ionicons name="people-outline" size={20} color={colors.icon} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.text }]}>Section</Text>
                <Text style={[styles.infoValue, { color: colors.title }]}>{exam.metadata.section}</Text>
              </View>
            </View>
          )}

          {exam.metadata.date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color={colors.icon} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.text }]}>Date</Text>
                <Text style={[styles.infoValue, { color: colors.title }]}>
                  {ExamService.formatDate(new Date(exam.metadata.date))}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="code-outline" size={20} color={colors.icon} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.text }]}>Exam Code</Text>
              <View style={styles.codeContainer}>
                <Text style={[styles.examCode, { color: colors.accent }]}>{exam.metadata.examCode}</Text>
                <TouchableOpacity
                  onPress={() =>
                    copyToClipboard(exam.metadata.examCode, "Exam code")
                  }
                >
                  <Ionicons name="copy-outline" size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Exam Configuration Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Configuration</Text>

          <View style={styles.configGrid}>
            <View
              style={[
                styles.configItem,
                { backgroundColor: darkModeEnabled ? "#2a3a33" : colors.cardSoft },
              ]}
            >
              <Text style={[styles.configLabel, { color: colors.text }]}>Total Questions</Text>
              <Text style={[styles.configValue, { color: colors.title }]}>{exam.totalQuestions}</Text>
            </View>
            <View
              style={[
                styles.configItem,
                { backgroundColor: darkModeEnabled ? "#2a3a33" : colors.cardSoft },
              ]}
            >
              <Text style={[styles.configLabel, { color: colors.text }]}>Choice Format</Text>
              <Text style={[styles.configValue, { color: colors.title }]}>{exam.choiceFormat}</Text>
            </View>
          </View>

          {exam.templateLayout && (
            <>
              <View style={styles.configGrid}>
                <View
                  style={[
                    styles.configItem,
                    { backgroundColor: darkModeEnabled ? "#2a3a33" : colors.cardSoft },
                  ]}
                >
                  <Text style={[styles.configLabel, { color: colors.text }]}>Columns</Text>
                  <Text style={[styles.configValue, { color: colors.title }]}>
                    {exam.templateLayout.columns}
                  </Text>
                </View>
                <View
                  style={[
                    styles.configItem,
                    { backgroundColor: darkModeEnabled ? "#2a3a33" : colors.cardSoft },
                  ]}
                >
                  <Text style={[styles.configLabel, { color: colors.text }]}>Questions Rows</Text>
                  <Text style={[styles.configValue, { color: colors.title }]}>
                    {exam.templateLayout.questionsPerColumn}
                  </Text>
                </View>
              </View>
              <View style={[styles.templateInfo, { borderTopColor: colors.border }]}>
                <Ionicons name="grid-outline" size={16} color={colors.text} />
                <Text style={[styles.templateText, { color: colors.text }]}>
                  Template: {exam.templateLayout.name}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Answer Key Preview Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.title }]}>Answer Key Preview</Text>
            {exam.answerKey.locked && (
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={12} color="#fff" />
                <Text style={styles.lockedText}>Locked</Text>
              </View>
            )}
          </View>
          <Text style={[styles.sectionSubtitle, { color: colors.text }]}>Read-only view</Text>
          {renderAnswerKeyGrid()}
        </View>

        {/* Status Management Section */}
        <StatusManager
          examId={examId}
          currentStatus={exam.metadata.status}
          darkModeEnabled={darkModeEnabled}
          onStatusChanged={loadExamData}
        />

        {/* Version Information */}
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Version Information</Text>

          <View style={styles.versionInfo}>
            <View style={[styles.versionRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.versionLabel, { color: colors.text }]}>Version:</Text>
              <Text style={[styles.versionValue, { color: colors.title }]}>v{exam.metadata.version}</Text>
            </View>
            <View style={[styles.versionRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.versionLabel, { color: colors.text }]}>Last Modified:</Text>
              <Text style={[styles.versionValue, { color: colors.title }]}>
                {ExamService.formatTimestamp(exam.lastModified)}
              </Text>
            </View>
            <View style={[styles.versionRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.versionLabel, { color: colors.text }]}>Created:</Text>
              <Text style={[styles.versionValue, { color: colors.title }]}>
                {ExamService.formatTimestamp(exam.metadata.createdAt)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View
        style={[
          styles.actionButtons,
          { backgroundColor: darkModeEnabled ? "#1a2520" : "#e6efe8", borderTopColor: colors.border },
        ]}
      >
        {exam.metadata.status === "Draft" && (
          <TouchableOpacity
            style={[
              styles.editExamButton,
              darkModeEnabled && { backgroundColor: "#5b4730", borderWidth: 1, borderColor: "#8a6d45" },
            ]}
            onPress={() => router.push(`/(tabs)/edit-exam?examId=${examId}`)}
          >
            <Ionicons name="pencil-outline" size={20} color="#fff" />
            <Text style={styles.editExamButtonText}>Edit Exam</Text>
          </TouchableOpacity>
        )}
        {exam.metadata.status === "Draft" && (
          <TouchableOpacity
            style={[
              styles.editButton,
              darkModeEnabled && { backgroundColor: "#204236", borderWidth: 1, borderColor: "#3a6c5a" },
            ]}
            onPress={() =>
              router.push(`/(tabs)/edit-answer-key?examId=${examId}`)
            }
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.editButtonText}>Edit Answer Key</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.printButton,
            darkModeEnabled && { backgroundColor: "#263f35", borderWidth: 1, borderColor: "#3e6657" },
          ]}
          onPress={() =>
            router.push(`/(tabs)/print-answer-sheet?examId=${examId}`)
          }
        >
          <Ionicons name="print-outline" size={20} color="#fff" />
          <Text style={styles.printButtonText}>Print Sheets</Text>
        </TouchableOpacity>
      </View>

      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#edf3ee",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#edf3ee",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: "#3d5a3d",
    borderBottomWidth: 1,
    borderBottomColor: "#2f4a38",
  },
  backIcon: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#eef7f0",
  },
  placeholder: {
    width: 32,
  },
  offlineBadge: {
    backgroundColor: "#ff9800",
    borderRadius: 16,
    padding: 6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 40,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#f3f7f4",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#cad9cf",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2b4337",
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#5f7668",
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
    marginBottom: 12,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: "#607a69",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: "#2d4639",
    fontWeight: "500",
  },
  codeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  examCode: {
    fontSize: 20,
    color: "#2d7a5f",
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  configGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  configItem: {
    flex: 1,
    backgroundColor: "#e6efe8",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  configLabel: {
    fontSize: 12,
    color: "#527060",
    marginBottom: 4,
  },
  configValue: {
    fontSize: 18,
    color: "#234033",
    fontWeight: "bold",
  },
  templateInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#cad9cf",
  },
  templateText: {
    fontSize: 13,
    color: "#4f6b5a",
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
    backgroundColor: "#e6efe8",
    padding: 9,
    borderRadius: 8,
    gap: 8,
  },
  questionNumber: {
    fontSize: 14,
    color: "#4f6b5a",
    fontWeight: "600",
    minWidth: 24,
  },
  answerBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2d7a5f",
    justifyContent: "center",
    alignItems: "center",
  },
  answerBubbleEmpty: {
    backgroundColor: "#ccc",
  },
  answerText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "bold",
  },
  noAnswersContainer: {
    alignItems: "center",
    padding: 32,
    backgroundColor: "#fff3cd",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffc107",
  },
  noAnswersText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#856404",
    marginTop: 12,
    marginBottom: 8,
  },
  noAnswersSubtext: {
    fontSize: 14,
    color: "#856404",
    textAlign: "center",
  },
  versionInfo: {
    gap: 8,
  },
  versionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#d7e4db",
  },
  versionLabel: {
    fontSize: 14,
    color: "#4f6b5a",
  },
  versionValue: {
    fontSize: 14,
    color: "#2b4337",
    fontWeight: "500",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#4f6b5a",
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: "#e74c3c",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#2d7a5f",
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
    color: "#3d5a3d",
    fontSize: 16,
  },
  actionButtons: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    backgroundColor: "#e5efe8",
    borderTopWidth: 1,
    borderTopColor: "#cad9cf",
    flexWrap: "wrap",
  },
  editExamButton: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#ff9800",
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  editExamButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  editButton: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#2d7a5f",
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  editButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  printButton: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#2f6d58",
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  printButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
