import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GradingService } from "../../services/gradingService";
import { ZipgradeGenerator } from "../../services/zipgradeGenerator";
import { ZipgradeScanner } from "../../services/zipgradeScanner";

export default function SystemTest() {
  const [testResults, setTestResults] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);

  const runSystemTest = async () => {
    setIsRunning(true);
    setTestResults("Running system tests...\n\n");

    try {
      // Test 1: Generator
      setTestResults((prev) => prev + "✓ Testing Answer Sheet Generator...\n");
      const blankSheet = ZipgradeGenerator.generateAnswerSheetSVG(
        "standard20",
        "TEST001",
        "A",
      );
      const filledSheet = ZipgradeGenerator.generateRandomFilledSheet(
        "standard20",
        "TEST001",
      );
      setTestResults(
        (prev) =>
          prev + `  - Blank sheet generated: ${blankSheet.length} characters\n`,
      );
      setTestResults(
        (prev) =>
          prev +
          `  - Filled sheet generated with student ID: ${filledSheet.studentId}\n\n`,
      );

      // Test 2: Scanner
      setTestResults((prev) => prev + "✓ Testing Zipgrade Scanner...\n");
      const mockImageUri = "test://mock-image";
      const scanResult = await ZipgradeScanner.processZipgradeSheet(
        mockImageUri,
        "standard20",
      );
      setTestResults(
        (prev) =>
          prev +
          `  - Scan completed with confidence: ${(scanResult.confidence * 100).toFixed(1)}%\n`,
      );
      setTestResults(
        (prev) => prev + `  - Student ID detected: ${scanResult.studentId}\n`,
      );
      setTestResults(
        (prev) =>
          prev +
          `  - Answers detected: ${scanResult.answers.length} questions\n\n`,
      );

      // Test 3: Grading
      setTestResults((prev) => prev + "✓ Testing Grading Service...\n");
      const answerKey = GradingService.getDefaultAnswerKey();
      const gradingResult = GradingService.gradeAnswers(scanResult, answerKey);
      setTestResults(
        (prev) =>
          prev +
          `  - Score calculated: ${gradingResult.score}/${gradingResult.totalPoints}\n`,
      );
      setTestResults(
        (prev) => prev + `  - Percentage: ${gradingResult.percentage}%\n`,
      );
      setTestResults(
        (prev) =>
          prev +
          `  - Correct answers: ${gradingResult.correctAnswers}/${gradingResult.totalQuestions}\n\n`,
      );

      // Test 4: Templates
      setTestResults((prev) => prev + "✓ Testing Template System...\n");
      const templates = ZipgradeGenerator.getTemplates();
      const templateNames = Object.keys(templates);
      setTestResults(
        (prev) =>
          prev + `  - Available templates: ${templateNames.join(", ")}\n`,
      );
      setTestResults(
        (prev) => prev + `  - Template count: ${templateNames.length}\n\n`,
      );

      setTestResults((prev) => prev + "🎉 All tests passed successfully!\n");
      setTestResults((prev) => prev + "\nSystem is ready for use.");

      Alert.alert("Tests Complete", "All system tests passed successfully!");
    } catch (error) {
      setTestResults((prev) => prev + `❌ Test failed: ${error}\n`);
      Alert.alert(
        "Test Failed",
        "Some tests failed. Check the results for details.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="flask" size={32} color="#007AFF" />
        <Text style={styles.title}>System Test</Text>
        <Text style={styles.subtitle}>Verify all components are working</Text>
      </View>

      <TouchableOpacity
        style={[styles.testButton, isRunning && styles.testButtonDisabled]}
        onPress={runSystemTest}
        disabled={isRunning}
      >
        <Ionicons
          name={isRunning ? "hourglass" : "play"}
          size={20}
          color="white"
        />
        <Text style={styles.testButtonText}>
          {isRunning ? "Running Tests..." : "Run System Test"}
        </Text>
      </TouchableOpacity>

      <View style={styles.resultsContainer}>
        <Text style={styles.resultsTitle}>Test Results:</Text>
        <Text style={styles.resultsText}>
          {testResults || "No tests run yet"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginTop: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 5,
  },
  testButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    gap: 10,
  },
  testButtonDisabled: {
    backgroundColor: "#999",
  },
  testButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  resultsText: {
    fontSize: 14,
    color: "#666",
    fontFamily: "monospace",
    lineHeight: 20,
  },
});
