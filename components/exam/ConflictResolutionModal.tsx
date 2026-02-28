import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { COLORS, RADIUS } from "../../constants/theme";
import { ConflictInfo } from "../../services/syncService";

interface ConflictResolutionModalProps {
  visible: boolean;
  conflicts: ConflictInfo[];
  onResolve: (
    conflictId: string,
    resolution: "use-local" | "use-server" | "merge",
  ) => void;
  onClose: () => void;
}

export default function ConflictResolutionModal({
  visible,
  conflicts,
  onResolve,
  onClose,
}: ConflictResolutionModalProps) {
  const [selectedConflict, setSelectedConflict] = useState(0);

  if (conflicts.length === 0) return null;

  const currentConflict = conflicts[selectedConflict];

  const handleResolve = (resolution: "use-local" | "use-server" | "merge") => {
    onResolve(currentConflict.examId, resolution);

    // Move to next conflict or close
    if (selectedConflict < conflicts.length - 1) {
      setSelectedConflict(selectedConflict + 1);
    } else {
      setSelectedConflict(0);
      onClose();
    }
  };

  const formatDate = (date: any) => {
    if (!date) return "Unknown";
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="git-merge" size={32} color="#FF3B30" />
            </View>
            <Text style={styles.title}>Sync Conflict Detected</Text>
            <Text style={styles.subtitle}>
              Changes were made both online and offline
            </Text>
          </View>

          {/* Progress */}
          {conflicts.length > 1 && (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>
                Conflict {selectedConflict + 1} of {conflicts.length}
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${((selectedConflict + 1) / conflicts.length) * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Conflict Details */}
          <ScrollView style={styles.content}>
            <View style={styles.conflictInfo}>
              <Text style={styles.examTitle}>
                {currentConflict.localData?.title || "Exam"}
              </Text>
              <Text style={styles.versionInfo}>
                Version conflict: Local v{currentConflict.localVersion} vs
                Server v{currentConflict.serverVersion}
              </Text>
            </View>

            {/* Local Version */}
            <View style={styles.versionCard}>
              <View style={styles.versionHeader}>
                <Ionicons name="phone-portrait" size={20} color="#007AFF" />
                <Text style={styles.versionTitle}>Your Changes (Local)</Text>
                <View
                  style={[styles.versionBadge, { backgroundColor: "#007AFF" }]}
                >
                  <Text style={styles.versionBadgeText}>
                    v{currentConflict.localVersion}
                  </Text>
                </View>
              </View>
              <View style={styles.versionDetails}>
                <Text style={styles.detailLabel}>Last modified:</Text>
                <Text style={styles.detailValue}>
                  {formatDate(currentConflict.localData?.updatedAt)}
                </Text>
                {currentConflict.localData?.description && (
                  <>
                    <Text style={styles.detailLabel}>Description:</Text>
                    <Text style={styles.detailValue}>
                      {currentConflict.localData.description}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* Server Version */}
            <View style={styles.versionCard}>
              <View style={styles.versionHeader}>
                <Ionicons name="cloud" size={20} color="#00a550" />
                <Text style={styles.versionTitle}>Server Version</Text>
                <View
                  style={[styles.versionBadge, { backgroundColor: "#00a550" }]}
                >
                  <Text style={styles.versionBadgeText}>
                    v{currentConflict.serverVersion}
                  </Text>
                </View>
              </View>
              <View style={styles.versionDetails}>
                <Text style={styles.detailLabel}>Last modified:</Text>
                <Text style={styles.detailValue}>
                  {formatDate(currentConflict.serverData?.updatedAt)}
                </Text>
                {currentConflict.serverData?.description && (
                  <>
                    <Text style={styles.detailLabel}>Description:</Text>
                    <Text style={styles.detailValue}>
                      {currentConflict.serverData.description}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* Warning */}
            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color="#FF9500" />
              <Text style={styles.warningText}>
                Choose which version to keep. This action cannot be undone.
              </Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.localButton]}
              onPress={() => handleResolve("use-local")}
            >
              <Ionicons name="phone-portrait" size={20} color={COLORS.white} />
              <Text style={styles.buttonText}>Use My Changes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.serverButton]}
              onPress={() => handleResolve("use-server")}
            >
              <Ionicons name="cloud" size={20} color={COLORS.white} />
              <Text style={styles.buttonText}>Use Server Version</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.mergeButton]}
              onPress={() => handleResolve("merge")}
            >
              <Ionicons name="git-merge" size={20} color={COLORS.white} />
              <Text style={styles.buttonText}>Merge Both</Text>
            </TouchableOpacity>
          </View>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Resolve Later</Text>
          </TouchableOpacity>
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
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMid,
    textAlign: "center",
  },
  progressContainer: {
    padding: 16,
    backgroundColor: "#f9f9f9",
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textMid,
    marginBottom: 8,
    textAlign: "center",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#007AFF",
    borderRadius: 2,
  },
  content: {
    padding: 20,
  },
  conflictInfo: {
    marginBottom: 20,
  },
  examTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textDark,
    marginBottom: 4,
  },
  versionInfo: {
    fontSize: 13,
    color: COLORS.textMid,
  },
  versionCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  versionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  versionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textDark,
    flex: 1,
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  versionBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.white,
  },
  versionDetails: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textMid,
    marginTop: 8,
  },
  detailValue: {
    fontSize: 13,
    color: COLORS.textDark,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fffbeb",
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 8,
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
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    gap: 8,
  },
  localButton: {
    backgroundColor: "#007AFF",
  },
  serverButton: {
    backgroundColor: "#00a550",
  },
  mergeButton: {
    backgroundColor: "#FF9500",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.white,
  },
  cancelButton: {
    padding: 16,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMid,
  },
});
