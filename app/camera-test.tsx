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
import { GradingResult } from "../types/scanning";

export default function CameraTest() {
  const [showCamera, setShowCamera] = useState(false);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleScanComplete = useCallback((result: GradingResult) => {
    setShowCamera(false);
    setGradingResult(result);
  }, []);

  const handleCancel = () => setShowCamera(false);
  const resetTest = () => setGradingResult(null);

  const runMockTest = async () => {
    setIsLoading(true);
    // Simulate network/processing latency
    setTimeout(() => {
      const mockResult: GradingResult = {
        studentId: "2024001",
        testVersion: "A",
        totalQuestions: 5,
        correctAnswers: 4,
        score: 4,
        totalPoints: 5,
        percentage: 80,
        details: [
          { questionNumber: 1, studentAnswer: "B", correctAnswer: "B", isCorrect: true, points: 1 },
          { questionNumber: 2, studentAnswer: "C", correctAnswer: "C", isCorrect: true, points: 1 },
          { questionNumber: 3, studentAnswer: "A", correctAnswer: "A", isCorrect: true, points: 1 },
          { questionNumber: 4, studentAnswer: "D", correctAnswer: "C", isCorrect: false, points: 0 },
          { questionNumber: 5, studentAnswer: "B", correctAnswer: "B", isCorrect: true, points: 1 },
        ],
        metadata: {
          confidence: 0.98,
          processingTimeMs: 450,
          templateUsed: "standard5",
          imageQuality: 0.95,
        },
      };
      setGradingResult(mockResult);
      setIsLoading(false);
    }, 1200);
  };

  // 1. Camera Overlay
  if (showCamera) {
    return (
      <View style={styles.fullscreen}>
        <StatusBar style="light" />
        <CameraScanner onScanComplete={handleScanComplete} onCancel={handleCancel} />
      </View>
    );
  }

  // 2. Results View (Detailed Breakdown)
  if (gradingResult) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ScanResults
          result={gradingResult}
          onClose={resetTest}
          onScanAnother={() => {
            resetTest();
            setShowCamera(true);
          }}
        />
        {/* The Question-by-Question breakdown is usually handled inside ScanResults, 
            but here is how you should structure that component's internal list: */}
      </SafeAreaView>
    );
  }

  // 3. Landing / Dashboard
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Grading Assistant</Text>
        <Text style={styles.subtitle}>Ready to scan student bubble sheets</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Analyzing bubbles...</Text>
          </View>
        ) : (
          <>
            <View style={styles.mainCard}>
              <View style={styles.iconCircle}>
                <Text style={{ fontSize: 32 }}>📄</Text>
              </View>
              <Text style={styles.cardTitle}>New Grading Session</Text>
              <Text style={styles.cardDescription}>
                Point your camera at the completed Zipgrade sheet to automatically grade the test.
              </Text>

              <TouchableOpacity style={styles.primaryButton} onPress={() => setShowCamera(true)}>
                <Text style={styles.primaryButtonText}>Start Camera Scanner</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.ghostButton} onPress={runMockTest}>
                <Text style={styles.ghostButtonText}>Try with Mock Data</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.instructionCard}>
              <Text style={styles.instructionHeader}>Best Practices</Text>
              <View style={styles.step}><Text>✅</Text><Text style={styles.stepText}>Ensure corners are visible</Text></View>
              <View style={styles.step}><Text>✅</Text><Text style={styles.stepText}>Avoid harsh shadows</Text></View>
              <View style={styles.step}><Text>✅</Text><Text style={styles.stepText}>Keep the sheet flat</Text></View>
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
  title: { fontSize: 28, fontWeight: "800", color: "#1A1A1A" },
  subtitle: { fontSize: 16, color: "#666", marginTop: 4 },
  scrollContent: { padding: 20 },
  mainCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 5 },
    }),
  },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#F0F7FF", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: "700", color: "#333", marginBottom: 8 },
  cardDescription: { fontSize: 14, color: "#777", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  primaryButton: { backgroundColor: "#007AFF", width: "100%", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryButtonText: { color: "white", fontSize: 17, fontWeight: "600" },
  ghostButton: { marginTop: 12, paddingVertical: 12 },
  ghostButtonText: { color: "#007AFF", fontSize: 15, fontWeight: "500" },
  loadingCard: { padding: 50, alignItems: "center" },
  loadingText: { marginTop: 15, fontSize: 16, color: "#444", fontWeight: "500" },
  instructionCard: { marginTop: 24, padding: 20, backgroundColor: "#FFF", borderRadius: 16, borderLeftWidth: 4, borderLeftColor: "#34C759" },
  instructionHeader: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  step: { flexDirection: "row", marginBottom: 8, alignItems: "center" },
  stepText: { marginLeft: 10, color: "#555", fontSize: 14 },
});