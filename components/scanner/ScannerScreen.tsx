import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import Toast from "react-native-toast-message";
import { GradingService } from "../../services/gradingService";
import { GradingResult, ScanResult } from "../../types/scanning";
import CameraScanner from "./CameraScanner";
import ScanResults from "./ScanResults";

type ScannerState = "camera" | "results";

interface ScannerScreenProps {
  onClose: () => void;
}

export default function ScannerScreen({ onClose }: ScannerScreenProps) {
  const [currentState, setCurrentState] = useState<ScannerState>("camera");
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(
    null,
  );
  const [scannedImage, setScannedImage] = useState<string | undefined>(
    undefined,
  );

  const handleScanComplete = async (scanResult: ScanResult, imageUri: string) => {
    try {
      // Get answer key (in production, this would come from the exam setup)
      const answerKey = GradingService.getDefaultAnswerKey();

      // Grade the answers
      const result = GradingService.gradeAnswers(scanResult, answerKey);

      // Show success toast
      Toast.show({
        type: "success",
        text1: "Scan Complete!",
        text2: `Student ${result.studentId}: ${result.score}/${result.totalPoints} (${result.percentage}%)`,
        visibilityTime: 4000,
      });

      setGradingResult(result);
      setScannedImage(imageUri);
      setCurrentState("results");
    } catch (error) {
      console.error("Error grading answers:", error);
      Alert.alert("Error", "Failed to grade answers. Please try again.");
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
      {currentState === "camera" && (
        <CameraScanner
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
