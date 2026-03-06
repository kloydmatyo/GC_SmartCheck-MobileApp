import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  const [scanCount, setScanCount] = useState(0); // Track scan count to force camera remount

  const handleScanComplete = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    try {
      const studentId = scanResult.studentId;

      // Basic validation
      if (!studentId || studentId === "0000000" || studentId === "Unknown") {
        Alert.alert("Invalid ID", "Could not detect a valid student ID. Please check the bubbles.");
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  examSelector: { flex: 1, padding: 20, justifyContent: "center" },
  closeButton: { position: "absolute", top: 40, right: 20 },
  content: { alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  input: { borderBottomWidth: 2, borderBottomColor: "#007AFF", width: "80%", fontSize: 20, textAlign: "center", marginBottom: 30 },
  btn: { backgroundColor: "#007AFF", padding: 15, borderRadius: 10, width: "80%", alignItems: "center" },
  btnText: { color: "white", fontSize: 18, fontWeight: "bold" }
});
