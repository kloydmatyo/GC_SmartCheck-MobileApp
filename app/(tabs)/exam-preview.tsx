import ConfirmationModal from "@/components/common/ConfirmationModal";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { ExamService as ExamApi } from "@/services/examService";
import { NetworkService } from "@/services/networkService";
import {
  ResultsService,
  type UnifiedResultRow,
} from "@/services/resultsService";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { WebView } from "react-native-webview";
import { auth } from "../../config/firebase";
import { ExamPreviewData } from "../../types/exam";
import {
  buildAnswerSheetHtml,
  generateAnswerSheetPDF,
  type AnswerSheetTemplateData,
} from "../../utils/answerSheetGenerator";

function buildExamPreviewPdfHtml(exam: ExamPreviewData): string {
  const total = exam.totalQuestions;
  const title = exam.metadata.title || "Untitled Exam";
  const section = exam.metadata.section || exam.metadata.subject || "";
  const examCode = exam.metadata.examCode || "EX-XXXXXX";
  const version = exam.metadata.version || 1;
  const choiceLabels =
    exam.choiceFormat === "A-D"
      ? ["A", "B", "C", "D"]
      : ["A", "B", "C", "D", "E"];
  const pageCount = Math.max(1, Math.ceil(total / 100));

  const renderQuestions = (start: number, end: number) => {
    const questionsPerColumn = 10;
    const columns = 5;
    const rows = Math.ceil((end - start + 1) / columns);
    const columnsHtml = Array.from({ length: columns }, (_, columnIndex) => {
      const colStart = start + columnIndex * rows;
      const items = Array.from({ length: rows }, (_, rowIndex) => {
        const questionNumber = colStart + rowIndex;
        if (questionNumber > end) return "";
        return `
          <div class="question-row">
            <div class="question-number">${questionNumber}</div>
            ${choiceLabels.map(() => `<div class="bubble"></div>`).join("")}
          </div>`;
      });
      return `<div class="question-column">${items.join("")}</div>`;
    });
    return `<div class="questions-grid">${columnsHtml.join("")}</div>`;
  };

  const pagesHtml = Array.from({ length: pageCount }, (_, pageIndex) => {
    const start = pageIndex * 100 + 1;
    const end = Math.min(total, start + 99);
    return `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="exam-label">GC SmartCheck</div>
            <div class="exam-title">${title}</div>
            <div class="exam-subtitle">${section}</div>
          </div>
          <div class="page-meta">
            <div class="page-meta-item">Code: ${examCode}</div>
            <div class="page-meta-item">Version: ${version}</div>
            <div class="page-meta-item">Page ${pageIndex + 1} of ${pageCount}</div>
          </div>
        </div>

        <div class="student-info">
          <div class="student-field">
            <span>Name</span>
            <div class="student-line"></div>
          </div>
          <div class="student-field">
            <span>Date</span>
            <div class="student-line short"></div>
          </div>
          <div class="student-field student-id-block">
            <span>Student ZipGrade ID</span>
            <div class="student-id-grid">
              ${Array.from(
                { length: 8 },
                (_, pos) => `
                <div class="student-id-column">
                  <div class="student-id-label">${pos + 1}</div>
                  ${Array.from({ length: 10 }, () => `<div class="student-id-bubble"></div>`).join("")}
                </div>
              `,
              ).join("")}
            </div>
          </div>
        </div>

        <div class="questions-section">
          <div class="questions-title">Answer Bubbles</div>
          ${renderQuestions(start, end)}
        </div>
      </div>`;
  });

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3,user-scalable=yes"/>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; background: #f2f4f2; color: #222; padding: 22px; display: flex; justify-content: center; }
      .page { width: 794px; min-height: 1123px; margin: 0 auto 18px; background: #fff; padding: 22px; border: 1px solid #D1D5DB; border-radius: 18px; box-shadow: 0 18px 40px rgba(0,0,0,0.12); }
      .page-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
      .exam-label { font-size: 12px; font-weight: 700; color: #1f4f3c; margin-bottom: 3px; }
      .exam-title { font-size: 18px; font-weight: 800; letter-spacing: -0.3px; margin-bottom: 4px; }
      .exam-subtitle { font-size: 11px; color: #5f6b65; }
      .page-meta { display: grid; gap: 5px; text-align: right; font-size: 10px; color: #5f6b65; }
      .page-meta-item { background: #f7faf7; border: 1px solid #dee5dc; border-radius: 10px; padding: 8px 10px; }
      .student-info { display: grid; gap: 12px; margin-bottom: 16px; }
      .student-field { display: flex; flex-direction: column; gap: 6px; font-size: 10px; color: #2f4237; }
      .student-line { height: 14px; border-bottom: 1px solid #444; width: 100%; }
      .student-line.short { width: 70%; }
      .student-id-block { border: 1px solid #d9e2d8; border-radius: 14px; padding: 12px; background: #f8faf7; }
      .student-id-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
      .student-id-column { display: grid; gap: 4px; align-items: center; }
      .student-id-label { font-size: 8px; color: #4f6257; font-weight: 700; }
      .student-id-bubble { width: 14px; height: 14px; border: 1px solid #444; border-radius: 50%; background: #fff; }
      .questions-section { border: 1px solid #d8e0d9; border-radius: 16px; background: #f8faf7; padding: 14px; }
      .questions-title { font-size: 12px; font-weight: 800; margin-bottom: 12px; color: #2f4237; }
      .questions-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
      .question-column { display: grid; gap: 8px; }
      .question-row { display: flex; align-items: center; gap: 8px; font-size: 9px; }
      .question-number { width: 20px; text-align: right; color: #4f6257; font-weight: 700; }
      .bubble { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #4f6257; background: #fff; }
      @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; margin: 0; border: none; page-break-after: always; } }
    </style>
  </head><body>${pagesHtml.join("")}</body></html>`;
}

async function createPdfFromHtml(
  html: string,
  baseName: string,
): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
  });
  const dest = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ""}${baseName}.pdf`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export default function ExamPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const examId = params.examId as string;
  const refreshKey = params.refresh as string; // Add refresh trigger
  const classId = params.classId as string | undefined;
  const requestedTab = params.tab as
    | "answerKey"
    | "preview"
    | "results"
    | undefined;
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
  const [activeTab, setActiveTab] = useState<
    "answerKey" | "preview" | "results"
  >(
    requestedTab === "results"
      ? "results"
      : requestedTab === "preview"
        ? "preview"
        : "answerKey",
  );
  const [examResults, setExamResults] = useState<UnifiedResultRow[]>([]);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [viewCodeVisible, setViewCodeVisible] = useState(false);
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState(false);
  const [previewDownloadLoading, setPreviewDownloadLoading] = useState(false);
  const [webviewLoading, setWebviewLoading] = useState(false);
  const [previewLogoBase64, setPreviewLogoBase64] = useState<
    string | undefined
  >(undefined);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isSectionRefreshing, setIsSectionRefreshing] = useState(false);
  const loadRequestRef = React.useRef(0);
  const resultsRequestRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const previewHeight = React.useMemo(() => {
    if (!exam) return 900;
    const pageCount = Math.max(1, Math.ceil(exam.totalQuestions / 100));
    return Math.min(1400, 900 + (pageCount - 1) * 260);
  }, [exam]);

  const resolvedAnswers = React.useMemo(() => {
    if (!exam || !exam.answerKey) return [];

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

  const previewTemplate = React.useMemo<AnswerSheetTemplateData | null>(() => {
    if (!exam) return null;
    const supportedQuestionCounts = [20, 50, 100, 150, 200] as const;
    const totalQuestions = exam.totalQuestions;
    if (!supportedQuestionCounts.includes(totalQuestions as any)) {
      return null;
    }

    return {
      name: exam.metadata.title || "Exam",
      numQuestions: totalQuestions as 20 | 50 | 100 | 150 | 200,
      choicesPerQuestion: exam.choiceFormat === "A-D" ? 4 : 5,
      examCode: exam.metadata.examCode,
      institutionName: "Gordon College",
      logoBase64: previewLogoBase64,
      answerKey: undefined,
    };
  }, [exam, previewLogoBase64]);

  const previewHtml = React.useMemo(() => {
    if (previewTemplate) {
      return buildAnswerSheetHtml(previewTemplate);
    }

    if (!exam) return null;
    try {
      return buildExamPreviewPdfHtml(exam);
    } catch (err) {
      console.error("[ExamPreview] Failed to build preview HTML:", err);
      return null;
    }
  }, [exam, previewTemplate]);

  useEffect(() => {
    const loadLogo = async () => {
      try {
        const asset = Asset.fromModule(
          require("@/assets/images/gordon-college-logo.png"),
        );
        await asset.downloadAsync();
        if (asset.localUri) {
          const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setPreviewLogoBase64(`data:image/png;base64,${base64}`);
        }
      } catch (err) {
        console.warn("[ExamPreview] Failed to load preview logo:", err);
      }
    };

    loadLogo();
  }, []);

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
        bg: "#F6F8F7",
        headerBg: "#FFFFFF",
        border: "#E5E7EB",
        cardBg: "#FFFFFF",
        cardSoft: "#F3F4F6",
        title: "#111827",
        text: "#374151",
        icon: "#16A34A",
        accent: "#16A34A",
      };

  const loadExamResults = async (id: string) => {
    const requestId = ++resultsRequestRef.current;
    try {
      if (!mountedRef.current || requestId !== resultsRequestRef.current)
        return;
      setResultsLoading(true);
      setExamResults([]);

      const resultRows = await Promise.race([
        ResultsService.getExamResults(id).catch((err) => {
          console.warn("[ExamPreview] Results fetch failed:", err);
          return [] as UnifiedResultRow[];
        }),
        new Promise<UnifiedResultRow[]>((resolve) =>
          setTimeout(() => resolve([]), 8000),
        ),
      ]);

      if (!mountedRef.current || requestId !== resultsRequestRef.current)
        return;
      setExamResults(resultRows);
    } catch (err) {
      if (!mountedRef.current || requestId !== resultsRequestRef.current)
        return;
      console.warn("[ExamPreview] Failed to load results:", err);
      setExamResults([]);
    } finally {
      if (!mountedRef.current || requestId !== resultsRequestRef.current)
        return;
      setResultsLoading(false);
    }
  };

  const handleDownloadPreviewPdf = async () => {
    if (previewTemplate) {
      setPreviewDownloadLoading(true);
      try {
        await generateAnswerSheetPDF(previewTemplate);
      } catch (error: any) {
        console.error("[ExamPreview] Download PDF failed:", error);
        Toast.show({
          type: "error",
          text1: "Download failed",
          text2: error?.message ?? "Unable to generate PDF.",
        });
      } finally {
        setPreviewDownloadLoading(false);
      }
      return;
    }

    if (!previewHtml || !exam) return;
    setPreviewDownloadLoading(true);
    try {
      const localUri = await createPdfFromHtml(
        previewHtml,
        `exam-preview-${examId}-${Date.now()}`,
      );

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          mimeType: "application/pdf",
          dialogTitle: "Download PDF Preview",
          UTI: "com.adobe.pdf",
        });
      } else {
        Toast.show({
          type: "success",
          text1: "Saved",
          text2: `PDF saved to: ${localUri}`,
        });
      }
    } catch (error: any) {
      console.error("[ExamPreview] Download PDF failed:", error);
      Toast.show({
        type: "error",
        text1: "Download failed",
        text2: error?.message ?? "Unable to generate PDF preview.",
      });
    } finally {
      setPreviewDownloadLoading(false);
    }
  };

  const loadExamData = React.useCallback(async (fromPullRefresh = false) => {
    const requestId = ++loadRequestRef.current;
    let resultsStarted = false;

    try {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      if (!fromPullRefresh) {
        setLoading(true);
        setExam(null);
      }
      setExamResults([]);
      setResultsLoading(true);
      setError(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setError("You must be logged in to view exams.");
        return;
      }

      const online = await NetworkService.isOnline().catch(() => true);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setIsOffline(!online);

      // 1. Check Authorization (Local-First in Service)
      const authorized = await ExamApi.isAuthorized(currentUser.uid, examId);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      if (!authorized) {
        setError("You are not authorized to view this exam.");
        return;
      }

      // 2. Fetch Exam Data (Local-First in Service)
      const examData = await ExamApi.getExamById(examId);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;

      if (!examData) {
        setError(
          "Exam not found. It may have been deleted or is not available on this device.",
        );
        return;
      }

      setExam(examData);
      resultsStarted = true;
      loadExamResults(examId);
    } catch (err) {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setError("Failed to load exam data. Please try again.");
      console.error("[ExamPreview] Load error:", err);
    } finally {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      if (!fromPullRefresh) {
        setLoading(false);
      }
      if (!resultsStarted) {
        setResultsLoading(false);
      }
    }
  }, [examId]);

  const resetViewState = () => {
    setExam(null);
    setExamResults([]);
    setError(null);
    setLoading(true);
    setResultsLoading(true);
    setSettingsMenuVisible(false);
    setViewCodeVisible(false);
    setArchiveConfirmVisible(false);
  };

  useEffect(() => {
    setActiveTab(
      requestedTab === "results"
        ? "results"
        : requestedTab === "preview"
          ? "preview"
          : "answerKey",
    );
  }, [requestedTab]);

  useFocusEffect(
    React.useCallback(() => {
      resetViewState();
      loadExamData();
    }, [loadExamData, refreshKey]),
  );

  const handlePullToRefresh = async () => {
    if (isPullRefreshing) return;
    setIsPullRefreshing(true);
    setIsSectionRefreshing(true);
    const refreshStartTime = Date.now();
    try {
      await loadExamData(true);
    } finally {
      const minRefreshStateMs = 450;
      const elapsed = Date.now() - refreshStartTime;
      if (elapsed < minRefreshStateMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, minRefreshStateMs - elapsed),
        );
      }
      if (mountedRef.current) {
        setIsPullRefreshing(false);
        setIsSectionRefreshing(false);
      }
    }
  };

  const closeSettingsMenu = () => {
    setSettingsMenuVisible(false);
  };

  const handleArchiveExam = async () => {
    try {
      const errorLog: string[] = [];
      errorLog.push(`[START] Archive Exam: ${examId}`);
      errorLog.push(`Title: ${exam?.metadata.title}`);
      errorLog.push(`Timestamp: ${new Date().toISOString()}`);

      await ExamApi.updateExam(examId, { isArchived: true });

      errorLog.push("[SUCCESS] Archive completed");
      console.log(errorLog.join("\n"));

      setArchiveConfirmVisible(false);
      setSettingsMenuVisible(false);
      Toast.show({
        type: "archive_result",
        text1: "Archived",
        text2: `${exam?.metadata.title || "Exam"} moved to Archived`,
      });
      goToQuizzes();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack =
        error instanceof Error ? error.stack : "No stack trace";

      const fullErrorReport = [
        "═══════════════════════════════════════════",
        "❌ ARCHIVE EXAM FAILED",
        "═══════════════════════════════════════════",
        `Exam ID: ${examId}`,
        `Exam Title: ${exam?.metadata.title}`,
        `Timestamp: ${new Date().toISOString()}`,
        "",
        "ERROR MESSAGE:",
        errorMessage,
        "",
        "STACK TRACE:",
        errorStack,
        "═══════════════════════════════════════════",
      ].join("\n");

      // Log to console/PowerShell
      console.error(fullErrorReport);

      // Show on Android phone screen with alert
      Alert.alert(
        "Archive Failed",
        `Error: ${errorMessage}\n\nCheck PowerShell for full details.`,
        [
          {
            text: "Copy Error",
            onPress: () => {
              Clipboard.setString(fullErrorReport);
              Toast.show({
                type: "success",
                text1: "Copied",
                text2: "Error details copied to clipboard",
              });
            },
          },
          {
            text: "OK",
            onPress: () => {},
          },
        ],
      );

      Toast.show({
        type: "error",
        text1: "Error",
        text2: `Failed to archive: ${errorMessage}`,
      });
    }
  };

  const renderAnswerKeyGrid = () => {
    if (isSectionRefreshing) {
      return (
        <View style={styles.resultsState}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.resultsStateText, { color: colors.text }]}>
            Loading answer key...
          </Text>
        </View>
      );
    }

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
                <View key={questionNum} style={styles.answerKeyItem}>
                  <Text style={styles.questionNumber}>{questionNum}</Text>
                  <View
                    style={[
                      styles.answerBubble,
                      !hasAnswer && styles.answerBubbleEmpty,
                    ]}
                  >
                    <Text
                      style={[
                        styles.answerText,
                        !hasAnswer && styles.answerTextEmpty,
                      ]}
                    >
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
              <View
                style={[
                  styles.resultAvatar,
                  { backgroundColor: scoreColors.badge },
                ]}
              >
                <Text
                  style={[styles.resultAvatarText, { color: scoreColors.text }]}
                >
                  {initials || "?"}
                </Text>
              </View>

              <View style={styles.resultCardBody}>
                <Text style={styles.resultStudentName}>
                  {result.studentName}
                </Text>
                <Text style={styles.resultStudentMeta}>
                  ID: {result.studentId || "N/A"}
                </Text>
              </View>

              <View style={styles.resultScoreWrap}>
                <Text
                  style={[styles.resultPercentage, { color: scoreColors.text }]}
                >
                  {result.percentage}%
                </Text>
                <View
                  style={[
                    styles.resultCorrectBadge,
                    { backgroundColor: scoreColors.badge },
                  ]}
                >
                  <Text
                    style={[
                      styles.resultCorrectText,
                      { color: scoreColors.text },
                    ]}
                  >
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

  const renderPreviewSheet = () => {
    if (isSectionRefreshing) {
      return (
        <View style={styles.resultsState}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.resultsStateText, { color: colors.text }]}>
            Loading template...
          </Text>
        </View>
      );
    }

    if (!exam || !previewHtml) {
      return (
        <View style={styles.emptyPanel}>
          <Ionicons name="document-text-outline" size={40} color="#6B7280" />
          <Text style={styles.emptyPanelTitle}>Preview unavailable</Text>
          <Text style={styles.emptyPanelText}>
            The printable PDF preview cannot be displayed right now.
          </Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.previewSectionHeader}>
          <View style={styles.previewSectionHeaderText}>
            <Text style={styles.previewViewerTitle}>
              PDF Answer Sheet Preview
            </Text>
          </View>
          <View style={styles.previewViewerActions}>
            <TouchableOpacity
              style={styles.previewActionButton}
              onPress={handleDownloadPreviewPdf}
              disabled={previewDownloadLoading}
            >
              {previewDownloadLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.previewActionText}>Download PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.previewViewerCard}>
          <View style={styles.previewWebviewWrapper}>
            <WebView
              source={{ html: previewHtml }}
              style={[styles.previewWebview, { height: previewHeight }]}
              javaScriptEnabled
              domStorageEnabled
              scalesPageToFit
              nestedScrollEnabled
              originWhitelist={["*"]}
              onLoadStart={() => setWebviewLoading(true)}
              onLoadEnd={() => setWebviewLoading(false)}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error("[ExamPreview] WebView error:", nativeEvent);
                setWebviewLoading(false);
                Toast.show({
                  type: "error",
                  text1: "Preview failed",
                  text2: "Unable to render the PDF preview.",
                });
              }}
            />
            {webviewLoading ? (
              <View style={styles.webviewLoader}>
                <ActivityIndicator size="large" color="#16A34A" />
                <Text style={styles.loadingText}>Loading preview…</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.previewMetricsRow}>
          <Text style={styles.previewMetricText}>
            {exam.totalQuestions} Questions • {exam.choiceFormat}
          </Text>
          <Text style={styles.previewMetricText}>
            {Math.max(1, Math.ceil(exam.totalQuestions / 100))} page(s)
          </Text>
        </View>
      </>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#00a550" />
        <Text style={[styles.loadingText, { color: colors.text }]}>
          Loading exam data...
        </Text>
      </View>
    );
  }

  if (error || !exam) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <Ionicons name="alert-circle-outline" size={64} color="#e74c3c" />
        <Text style={styles.errorText}>{error || "Exam not found"}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadExamData()}>
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

      <View
        style={[
          styles.tabSwitcher,
          { backgroundColor: "#FFFFFF", borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "answerKey" && styles.tabButtonActive,
          ]}
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
          style={[
            styles.tabButton,
            activeTab === "preview" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("preview")}
        >
          <Text
            style={[
              styles.tabButtonText,
              { color: "#6B7280" },
              activeTab === "preview" && styles.tabButtonTextActive,
            ]}
          >
            Template
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "results" && styles.tabButtonActive,
          ]}
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
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor="#16A34A"
            colors={["#16A34A"]}
          />
        }
      >
        {activeTab === "answerKey" ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>
                Answer Key
              </Text>
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
        ) : activeTab === "preview" ? (
          <View style={styles.section}>{renderPreviewSheet()}</View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>
                Results
              </Text>
              {examResults.length > 0 && (
                <TouchableOpacity
                  style={styles.inlineEditButton}
                  onPress={() =>
                    router.push(
                      `/(tabs)/exam-stats?examId=${examId}&examTitle=${encodeURIComponent(exam.metadata.title)}`,
                    )
                  }
                >
                  <Text style={styles.inlineEditButtonText}>Stats & Send</Text>
                </TouchableOpacity>
              )}
            </View>
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
                router.push(
                  `/(tabs)/edit-exam?examId=${examId}${
                    classId ? `&classId=${classId}` : ""
                  }&returnTo=exam-preview&tab=${activeTab}`,
                );
              }}
            >
              <Text style={[styles.menuItemText, { color: "#20BE7B" }]}>
                Edit Exam
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
    backgroundColor: "transparent",
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
  previewSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  previewInfoBlock: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#F3F8F2",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DDE8DE",
  },
  previewInfoLabel: {
    fontSize: 11,
    color: "#6B7B69",
    marginBottom: 4,
  },
  previewInfoValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F3D2A",
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  previewColumn: {
    flex: 1,
    minWidth: 120,
    maxWidth: 180,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    padding: 10,
  },
  previewColumnTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  previewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  previewHeaderSpacer: {
    width: 24,
  },
  previewChoiceHeader: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F0F5F0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  previewChoiceHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4F6B53",
  },
  previewQuestionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  previewQuestionNumber: {
    width: 24,
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "700",
    marginRight: 4,
  },
  previewBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
    backgroundColor: "#F9FAFB",
  },
  previewBubbleFilled: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  previewBubbleText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  templateWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  templateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  templateHeaderLeft: {
    flex: 1,
    paddingRight: 12,
  },
  templateSchool: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1F3D2A",
    marginBottom: 4,
  },
  templateTitleText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  templateMetaText: {
    fontSize: 12,
    color: "#4B5563",
  },
  templatePageLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666F7A",
  },
  templateFieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 12,
  },
  templateFieldItem: {
    flex: 1,
  },
  templateFieldLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 6,
  },
  templateFieldLine: {
    height: 1,
    backgroundColor: "#D1D5DB",
    borderRadius: 1,
  },
  templateTopSection: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  studentIdCard: {
    flex: 1,
    minWidth: 220,
    backgroundColor: "#F8FAF8",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EDE8",
    padding: 14,
  },
  shadingGuideCard: {
    flex: 0.9,
    minWidth: 180,
    backgroundColor: "#F8FAF8",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EDE8",
    padding: 14,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 10,
  },
  studentIdGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "nowrap",
  },
  studentIdColumn: {
    alignItems: "center",
  },
  studentIdColumnLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 6,
  },
  studentIdBubble: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    marginBottom: 4,
  },
  shadingGuideRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  shadingGuideLabel: {
    fontSize: 11,
    color: "#4B5563",
    flex: 1,
  },
  shadingGuideBubbles: {
    flexDirection: "row",
    gap: 6,
  },
  shadingBubble: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  shadingBubbleFilled: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  shadingGuideNotes: {
    marginTop: 10,
  },
  shadingGuideNote: {
    fontSize: 10,
    color: "#6B7280",
    marginBottom: 4,
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
    backgroundColor: "#E5E7EB",
    borderColor: "#D1D5DB",
  },
  answerText: {
    fontSize: 13,
    color: "#16A34A",
    fontWeight: "700",
  },
  answerTextEmpty: {
    color: "#9CA3AF",
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
  previewSectionHeader: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
    marginBottom: 18,
  },
  previewSectionHeaderText: {
    width: "100%",
  },
  previewViewerCard: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  previewViewerHeader: {
    padding: 18,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  previewViewerHeading: {
    flex: 1,
  },
  previewViewerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  previewViewerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  previewViewerActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
  },
  previewActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#16A34A",
    borderRadius: 12,
  },
  previewOpenButton: {
    backgroundColor: "#2563EB",
  },
  previewActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  previewMetricsRow: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  previewMetricText: {
    fontSize: 13,
    color: "#4B5563",
  },
  previewWebviewWrapper: {
    minHeight: 400,
    maxHeight: 1400,
    backgroundColor: "#FFFFFF",
    padding: 0,
  },
  previewActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  previewActionsText: {
    flex: 1,
  },
  previewWebview: {
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  webviewLoader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
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
