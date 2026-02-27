import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, RADIUS } from "../../constants/theme";
import { BatchHistoryService } from "../../services/batchHistoryService";
import { ExamBatch } from "../../types/batch";

interface DuplicateBatchWarningModalProps {
  visible: boolean;
  existingBatch: ExamBatch | null;
  onCancel: () => void;
  onProceed: () => void;
}

export default function DuplicateBatchWarningModal({
  visible,
  existingBatch,
  onCancel,
  onProceed,
}: DuplicateBatchWarningModalProps) {
  if (!existingBatch) return null;

  const minutesAgo = Math.round(
    (Date.now() - existingBatch.createdAt.getTime()) / 60000,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.iconContainer}>
            <Ionicons name="warning" size={48} color="#FF9500" />
          </View>

          <Text style={styles.title}>Duplicate Batch Detected</Text>

          <Text style={styles.message}>
            You generated a similar batch {minutesAgo} minute
            {minutesAgo !== 1 ? "s" : ""} ago. Are you sure you want to create
            another one?
          </Text>

          <View style={styles.batchInfo}>
            <View style={styles.infoRow}>
              <Ionicons name="barcode" size={16} color="#666" />
              <Text style={styles.infoText}>
                Batch ID: {existingBatch.batchId}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="document" size={16} color="#666" />
              <Text style={styles.infoText}>
                Exam: {existingBatch.examTitle}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="copy" size={16} color="#666" />
              <Text style={styles.infoText}>
                Sheets: {existingBatch.sheetsGenerated}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="time" size={16} color="#666" />
              <Text style={styles.infoText}>
                {BatchHistoryService.formatDate(existingBatch.createdAt)}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.proceedButton]}
              onPress={onProceed}
            >
              <Text style={styles.proceedButtonText}>Generate Anyway</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.large,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textDark,
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: COLORS.textMid,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  batchInfo: {
    backgroundColor: "#f9f9f9",
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#666",
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  proceedButton: {
    backgroundColor: "#FF9500",
  },
  proceedButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.white,
  },
});
