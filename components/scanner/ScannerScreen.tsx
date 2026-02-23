import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import Toast from "react-native-toast-message";
import { db } from "../../config/firebase";
import { GradingService } from "../../services/gradingService";
import { StorageService } from "../../services/storageService";
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
      console.log(`[Firestore] Verification complete for ${studentId}: ${isValidId ? 'MATCH FOUND' : 'NO MATCH'} (${duration}ms)`);

      if (!isValidId) {
        console.warn(`[Firestore] Student ID ${studentId} not found in 'students' collection.`);
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

      console.log(`[ScannerScreen] Scanned student ID: ${result.studentId} (Valid: ${isValidId})`);
      console.log(`[ScannerScreen] Extracted answers count: ${rawCount}`);

      // Store result and image
      await StorageService.saveScanResult(result, imageUri);

      // Show success toast
      Toast.show({
        type: "success",
        text1: `Sheet Scanned: ${rawCount} Questions`,
        text2: `Student ${result.studentId || "00000000"}: ${result.score}/${result.totalPoints}`,
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
          questionCount={gradingResult.totalQuestions}
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
