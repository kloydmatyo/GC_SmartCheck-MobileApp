import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ActivityIndicator,
} from "react-native";
import Toast from "react-native-toast-message";
import { db } from "../../config/firebase";
import { ClassService } from "../../services/classService";
import {
    DuplicateScoreDetectionService,
    DuplicateScoreMatch,
} from "../../services/duplicateScoreDetectionService";
import { GradeStorageService } from "../../services/gradeStorageService";
import { GradingService } from "../../services/gradingService";
import { StorageService } from "../../services/storageService";
import { GradingResult, ScanResult, StudentAnswer } from "../../types/scanning";
import { DuplicateScoreWarningModal } from "../modals/DuplicateScoreWarningModal";
import CameraScanner from "./CameraScanner";
import ScanResults from "./ScanResults";

// Helper for fast-failing Firestore calls
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

function resolveChoicesPerQuestion(examData: any): 4 | 5 {
  const rawChoiceCount =
    examData?.choicesPerQuestion ??
    examData?.choices_per_item ??
    examData?.choicesPerItem;
  const rawChoiceFormat =
    examData?.choiceFormat ??
    examData?.choicesFormat ??
    examData?.choice_format;

  if (rawChoiceCount === 5 || rawChoiceCount === "5") return 5;
  if (rawChoiceCount === 4 || rawChoiceCount === "4") return 4;

  if (typeof rawChoiceFormat === "string") {
    const normalized = rawChoiceFormat.trim().toUpperCase();
    if (
      normalized === "A-E" ||
      normalized === "AE" ||
      normalized.includes("5")
    ) {
      return 5;
    }
    if (
      normalized === "A-D" ||
      normalized === "AD" ||
      normalized.includes("4")
    ) {
      return 4;
    }
  }

  return 4;
}

function normalizeTwoStagePageAnswers(
  answers: StudentAnswer[],
  pageNumber: 1 | 2,
): StudentAnswer[] {
  const questionOffset = pageNumber === 1 ? 0 : 100;
  const byQuestion = new Map<number, StudentAnswer>();

  for (const answer of answers) {
    const localQuestion = ((answer.questionNumber - 1) % 100) + 1;
    if (localQuestion < 1 || localQuestion > 100) continue;

    const questionNumber = questionOffset + localQuestion;
    byQuestion.set(questionNumber, {
      ...answer,
      questionNumber,
    });
  }

  return Array.from({ length: 100 }, (_, index) => {
    const questionNumber = questionOffset + index + 1;
    return (
      byQuestion.get(questionNumber) ?? {
        questionNumber,
        selectedAnswer: "",
      }
    );
  });
}

type ScannerState = "exam-select" | "camera" | "results";

interface ScannerScreenProps {
  onClose: () => void;
  initialClassId?: string;
  initialExamId?: string;
  /**
   * value passed from the parent when a "quick scan" navigation occurs.
   */
  resetFlag?: string;
}

