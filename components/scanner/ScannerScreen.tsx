import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import Toast from "react-native-toast-message";
import { GradingService } from "../../services/gradingService";
import { ScanResult } from "../../types/scanning";
import { GradingResultExtended } from "../../types/student";
import CameraScanner from "./CameraScanner";
import ScanResults from "./ScanResults";

type ScannerState = "camera" | "results";

interface ScannerScreenProps {
  onClose: () => void;
  sectionId?: string; // Section context for validation
}

export default function ScannerScreen({ onClose, sectionId }: ScannerScreenProps) {
  const [currentState, setCurrentState] = useState<ScannerState>("camera");
  const [gradingResult, setGradingResult] = useState<GradingResultExtended | null>(
    null,
  );

  const handleScanComplete = async (scanResult: ScanResult) => {
    try {
      // Get answer key (in production, this would come from the exam setup)
      const answerKey = GradingService.getDefaultAnswerKey();

      // REQ 1-12, 13-21: Validate student ID before grading
      const result = await GradingService.gradeWithValidation(
        scanResult,
        answerKey,
        sectionId
      );

      // REQ 18: Instructor notification for invalid students (PDF 2.2 Acceptance #3)
      if (result.score === null) {
        // NULL grade assigned - notify instructor
        const statusMessages: Record<string, string> = {
          'NULL_INVALID_ID': 'Student ID not found in database',
          'NULL_INACTIVE': 'Student account is inactive',
          'NULL_NOT_IN_SECTION': 'Student not enrolled in this section'
        };

        Toast.show({
          type: "error",
          text1: "Invalid Student ID",
          text2: statusMessages[result.gradeStatus] || 'Validation failed',
          visibilityTime: 6000,
        });
      } else {
        // Valid student - show success
        Toast.show({
          type: "success",
          text1: "Scan Complete!",
          text2: `Student ${result.studentId}: ${result.score}/${result.totalPoints} (${result.percentage}%)`,
          visibilityTime: 4000,
        });
      }

      setGradingResult(result);
      setCurrentState("results");
    } catch (error) {
      console.error("Error grading answers:", error);
      Alert.alert("Error", "Failed to grade answers. Please try again.");
    }
  };

  const handleScanAnother = () => {
    setGradingResult(null);
    setCurrentState("camera");
  };

  const handleClose = () => {
    setGradingResult(null);
    setCurrentState("camera");
    onClose();
  };

  return (
    <View style={styles.container}>
      {currentState === "camera" && (
        <CameraScanner
          onScanComplete={handleScanComplete}
          onCancel={handleClose}
        />
      )}

      {currentState === "results" && gradingResult && (
        <ScanResults
          result={gradingResult}
          onClose={handleClose}
          onScanAnother={handleScanAnother}
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
});
