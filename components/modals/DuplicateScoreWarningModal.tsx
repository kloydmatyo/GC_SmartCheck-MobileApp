import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { DuplicateScoreMatch } from "../../services/duplicateScoreDetectionService";
import { GradingResult } from "../../types/scanning";

interface DuplicateScoreWarningModalProps {
  visible: boolean;
  match: DuplicateScoreMatch;
  newResult: GradingResult;
  onKeepNew: () => void;
  onKeepExisting: () => void;
  onCancel: () => void;
}

export function DuplicateScoreWarningModal({
  visible,
  match,
  newResult,
  onKeepNew,
  onKeepExisting,
  onCancel,
}: DuplicateScoreWarningModalProps) {
  const { existingResult, similarity, matchType, matchedFields } = match;

  const getMatchTypeColor = () => {
    switch (matchType) {
      case "exact":
        return "#f44336";
      case "high":
        return "#ff9800";
      case "moderate":
        return "#ffc107";
      default:
        return "#666";
    }
  };

  const getMatchTypeIcon = () => {
    switch (matchType) {
      case "exact":
        return "alert-circle";
      case "high":
        return "warning";
      case "moderate":
        return "information-circle";
      default:
        return "help-circle";
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView>
            {/* Header */}
            <View style={styles.header}>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: getMatchTypeColor() + "20" },
                ]}
              >
                <Ionicons
                  name={getMatchTypeIcon() as any}
                  size={40}
                  color={getMatchTypeColor()}
                />
              </View>
              <Text style={styles.title}>Potential Duplicate Detected</Text>
              <Text style={styles.subtitle}>
                This scan appears to be similar to a previous scan
              </Text>
            </View>

            {/* Similarity Info */}
            <View style={styles.similarityCard}>
              <Text style={styles.similarityLabel}>Similarity Score</Text>
              <View style={styles.similarityBar}>
                <View
                  style={[
                    styles.similarityFill,
                    {
                      width: `${similarity * 100}%`,
                      backgroundColor: getMatchTypeColor(),
                    },
                  ]}
                />
              </View>
              <Text style={styles.similarityText}>
                {Math.round(similarity * 100)}% match
              </Text>
            </View>

            {/* Matched Fields */}
            <View style={styles.matchedFieldsCard}>
              <Text style={styles.sectionTitle}>Matched Fields</Text>
              {matchedFields.map((field, index) => (
                <View key={index} style={styles.matchedField}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <Text style={styles.matchedFieldText}>{field}</Text>
                </View>
              ))}
            </View>

            {/* Comparison */}
            <View style={styles.comparisonCard}>
              <Text style={styles.sectionTitle}>Comparison</Text>

              {/* Existing Result */}
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>Existing Scan</Text>
                <View style={styles.resultDetails}>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultKey}>Student ID:</Text>
                    <Text style={styles.resultValue}>
                      {existingResult.studentId}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultKey}>Score:</Text>
                    <Text style={styles.resultValue}>
                      {existingResult.score}/{existingResult.totalPoints} (
                      {existingResult.letterGrade})
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultKey}>Time:</Text>
                    <Text style={styles.resultValue}>
                      {new Date(existingResult.timestamp).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultKey}>Confidence:</Text>
                    <Text style={styles.resultValue}>
                      {Math.round(existingResult.confidence * 100)}%
                    </Text>
                  </View>
                </View>
              </View>

              {/* New Result */}
              <View style={[styles.resultCard, styles.newResultCard]}>
                <Text style={styles.resultLabel}>New Scan</Text>
                <View style={styles.resultDetails}>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultKey}>Student ID:</Text>
                    <Text style={styles.resultValue}>
                      {newResult.studentId}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultKey}>Score:</Text>
                    <Text style={styles.resultValue}>
                      {newResult.score}/{newResult.totalPoints} (
                      {newResult.letterGrade})
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultKey}>Time:</Text>
                    <Text style={styles.resultValue}>
                      {new Date(newResult.timestamp).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultKey}>Confidence:</Text>
                    <Text style={styles.resultValue}>
                      {Math.round(newResult.confidence * 100)}%
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Warning Message */}
            {matchType === "exact" && (
              <View style={styles.warningCard}>
                <Ionicons name="warning" size={20} color="#f44336" />
                <Text style={styles.warningText}>
                  This appears to be an exact duplicate. Saving it may create
                  duplicate records.
                </Text>
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.keepExistingButton}
                onPress={onKeepExisting}
              >
                <Text style={styles.keepExistingButtonText}>Keep Existing</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.keepNewButton}
                onPress={onKeepNew}
              >
                <Text style={styles.keepNewButtonText}>Save New</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modal: {
    backgroundColor: "white",
    borderRadius: 16,
    maxHeight: "90%",
    width: "100%",
    maxWidth: 500,
  },
  header: {
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  similarityCard: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  similarityLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  similarityBar: {
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  similarityFill: {
    height: "100%",
    borderRadius: 4,
  },
  similarityText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  matchedFieldsCard: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  matchedField: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  matchedFieldText: {
    fontSize: 14,
    color: "#333",
  },
  comparisonCard: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  resultCard: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  newResultCard: {
    backgroundColor: "#e3f2fd",
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 12,
  },
  resultDetails: {
    gap: 8,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultKey: {
    fontSize: 14,
    color: "#666",
  },
  resultValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffebee",
    padding: 16,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 8,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: "#c62828",
  },
  actions: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  keepExistingButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  keepExistingButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  keepNewButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  keepNewButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
  },
});
