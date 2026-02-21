import { StatusBar } from "expo-status-bar";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import CameraScanner from "../components/scanner/CameraScanner";
import ScanResults from "../components/scanner/ScanResults";
import { GradingService } from "../services/gradingService";
import { GradingResult, ScanResult } from "../types/scanning";

export default function CameraTest() {
  const [showCamera, setShowCamera] = useState(false);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null);
  const [scannedImage, setScannedImage] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  // Updated to receive both the data result and the image file path
  const handleScanComplete = useCallback((scanResult: ScanResult, imageUri: string) => {
    // Get answer key (in production, this would come from the exam setup)
    const answerKey = GradingService.getDefaultAnswerKey();
    // Grade the answers
    const gradedInfo = GradingService.gradeAnswers(scanResult, answerKey);

    setScannedImage(imageUri);
    setGradingResult(gradedInfo);
    setShowCamera(false);
  }, []);

  const handleCancel = () => setShowCamera(false);

  const resetTest = () => {
    setGradingResult(null);
    setScannedImage(undefined);
  };

  const runMockTest = async () => {
    setIsLoading(true);
    setTimeout(() => {
      const mockResult: GradingResult = {
        studentId: "2024001",
        score: 18,
        totalPoints: 20,
        percentage: 90,
        correctAnswers: 18,
        totalQuestions: 20,
        details: [
          { questionNumber: 1, studentAnswer: "A", correctAnswer: "A", isCorrect: true, points: 1 },
          { questionNumber: 2, studentAnswer: "B", correctAnswer: "B", isCorrect: true, points: 1 },
          // ... mapping to your 20-question PDF structure
        ]
      };
      setGradingResult(mockResult);
      // For mock purposes, we can use a placeholder image
      setScannedImage("https://via.placeholder.com/300x600.png?text=Mock+Gordon+College+Sheet");
      setIsLoading(false);
    }, 1200);
  };

  if (showCamera) {
    return (
      <View style={styles.fullscreen}>
        <StatusBar style="light" />
        <CameraScanner onScanComplete={handleScanComplete} onCancel={handleCancel} />
      </View>
    );
  }

  if (gradingResult) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ScanResults
          result={gradingResult}
          imageUri={scannedImage} // Pass the image URI here
          onClose={resetTest}
          onScanAnother={() => {
            resetTest();
            setShowCamera(true);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Grading Assistant</Text>
        <Text style={styles.subtitle}>Gordon College - Olongapo City</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#1A237E" />
            <Text style={styles.loadingText}>Processing Sheet...</Text>
          </View>
        ) : (
          <>
            <View style={styles.mainCard}>
              <View style={styles.iconCircle}>
                <Text style={{ fontSize: 32 }}>🎓</Text>
              </View>
              <Text style={styles.cardTitle}>Start New Scan</Text>
              <Text style={styles.cardDescription}>
                Ready for 20-question Zipgrade answer sheets.
              </Text>

              <TouchableOpacity style={styles.primaryButton} onPress={() => setShowCamera(true)}>
                <Text style={styles.primaryButtonText}>Open Scanner</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.ghostButton} onPress={runMockTest}>
                <Text style={styles.ghostButtonText}>Run Diagnostic Mock</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  fullscreen: { flex: 1, backgroundColor: "black" },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: "800", color: "#1A237E" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 4 },
  scrollContent: { padding: 20 },
  mainCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 5 },
    }),
  },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#E8EAF6", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: "700", color: "#333", marginBottom: 8 },
  cardDescription: { fontSize: 14, color: "#777", textAlign: "center", marginBottom: 24 },
  primaryButton: { backgroundColor: "#1A237E", width: "100%", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryButtonText: { color: "white", fontSize: 17, fontWeight: "600" },
  ghostButton: { marginTop: 12, paddingVertical: 12 },
  ghostButtonText: { color: "#1A237E", fontSize: 15, fontWeight: "500" },
  loadingCard: { padding: 50, alignItems: "center" },
  loadingText: { marginTop: 15, fontSize: 16, color: "#444" },
});