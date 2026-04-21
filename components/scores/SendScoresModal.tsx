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

    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => toggleOne(student.student_id)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>
            {student.first_name} {student.last_name}
          </Text>
          <Text style={styles.rowId}>{student.student_id}</Text>
          {!student.email && (
            <Text style={styles.noEmail}>No email on file</Text>
          )}
        </View>
        <View style={styles.rowScore}>
          <Text style={styles.scoreText}>
            {result.score}/{result.totalQuestions}
          </Text>
          <Text
            style={[styles.pctText, { color: passing ? "#00a550" : "#e74c3c" }]}
          >
            {result.percentage}%
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#24362f" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Scores</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#00a550" />
            <Text style={styles.loadingText}>Loading results...</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>
              No results found for this exam.
            </Text>
          </View>
        ) : confirming ? (
          // ── Confirmation screen ──────────────────────────────────────
          <View style={styles.confirmContainer}>
            <Ionicons name="mail-outline" size={52} color="#00a550" />
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
                onPress={() => { console.log("[SendScores] Send button pressed"); handleSend(); }}
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
                {allSelected ? "Deselect All" : "Select All"} ({entries.length})
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
              <Text style={styles.footerCount}>{selected.size} selected</Text>
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  selected.size === 0 && styles.sendBtnDisabled,
                ]}
                disabled={selected.size === 0}
                onPress={() => setConfirming(true)}
              >
                <Ionicons name="mail-outline" size={16} color="#fff" />
                <Text style={styles.sendBtnText}>Send Scores</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  closeBtn: { padding: 4, width: 36 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#24362f",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#888" },
  emptyText: { fontSize: 14, color: "#aaa", textAlign: "center" },

  // Select All bar
  selectAllBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#ebebeb",
  },
  selectAllText: { fontSize: 14, fontWeight: "600", color: "#24362f" },

  // List
  list: { paddingVertical: 8, paddingHorizontal: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "#e8e8e8",
  },
  rowSelected: {
    borderColor: "#00a550",
    backgroundColor: "#f0faf4",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#c0c0c0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxActive: {
    backgroundColor: "#00a550",
    borderColor: "#00a550",
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: "600", color: "#222" },
  rowId: { fontSize: 12, color: "#888", marginTop: 1 },
  noEmail: { fontSize: 11, color: "#e67e22", marginTop: 2 },
  rowScore: { alignItems: "flex-end" },
  scoreText: { fontSize: 13, fontWeight: "600", color: "#333" },
  pctText: { fontSize: 12, fontWeight: "700", marginTop: 2 },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  footerCount: { fontSize: 14, color: "#555", fontWeight: "600" },

  // Buttons
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#00a550",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendBtnDisabled: { backgroundColor: "#b0d9c0" },
  sendBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#c0c0c0",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: "#555" },

  // Confirmation
  confirmContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  confirmTitle: { fontSize: 22, fontWeight: "700", color: "#24362f" },
  confirmBody: { fontSize: 16, color: "#444", textAlign: "center" },
  confirmCount: { fontWeight: "700", color: "#00a550" },
  confirmWarning: {
    fontSize: 13,
    color: "#e67e22",
    textAlign: "center",
    backgroundColor: "#fff8f0",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f0d0a0",
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
});
