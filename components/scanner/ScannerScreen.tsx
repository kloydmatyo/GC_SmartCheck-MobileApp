import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
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

// Helper for fast-failing Firestore calls
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

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

<<<<<<< HEAD
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
=======
      // Basic validation
      if (!studentId || studentId === "0000000" || studentId === "Unknown") {
        Alert.alert("Invalid ID", "Could not detect a valid student ID. Please check the bubbles.");
>>>>>>> b84de6dc8e340785885c18d9ff640d33943c9b95
        return;
      }

      console.log(`[ScannerScreen] Detected student ID: ${studentId}`);

      // ── 1. Fast Student Verification ──
      let isValidId = false;
      const netState = await NetInfo.fetch();

      if (netState.isConnected && netState.isInternetReachable) {
        console.log(`[Firestore] Verifying student ID: ${studentId}...`);
        try {
          const q = query(collection(db, "students"), where("studentId", "==", studentId));
          const snap = await withTimeout(getDocs(q), 2000);
          isValidId = !snap.empty;

          if (!isValidId) {
            // Fallback to class check
            const classesSnapshot = await withTimeout(getDocs(collection(db, "classes")), 2500);
            for (const classDoc of classesSnapshot.docs) {
              if (classDoc.data().students?.some((s: any) => s.student_id === studentId)) {
                isValidId = true;
                break;
              }
            }
          }
        } catch (err) {
          console.warn("[ScannerScreen] Student verification timed out. Assuming valid.");
          isValidId = true;
        }
      } else {
        console.log("[ScannerScreen] Offline - Skipping network validation.");
        isValidId = true; // Trust ID while offline
      }

      if (!isValidId) {
        Alert.alert("Unregistered student", `ID ${studentId} not found, but it will be scored anyway.`);
      }

      // ── 2. Fetch Answer Key (Fast Timeout) ──
      const rawCount = scanResult.answers?.length || 20;
      let answerKey: string[] = [];

      try {
        const { ExamService } = await import("../../services/examService");
        const examData = await withTimeout(ExamService.getExamById(activeExamId), 2500);
        if (examData?.answerKey?.answers) {
          answerKey = examData.answerKey.answers;
        } else {
          throw new Error("Missing key");
        }
      } catch (error) {
        console.warn("[ScannerScreen] Answer key fetch failed/timed out. using default key.");
        answerKey = GradingService.getDefaultAnswerKey(rawCount).map(ak => ak.correctAnswer);
      }

      const answerKeyFormatted = answerKey.map((answer, index) => ({
        questionNumber: index + 1,
        correctAnswer: answer,
        points: 1,
      }));

      // ── 3. Grade & Duplicate Check ──
      const result = GradingService.gradeAnswers(scanResult, answerKeyFormatted);
      result.metadata = { ...result.metadata, isValidId: isValidId } as any;

      let duplicateCheck = null;
      try {
        duplicateCheck = await withTimeout(
          DuplicateScoreDetectionService.checkForDuplicates(result, activeExamId),
          2000
        );
      } catch (err) { /* proceed if check hangs */ }

      if (duplicateCheck && (duplicateCheck.matchType === "exact" || duplicateCheck.matchType === "high")) {
        setPendingResult(result);
        setDuplicateMatch(duplicateCheck);
        setShowDuplicateModal(true);
        return;
      }

      // ── 4. Save Pipeline ──
      const savedResult = await StorageService.saveScanResult(result, imageUri);

      // Async Firestore/Realm save
      GradeStorageService.saveGradingResult(result, activeExamId).then(saveResult => {
        if (saveResult.status === "saved") {
          Toast.show({ type: "success", text1: "Saved", text2: `Score: ${result.score}/${result.totalPoints}` });
        } else if (saveResult.status === "pending") {
          Toast.show({ type: "info", text1: "Queued Offline", text2: "Data saved in RealmDB for later sync." });
        }
      });

      setGradingResult(savedResult);
      setScannedImage(imageUri);
      setCurrentState("results");

    } catch (error) {
      console.error("[ScannerScreen] Error:", error);
      Alert.alert("Error", "Failed to process scan.");
    }
  };

  const handleRetrySave = () => handleFirestoreRetrySave(gradingResult!, activeExamId);

  const handleFirestoreRetrySave = async (result: GradingResult, examId: string) => {
    const saveResult = await GradeStorageService.saveGradingResult(result, examId);
    if (saveResult.status === "saved") {
      Toast.show({ type: "success", text1: "Saved Successfully" });
    } else if (saveResult.status === "pending") {
      Toast.show({ type: "info", text1: "Saved Locally (Realm)" });
    } else {
      Toast.show({ type: "error", text1: "Still Failing", text2: saveResult.message });
    }
  };

  const handleConfirmExam = async () => {
    if (!examIdInput.trim()) return;
    setIsValidatingExam(true);
    try {
      const { auth } = await import("../../config/firebase");
      if (!auth.currentUser) {
        Alert.alert("Auth Required", "Please sign in to search for exams.");
        return;
      }

      const examsRef = collection(db, "exams");
      const q = query(examsRef, where("examCode", "==", examIdInput.trim()));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const data = snap.docs[0].data();
        setExamQuestionCount(data.num_items || 20);
        setActiveExamId(snap.docs[0].id);
        setCurrentState("camera");
      } else {
        Alert.alert("Error", "Exam not found.");
      }
    } catch (err) {
      Alert.alert("Error", "Could not reach server.");
    } finally {
      setIsValidatingExam(false);
    }
  };

  const handleScanAnother = () => {
    setScanCount(prev => prev + 1);
    setCurrentState("camera");
  };

  const handleClose = () => {
    setCurrentState("exam-select");
    onClose();
  };

  const handleKeepNewScan = async () => {
    if (!pendingResult || !scannedImage) return;
    const overridden = DuplicateScoreDetectionService.markAsOverride(pendingResult);
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
      {currentState === "exam-select" && (
        <View style={styles.examSelector}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={32} color="black" />
          </TouchableOpacity>
          <View style={styles.content}>
            <Text style={styles.title}>Enter Exam Code</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. MATH-101"
              value={examIdInput}
              onChangeText={setExamIdInput}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.btn} onPress={handleConfirmExam}>
              {isValidatingExam ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Start Scanning</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {currentState === "camera" && (
        <CameraScanner
          key={`cam-${scanCount}`}
          questionCount={examQuestionCount}
          onScanComplete={handleScanComplete}
          onCancel={handleClose}
        />
      )}

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
<<<<<<< HEAD

  {/* ── Manual Student ID Entry Modal ── */ }
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
=======
>>>>>>> b84de6dc8e340785885c18d9ff640d33943c9b95
    </View >
  );
}

const styles = StyleSheet.create({
<<<<<<< HEAD
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
=======
  container: { flex: 1, backgroundColor: "white" },
  examSelector: { flex: 1, padding: 20, justifyContent: "center" },
  closeButton: { position: "absolute", top: 40, right: 20 },
  content: { alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  input: { borderBottomWidth: 2, borderBottomColor: "#007AFF", width: "80%", fontSize: 20, textAlign: "center", marginBottom: 30 },
  btn: { backgroundColor: "#007AFF", padding: 15, borderRadius: 10, width: "80%", alignItems: "center" },
  btnText: { color: "white", fontSize: 18, fontWeight: "bold" }
>>>>>>> b84de6dc8e340785885c18d9ff640d33943c9b95
});