export default function ScannerScreen({
  onClose,
  resetFlag,
  initialClassId,
  initialExamId,
}: ScannerScreenProps) {
  const [currentState, setCurrentState] = useState<ScannerState>("exam-select");
  const [activeExamId, setActiveExamId] = useState("");
  const [examQuestionCount, setExamQuestionCount] = useState(20); // Store exam question count
  const [examChoicesPerQuestion, setExamChoicesPerQuestion] = useState<4 | 5>(
    4,
  );
  const [isSaving, setIsSaving] = useState(false);

  // class/exam dropdown state
  const [classesList, setClassesList] = useState<
    { id: string; class_name?: string }[]
  >([]);
  const [selectedClass, setSelectedClass] = useState<{
    id: string;
    class_name?: string;
  } | null>(null);
  const [examsList, setExamsList] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<any | null>(null);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [examDropdownOpen, setExamDropdownOpen] = useState(false);

  // when resetFlag changes we should return to the initial exam-select
  // state and clear any existing exam context. this allows the home screen's
  // quick scan button to behave predictably even if the user previously
  // navigated to this tab and left while inside the camera view.
  React.useEffect(() => {
    if (resetFlag) {
      setActiveExamId("");
      setExamQuestionCount(20);
      setExamChoicesPerQuestion(4);
      setSelectedClass(null);
      setSelectedExam(null);
      // Reset 2-stage state
      setTwoStageData(null);
      setTwoStageCurrent(1);
      setShowPage1Confirmation(false);
      // stay in camera mode but clear selections
    }
  }, [resetFlag]);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(
    null,
  );
  const [scannedImage, setScannedImage] = useState<string | undefined>(
    undefined,
  );
  const [duplicateMatch, setDuplicateMatch] =
    useState<DuplicateScoreMatch | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingResult, setPendingResult] = useState<GradingResult | null>(
    null,
  );
  const [scanCount, setScanCount] = useState(0);
  const [cachedAnswerKey, setCachedAnswerKey] = useState<string[] | null>(null);

  // ── 2-Stage scanning state for 200-item exams ───────────────────────────
  const [twoStageData, setTwoStageData] = useState<{
    page1Result: ScanResult | null;
    page1Image: string;
  } | null>(null);
  const [twoStageCurrent, setTwoStageCurrent] = useState<1 | 2>(1);
  const [showPage1Confirmation, setShowPage1Confirmation] = useState(false);

  // ── Manual student ID entry (fallback when OMR can't read bubbles) ──────
  const [manualIdModal, setManualIdModal] = useState<{
    visible: boolean;
    pendingScan: ScanResult | null;
    pendingImage: string;
    input: string;
  }>({
    visible: false,
    pendingScan: null,
    pendingImage: "",
    input: "",
  });

  // ----- new behaviour for class/exam selection UI -----
  // load classes for teacher
  React.useEffect(() => {
    const fetchClasses = async () => {
      try {
        const cls = await ClassService.getClassesByUser();
        setClassesList(cls);

        // Handle pre-selection if initialClassId is provided
        if (initialClassId) {
          const matched = cls.find((c) => c.id === initialClassId);
          if (matched) {
            setSelectedClass(matched);
          }
        }
      } catch (error) {
        console.error("[ScannerScreen] failed loading classes", error);
      }
    };
    fetchClasses();
  }, [initialClassId]);

  // when class changes fetch its exams
  React.useEffect(() => {
    if (!selectedClass) {
      setExamsList([]);
      setSelectedExam(null);
      return;
    }

    const fetchExams = async () => {
      try {
        const { ExamService } = await import("../../services/examService");
        const list = await ExamService.getExamsByUser();
        
        // Filter by classId
        const filtered = list.filter((ex: any) => ex.classId === selectedClass.id);
        setExamsList(filtered);

        // Handle pre-selection of exam if initialExamId is provided
        if (initialExamId) {
          const matched = filtered.find((ex: any) => ex.id === initialExamId);
          if (matched) {
            setSelectedExam(matched);
          }
        }
      } catch (error) {
        console.error("[ScannerScreen] failed loading exams", error);
      }
    };
    fetchExams();
  }, [initialExamId, selectedClass]);

  // when an exam is chosen, set up camera parameters
  React.useEffect(() => {
    if (selectedExam) {
      setActiveExamId(selectedExam.id);
      const questionCount = selectedExam.num_items || 20;
      const choicesPerQuestion = resolveChoicesPerQuestion(selectedExam);
      setExamQuestionCount(questionCount);
      setExamChoicesPerQuestion(choicesPerQuestion);
      console.log(
        `[ScannerScreen] Selected exam scan config: questions=${questionCount}, choices=${choicesPerQuestion} (${choicesPerQuestion === 5 ? "A-E" : "A-D"})`,
      );
      setCachedAnswerKey(
        Array.isArray(selectedExam.answerKey?.answers)
          ? selectedExam.answerKey.answers
          : null,
      );
      // stay in camera mode with exam selected
    }
  }, [selectedExam]);

  React.useEffect(() => {
    if (!activeExamId) return;

    let cancelled = false;
    const prefetchAnswerKey = async () => {
      try {
        // Always fetch directly from Firestore so we pick up any edits made
        // from the web app without waiting for the Realm cache to refresh.
        const akQuery = query(
          collection(db, "answerKeys"),
          where("examId", "==", activeExamId),
        );
        const akSnap = await getDocs(akQuery);
        if (cancelled) return;

        if (!akSnap.empty) {
          // Pick the highest-version doc (same logic as ExamService)
          let best = akSnap.docs[0];
          akSnap.docs.slice(1).forEach((d) => {
            if ((d.data().version ?? 0) > (best.data().version ?? 0)) best = d;
          });
          const akData = best.data();

          // Prefer the answers array; fall back to questionSettings
          let answers: string[] = [];
          if (Array.isArray(akData.answers) && akData.answers.length > 0) {
            answers = akData.answers as string[];
          } else if (
            Array.isArray(akData.questionSettings) &&
            akData.questionSettings.length > 0
          ) {
            answers = (akData.questionSettings as any[])
              .slice()
              .sort((a, b) => a.questionNumber - b.questionNumber)
              .map((q) => String(q.correctAnswer ?? ""));
          }

          if (answers.length > 0) {
            setCachedAnswerKey(answers);

            // Also update the Realm cache so offline scans use the fresh key
            try {
              const { RealmService } =
                await import("../../services/realmService");
              const cacheRealm = await RealmService.getCacheRealm();
              const cached = cacheRealm.objectForPrimaryKey<any>(
                "QuizCache",
                activeExamId,
              );
              if (cached) {
                cacheRealm.write(() => {
                  cached.answerKey = JSON.stringify({ ...akData, answers });
                  cached.updatedAt = new Date();
                });
              }
            } catch (cacheErr) {
              console.warn(
                "[ScannerScreen] Realm cache update skipped:",
                cacheErr,
              );
            }
          }
        } else {
          // No answer key in Firestore yet — fall back to cached ExamService
          const { ExamService } = await import("../../services/examService");
          const examData = await ExamService.getExamById(activeExamId);
          if (cancelled) return;
          if (Array.isArray(examData?.answerKey?.answers)) {
            setCachedAnswerKey(examData.answerKey.answers);
          }
        }
      } catch (error) {
        console.warn("[ScannerScreen] answer key prefetch skipped:", error);
      }
    };

    prefetchAnswerKey();
    return () => {
      cancelled = true;
    };
  }, [activeExamId]);

  const handleScanComplete = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    if (isSaving || currentState === "results") return;
    setIsSaving(true);
    try {
      const studentId = scanResult.studentId;

      // Ensure that a valid student ID was parsed
      const isInvalidId =
        !studentId || studentId === "Unknown" || /^0+$/.test(studentId); // catches 0000000, 00000000, etc.

      if (isInvalidId) {
        console.warn(
          `[ScannerScreen] Unreadable student ID ("${studentId}") — prompting manual entry`,
        );
        setIsSaving(false);
        // Show manual entry modal instead of hard-blocking
        setManualIdModal({
          visible: true,
          pendingScan: { ...scanResult, studentId: "" },
          pendingImage: imageUri,
          input: "",
        });
        return;
      }

      console.log(`[ScannerScreen] Detected student ID: ${studentId}`);

      // ── 1. Fast Student Verification ──
      let isValidId = false;
      const netState = await NetInfo.fetch();

      if (netState.isConnected && netState.isInternetReachable) {
        console.log(`[Firestore] Verifying student ID: ${studentId}...`);
        try {
          // Check the selected class roster first (fastest, no extra query)
          if (selectedClass) {
            const classSnap = await withTimeout(
              getDocs(
                query(
                  collection(db, "classes"),
                  where("__name__", "==", selectedClass.id),
                ),
              ),
              1200,
            );
            if (!classSnap.empty) {
              const classData = classSnap.docs[0].data();
              const roster: any[] = classData.students || [];
              if (
                roster.some(
                  (s: any) =>
                    s.student_id === studentId || s.studentId === studentId,
                )
              ) {
                isValidId = true;
              }
            }
          }

          // Fallback: query the standalone students collection (both field name variants)
          if (!isValidId) {
            const [snapSnake, snapCamel] = await Promise.all([
              withTimeout(
                getDocs(
                  query(
                    collection(db, "students"),
                    where("student_id", "==", studentId),
                  ),
                ),
                1200,
              ),
              withTimeout(
                getDocs(
                  query(
                    collection(db, "students"),
                    where("studentId", "==", studentId),
                  ),
                ),
                1200,
              ),
            ]);
            isValidId = !snapSnake.empty || !snapCamel.empty;
          }
        } catch {
          console.warn(
            "[ScannerScreen] Student verification timed out. Assuming valid.",
          );
          isValidId = true;
        }
      } else {
        console.log("[ScannerScreen] Offline - Skipping network validation.");
        isValidId = true; // Trust ID while offline
      }

      if (!isValidId) {
        Alert.alert(
          "Unregistered student",
          `ID ${studentId} not found, but it will be scored anyway.`,
        );
      }

      // ── 2. Fetch Answer Key (Fast Timeout) ──
      const rawCount = scanResult.answers?.length || 20;
      let answerKey: string[] = cachedAnswerKey ?? [];

      if (answerKey.length === 0) {
        try {
          // Go directly to Firestore so we always use the latest answer key,
          // even if the web app edited it after the Realm cache was last synced.
          const akQuery = query(
            collection(db, "answerKeys"),
            where("examId", "==", activeExamId),
          );
          const akSnap = await withTimeout(getDocs(akQuery), 2500);

          if (!akSnap.empty) {
            let best = akSnap.docs[0];
            akSnap.docs.slice(1).forEach((d) => {
              if ((d.data().version ?? 0) > (best.data().version ?? 0))
                best = d;
            });
            const akData = best.data();

            if (Array.isArray(akData.answers) && akData.answers.length > 0) {
              answerKey = akData.answers as string[];
            } else if (
              Array.isArray(akData.questionSettings) &&
              akData.questionSettings.length > 0
            ) {
              answerKey = (akData.questionSettings as any[])
                .slice()
                .sort((a: any, b: any) => a.questionNumber - b.questionNumber)
                .map((q: any) => String(q.correctAnswer ?? ""));
            }
          }

          if (answerKey.length > 0) {
            setCachedAnswerKey(answerKey);
          } else {
            throw new Error("Missing key");
          }
        } catch {
          console.warn(
            "[ScannerScreen] Answer key fetch failed/timed out. using default key.",
          );
          answerKey = GradingService.getDefaultAnswerKey(rawCount).map(
            (ak) => ak.correctAnswer,
          );
        }
      }

      const answerKeyFormatted = answerKey.map((answer, index) => ({
        questionNumber: index + 1,
        correctAnswer: answer,
        points: 1,
      }));
      // ── 3. Grade & Duplicate Check ──
      const result = GradingService.gradeAnswers(
        scanResult,
        answerKeyFormatted,
      );
      result.metadata = { ...result.metadata, isValidId: isValidId } as any;

      let duplicateCheck = null;
      try {
        duplicateCheck = await withTimeout(
          DuplicateScoreDetectionService.checkForDuplicates(
            result,
            activeExamId,
          ),
          900,
        );
      } catch {
        /* proceed if check hangs */
      }

      if (
        duplicateCheck &&
        (duplicateCheck.matchType === "exact" ||
          duplicateCheck.matchType === "high")
      ) {
        setPendingResult(result);
        setDuplicateMatch(duplicateCheck);
        setShowDuplicateModal(true);
        setIsSaving(false);
        return;
      }

      // ── 4. Save Pipeline ──
      const savedResult = await StorageService.saveScanResult(result, imageUri);

      // Await Firestore/Realm save to show loading
      try {
        const saveResult = await GradeStorageService.saveGradingResult(result, activeExamId);
        
        if (saveResult.status === "saved") {
          Toast.show({
            type: "success",
            text1: "Synced to Cloud",
            text2: `Score: ${result.score}/${result.totalPoints}`,
          });
        } else if (saveResult.status === "retake") {
          Toast.show({
            type: "info",
            text1: "Retake Exam Marked",
            text2: `Score: ${result.score}/${result.totalPoints} (Saved)`,
          });
        } else if (saveResult.status === "duplicate") {
          Toast.show({
            type: "error",
            text1: "Duplicate Scan",
            text2: "This exact paper was already scanned.",
          });
          setIsSaving(false);
          return;
        } else if (saveResult.status === "pending") {
          // If offline, just hide loading. The user sees the score on the next screen anyway.
          // No toast needed as per user request to "remove the offline toast".
        } else if (saveResult.status === "error") {
          Toast.show({
            type: "error",
            text1: "Save Failed",
            text2: saveResult.message || "Could not save to server.",
          });
        }
      } catch (saveErr) {
        console.error("[ScannerScreen] Save error:", saveErr);
        // Fallback for unexpected errors — still no toast as per request
      }

      setGradingResult(savedResult);
      setScannedImage(imageUri);
      setCurrentState("results");
    } catch (error) {
      console.error("[ScannerScreen] Error:", error);
      Alert.alert("Error", "Failed to process scan.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── 2-Stage scan handler for 200-item exams ─────────────────────────────
  const handleTwoStageScanComplete = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    if (twoStageCurrent === 1) {
      // Stage 1: Store Page 1 results, ask user to scan Page 2
      console.log(
        `[ScannerScreen] 200Q Stage 1 complete: studentId=${scanResult.studentId}, answers=${scanResult.answers.length}`,
      );
      setTwoStageData({
        page1Result: scanResult,
        page1Image: imageUri,
      });
      // Speed optimization: jump directly to page 2 capture.
      setShowPage1Confirmation(false);
      setTwoStageCurrent(2);
      setScanCount((prev) => prev + 1);
    } else {
      // Stage 2: Merge with Page 1 data
      if (!twoStageData?.page1Result) {
        Alert.alert(
          "Error",
          "Page 1 data is missing. Please restart the scan.",
        );
        setTwoStageCurrent(1);
        setTwoStageData(null);
        return;
      }

      const page1 = twoStageData.page1Result;
      const page2 = scanResult;

      // Validate Student ID match
      const id1 = page1.studentId;
      const id2 = page2.studentId;
      const idsMatch =
        id1 === id2 ||
        /^0+$/.test(id1) ||
        /^0+$/.test(id2) ||
        id1 === "Unknown" ||
        id2 === "Unknown";

      if (!idsMatch) {
        Alert.alert(
          "Student ID Mismatch",
          `Page 1 ID: ${id1}\nPage 2 ID: ${id2}\n\nThe Student IDs on both pages don't match. Please re-scan Page 2.`,
          [
            {
              text: "Re-scan Page 2",
              onPress: () => {
                setScanCount((prev) => prev + 1);
              },
            },
          ],
        );
        return;
      }

      // Merge answers: Stage 1 is always Q1-100 and Stage 2 is always Q101-200.
      const mergedAnswers = [
        ...normalizeTwoStagePageAnswers(page1.answers, 1),
        ...normalizeTwoStagePageAnswers(page2.answers, 2),
      ];

      // Use the valid student ID (prefer non-zero)
      const mergedStudentId =
        id1 && !/^0+$/.test(id1) && id1 !== "Unknown" ? id1 : id2;

      const mergedResult: ScanResult = {
        studentId: mergedStudentId,
        answers: mergedAnswers,
        confidence: Math.min(
          page1.confidence ?? 0.95,
          page2.confidence ?? 0.95,
        ),
        processedImageUri: page1.processedImageUri || page2.processedImageUri,
      };

      console.log(
        `[ScannerScreen] 200Q Merged: ID=${mergedStudentId}, answers=${mergedAnswers.length}`,
      );

      // Clean up 2-stage state
      setTwoStageData(null);
      setTwoStageCurrent(1);

      // Feed merged result into normal scan pipeline
      handleScanComplete(mergedResult, imageUri);
    }
  };

  const handlePage1ConfirmScanPage2 = () => {
    setShowPage1Confirmation(false);
    setTwoStageCurrent(2);
    setScanCount((prev) => prev + 1);
  };

  const handlePage1Rescan = () => {
    setShowPage1Confirmation(false);
    setTwoStageData(null);
    setTwoStageCurrent(1);
    setScanCount((prev) => prev + 1);
  };

  const handleRetrySave = () =>
    handleFirestoreRetrySave(gradingResult!, activeExamId);

  const handleFirestoreRetrySave = async (
    result: GradingResult,
    examId: string,
  ) => {
    const saveResult = await GradeStorageService.saveGradingResult(
      result,
      examId,
    );
    if (saveResult.status === "saved") {
      Toast.show({ type: "success", text1: "Saved Successfully" });
    } else if (saveResult.status === "retake") {
      Toast.show({ type: "info", text1: "Retake Exam Marked", text2: "Saved Successfully" });
    } else if (saveResult.status === "duplicate") {
      Toast.show({ type: "error", text1: "Duplicate Scan", text2: "This exact paper was already scanned." });
    } else if (saveResult.status === "pending") {
      Toast.show({ type: "info", text1: "Saved Locally (Realm)" });
    } else {
      Toast.show({
        type: "error",
        text1: "Still Failing",
        text2: saveResult.message,
      });

    }
  };

  const handleScanAnother = () => {
    // Reset 2-stage state for 200-item exams
    setTwoStageData(null);
    setTwoStageCurrent(1);
    setShowPage1Confirmation(false);
    setScanCount((prev) => prev + 1);
    setCurrentState("camera");
  };

  const handleClose = () => {
    setGradingResult(null);
    setScannedImage(undefined);
    setCurrentState("camera");
    // Reset 2-stage state
    setTwoStageData(null);
    setTwoStageCurrent(1);
    setShowPage1Confirmation(false);
    setExamChoicesPerQuestion(4);
    setCachedAnswerKey(null);
    // clear selection so reopening starts fresh
    setSelectedClass(null);
    setSelectedExam(null);
    onClose();
  };

  const handleKeepNewScan = async () => {
    if (!pendingResult || !scannedImage) return;
    const overridden =
      DuplicateScoreDetectionService.markAsOverride(pendingResult);
    const saved = await StorageService.saveScanResult(overridden, scannedImage);
    GradeStorageService.saveGradingResult(overridden, activeExamId);
    setGradingResult(saved);
    setScannedImage(scannedImage);
    setCurrentState("results");
    setShowDuplicateModal(false);
  };

  // ── Handler for manual ID submission ──
  const handleConfirmManualId = () => {
    const { pendingScan, pendingImage, input } = manualIdModal;
    if (!input.trim() || !pendingScan) {
      Alert.alert("Error", "Please enter a valid Student ID");
      return;
    }

    // Hide manual modal
    setManualIdModal({
      visible: false,
      pendingScan: null,
      pendingImage: "",
      input: "",
    });

    // Resume the scan workflow with the manually entered ID
    const correctedScan = { ...pendingScan, studentId: input.trim() };
    handleScanComplete(correctedScan, pendingImage);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      {/* ── Camera (Always Visible) ── */}
      {currentState !== "results" && !showPage1Confirmation && (
        <CameraScanner
          key={`cam-${scanCount}`}
          questionCount={examQuestionCount}
          choicesPerQuestion={examChoicesPerQuestion}
          scanStage={
            examQuestionCount === 200
              ? { current: twoStageCurrent, total: 2 }
              : undefined
          }
          onScanComplete={
            examQuestionCount === 200
              ? handleTwoStageScanComplete
              : handleScanComplete
          }
          onCancel={handleClose}
        />
      )}

      {/* ── Header Overlay (Back + Title) ── */}
      {currentState !== "results" && (
        <View style={styles.headerOverlay}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.backButtonOverlay}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scanner</Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {/* ── Selectors Overlay (Class & Exam side-by-side) ── */}
      {currentState !== "results" && (
        <View style={styles.selectorsOverlay}>
          <TouchableOpacity
            style={styles.selectorField}
            onPress={() => setClassDropdownOpen(true)}
          >
            <Text style={styles.selectorFieldText} numberOfLines={1}>
              {selectedClass?.class_name || "Class..."}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.selectorField,
              !selectedClass && styles.selectorFieldDisabled,
            ]}
            onPress={() => selectedClass && setExamDropdownOpen(true)}
            disabled={!selectedClass}
          >
            <Text style={styles.selectorFieldText} numberOfLines={1}>
              {selectedExam?.title || "Exam..."}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Class Selector Dropdown Modal ── */}
      <Modal
        visible={classDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClassDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setClassDropdownOpen(false)}
        />
        <View style={styles.dropdownPanel}>
          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.dropdownScrollContent}
          >
            {classesList.map((cls) => {
              const selected = cls.id === selectedClass?.id;
              return (
                <TouchableOpacity
                  key={cls.id}
                  style={[
                    styles.dropdownItem,
                    selected && styles.dropdownSelected,
                  ]}
                  onPress={() => {
                    setSelectedClass(cls);
                    setClassDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[styles.dropdownName, selected && { color: "#fff" }]}
                  >
                    {cls.class_name || "Unnamed"}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Exam Selector Dropdown Modal ── */}
      <Modal
        visible={examDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExamDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setExamDropdownOpen(false)}
        />
        <View style={styles.dropdownPanel}>
          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.dropdownScrollContent}
          >
            {examsList.map((ex) => {
              const selected = ex.id === selectedExam?.id;
              return (
                <TouchableOpacity
                  key={ex.id}
                  style={[
                    styles.dropdownItem,
                    selected && styles.dropdownSelected,
                  ]}
                  onPress={() => {
                    setSelectedExam(ex);
                    setExamDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[styles.dropdownName, selected && { color: "#fff" }]}
                    numberOfLines={1}
                  >
                    {ex.title || ex.name || "Unnamed Exam"}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Results ── */}
      {currentState === "results" && gradingResult && (
        <ScanResults
          result={gradingResult}
          imageUri={scannedImage}
          onClose={handleClose}
          onScanAnother={handleScanAnother}
          onRetrySave={handleRetrySave}
        />
      )}

      {showDuplicateModal && duplicateMatch && (
        <DuplicateScoreWarningModal
          visible={showDuplicateModal}
          match={duplicateMatch}
          newResult={pendingResult!}
          onKeepNew={handleKeepNewScan}
          onKeepExisting={() => setShowDuplicateModal(false)}
          onCancel={() => setShowDuplicateModal(false)}
        />
      )}
      {/* ── Manual Student ID Entry Modal ── */}
      <Modal
        visible={manualIdModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setManualIdModal({ ...manualIdModal, visible: false })
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.manualIdModalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={28} color="#f39c12" />
              <Text style={styles.modalTitle}>Unreadable Student ID</Text>
            </View>

            <Text style={styles.modalMessage}>
              The scanner could not read the student ID bubbles on this sheet.
              Please type the correct Student ID below to continue saving.
            </Text>

            <TextInput
              style={styles.manualIdInput}
              placeholder="e.g. 202300109"
              value={manualIdModal.input}
              onChangeText={(text) =>
                setManualIdModal({ ...manualIdModal, input: text })
              }
              keyboardType="number-pad"
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSummaryCancel]}
                onPress={() => {
                  setManualIdModal({
                    visible: false,
                    pendingScan: null,
                    pendingImage: "",
                    input: "",
                  });
                  setCurrentState("camera");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel Scan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalVerifyConfirm]}
                onPress={handleConfirmManualId}
              >
                <Text style={styles.modalConfirmText}>Confirm & Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Page 1 Confirmation Modal (200-item 2-stage) ── */}
      <Modal
        visible={showPage1Confirmation}
        transparent
        animationType="fade"
        onRequestClose={handlePage1Rescan}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.manualIdModalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-circle" size={28} color="#1FC27D" />
              <Text style={styles.modalTitle}>Page 1 Scanned ✓</Text>
            </View>

            <Text style={styles.modalMessage}>
              Page 1 (Q1–100) captured successfully.
              {twoStageData?.page1Result?.studentId &&
              !/^0+$/.test(twoStageData.page1Result.studentId)
                ? `\nStudent ID: ${twoStageData.page1Result.studentId}`
                : ""}
              {`\nAnswers detected: ${twoStageData?.page1Result?.answers.filter((a) => a.selectedAnswer).length || 0}/100`}
              \n\nPlease place Page 2 (Q101–200) on the scanning area.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSummaryCancel]}
                onPress={handlePage1Rescan}
              >
                <Text style={styles.modalCancelText}>Re-scan Page 1</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalVerifyConfirm]}
                onPress={handlePage1ConfirmScanPage2}
              >
                <Text style={styles.modalConfirmText}>Scan Page 2</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Loading Overlay ── */}
      {isSaving && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#1FC27D" />
            <Text style={styles.loadingText}>Syncing Grade...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  // ── Exam Selector ──
  examSelector: {
    flex: 1,
    backgroundColor: "#eef1ef",
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
    backgroundColor: "#fff",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#3d5a3d",
  },
  examSelectorContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  examSelectorTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#333",
    marginTop: 16,
    marginBottom: 8,
  },
  examSelectorSubtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  selectorRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    marginTop: 24,
  },
  selector: {
    flex: 1,
    marginHorizontal: 5,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3d5a3d",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorDisabled: {
    opacity: 0.6,
  },
  selectorName: {
    fontSize: 16,
    color: "#333",
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  dropdownPanel: {
    position: "absolute",
    top: 150,
    left: 20,
    right: 20,
    maxHeight: "60%",
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1000,
    overflow: "hidden", // Ensures content stays inside rounded corners
  },
  dropdownScrollContent: {
    paddingVertical: 8,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  dropdownSelected: {
    backgroundColor: "rgba(31, 194, 125, 0.15)",
  },
  dropdownName: {
    fontSize: 15,
    color: "#E0E0E0",
    fontWeight: "500",
  },
  // ── Overlay styles for camera-first UI ──
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 55,
    paddingBottom: 15,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
  },
  backButtonOverlay: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 40,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  loadingBox: {
    backgroundColor: "#1A1A1A",
    padding: 30,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  loadingText: {
    color: "#fff",
    marginTop: 15,
    fontSize: 16,
    fontWeight: "600",
  },
  selectorsOverlay: {
    position: "absolute",
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 60 : 105,
    left: 16,
    right: 16,
    zIndex: 90,
    flexDirection: "row",
    gap: 10,
  },
  selectorField: {
    flex: 1,
    backgroundColor: "rgba(30, 30, 30, 0.75)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectorFieldDisabled: {
    opacity: 0.5,
  },
  selectorFieldText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  // ── Manual ID Modal Styles ──
  manualIdModalContent: {
    width: "90%",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  manualIdInput: {
    width: "100%",
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  modalMessage: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  modalSummaryCancel: {
    backgroundColor: "#f5f5f5",
  },
  modalCancelText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  modalVerifyConfirm: {
    backgroundColor: "#00a550",
  },
  modalConfirmText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
