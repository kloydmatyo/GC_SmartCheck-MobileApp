import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CameraScanner from "../components/scanner/CameraScanner";
import ScanResults from "../components/scanner/ScanResults"; // Import the ScanResults component
import { GradingResult } from "../types/scanning"; // Use GradingResult instead of ScanResult

export default function CameraTest() {
  const [showCamera, setShowCamera] = useState(false);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleScanComplete = (result: GradingResult) => {
    setShowCamera(false);
    setGradingResult(result);
  };

  const handleCancel = () => {
    setShowCamera(false);
  };

  const resetTest = () => {
    setGradingResult(null);
  };

  // Mock test that matches GradingResult structure
  const runMockTest = async () => {
    setIsLoading(true);

    // Simulate processing delay
    setTimeout(() => {
      const mockResult: GradingResult = {
        studentId: "2024001",
        testVersion: "A",
        totalQuestions: 50,
        correctAnswers: 42,
        score: 42,
        totalPoints: 50,
        percentage: 84,
        details: [
          {
            questionNumber: 1,
            studentAnswer: "B",
            correctAnswer: "B",
            isCorrect: true,
            points: 1,
          },
          {
            questionNumber: 2,
            studentAnswer: "C",
            correctAnswer: "C",
            isCorrect: true,
            points: 1,
          },
          {
            questionNumber: 3,
            studentAnswer: "A",
            correctAnswer: "A",
            isCorrect: true,
            points: 1,
          },
          {
            questionNumber: 4,
            studentAnswer: "D",
            correctAnswer: "C",
            isCorrect: false,
            points: 0,
          },
          {
            questionNumber: 5,
            studentAnswer: "B",
            correctAnswer: "B",
            isCorrect: true,
            points: 1,
          },
        ],
        metadata: {
          confidence: 0.95,
          processingTimeMs: 850,
          templateUsed: "standard20",
          imageQuality: 0.92,
        },
      };

      setGradingResult(mockResult);
      setIsLoading(false);
    }, 1500);
  };

  if (showCamera) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <CameraScanner
          onScanComplete={handleScanComplete}
          onCancel={handleCancel}
        />
      </View>
    );
  }

  // If we have a grading result, show the ScanResults component
  if (gradingResult) {
    return (
      <View style={styles.container}>
        <ScanResults
          result={gradingResult}
          onClose={resetTest}
          onScanAnother={() => {
            resetTest();
            setShowCamera(true);
          }}
        />
      </View>
    );
  }

  // Main menu when no camera and no results
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>📱 Zipgrade Scanner Test</Text>
        <Text style={styles.subtitle}>Camera Test Page</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Main Content */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Processing test...</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Test Scanner</Text>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setShowCamera(true)}
              >
                <Text style={styles.primaryButtonText}>
                  📸 Open Camera Scanner
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={runMockTest}
              >
                <Text style={styles.secondaryButtonText}>🔄 Run Mock Test</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>📋 Instructions:</Text>
              <Text style={styles.infoText}>
                1. Place Zipgrade sheet on flat surface
              </Text>
              <Text style={styles.infoText}>2. Ensure good lighting</Text>
              <Text style={styles.infoText}>3. Align sheet in the frame</Text>
              <Text style={styles.infoText}>4. Hold steady and capture</Text>
            </View>
          </View>
        )}

        {/* Quick Test Buttons */}
        <View style={styles.debugCard}>
          <Text style={styles.debugTitle}>🔧 Quick Tests</Text>

          <TouchableOpacity
            style={styles.debugButton}
            onPress={() => {
              Alert.alert("Test", "Navigation is working!");
            }}
          >
            <Text style={styles.debugButtonText}>Test Alert</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.debugButton}
            onPress={() => {
              console.log("Current app state:", {
                showCamera,
                hasResult: !!gradingResult,
                isLoading,
              });
              Alert.alert("State", "Check console for details");
            }}
          >
            <Text style={styles.debugButtonText}>Log State to Console</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 20,
    color: "#333",
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#34C759",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  infoBox: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#495057",
  },
  infoText: {
    fontSize: 14,
    color: "#6c757d",
    marginBottom: 4,
  },
  loadingContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
    marginBottom: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  debugCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#dee2e6",
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6c757d",
    marginBottom: 12,
  },
  debugButton: {
    backgroundColor: "#6c757d",
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  debugButtonText: {
    color: "white",
    fontSize: 14,
    textAlign: "center",
  },
});
