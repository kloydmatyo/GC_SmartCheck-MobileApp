/**
 * SendScoresModal
 * Lets instructors select students and send their scores via native mail composer.
 */

import {
  ScoreEmailService,
  StudentScoreEntry,
} from "@/services/scoreEmailService";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

interface Props {
  visible: boolean;
  onClose: () => void;
  examId: string;
  examLabel: string;
}

export default function SendScoresModal({
  visible,
  onClose,
  examId,
  examLabel,
}: Props) {
  const [entries, setEntries] = useState<StudentScoreEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Load students + scores when modal opens
  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setConfirming(false);
    setLoading(true);
    ScoreEmailService.getStudentsWithScores(examId)
      .then((data) => setEntries(data))
      .catch(() =>
        Toast.show({
          type: "error",
          text1: "Failed to load scores",
          visibilityTime: 3000,
        }),
      )
      .finally(() => setLoading(false));
  }, [visible, examId]);

  const allSelected = entries.length > 0 && selected.size === entries.length;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.student.student_id)));
    }
  }, [allSelected, entries]);

  const toggleOne = useCallback((studentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });
  }, []);

  const handleSend = useCallback(async () => {
    console.log("[SendScores] handleSend triggered, selected:", selected.size);
    const toSend = entries.filter((e) => selected.has(e.student.student_id));
    console.log("[SendScores] toSend count:", toSend.length);
    setSending(true);
    setConfirming(false);
    const result = await ScoreEmailService.sendScores(toSend, examLabel, {
      className: examLabel,
      passingThreshold: 60,
    });
    console.log("[SendScores] result:", JSON.stringify(result));
    setSending(false);

    if (result.status === "sent" || result.status === "partial") {
      Toast.show({
        type: "success",
        text1: "Scores Sent",
        text2: result.message,
        visibilityTime: 3500,
      });
      onClose();
    } else {
      Toast.show({
        type: "error",
        text1: "Could Not Send",
        text2: result.message,
        visibilityTime: 4000,
      });
    }
  }, [entries, selected, examLabel, onClose]);

  const selectedEntries = entries.filter((e) =>
    selected.has(e.student.student_id),
  );
  const missingEmail = selectedEntries.filter((e) => !e.student.email).length;

  const renderItem = ({ item }: { item: StudentScoreEntry }) => {
    const { student, result } = item;
    const isSelected = selected.has(student.student_id);
    const passing = result.percentage >= 60;
    const tone = passing
      ? { badge: "#D8F3E7", text: "#20A86B" }
      : result.percentage >= 70
        ? { badge: "#F5E8B8", text: "#D68B11" }
        : { badge: "#F9D7D9", text: "#E24E5C" };

    const name =
      student.first_name || student.last_name
        ? `${student.first_name} ${student.last_name}`.trim()
        : student.student_id;

    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => toggleOne(student.student_id)}
        activeOpacity={0.75}
      >
        {/* Score circle with checkbox overlay */}
        <View style={styles.circleWrap}>
          <View style={[styles.scoreCircle, { backgroundColor: tone.badge }]}>
            <Text style={[styles.scoreCircleText, { color: tone.text }]}>
              {result.percentage}%
            </Text>
          </View>
          <View
            style={[
              styles.checkOverlay,
              isSelected && styles.checkOverlayActive,
            ]}
          >
            {isSelected && <Ionicons name="checkmark" size={11} color="#fff" />}
          </View>
        </View>

        {/* Body */}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{name}</Text>
          <Text style={styles.rowId}>{student.student_id}</Text>
          <View style={styles.rowFooter}>
            <Text style={styles.scoreCorrect}>
              {result.score}/{result.totalQuestions} correct
            </Text>
            {!student.email && <Text style={styles.noEmail}>No email</Text>}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Send Scores</Text>
              <View style={{ width: 36 }} />
            </View>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#00a550" />
              <Text style={styles.loadingText}>Loading results...</Text>
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color="#C7CDD6" />
              <Text style={styles.emptyText}>
                No results found for this exam.
              </Text>
            </View>
          ) : confirming ? (
            // ── Confirmation screen ──────────────────────────────────────
            <View style={styles.confirmContainer}>
              <Ionicons name="mail-outline" size={52} color="#20BE7B" />
              <Text style={styles.confirmTitle}>Ready to Send</Text>
              <Text style={styles.confirmBody}>
                Sending scores to{" "}
                <Text style={styles.confirmCount}>
                  {selectedEntries.length - missingEmail}
                </Text>{" "}
                student{selectedEntries.length - missingEmail !== 1 ? "s" : ""}.
              </Text>
              {missingEmail > 0 && (
                <Text style={styles.confirmWarning}>
                  {missingEmail} student{missingEmail !== 1 ? "s" : ""} will be
                  skipped (no email on file).
                </Text>
              )}
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setConfirming(false)}
                >
                  <Text style={styles.cancelBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={() => {
                    console.log("[SendScores] Send button pressed");
                    handleSend();
                  }}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={styles.sendBtnText}>Send</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // ── Selection screen ─────────────────────────────────────────
            <>
              {/* Select All bar */}
              <TouchableOpacity
                style={styles.selectAllBar}
                onPress={toggleSelectAll}
              >
                <View
                  style={[
                    styles.checkbox,
                    allSelected && styles.checkboxActive,
                    { marginRight: 10 },
                  ]}
                >
                  {allSelected && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
                <Text style={styles.selectAllText}>
                  {allSelected ? "Deselect All" : "Select All"} (
                  {entries.length})
                </Text>
              </TouchableOpacity>

              <FlatList
                data={entries}
                keyExtractor={(item) => item.student.student_id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
              />

              {/* Footer */}
              <View style={styles.footer}>
                <View style={styles.footerLeft}>
                  <Text style={styles.footerCount}>{selected.size}</Text>
                  <Text style={styles.footerLabel}>selected</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    selected.size === 0 && styles.sendBtnDisabled,
                  ]}
                  disabled={selected.size === 0}
                  onPress={() => setConfirming(true)}
                >
                  <Ionicons name="mail-outline" size={18} color="#fff" />
                  <Text style={styles.sendBtnText}>Send Scores</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    height: "85%",
    backgroundColor: "#F7F7F8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  container: { flex: 1, backgroundColor: "#F7F7F8" },
  header: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF2",
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 13, color: "#8E97A6" },
  emptyText: { fontSize: 13, color: "#8E97A6", textAlign: "center" },

  // Select All bar
  selectAllBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF2",
  },
  selectAllText: { fontSize: 13, fontWeight: "700", color: "#1F2937" },

  // List
  list: { paddingVertical: 12, paddingHorizontal: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E8EBF0",
  },
  rowSelected: {
    borderColor: "#20BE7B",
    backgroundColor: "#F0FBF6",
  },
  // Score circle
  circleWrap: {
    position: "relative",
    marginRight: 12,
  },
  scoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCircleText: {
    fontSize: 13,
    fontWeight: "800",
  },
  checkOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOverlayActive: {
    backgroundColor: "#20BE7B",
    borderColor: "#20BE7B",
  },
  // Legacy checkbox (used in select-all bar only)
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxActive: {
    backgroundColor: "#20BE7B",
    borderColor: "#20BE7B",
  },
  rowInfo: { flex: 1 },
  rowName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  rowId: { fontSize: 12, color: "#8E97A6" },
  rowFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  scoreCorrect: { fontSize: 11, color: "#19B97C", fontWeight: "700" },
  noEmail: { fontSize: 11, color: "#F59E0B", fontWeight: "600" },
  // Legacy (unused but kept to avoid ref errors)
  rowScore: { alignItems: "flex-end" },
  scoreText: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  pctText: { fontSize: 12, fontWeight: "800", marginTop: 2 },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 32,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#ECEEF2",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 14,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  footerCount: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1F2937",
  },
  footerLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E97A6",
  },

  // Buttons
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#20BE7B",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
  },
  sendBtnDisabled: { backgroundColor: "#A8E6CC" },
  sendBtnText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E6EC",
    backgroundColor: "#FFFFFF",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: "#6B7280" },

  // Confirmation
  confirmContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  confirmTitle: { fontSize: 22, fontWeight: "800", color: "#1F2937" },
  confirmBody: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  confirmCount: { fontWeight: "800", color: "#20BE7B" },
  confirmWarning: {
    fontSize: 13,
    color: "#D97706",
    textAlign: "center",
    backgroundColor: "#FFFBEB",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    lineHeight: 18,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
});
