import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Toast from "react-native-toast-message";
import { db } from "../../config/firebase";
import { GradingService } from "../../services/gradingService";
import { StorageService } from "../../services/storageService";
import { GradingResult, ScanResult } from "../../types/scanning";
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
  const [examIdInput, setExamIdInput] = useState("");
  const [isValidatingExam, setIsValidatingExam] = useState(false);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(
    null,
  );
  const [scannedImage, setScannedImage] = useState<string | undefined>(
    undefined,
  );

  const handleScanComplete = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    try {
      const studentId = scanResult.studentId;

      // Ensure that a valid student ID was parsed
      if (!studentId || studentId === "0000000" || studentId === "Unknown") {
        Alert.alert(
          "Invalid ID",
          "Could not detect a valid student ID from the scanned sheet.",
        );
        return;
      }

      // Verify the student account with Firestore
      console.log(`[Firestore] Verifying student ID: ${studentId}...`);
      const studentsRef = collection(db, "students");
      const q = query(studentsRef, where("studentId", "==", studentId));

      const startTime = Date.now();
      const querySnapshot = await getDocs(q);
      const duration = Date.now() - startTime;

      const isValidId = !querySnapshot.empty;
      console.log(
        `[Firestore] Verification complete for ${studentId}: ${isValidId ? "MATCH FOUND" : "NO MATCH"} (${duration}ms)`,
      );

      if (!isValidId) {
        console.warn(
          `[Firestore] Student ID ${studentId} not found in 'students' collection.`,
        );
        Alert.alert(
          "Unrecognized ID",
          `Student ID ${studentId} is not a valid or registered account, but it was still scored.`,
        );
      } else {
        const studentData = querySnapshot.docs[0].data();
        console.log(`[Firestore] Student data:`, studentData);
      }

      // Get answer key (in production, this would come from the exam setup)
      const rawCount = scanResult.answers?.length || 20;
      const answerKey = GradingService.getDefaultAnswerKey(rawCount);

      // Grade the answers
      const result = GradingService.gradeAnswers(scanResult, answerKey);
      result.metadata = { ...result.metadata, isValidId: isValidId } as any;

      console.log(
        `[ScannerScreen] Scanned student ID: ${result.studentId} (Valid: ${isValidId})`,
      );
      console.log(`[ScannerScreen] Extracted answers count: ${rawCount}`);

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
      // Validate exam exists
      // For now, just accept any exam ID
      setActiveExamId(examIdInput.trim());
      setCurrentState("camera");
    } catch (error) {
      Alert.alert("Error", "Invalid exam ID");
    } finally {
      setIsValidatingExam(false);
    }
  };

  const handleScanAnother = () => {
    setGradingResult(null);
    setScannedImage(undefined);
    setCurrentState("camera");
  };

  const handleClose = () => {
    setGradingResult(null);
    setScannedImage(undefined);
    setCurrentState("camera");
    onClose();
  };

  return (
    <View style={styles.container}>
      {/* ── Step 5: Exam Selector ── */}
      {currentState === "exam-select" && (
        <View style={styles.examSelector}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color="#3d5a3d" />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.examSelectorContent}>
            <Ionicons name="document-text" size={56} color="#3d5a3d" />
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
  examInput: {
    width: "100%",
    backgroundColor: "white",
    borderWidth: 1.5,
    borderColor: "#3d5a3d",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#333",
    marginBottom: 20,
  },
  confirmButton: {
    width: "100%",
    backgroundColor: "#3d5a3d",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: "#95bba6",
  },
  confirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
