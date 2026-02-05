import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { GradingService } from "../../services/gradingService";
import { ZipgradeGenerator } from "../../services/zipgradeGenerator";
import { ZipgradeScanner } from "../../services/zipgradeScanner";
import SvgPreview from "../ui/SvgPreview";

interface ZipgradeDemoProps {
  onClose: () => void;
}

export default function ZipgradeDemo({ onClose }: ZipgradeDemoProps) {
  const [currentStep, setCurrentStep] = useState<
    "generate" | "scan" | "results"
  >("generate");
  const [generatedSheet, setGeneratedSheet] = useState<{
    svg: string;
    studentId: string;
    answers: { [key: number]: "A" | "B" | "C" | "D" };
  } | null>(null);
  const [scanResults, setScanResults] = useState<any>(null);

  const generateTestSheet = () => {
    try {
      const sheet = ZipgradeGenerator.generateRandomFilledSheet(
        "standard20",
        "DEMO001",
      );
      setGeneratedSheet(sheet);
      setCurrentStep("scan");

      Alert.alert(
        "Test Sheet Generated!",
        `Student ID: ${sheet.studentId}\nAnswers: ${Object.keys(sheet.answers).length} questions filled\n\nNow you can test the scanner with this sheet.`,
        [{ text: "OK" }],
      );
    } catch (error) {
      Alert.alert("Error", "Failed to generate test sheet");
    }
  };

  const simulateScan = async () => {
    if (!generatedSheet) return;

    try {
      // Simulate scanning the generated sheet
      const mockImageUri = "mock://generated-sheet";
      const scanResult = await ZipgradeScanner.processZipgradeSheet(
        mockImageUri,
        "standard20",
      );

      // Override with actual generated data for demo
      scanResult.studentId = generatedSheet.studentId;
      scanResult.answers = Object.entries(generatedSheet.answers).map(
        ([questionNum, answer]) => ({
          questionNumber: parseInt(questionNum),
          selectedAnswer: answer,
        }),
      );

      // Grade the answers
      const answerKey = GradingService.getDefaultAnswerKey();
      const gradingResult = GradingService.gradeAnswers(scanResult, answerKey);

      setScanResults(gradingResult);
      setCurrentStep("results");

      Alert.alert(
        "Scan Complete!",
        `Student ${gradingResult.studentId}: ${gradingResult.score}/${gradingResult.totalPoints} (${gradingResult.percentage}%)`,
        [{ text: "View Results" }],
      );
    } catch (error) {
      Alert.alert("Error", "Failed to simulate scan");
    }
  };

  const resetDemo = () => {
    setGeneratedSheet(null);
    setScanResults(null);
    setCurrentStep("generate");
  };

  const renderGenerateStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Ionicons name="document-text" size={48} color="#007AFF" />
        <Text style={styles.stepTitle}>Step 1: Generate Test Sheet</Text>
        <Text style={styles.stepDescription}>
          Create a Zipgrade answer sheet with random answers for testing
        </Text>
      </View>

      <TouchableOpacity style={styles.actionButton} onPress={generateTestSheet}>
        <Ionicons name="add-circle" size={24} color="white" />
        <Text style={styles.actionButtonText}>Generate Random Test Sheet</Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>What this does:</Text>
        <Text style={styles.infoText}>
          • Creates a 20-question Zipgrade answer sheet
        </Text>
        <Text style={styles.infoText}>• Fills bubbles with random answers</Text>
        <Text style={styles.infoText}>
          • Generates a random 8-digit student ID
        </Text>
        <Text style={styles.infoText}>• Produces a print-ready SVG format</Text>
      </View>
    </View>
  );

  const renderScanStep = () => {
    if (!generatedSheet) return null;

    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepHeader}>
          <Ionicons name="camera" size={48} color="#4CAF50" />
          <Text style={styles.stepTitle}>Step 2: Test Scanner</Text>
          <Text style={styles.stepDescription}>
            Simulate scanning the generated answer sheet
          </Text>
        </View>

        <View style={styles.sheetPreview}>
          <SvgPreview
            svgContent={generatedSheet.svg}
            title="Generated Answer Sheet"
            studentId={generatedSheet.studentId}
            filledAnswers={generatedSheet.answers}
          />
        </View>

        <TouchableOpacity
          style={[styles.actionButton, styles.scanButton]}
          onPress={simulateScan}
        >
          <Ionicons name="scan" size={24} color="white" />
          <Text style={styles.actionButtonText}>Simulate Scan & Grade</Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Scanner will detect:</Text>
          <Text style={styles.infoText}>
            • Student ID: {generatedSheet.studentId}
          </Text>
          <Text style={styles.infoText}>
            • {Object.keys(generatedSheet.answers).length} filled answers
          </Text>
          <Text style={styles.infoText}>• Bubble positions and selections</Text>
        </View>
      </View>
    );
  };

  const renderResultsStep = () => {
    if (!scanResults) return null;

    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepHeader}>
          <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
          <Text style={styles.stepTitle}>Step 3: Results</Text>
          <Text style={styles.stepDescription}>
            Scanning and grading completed successfully!
          </Text>
        </View>

        <View style={styles.resultsCard}>
          <Text style={styles.resultTitle}>Scan Results</Text>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Student ID:</Text>
            <Text style={styles.resultValue}>{scanResults.studentId}</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Score:</Text>
            <Text style={styles.resultValue}>
              {scanResults.score}/{scanResults.totalPoints}
            </Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Percentage:</Text>
            <Text
              style={[
                styles.resultValue,
                { color: scanResults.percentage >= 70 ? "#4CAF50" : "#F44336" },
              ]}
            >
              {scanResults.percentage}%
            </Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Correct:</Text>
            <Text style={styles.resultValue}>
              {scanResults.correctAnswers}/{scanResults.totalQuestions}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.actionButton, styles.resetButton]}
          onPress={resetDemo}
        >
          <Ionicons name="refresh" size={24} color="white" />
          <Text style={styles.actionButtonText}>Try Another Demo</Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Demo Complete!</Text>
          <Text style={styles.infoText}>
            • Answer sheet was successfully scanned
          </Text>
          <Text style={styles.infoText}>
            • Student ID was correctly identified
          </Text>
          <Text style={styles.infoText}>
            • Answers were graded automatically
          </Text>
          <Text style={styles.infoText}>• Results are ready for export</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#666" />
        </TouchableOpacity>
        <Text style={styles.title}>Zipgrade Demo</Text>
        <TouchableOpacity onPress={resetDemo} style={styles.resetHeaderButton}>
          <Ionicons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressStep,
            currentStep !== "generate" && styles.progressStepComplete,
          ]}
        >
          <Text style={styles.progressText}>1</Text>
        </View>
        <View
          style={[
            styles.progressLine,
            currentStep === "results" && styles.progressLineComplete,
          ]}
        />
        <View
          style={[
            styles.progressStep,
            currentStep === "results" && styles.progressStepComplete,
          ]}
        >
          <Text style={styles.progressText}>2</Text>
        </View>
        <View
          style={[
            styles.progressLine,
            currentStep === "results" && styles.progressLineComplete,
          ]}
        />
        <View
          style={[
            styles.progressStep,
            currentStep === "results" && styles.progressStepComplete,
          ]}
        >
          <Text style={styles.progressText}>3</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {currentStep === "generate" && renderGenerateStep()}
        {currentStep === "scan" && renderScanStep()}
        {currentStep === "results" && renderResultsStep()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  closeButton: {
    padding: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  resetHeaderButton: {
    padding: 5,
  },
  progressBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "white",
  },
  progressStep: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#e0e0e0",
    alignItems: "center",
    justifyContent: "center",
  },
  progressStepComplete: {
    backgroundColor: "#4CAF50",
  },
  progressText: {
    color: "white",
    fontWeight: "bold",
  },
  progressLine: {
    width: 50,
    height: 2,
    backgroundColor: "#e0e0e0",
  },
  progressLineComplete: {
    backgroundColor: "#4CAF50",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  stepContainer: {
    flex: 1,
  },
  stepHeader: {
    alignItems: "center",
    marginBottom: 30,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginTop: 15,
    marginBottom: 10,
  },
  stepDescription: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    gap: 10,
  },
  scanButton: {
    backgroundColor: "#4CAF50",
  },
  resetButton: {
    backgroundColor: "#FF9500",
  },
  actionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  infoBox: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  sheetPreview: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  resultsCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  resultLabel: {
    fontSize: 16,
    color: "#666",
  },
  resultValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
});
