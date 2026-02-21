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
import { GradingResultExtended } from "../../types/student";
import { StudentValidationResult } from "../student/StudentValidationResult";

interface ScanResultsProps {
  result: GradingResultExtended;
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

  // REQ 14, 15: Handle NULL grades
  const isNullGrade = result.score === null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan Results</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* REQ 7: Validation Status Display */}
        {isNullGrade && (
          <View style={styles.validationCard}>
            <Ionicons name="alert-circle" size={48} color="#e74c3c" />
            <Text style={styles.nullGradeTitle}>Invalid Student ID</Text>
            <Text style={styles.nullGradeMessage}>
              {result.gradeStatus === 'NULL_INVALID_ID' && 'Student ID not found in database'}
              {result.gradeStatus === 'NULL_INACTIVE' && 'Student account is inactive'}
              {result.gradeStatus === 'NULL_NOT_IN_SECTION' && 'Student not enrolled in this section'}
            </Text>
            <Text style={styles.nullGradeNote}>
              This entry has been flagged for instructor review.
            </Text>
          </View>
        )}

        {/* Student Info */}
        <View style={styles.studentCard}>
          <Text style={styles.studentId}>Student ID: {result.studentId}</Text>
          
          {!isNullGrade ? (
            <>
              <View style={styles.scoreContainer}>
                <Text
                  style={[
                    styles.scoreText,
                    { color: getScoreColor(result.percentage!) },
                  ]}
                >
                  {result.score}/{result.totalPoints}
                </Text>
                <Text
                  style={[
                    styles.percentageText,
                    { color: getScoreColor(result.percentage!) },
                  ]}
                >
                  {result.percentage}%
                </Text>
                <Text
                  style={[
                    styles.gradeText,
                    { color: getScoreColor(result.percentage!) },
                  ]}
                >
                  {getGradeLetter(result.percentage!)}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.nullScoreContainer}>
              <Text style={styles.nullScoreText}>NULL</Text>
              <Text style={styles.nullScoreLabel}>Grade Not Assigned</Text>
            </View>
          )}
        </View>

        {/* Answer Details - Only show for valid grades */}
        {!isNullGrade && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Answer Details</Text>
            <Text style={styles.detailsNote}>
              Showing scanned answers (grading was prevented due to validation)
            </Text>
          </View>
        )}

        {/* Metadata */}
        <View style={styles.metadataCard}>
          <Text style={styles.metadataTitle}>Grading Information</Text>
          <Text style={styles.metadataText}>Status: {result.gradeStatus}</Text>
          <Text style={styles.metadataText}>Validation: {result.validationStatus}</Text>
          <Text style={styles.metadataText}>Graded At: {new Date(result.gradedAt).toLocaleString()}</Text>
          {result.reasonCode && (
            <Text style={styles.metadataText}>Reason: {result.reasonCode}</Text>
          )}
          {result.reviewRequired && (
            <View style={styles.reviewBadge}>
              <Ionicons name="flag" size={16} color="#ff9800" />
              <Text style={styles.reviewText}>Requires Review</Text>
            </View>
          )}
        </View>

        {/* Legacy Answer Details Grid (hidden for NULL grades) */}
        {false && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Answer Details</Text>
            <View style={styles.detailsGrid}>
              {/* Placeholder - details not available in GradingResultExtended */}
            </View>
          </View>
        )}

        <View style={{display: 'none'}}>
          <View style={styles.detailsGrid}>
            {[].map((detail: any, index: number) => (
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
  // NULL grade styles
  validationCard: {
    backgroundColor: "#fff3e0",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ff9800",
  },
  nullGradeTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#e74c3c",
    marginTop: 10,
    marginBottom: 8,
  },
  nullGradeMessage: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 12,
  },
  nullGradeNote: {
    fontSize: 14,
    color: "#ff9800",
    textAlign: "center",
    fontStyle: "italic",
  },
  nullScoreContainer: {
    alignItems: "center",
    padding: 20,
  },
  nullScoreText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#e74c3c",
  },
  nullScoreLabel: {
    fontSize: 16,
    color: "#666",
    marginTop: 8,
  },
  metadataCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metadataTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  metadataText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 6,
  },
  reviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff3e0",
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  reviewText: {
    fontSize: 14,
    color: "#ff9800",
    fontWeight: "600",
  },
  detailsNote: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
    marginTop: 8,
  },
});
