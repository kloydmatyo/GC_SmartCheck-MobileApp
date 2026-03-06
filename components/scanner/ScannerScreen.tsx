import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { db } from "../../config/firebase";
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

type ScannerState = "exam-select" | "camera" | "results";

interface ScannerScreenProps {
  onClose: () => void;
  sectionId?: string; // Section context for validation
}

export default function ScannerScreen({ onClose }: ScannerScreenProps) {
  const [currentState, setCurrentState] = useState<ScannerState>("exam-select");
  const [activeExamId, setActiveExamId] = useState("");
  const [examQuestionCount, setExamQuestionCount] = useState(20); // Store exam question count
  const [examIdInput, setExamIdInput] = useState("");
  const [isValidatingExam, setIsValidatingExam] = useState(false);
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

  const handleScanComplete = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    try {
      const studentId = scanResult.studentId;

      // Ensure that a valid student ID was parsed
      const isInvalidId =
        !studentId ||
        studentId === "Unknown" ||
        /^0+$/.test(studentId); // catches 0000000, 00000000, etc.

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

      // 1. Save scan image + local history (StorageService — always runs)
      const savedResult = await StorageService.saveScanResult(result, imageUri);

      // 2. Save to Firestore via GradeStorageService — dynamic result binding (#2)
      GradeStorageService.saveGradingResult(result, activeExamId).then(
        (saveResult) => {
          if (saveResult.status === "saved") {
            // ── Success: show score summary (#3)
            Toast.show({
              type: "save_result",
              text1: `Saved — ${result.score}/${result.totalPoints} (${result.percentage}%)`,
              text2: `Student ${result.studentId} · Grade ${result.gradeEquivalent}`,
              visibilityTime: 4000,
            });
          } else if (saveResult.status === "duplicate") {
            // ── Duplicate: informational (#3)
            Toast.show({
              type: "info",
              text1: "Already Saved",
              text2: saveResult.message,
              visibilityTime: 4000,
            });
          } else if (saveResult.status === "pending") {
            // ── Offline queued (#3)
            Toast.show({
              type: "save_offline",
              text1: "Saved Offline",
              text2: "No connection — will sync automatically when online.",
              visibilityTime: 5000,
            });
          } else {
            // ── Error: show retry button with pulse animation (#3, #4, #5)
            Toast.show({
              type: "save_retry",
              text1: "Save Failed",
              text2: saveResult.message,
              visibilityTime: 8000,
              props: {
                onRetry: () =>
                  handleFirestoreRetrySave(result, activeExamId),
              },
            });
          }
        },
      );

      // Show scan-complete toast immediately (doesn't wait for Firestore)
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

  // Retry save from results screen — uses GradeStorageService (#5)
  const handleRetrySave = async () => {
    if (!gradingResult || !scannedImage) return;
    await handleFirestoreRetrySave(gradingResult, activeExamId);
  };

  // Core retry logic (also called from save_retry toast button) (#5)
  const handleFirestoreRetrySave = async (
    result: GradingResult,
    examId: string,
  ) => {
    try {
      const saveResult = await GradeStorageService.saveGradingResult(
        result,
        examId,
      );

      if (saveResult.status === "saved") {
        Toast.show({
          type: "save_result",
          text1: "Saved Successfully",
          text2: `Student ${result.studentId} · ${result.score}/${result.totalPoints}`,
          visibilityTime: 4000,
        });
      } else if (saveResult.status === "pending") {
        Toast.show({
          type: "save_offline",
          text1: "Saved Offline",
          text2: "Will sync when connection is restored.",
          visibilityTime: 5000,
        });
      } else {
        // Still failing — show retry again (#5)
        Toast.show({
          type: "save_retry",
          text1: "Save Failed Again",
          text2: saveResult.message,
          visibilityTime: 8000,
          props: {
            onRetry: () => handleFirestoreRetrySave(result, examId),
          },
        });
      }
    } catch (error: any) {
      Toast.show({
        type: "save_retry",
        text1: "Save Error",
        text2: error.message ?? "Could not save. Tap Retry.",
        visibilityTime: 8000,
        props: {
          onRetry: () => handleFirestoreRetrySave(result, examId),
        },
      });
    }
  };

  const handleConfirmExam = async () => {
    if (!examIdInput.trim()) return;

    setIsValidatingExam(true);
    try {
      const { auth } = await import("../../config/firebase");
      if (!auth.currentUser) {
        Alert.alert(
          "Online Mode Required",
          "You are currently using a guest/dummy account. Searching for exams requires a real account signed in via Firebase.",
          [{ text: "OK" }]
        );
        return;
      }

      const inputValue = examIdInput.trim();
      console.log(`[ScannerScreen] Looking up exam: ${inputValue}`);

      // Try to find exam by examCode or document ID
      const { collection, query, where, getDocs } =
        await import("firebase/firestore");
      const examsRef = collection(db, "exams");

      // First, try to find by examCode
      const examCodeQuery = query(
        examsRef,
        where("examCode", "==", inputValue),
      );
      const examCodeSnapshot = await getDocs(examCodeQuery);

      console.log(
        `[ScannerScreen] Query by examCode returned ${examCodeSnapshot.size} documents`,
      );

      let examDocId = null;

      if (!examCodeSnapshot.empty) {
        // Found by exam code
        examDocId = examCodeSnapshot.docs[0].id;
        const examData = examCodeSnapshot.docs[0].data();
        console.log(
          `[ScannerScreen] Found exam by code: ${inputValue} -> ${examDocId}`,
        );
        console.log(`[ScannerScreen] Exam title: ${examData.title}`);

        // Store question count for scanner
        const questionCount = examData.num_items || 20;
        setExamQuestionCount(questionCount);
        console.log(`[ScannerScreen] Exam question count: ${questionCount}`);
      } else {
        console.log(
          `[ScannerScreen] No exam found with examCode: ${inputValue}, trying as document ID`,
        );
        // Try as document ID directly
        const { doc, getDoc } = await import("firebase/firestore");
        const examDocRef = doc(db, "exams", inputValue);
        const examDocSnap = await getDoc(examDocRef);

        if (examDocSnap.exists()) {
          examDocId = examDocSnap.id;
          const examData = examDocSnap.data();
          console.log(
            `[ScannerScreen] Found exam by document ID: ${examDocId}`,
          );

          // Store question count for scanner
          const questionCount = examData.num_items || 20;
          setExamQuestionCount(questionCount);
          console.log(`[ScannerScreen] Exam question count: ${questionCount}`);
        } else {
          console.log(
            `[ScannerScreen] No exam found with document ID: ${inputValue}`,
          );
        }
      }

      if (!examDocId) {
        Alert.alert(
          "Exam Not Found",
          `No exam found with code or ID: ${inputValue}`,
        );
        return;
      }

      setActiveExamId(examDocId);
      setCurrentState("camera");
    } catch (error: any) {
      console.error("[ScannerScreen] Error validating exam:", error);

      let title = "Connectivity Error";
      let message = "Failed to validate exam ID. Please try again.";

      if (error.code === "permission-denied") {
        title = "Access Denied";
        message = "You don't have permission to access these exam records. Please ensure you are logged in with the correct account.";
      } else if (
        error.code === "unavailable" ||
        error.message?.includes("offline") ||
        error.message?.includes("network-error")
      ) {
        message = "You appear to be offline. Please check your internet connection.";
      }

      Alert.alert(title, message);
    } finally {
      setIsValidatingExam(false);
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
      {/* ── Step 5: Exam Selector ── */}
      {currentState === "exam-select" && (
        <View style={styles.examSelector}>
          <TouchableOpacity onPress={handleClose} style={styles.backButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>

          <View style={styles.examSelectorContent}>
            <Ionicons name="document-text" size={56} color="#007AFF" />
            <Text style={styles.examSelectorTitle}>Select Exam</Text>
            <Text style={styles.examSelectorSubtitle}>
              Enter the Exam ID before scanning answer sheets
            </Text>

            <TextInput
              style={styles.examInput}
              placeholder="Exam ID (e.g. abc123xyz)"
              placeholderTextColor="#aaa"
              value={examIdInput}
              onChangeText={setExamIdInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleConfirmExam}
            />

            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!examIdInput.trim() || isValidatingExam) &&
                styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirmExam}
              disabled={!examIdInput.trim() || isValidatingExam}
            >
              {isValidatingExam ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="white" />
                  <Text style={styles.confirmButtonText}>
                    Confirm & Start Scanning
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Camera ── */}
      {currentState === "camera" && (
        <CameraScanner
          key={`camera-${scanCount}`}
          questionCount={examQuestionCount}
          onScanComplete={handleScanComplete}
          onCancel={handleClose}
        />
      )}

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
    backgroundColor: "#f5f5f5",
  },
  backButton: {
    padding: 20,
    alignSelf: "flex-end",
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
  examInput: {
    width: "100%",
    backgroundColor: "white",
    borderWidth: 1.5,
    borderColor: "#007AFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#333",
    marginBottom: 20,
  },
  confirmButton: {
    width: "100%",
    backgroundColor: "#007AFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: "#b0c8f0",
  },
  confirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
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
