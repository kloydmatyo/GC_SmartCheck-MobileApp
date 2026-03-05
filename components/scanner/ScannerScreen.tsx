import { Ionicons } from "@expo/vector-icons";
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
  const [scanCount, setScanCount] = useState(0); // Track scan count to force camera remount

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

  const handleConfirmExam = async () => {
    if (!examIdInput.trim()) return;

    setIsValidatingExam(true);
    try {
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
    } catch (error) {
      console.error("[ScannerScreen] Error validating exam:", error);
      Alert.alert("Error", "Failed to validate exam ID");
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
});
