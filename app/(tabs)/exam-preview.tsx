import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { NetworkService } from "@/services/networkService";
import { OfflineStorageService } from "@/services/offlineStorageService";
import { ResultsService, type UnifiedResultRow } from "@/services/resultsService";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { ExamService as ExamApi } from "@/services/examService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Clipboard,
} from "react-native";
import Toast from "react-native-toast-message";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import { ExamPreviewData } from "../../types/exam";

export default function ExamPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const examId = params.examId as string;
  const refreshKey = params.refresh as string; // Add refresh trigger
  const classId = params.classId as string | undefined;
  const requestedTab = params.tab as "answerKey" | "results" | undefined;
  const goToQuizzes = () =>
    classId
      ? router.replace(`/(tabs)/class-details?classId=${classId}&tab=exams`)
      : router.replace("/(tabs)/quizzes");

  const [exam, setExam] = useState<ExamPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [headerTopPadding, setHeaderTopPadding] = useState(56);
  const [activeTab, setActiveTab] = useState<"answerKey" | "results">(
    requestedTab === "results" ? "results" : "answerKey",
  );
  const [examResults, setExamResults] = useState<UnifiedResultRow[]>([]);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [viewCodeVisible, setViewCodeVisible] = useState(false);
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const loadRequestRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const resolvedAnswers = React.useMemo(() => {
    if (!exam) return [];

    const directAnswers = Array.isArray(exam.answerKey.answers)
      ? exam.answerKey.answers.map((answer) => String(answer || ""))
      : [];

    if (directAnswers.some((answer) => answer.trim() !== "")) {
      return directAnswers;
    }

    const settings = Array.isArray(exam.answerKey.questionSettings)
      ? exam.answerKey.questionSettings
      : [];

    if (!settings.length) {
      return directAnswers;
    }

    return Array.from({ length: exam.totalQuestions }, (_, index) => {
      const match = settings.find(
        (item) => Number(item.questionNumber) === index + 1,
      );
      return String(match?.correctAnswer || "");
    });
  }, [exam]);

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

  const colors = {
    bg: "#FFFFFF",
    headerBg: "#FFFFFF",
    border: "#ECEEF2",
    cardBg: "#FFFFFF",
    cardSoft: "#F7F8FA",
    title: "#1F2937",
    text: "#9AA3B2",
    icon: "#667085",
    accent: "#20BE7B",
  };

  useEffect(() => {
    setExam(null);
    setExamResults([]);
    setError(null);
    setLoading(true);
    setResultsLoading(true);
    setSettingsMenuVisible(false);
    setViewCodeVisible(false);
    setArchiveConfirmVisible(false);
    setDeleteConfirmVisible(false);
    loadExamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, refreshKey]); // Reload when refreshKey changes

  useEffect(() => {
    setActiveTab(requestedTab === "results" ? "results" : "answerKey");
  }, [requestedTab]);

  const loadExamData = async () => {
    const requestId = ++loadRequestRef.current;
    try {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setLoading(true);
      setResultsLoading(true);
      setError(null);
      setExam(null);
      setExamResults([]);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setError("You must be logged in to view exams.");
        return;
      }

      const online = await NetworkService.isOnline().catch(() => true);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setIsOffline(!online);
      let liveLoadError: unknown = null;

      try {
        const authorized = await ExamApi.isAuthorized(
          currentUser.uid,
          examId,
        );
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        if (!authorized) {
          setError("You are not authorized to view this exam.");
          return;
        }

        const [examData, resultRows] = await Promise.all([
          ExamApi.getExamById(examId),
          ResultsService.getExamResults(examId).catch(() => []),
        ]);
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        if (!examData) {
          throw new Error("Exam not found in live data");
        }

        setIsOffline(false);
        setExam(examData);
        setExamResults(resultRows);
        return;
      } catch (liveError) {
        liveLoadError = liveError;
        console.warn(
          "Failed to fetch live exam data, attempting offline fallback:",
          liveError,
        );
      }

      // Offline fallback
      const offlineExam = await OfflineStorageService.getDownloadedExam(examId);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      if (!offlineExam) {
        if (liveLoadError) {
          const message =
            liveLoadError instanceof Error && liveLoadError.message
              ? liveLoadError.message
              : "Failed to load exam data. Please try again.";
          setError(message);
        } else {
          setError(
            "This exam is not available offline. Please connect to the internet.",
          );
        }
        return;
      }

      const examData: ExamPreviewData = {
        metadata: {
          examId,
          examCode: String((offlineExam as any).examCode || examId),
          title: offlineExam.title,
          subject: "",
          section: "",
          date: offlineExam.createdAt.toISOString(),
          status: "Active",
          version: offlineExam.version,
          createdAt: offlineExam.createdAt,
          updatedAt: offlineExam.updatedAt,
          createdBy: offlineExam.createdBy || "",
        },
        totalQuestions: offlineExam.questions?.length || 0,
        choiceFormat: "A-D",
        answerKey: {
          id: `ak_${examId}_offline`,
          examId,
          answers: offlineExam.answerKey?.answers || [],
          questionSettings: [],
          locked: true,
          createdAt: offlineExam.createdAt,
          updatedAt: offlineExam.updatedAt,
          createdBy: offlineExam.createdBy || "",
          version: offlineExam.version || 1,
        },
        lastModified: offlineExam.updatedAt,
      };

      setExam(examData);

      try {
        const resultRows = await ResultsService.getExamResults(examId);
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setExamResults(resultRows);
      } catch (resultsError) {
        console.warn("Failed to load exam results:", resultsError);
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setExamResults([]);
      }
    } catch (err) {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setError("Failed to load exam data. Please try again.");
      console.error(err);
    } finally {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setLoading(false);
      setResultsLoading(false);
    }
  };

  const closeSettingsMenu = () => {
    setSettingsMenuVisible(false);
  };

  const handleArchiveExam = async () => {
    try {
      await updateDoc(doc(db, "exams", examId), { isArchived: true });
      setArchiveConfirmVisible(false);
      setSettingsMenuVisible(false);
      Toast.show({
        type: "success",
        text1: "Archived",
        text2: `${exam?.metadata.title || "Exam"} moved to Archived`,
      });
      goToQuizzes();
    } catch (error) {
      console.error("Error archiving exam:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to archive exam",
      });
    }
  };

  const handleDeleteExam = async () => {
    try {
      await deleteDoc(doc(db, "exams", examId));
      setDeleteConfirmVisible(false);
      setSettingsMenuVisible(false);
      Toast.show({
        type: "success",
        text1: "Deleted",
        text2: "Exam deleted successfully",
      });
      goToQuizzes();
    } catch (error) {
      console.error("Error deleting exam:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to delete exam",
      });
    }
  };

  const renderAnswerKeyGrid = () => {
    if (!exam) return null;

    const columns = 5;
    const rows = Math.ceil(exam.totalQuestions / columns);
    const grid: number[][] = [];

    for (let i = 0; i < rows; i++) {
      const row: number[] = [];
      for (let j = 0; j < columns; j++) {
        const questionNum = i * columns + j + 1;
        if (questionNum <= exam.totalQuestions) {
          row.push(questionNum);
        }
      }
      grid.push(row);
    }

    // Check if there are any answers
    const hasAnswers = resolvedAnswers.some(
      (answer) => answer && answer.trim() !== "",
    );

    if (!hasAnswers) {
      return (
        <View style={styles.emptyPanel}>
          <Ionicons name="alert-circle-outline" size={40} color="#F59E0B" />
          <Text style={styles.emptyPanelTitle}>No answers set yet</Text>
          <Text style={styles.emptyPanelText}>
            Set the correct answers to show the answer key here.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.answerKeyGrid}>
        {grid.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.answerKeyRow}>
            {row.map((questionNum) => {
              const answer = resolvedAnswers[questionNum - 1] || "";
              const hasAnswer = answer && answer.trim() !== "";
              return (
                <View
                  key={questionNum}
                  style={styles.answerKeyItem}
                >
                  <Text style={styles.questionNumber}>{questionNum}</Text>
                  <View
                    style={[
                      styles.answerBubble,
                      !hasAnswer && styles.answerBubbleEmpty,
                    ]}
                  >
                    <Text style={[styles.answerText, !hasAnswer && styles.answerTextEmpty]}>
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

  const renderResultsList = () => {
    if (resultsLoading) {
      return (
        <View style={styles.resultsState}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.resultsStateText, { color: colors.text }]}>
            Loading results...
          </Text>
        </View>
      );
    }

    if (!examResults.length) {
      return (
        <View style={styles.emptyPanel}>
          <Ionicons name="people-outline" size={36} color="#98A2B3" />
          <Text style={styles.emptyPanelTitle}>No results yet</Text>
          <Text style={styles.emptyPanelText}>
            Student scores will appear here after scanning or grading.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.resultsList}>
        {examResults.map((result) => {
          const initials = result.studentName
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("");
          const scoreColors =
            result.percentage >= 85
              ? { badge: "#D8F3E7", text: "#20A86B" }
              : result.percentage >= 70
                ? { badge: "#F5E8B8", text: "#D68B11" }
                : { badge: "#F9D7D9", text: "#E24E5C" };

          return (
            <View
              key={result.id}
              style={[
                styles.resultCard,
                {
                  backgroundColor: "#FFFFFF",
                  borderColor: "#E8EBF0",
                },
              ]}
            >
              <View style={[styles.resultAvatar, { backgroundColor: scoreColors.badge }]}>
                <Text style={[styles.resultAvatarText, { color: scoreColors.text }]}>
                  {initials || "?"}
                </Text>
              </View>

              <View style={styles.resultCardBody}>
                <Text style={styles.resultStudentName}>{result.studentName}</Text>
                <Text style={styles.resultStudentMeta}>
                  ID: {result.studentId || "N/A"}
                </Text>
              </View>

              <View style={styles.resultScoreWrap}>
                <Text style={[styles.resultPercentage, { color: scoreColors.text }]}>
                  {result.percentage}%
                </Text>
                <View style={[styles.resultCorrectBadge, { backgroundColor: scoreColors.badge }]}>
                  <Text style={[styles.resultCorrectText, { color: scoreColors.text }]}>
                    {result.correctLabel}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
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
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.title }]}>
            {exam.metadata.title}
          </Text>
          {exam.metadata.examCode ? (
            <Text style={[styles.headerCode, { color: colors.text }]}>
              {exam.metadata.examCode}
            </Text>
          ) : null}
          <Text style={[styles.headerSubtitle, { color: colors.text }]}>
            {exam.totalQuestions} Questions
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => setSettingsMenuVisible(true)}
        >
          <Ionicons
            name={isOffline ? "cloud-offline-outline" : "settings-outline"}
            size={20}
            color={colors.title}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabSwitcher, { backgroundColor: "#FFFFFF", borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "answerKey" && styles.tabButtonActive]}
          onPress={() => setActiveTab("answerKey")}
        >
          <Text
            style={[
              styles.tabButtonText,
              { color: "#6B7280" },
              activeTab === "answerKey" && styles.tabButtonTextActive,
            ]}
          >
            Answer Key
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "results" && styles.tabButtonActive]}
          onPress={() => setActiveTab("results")}
        >
          <Text
            style={[
              styles.tabButtonText,
              { color: "#6B7280" },
              activeTab === "results" && styles.tabButtonTextActive,
            ]}
          >
            Results
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "answerKey" ? (
          <View
            style={[
              styles.section,
              { backgroundColor: colors.cardBg, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>Answer Key</Text>
              {exam.metadata.status === "Draft" ? (
                <TouchableOpacity
                  style={styles.inlineEditButton}
                  onPress={() =>
                    router.push(
                      `/(tabs)/edit-answer-key?examId=${examId}${
                        classId ? `&classId=${classId}` : ""
                      }&tab=exams`,
                    )
                  }
                >
                  <Text style={styles.inlineEditButtonText}>Edit</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.inlineEditButton}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push(
                      `/(tabs)/edit-answer-key?examId=${examId}${
                        classId ? `&classId=${classId}` : ""
                      }&tab=exams`,
                    )
                  }
                >
                  <Text style={styles.inlineEditButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.sectionSubtitle, { color: colors.text }]}>
              {exam.totalQuestions} Questions • Multiple Choice
            </Text>
            <View style={styles.infoRow}>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Exam Code</Text>
                <View style={styles.codeContainer}>
                  <Text style={styles.examCode}>
                    {exam.metadata.examCode || "Not available"}
                  </Text>
                  {exam.metadata.examCode ? (
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={() => {
                        Clipboard.setString(exam.metadata.examCode);
                        Toast.show({
                          type: "success",
                          text1: "Copied",
                          text2: "Exam code copied to clipboard",
                        });
                      }}
                    >
                      <Ionicons name="copy-outline" size={18} color="#20BE7B" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
            {renderAnswerKeyGrid()}
          </View>
        ) : (
          <View
            style={[
              styles.section,
              { backgroundColor: colors.cardBg, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.title }]}>Results</Text>
            {renderResultsList()}
          </View>
        )}
      </ScrollView>

      {settingsMenuVisible ? (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={closeSettingsMenu}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={styles.examMenuContent}
          >
            <View style={styles.examMenuHeader}>
              <Text style={styles.examMenuTitle} numberOfLines={1}>
                {exam.metadata.title}
              </Text>
              <TouchableOpacity
                style={styles.menuCloseButton}
                onPress={closeSettingsMenu}
              >
                <Ionicons name="close" size={18} color="#98A2B3" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setSettingsMenuVisible(false);
                setViewCodeVisible(true);
              }}
            >
              <Text style={styles.menuItemText}>View Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setSettingsMenuVisible(false);
                setArchiveConfirmVisible(true);
              }}
            >
              <Text style={[styles.menuItemText, styles.menuArchiveText]}>
                Archive Exam
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setSettingsMenuVisible(false);
                setDeleteConfirmVisible(true);
              }}
            >
              <Text style={[styles.menuItemText, styles.menuDeleteText]}>
                Delete Exam
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      ) : null}

      {viewCodeVisible ? (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setViewCodeVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={styles.codeCard}
          >
            <View style={styles.codeHeader}>
              <Text style={styles.codeTitle}>Exam Code</Text>
              <TouchableOpacity
                style={styles.codeCloseButton}
                onPress={() => setViewCodeVisible(false)}
              >
                <Ionicons name="close" size={18} color="#98A2B3" />
              </TouchableOpacity>
            </View>
            <View style={styles.codeRow}>
              <Text style={styles.codeValue}>
                {exam.metadata.examCode || "No exam code available"}
              </Text>
              {exam.metadata.examCode ? (
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => {
                    Clipboard.setString(exam.metadata.examCode);
                    Toast.show({
                      type: "success",
                      text1: "Copied",
                      text2: "Exam code copied to clipboard",
                    });
                  }}
                >
                  <Ionicons name="copy-outline" size={18} color="#20BE7B" />
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      ) : null}

      <ConfirmationModal
        visible={archiveConfirmVisible}
        title="Archive Item"
        message={`Are you sure you want to archive ${exam.metadata.title}? You can still view it later in the archived section.`}
        cancelText="Cancel"
        confirmText="Archive"
        destructive
        onCancel={() => setArchiveConfirmVisible(false)}
        onConfirm={handleArchiveExam}
      />

      <ConfirmationModal
        visible={deleteConfirmVisible}
        title="Delete Item"
        message={`Are you sure you want to delete ${exam.metadata.title}? This action cannot be undone.`}
        cancelText="Cancel"
        confirmText="Delete"
        destructive
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={handleDeleteExam}
      />

      <Toast />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF2",
  },
  backIcon: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1F2937",
    textAlign: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 4,
    color: "#98A2B3",
  },
  headerCode: {
    fontSize: 11,
    marginTop: 3,
    color: "#7B8494",
    fontWeight: "600",
  },
  headerAction: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  menuOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 112,
    paddingHorizontal: 20,
  },
  examMenuContent: {
    width: 196,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  examMenuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  examMenuTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2937",
    marginRight: 8,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  menuArchiveText: {
    color: "#F59E0B",
  },
  menuDeleteText: {
    color: "#E24E5C",
  },
  codeCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  codeTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1F2937",
  },
  codeCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F8FA",
  },
  menuCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F8FA",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  codeValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#20BE7B",
    textAlign: "center",
  },
  copyButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9F8F1",
  },
  tabSwitcher: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 20,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: {
    borderBottomColor: "#20BE7B",
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: "#20BE7B",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 0,
    padding: 0,
    marginBottom: 10,
    borderWidth: 0,
    borderColor: "transparent",
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
    color: "#1F2937",
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#8E97A6",
    marginBottom: 18,
  },
  inlineEditButton: {
    minWidth: 54,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#E9F8F1",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineEditButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#20BE7B",
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
    gap: 14,
  },
  answerKeyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  answerKeyItem: {
    width: 56,
    alignItems: "center",
    gap: 8,
  },
  questionNumber: {
    fontSize: 12,
    color: "#A4ACBA",
    fontWeight: "600",
  },
  answerBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#D6F2DE",
    borderWidth: 1,
    borderColor: "#B7E8C6",
    justifyContent: "center",
    alignItems: "center",
  },
  answerBubbleEmpty: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  answerText: {
    fontSize: 13,
    color: "#16A34A",
    fontWeight: "700",
  },
  answerTextEmpty: {
    color: "#D0D5DD",
  },
  emptyPanel: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyPanelTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginTop: 12,
    marginBottom: 8,
  },
  emptyPanelText: {
    fontSize: 14,
    color: "#8E97A6",
    textAlign: "center",
  },
  resultsState: {
    paddingVertical: 18,
    alignItems: "center",
    gap: 10,
  },
  resultsStateText: {
    fontSize: 14,
    fontWeight: "500",
  },
  resultsList: {
    gap: 12,
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  resultAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  resultAvatarText: {
    fontSize: 12,
    fontWeight: "800",
  },
  resultCardBody: {
    flex: 1,
    gap: 2,
  },
  resultStudentName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  resultStudentMeta: {
    fontSize: 11,
    color: "#A4ACBA",
  },
  resultScoreWrap: {
    alignItems: "flex-end",
    gap: 8,
  },
  resultPercentage: {
    fontSize: 24,
    fontWeight: "800",
  },
  resultCorrectBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  resultCorrectText: {
    fontSize: 10,
    fontWeight: "700",
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
});
