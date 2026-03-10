import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ClassService } from "../../services/classService";
import Toast from "react-native-toast-message";
import { db } from "../../config/firebase";
import {
  DuplicateScoreDetectionService,
  DuplicateScoreMatch,
} from "../../services/duplicateScoreDetectionService";
import { GradingService } from "../../services/gradingService";
import { StorageService } from "../../services/storageService";
import { GradingResult, ScanResult } from "../../types/scanning";
import { DuplicateScoreWarningModal } from "../modals/DuplicateScoreWarningModal";
import CameraScanner from "./CameraScanner";
import ScanResults from "./ScanResults";

type ScannerState = "exam-select" | "camera" | "results";

interface ScannerScreenProps {
  onClose: () => void;
  sectionId?: string; // Section context for validation
  /**
   * value passed from the parent when a "quick scan" navigation occurs.
   * changing this prop should reset the local scanner state so the user is
   * shown the exam‑id entry screen rather than resuming whatever they were
   * doing previously.
   */
  resetFlag?: string;
}

export default function ScannerScreen({ onClose, resetFlag }: ScannerScreenProps) {
  const [currentState, setCurrentState] = useState<ScannerState>("exam-select");
  const [activeExamId, setActiveExamId] = useState("");
  const [examQuestionCount, setExamQuestionCount] = useState(20); // Store exam question count

  // class/exam dropdown state
  const [classesList, setClassesList] = useState<Array<{ id: string; class_name?: string }>>([]);
  const [selectedClass, setSelectedClass] = useState<{ id: string; class_name?: string } | null>(null);
  const [examsList, setExamsList] = useState<Array<any>>([]);
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
  const [scanCount, setScanCount] = useState(0); // Track scan count to force camera remount

  // ----- new behaviour for class/exam selection UI -----
  // load classes for teacher
  React.useEffect(() => {
    const fetchClasses = async () => {
      try {
        const cls = await ClassService.getClassesByUser();
        setClassesList(cls);
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
        const { collection, query, where, getDocs } = await import(
          "firebase/firestore"
        );
        const examsRef = collection(db, "exams");
        const examsQuery = query(
          examsRef,
          where("classId", "==", selectedClass.id),
        );
        const snap = await getDocs(examsQuery);
        const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setExamsList(list);
      } catch (error) {
        console.error("[ScannerScreen] failed loading exams", error);
      }
    };
    fetchExams();
  }, [selectedClass]);

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
      if (!studentId || studentId === "0000000" || studentId === "Unknown") {
        console.warn(
          `[ScannerScreen] Invalid student ID detected: "${studentId}"`,
        );
        Alert.alert(
          "Invalid ID",
          "Could not detect a valid student ID from the scanned sheet. Please ensure the ID bubbles are properly filled.",
        );
        return;
      }

      console.log(`[ScannerScreen] Detected student ID: ${studentId}`);

      // Verify the student account with Firestore
      console.log(`[Firestore] Verifying student ID: ${studentId}...`);

      // First, check the students collection
      const studentsRef = collection(db, "students");
      const q = query(studentsRef, where("studentId", "==", studentId));

      const startTime = Date.now();
      const querySnapshot = await getDocs(q);
      let duration = Date.now() - startTime;

      let isValidId = !querySnapshot.empty;

      if (isValidId) {
        const studentData = querySnapshot.docs[0].data();
        console.log(
          `[Firestore] Verification complete for ${studentId}: MATCH FOUND in students collection (${duration}ms)`,
        );
        console.log(`[Firestore] Student data:`, studentData);
      } else {
        // Fallback: Check if student exists in any class's students array
        console.log(
          `[Firestore] Not found in students collection, checking classes...`,
        );

        const classesRef = collection(db, "classes");
        const classesSnapshot = await getDocs(classesRef);
        duration = Date.now() - startTime;

        for (const classDoc of classesSnapshot.docs) {
          const classData = classDoc.data();
          if (classData.students && Array.isArray(classData.students)) {
            const foundStudent = classData.students.find(
              (s: any) => s.student_id === studentId,
            );
            if (foundStudent) {
              isValidId = true;
              console.log(
                `[Firestore] Verification complete for ${studentId}: MATCH FOUND in class ${classData.class_name} (${duration}ms)`,
              );
              console.log(`[Firestore] Student data:`, foundStudent);
              break;
            }
          }
        }

        if (!isValidId) {
          console.warn(
            `[Firestore] Student ID ${studentId} not found in students collection or any class (${duration}ms)`,
          );
          Alert.alert(
            "Unrecognized ID",
            `Student ID ${studentId} is not registered in any class, but it was still scored.`,
          );
        }
      }

      // Fetch the actual answer key from Firebase
      console.log(
        `[ScannerScreen] Fetching answer key for exam: ${activeExamId}`,
      );
      const rawCount = scanResult.answers?.length || 20;
      let answerKey: string[] = [];

      try {
        // Import ExamService dynamically to avoid circular dependencies
        const { ExamService } = await import("../../services/examService");
        const examData = await ExamService.getExamById(activeExamId);

        if (examData && examData.answerKey && examData.answerKey.answers) {
          answerKey = examData.answerKey.answers;
          console.log(
            `[ScannerScreen] Loaded answer key from exam: ${answerKey.length} questions`,
          );
          console.log(
            `[ScannerScreen] First 5 answers:`,
            answerKey.slice(0, 5),
          );
        } else {
          console.warn(
            `[ScannerScreen] No answer key found for exam ${activeExamId}, using default`,
          );
          // Fallback to default pattern
          answerKey = GradingService.getDefaultAnswerKey(rawCount).map(
            (ak) => ak.correctAnswer,
          );
        }
      } catch (error) {
        console.error(`[ScannerScreen] Error fetching answer key:`, error);
        // Fallback to default pattern
        answerKey = GradingService.getDefaultAnswerKey(rawCount).map(
          (ak) => ak.correctAnswer,
        );
      }

      // Convert string array to AnswerKey format
      const answerKeyFormatted = answerKey.map((answer, index) => ({
        questionNumber: index + 1,
        correctAnswer: answer,
        points: 1,
      }));

      console.log(
        `[ScannerScreen] Using answer key with ${answerKeyFormatted.length} questions`,
      );
      console.log(
        `[ScannerScreen] First 3 formatted keys:`,
        answerKeyFormatted.slice(0, 3),
      );

      // Grade the answers
      const result = GradingService.gradeAnswers(
        scanResult,
        answerKeyFormatted,
      );
      result.metadata = { ...result.metadata, isValidId: isValidId } as any;

      console.log(
        `[ScannerScreen] Scanned student ID: ${result.studentId} (Valid: ${isValidId})`,
      );
      console.log(`[ScannerScreen] Extracted answers count: ${rawCount}`);

      // Check for duplicates
      let duplicateCheck = null;
      try {
        duplicateCheck =
          await DuplicateScoreDetectionService.checkForDuplicates(
            result,
            activeExamId,
          );
      } catch (error) {
        console.error("[ScannerScreen] Duplicate check failed:", error);
        // Continue without duplicate check
      }

      if (duplicateCheck) {
        console.log(
          `[ScannerScreen] Duplicate detected: ${duplicateCheck.matchType} (${Math.round(duplicateCheck.similarity * 100)}%)`,
        );

        // If exact duplicate, show warning modal
        if (
          duplicateCheck.matchType === "exact" ||
          duplicateCheck.matchType === "high"
        ) {
          setPendingResult(result);
          setDuplicateMatch(duplicateCheck);
          setShowDuplicateModal(true);
          return;
        }

        // For moderate duplicates, just show a toast warning
        Toast.show({
          type: "info",
          text1: "Similar Scan Detected",
          text2:
            DuplicateScoreDetectionService.getDuplicateWarningMessage(
              duplicateCheck,
            ),
          visibilityTime: 5000,
        });
      }

      // Store result and image
      const savedResult = await StorageService.saveScanResult(result, imageUri);

      // Show success toast
      Toast.show({
        type: "success",
        text1: `Sheet Scanned: ${rawCount} Questions`,
        text2: `Student ${result.studentId || "00000000"}: ${result.score}/${result.totalPoints}`,
        visibilityTime: 4000,
      });

      setGradingResult(savedResult);
      setScannedImage(imageUri);
      setCurrentState("results");
    } catch (error) {
      console.error("Error grading answers:", error);
      Alert.alert("Error", "Failed to grade answers. Please try again.");
    }
  };

  // Retry save from results screen
  const handleRetrySave = async () => {
    if (!gradingResult || !scannedImage) return;
    try {
      await StorageService.saveScanResult(gradingResult, scannedImage);
      Toast.show({
        type: "success",
        text1: "Saved Successfully",
        text2: "Result has been saved",
        visibilityTime: 4000,
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Save Failed",
        text2: "Could not save result",
        visibilityTime: 4000,
      });
    }
  };


  const handleScanAnother = () => {
    setGradingResult(null);
    setScannedImage(undefined);
    setScanCount((prev) => prev + 1); // Increment to force camera remount
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

    try {
      // Mark as override and save
      const overriddenResult =
        DuplicateScoreDetectionService.markAsOverride(pendingResult);
      const savedResult = await StorageService.saveScanResult(
        overriddenResult,
        scannedImage,
      );

      Toast.show({
        type: "success",
        text1: "Scan Saved",
        text2: "New scan saved successfully",
        visibilityTime: 3000,
      });

      setGradingResult(savedResult);
      setScannedImage(scannedImage);
      setCurrentState("results");
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Save Failed",
        text2: "Could not save scan result",
        visibilityTime: 4000,
      });
    } finally {
      setShowDuplicateModal(false);
      setPendingResult(null);
      setDuplicateMatch(null);
    }
  };

  const handleKeepExistingScan = () => {
    Toast.show({
      type: "info",
      text1: "Scan Discarded",
      text2: "Keeping existing scan",
      visibilityTime: 3000,
    });

    setShowDuplicateModal(false);
    setPendingResult(null);
    setDuplicateMatch(null);
    setCurrentState("camera");
  };

  const handleCancelDuplicate = () => {
    setShowDuplicateModal(false);
    setPendingResult(null);
    setDuplicateMatch(null);
    setCurrentState("camera");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      {/* ── Camera (Always Visible) ── */}
      {currentState !== "results" && (
        <CameraScanner
          key={`camera-${scanCount}`}
          questionCount={examQuestionCount}
          onScanComplete={handleScanComplete}
          onCancel={handleClose}
        />
      )}

      {/* ── Header Overlay (Back + Title) ── */}
      {currentState !== "results" && (
        <View style={styles.headerOverlay}>
          <TouchableOpacity onPress={handleClose} style={styles.backButtonOverlay}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scanner</Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {/* ── Selectors Overlay (Class & Exam) ── */}
      {currentState !== "results" && (
        <View style={styles.selectorsOverlay}>
          <TouchableOpacity
            style={[styles.selectorField, { marginBottom: 12 }]}
            onPress={() => setClassDropdownOpen(true)}
          >
            <Text style={styles.selectorFieldText}>
              {selectedClass?.class_name || "Select Class..."}
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
            <Text style={styles.selectorFieldText}>
              {selectedExam?.title || "Select Exam..."}
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
                    style={[
                      styles.dropdownName,
                      selected && { color: "#fff" },
                    ]}
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
                    style={[
                      styles.dropdownName,
                      selected && { color: "#fff" },
                    ]}
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
          questionCount={gradingResult.totalQuestions}
          onClose={handleClose}
          onScanAnother={handleScanAnother}
          onRetrySave={handleRetrySave}
        />
      )}

      {/* Duplicate Warning Modal */}
      {showDuplicateModal && duplicateMatch && pendingResult && (
        <DuplicateScoreWarningModal
          visible={showDuplicateModal}
          match={duplicateMatch}
          newResult={pendingResult}
          onKeepNew={handleKeepNewScan}
          onKeepExisting={handleKeepExistingScan}
          onCancel={handleCancelDuplicate}
        />
      )}

      <Toast />
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
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 12,
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
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 55,
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
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 60 : 100,
    left: 20,
    right: 20,
    zIndex: 90,
  },
  selectorField: {
    backgroundColor: "rgba(30, 30, 30, 0.7)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
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
});
