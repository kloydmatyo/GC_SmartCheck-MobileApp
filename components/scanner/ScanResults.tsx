import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { GradingResult } from "../../types/scanning";

interface ScanResultsProps {
  result: GradingResult;
  onClose: () => void;
  onScanAnother: () => void;
}

export default function ScanResults({
  result,
  onClose,
  onScanAnother,
}: ScanResultsProps) {
  const getScoreColor = (percentage: number) => {
    if (percentage >= 90) return "#4CAF50"; // Green
    if (percentage >= 80) return "#FF9800"; // Orange
    if (percentage >= 70) return "#FFC107"; // Yellow
    return "#F44336"; // Red
  };

  const getGradeLetter = (percentage: number) => {
    if (percentage >= 90) return "A";
    if (percentage >= 80) return "B";
    if (percentage >= 70) return "C";
    if (percentage >= 60) return "D";
    return "F";
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan Results</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Student Info */}
        <View style={styles.studentCard}>
          <Text style={styles.studentId}>Student ID: {result.studentId}</Text>
          <View style={styles.scoreContainer}>
            <Text
              style={[
                styles.scoreText,
                { color: getScoreColor(result.percentage) },
              ]}
            >
              {result.score}/{result.totalPoints}
            </Text>
            <Text
              style={[
                styles.percentageText,
                { color: getScoreColor(result.percentage) },
              ]}
            >
              {result.percentage}%
            </Text>
            <Text
              style={[
                styles.gradeText,
                { color: getScoreColor(result.percentage) },
              ]}
            >
              {getGradeLetter(result.percentage)}
            </Text>
          </View>
          <Text style={styles.correctAnswers}>
            Correct: {result.correctAnswers}/{result.totalQuestions}
          </Text>
        </View>

        {/* Answer Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Answer Details</Text>
          <View style={styles.detailsGrid}>
            {result.details.map((detail, index) => (
              <View
                key={detail.questionNumber}
                style={[
                  styles.answerItem,
                  detail.isCorrect
                    ? styles.correctAnswer
                    : styles.incorrectAnswer,
                ]}
              >
                <Text style={styles.questionNumber}>
                  Q{detail.questionNumber}
                </Text>
                <Text style={styles.answerText}>
                  {detail.studentAnswer || "—"} / {detail.correctAnswer}
                </Text>
                <Ionicons
                  name={detail.isCorrect ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={detail.isCorrect ? "#4CAF50" : "#F44336"}
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.scanAnotherButton]}
          onPress={onScanAnother}
        >
          <Ionicons name="camera" size={20} color="white" />
          <Text style={styles.actionButtonText}>Scan Another</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.doneButton]}
          onPress={onClose}
        >
          <Ionicons name="checkmark" size={20} color="white" />
          <Text style={styles.actionButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
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
    justifyContent: "space-between",
    alignItems: "center",
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
  closeButton: {
    padding: 5,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  studentCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  studentId: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  scoreText: {
    fontSize: 32,
    fontWeight: "bold",
    marginRight: 15,
  },
  percentageText: {
    fontSize: 28,
    fontWeight: "bold",
    marginRight: 15,
  },
  gradeText: {
    fontSize: 36,
    fontWeight: "bold",
  },
  correctAnswers: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  detailsCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  answerItem: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  correctAnswer: {
    backgroundColor: "#E8F5E8",
    borderColor: "#4CAF50",
  },
  incorrectAnswer: {
    backgroundColor: "#FFEBEE",
    borderColor: "#F44336",
  },
  questionNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  answerText: {
    fontSize: 14,
    color: "#666",
    flex: 1,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    padding: 20,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    borderRadius: 8,
    gap: 8,
  },
  scanAnotherButton: {
    backgroundColor: "#007AFF",
  },
  doneButton: {
    backgroundColor: "#4CAF50",
  },
  actionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
