import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, RADIUS } from "../../constants/theme";

interface VersionMismatchWarningModalProps {
  visible: boolean;
  currentVersion: number;
  batchVersion: number;
  message: string;
  onClose: () => void;
  onProceed: () => void;
}

export default function VersionMismatchWarningModal({
  visible,
  currentVersion,
  batchVersion,
  message,
  onClose,
  onProceed,
}: VersionMismatchWarningModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.iconContainer}>
            <Ionicons name="alert-circle" size={48} color="#FF3B30" />
          </View>

          <Text style={styles.title}>Version Mismatch Warning</Text>

          <Text style={styles.message}>{message}</Text>

          <View style={styles.versionComparison}>
            <View style={styles.versionBox}>
              <Text style={styles.versionLabel}>Last Batch</Text>
              <Text style={styles.versionNumber}>v{batchVersion}</Text>
            </View>

            <Ionicons name="arrow-forward" size={24} color="#666" />

            <View style={[styles.versionBox, styles.currentVersionBox]}>
              <Text style={styles.versionLabel}>Current</Text>
              <Text style={[styles.versionNumber, styles.currentVersionNumber]}>
                v{currentVersion}
              </Text>
            </View>
          </View>

          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={20} color="#FF9500" />
            <Text style={styles.warningText}>
              Generating with a different template version may cause
              inconsistencies in scanning and grading.
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.proceedButton]}
              onPress={onProceed}
            >
              <Text style={styles.proceedButtonText}>Proceed Anyway</Text>
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
  versionComparison: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 20,
  },
  versionBox: {
    backgroundColor: "#f9f9f9",
    borderRadius: RADIUS.md,
    padding: 16,
    alignItems: "center",
    minWidth: 100,
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  currentVersionBox: {
    backgroundColor: "#fff4f3",
    borderColor: "#FF3B30",
  },
  versionLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
    fontWeight: "600",
  },
  versionNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  currentVersionNumber: {
    color: "#FF3B30",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fffbeb",
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ffd5a3",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#8B5A00",
    lineHeight: 18,
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
    backgroundColor: "#FF3B30",
  },
  proceedButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.white,
  },
});
