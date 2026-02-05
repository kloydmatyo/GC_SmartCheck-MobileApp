import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ZipgradeGenerator } from "../../services/zipgradeGenerator";
import SvgPreview from "../ui/SvgPreview";

export default function GeneratorTest() {
  const [testResult, setTestResult] = useState<{
    svg: string;
    studentId: string;
    answers: { [key: number]: "A" | "B" | "C" | "D" };
  } | null>(null);

  const runTest = () => {
    try {
      const result = ZipgradeGenerator.generateRandomFilledSheet(
        "standard20",
        "TEST001",
      );
      setTestResult(result);

      Alert.alert(
        "Test Generated",
        `Student ID: ${result.studentId}\nAnswers: ${Object.keys(result.answers).length} filled\nFirst few answers: ${Object.entries(
          result.answers,
        )
          .slice(0, 5)
          .map(([q, a]) => `Q${q}:${a}`)
          .join(", ")}`,
        [{ text: "OK" }],
      );
    } catch (error) {
      Alert.alert("Error", `Failed to generate test: ${error}`);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="flask" size={32} color="#007AFF" />
        <Text style={styles.title}>Generator Test</Text>
        <Text style={styles.subtitle}>Test pre-filled sheet generation</Text>
      </View>

      <TouchableOpacity style={styles.testButton} onPress={runTest}>
        <Ionicons name="play" size={20} color="white" />
        <Text style={styles.testButtonText}>Generate Test Sheet</Text>
      </TouchableOpacity>

      {testResult && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Generated Data:</Text>
          <Text style={styles.resultText}>
            Student ID: {testResult.studentId}
          </Text>
          <Text style={styles.resultText}>
            Answers: {Object.keys(testResult.answers).length} questions
          </Text>
          <Text style={styles.resultText}>
            Sample answers:{" "}
            {Object.entries(testResult.answers)
              .slice(0, 10)
              .map(([q, a]) => `Q${q}:${a}`)
              .join(", ")}
          </Text>

          <View style={styles.previewContainer}>
            <SvgPreview
              svgContent={testResult.svg}
              title="Test Sheet Preview"
              studentId={testResult.studentId}
              filledAnswers={testResult.answers}
            />
          </View>
        </View>
      )}
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
  testButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  resultContainer: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  resultText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  previewContainer: {
    flex: 1,
    marginTop: 20,
    backgroundColor: "white",
    borderRadius: 8,
    overflow: "hidden",
  },
});
