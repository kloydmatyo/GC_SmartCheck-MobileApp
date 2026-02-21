import { Ionicons } from "@expo/vector-icons";
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
import {
  GradeStorageService,
  SaveResult,
} from "../../services/gradeStorageService";
import { GradingService } from "../../services/gradingService";
import { ScanResult } from "../../types/scanning";
import { GradingResultExtended } from "../../types/student";
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
  const [saveStatus, setSaveStatus] = useState<SaveResult | null>(null);

  // Exam selector 
  const handleConfirmExam = async () => {
    const trimmed = examIdInput.trim();
    if (!trimmed) {
      Alert.alert(
        "Exam ID required",
        "Please enter a valid Exam ID before scanning.",
      );
      return;
    }
    setIsValidatingExam(true);
    const isValid = await GradeStorageService.validateExamId(trimmed);
    setIsValidatingExam(false);
    if (!isValid) {
      Alert.alert(
        "Invalid Exam",
        `Exam "${trimmed}" was not found or is not active. Please check the ID and try again.`,
      );
      return;
    }
    setActiveExamId(trimmed);
    setCurrentState("camera");
  };

  // ── Step 3: Scan + grade + store ─────────────────────────────────────────
  const handleScanComplete = async (scanResult: ScanResult) => {
    try {
      const answerKey = GradingService.getDefaultAnswerKey();
      const result = GradingService.gradeAnswers(scanResult, answerKey);

      // Attempt to save to Firestore
      const storageResult = await GradeStorageService.saveGradingResult(
        result,
        activeExamId,
      );
      setSaveStatus(storageResult);

      // Toast based on save status
      if (storageResult.status === "saved") {
        Toast.show({
          type: "success",
          text1: "Scan Complete!",
          text2: `Student ${result.studentId}: ${result.score}/${result.totalPoints} (${result.percentage}%) — Saved`,
          visibilityTime: 4000,
        });
      } else if (storageResult.status === "duplicate") {
        Toast.show({
          type: "error",
          text1: "Already Graded",
          text2: storageResult.message,
          visibilityTime: 5000,
        });
      } else if (storageResult.status === "pending") {
        Toast.show({
          type: "info",
          text1: "Saved Offline",
          text2: "No internet — result queued and will sync automatically.",
          visibilityTime: 5000,
        });
      } else {
        Toast.show({
          type: "error",
          text1: "Save Failed",
          text2: storageResult.message,
          visibilityTime: 5000,
        });
      }

      setGradingResult(result);
      setCurrentState("results");
    } catch (error) {
      console.error("Error grading answers:", error);
      Alert.alert("Error", "Failed to grade answers. Please try again.");
    }
  };

  // Retry save from results screen
  const handleRetrySave = async () => {
    if (!gradingResult) return;
    const storageResult = await GradeStorageService.saveGradingResult(
      gradingResult,
      activeExamId,
    );
    setSaveStatus(storageResult);
    Toast.show({
      type: storageResult.success ? "success" : "error",
      text1: storageResult.success ? "Saved Successfully" : "Save Failed",
      text2: storageResult.message,
      visibilityTime: 4000,
    });
  };

  const handleScanAnother = () => {
    setGradingResult(null);
    setSaveStatus(null);
    setCurrentState("camera");
  };

  const handleClose = () => {
    setGradingResult(null);
    setSaveStatus(null);
    setActiveExamId("");
    setExamIdInput("");
    setCurrentState("exam-select");
    onClose();
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
          onScanComplete={handleScanComplete}
          onCancel={handleClose}
        />
      )}

      {/* ── Results ── */}
      {currentState === "results" && gradingResult && (
        <ScanResults
          result={gradingResult}
          saveStatus={saveStatus}
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
