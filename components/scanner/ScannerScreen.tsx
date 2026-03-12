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
import { GradingResult, ScanResult } from "../../types/scanning";
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
      setSelectedClass(null);
      setSelectedExam(null);
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
  }, []);

  // when class changes fetch its exams
  React.useEffect(() => {
    if (!selectedClass) {
      setExamsList([]);
      setSelectedExam(null);
      return;
    }

    const fetchExams = async () => {
      try {
        const { collection, query, where, getDocs } =
          await import("firebase/firestore");
        const examsRef = collection(db, "exams");
        const examsQuery = query(
          examsRef,
          where("classId", "==", selectedClass.id),
        );
        const snap = await getDocs(examsQuery);
        const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setExamsList(list);

        // Handle pre-selection of exam if initialExamId is provided
        if (initialExamId) {
          const matched = list.find((ex) => ex.id === initialExamId);
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
      setExamQuestionCount(questionCount);
      // stay in camera mode with exam selected
    }
  }, [selectedExam]);

  const handleScanComplete = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    try {
      const studentId = scanResult.studentId;

      // Ensure that a valid student ID was parsed
      const isInvalidId =
        !studentId || studentId === "Unknown" || /^0+$/.test(studentId); // catches 0000000, 00000000, etc.

      if (isInvalidId) {
        console.warn(
          `[ScannerScreen] Unreadable student ID ("${studentId}") — prompting manual entry`,
        );
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
          const q = query(
            collection(db, "students"),
            where("studentId", "==", studentId),
          );
          const snap = await withTimeout(getDocs(q), 2000);
          isValidId = !snap.empty;

          if (!isValidId) {
            // Fallback to class check
            const classesSnapshot = await withTimeout(
              getDocs(collection(db, "classes")),
              2500,
            );
            for (const classDoc of classesSnapshot.docs) {
              if (
                classDoc
                  .data()
                  .students?.some((s: any) => s.student_id === studentId)
              ) {
                isValidId = true;
                break;
              }
            }
          }
        } catch (err) {
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
      let answerKey: string[] = [];

      try {
        const { ExamService } = await import("../../services/examService");
        const examData = await withTimeout(
          ExamService.getExamById(activeExamId),
          2500,
        );
        if (examData?.answerKey?.answers) {
          answerKey = examData.answerKey.answers;
        } else {
          throw new Error("Missing key");
        }
      } catch (error) {
        console.warn(
          "[ScannerScreen] Answer key fetch failed/timed out. using default key.",
        );
        answerKey = GradingService.getDefaultAnswerKey(rawCount).map(
          (ak) => ak.correctAnswer,
        );
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
          2000,
        );
      } catch (err) {
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
        return;
      }

      // ── 4. Save Pipeline ──
      const savedResult = await StorageService.saveScanResult(result, imageUri);

      // Async Firestore/Realm save
      GradeStorageService.saveGradingResult(result, activeExamId).then(
        (saveResult) => {
          if (saveResult.status === "saved") {
            Toast.show({
              type: "success",
              text1: "Saved",
              text2: `Score: ${result.score}/${result.totalPoints}`,
            });
          } else if (saveResult.status === "pending") {
            Toast.show({
              type: "info",
              text1: "Queued Offline",
              text2: "Data saved in RealmDB for later sync.",
            });
          }
        },
      );

      setGradingResult(savedResult);
      setScannedImage(imageUri);
      setCurrentState("results");
    } catch (error) {
      console.error("[ScannerScreen] Error:", error);
      Alert.alert("Error", "Failed to process scan.");
    }
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

  const handleConfirmExam = async () => {
    const code = examIdInput.trim();
    if (!code) return;
    setIsValidatingExam(true);

    try {
      const { auth } = await import("../../config/firebase");
      if (!auth.currentUser) {
        Alert.alert("Auth Required", "Please sign in to search for exams.");
        return;
      }

      let foundExamId: string | null = null;
      let questionCount = 20;

      // 1. Check Staging Realm (Offline creations)
      const { RealmService, OfflineQuiz, QuizCache } =
        await import("../../services/realmService");
      const stagingRealm = await RealmService.getStagingRealm();
      const sQuizzes = stagingRealm
        .objects<any>("OfflineQuiz")
        .filtered(`examCode == "${code}"`);
      if (sQuizzes.length > 0) {
        const sQuiz = sQuizzes[0];
        foundExamId = `staging_${sQuiz._id.toHexString()}`;
        questionCount = sQuiz.questionCount || 20;
      }

      // 2. Check Cache Realm (Downloaded/Synced exams)
      if (!foundExamId) {
        const cacheRealm = await RealmService.getCacheRealm();
        const cQuizzes = cacheRealm
          .objects<any>("QuizCache")
          .filtered(`examCode == "${code}"`);
        if (cQuizzes.length > 0) {
          const cQuiz = cQuizzes[0];
          foundExamId = cQuiz.id;
          questionCount = cQuiz.questionCount || 20;
        }
      }

      // 3. Check Firestore (Online)
      if (!foundExamId) {
        const netState = await NetInfo.fetch();
        if (netState.isConnected && netState.isInternetReachable) {
          try {
            const examsRef = collection(db, "exams");
            const q = query(examsRef, where("examCode", "==", code));
            // Use withTimeout to prevent hanging if connection is flaky
            const snap = await withTimeout(getDocs(q), 5000);

            if (!snap.empty) {
              const data = snap.docs[0].data();
              foundExamId = snap.docs[0].id;
              questionCount = data.num_items || 20;
            }
          } catch (firestoreErr) {
            console.warn(
              "[ScannerScreen] Firestore query failed:",
              firestoreErr,
            );
            // Ignore - we will handle the null foundExamId below
          }
        }
      }

      // Setup scanner or show error
      if (foundExamId) {
        setExamQuestionCount(questionCount);
        setActiveExamId(foundExamId);
        setCurrentState("camera");
      } else {
        Alert.alert(
          "Error",
          "Exam not found. Please check the code and try again.",
        );
      }
    } catch (err) {
      console.error("[ScannerScreen] Error validating exam code:", err);
      Alert.alert(
        "Error",
        "An unexpected error occurred while searching for the exam.",
      );
    } finally {
      setIsValidatingExam(false);
    }
  };

  const handleScanAnother = () => {
    setScanCount((prev) => prev + 1);
    setCurrentState("camera");
  };

  const handleClose = () => {
    setGradingResult(null);
    setScannedImage(undefined);
    setCurrentState("camera");
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
      {currentState !== "results" && (
        <CameraScanner
          key={`cam-${scanCount}`}
          questionCount={examQuestionCount}
          onScanComplete={handleScanComplete}
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
