import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Toast from "react-native-toast-message";
import { ExamService } from "../../services/examService";

interface StatusManagerProps {
  examId: string;
  currentStatus: "Draft" | "Scheduled" | "Active" | "Completed";
  onStatusChanged: () => void;
}

export default function StatusManager({
  examId,
  currentStatus,
  onStatusChanged,
}: StatusManagerProps) {
  const [loading, setLoading] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Force close date picker before unmounting
      if (showDatePicker) {
        setShowDatePicker(false);
      }
    };
  }, [showDatePicker]);

  const availableTransitions =
    ExamService.getAvailableStatusTransitions(currentStatus);

  const handleStatusChange = async (
    newStatus: "Draft" | "Scheduled" | "Active" | "Completed",
  ) => {
    if (newStatus === "Scheduled") {
      setShowScheduleModal(true);
      return;
    }

    // Show confirmation for other status changes
    const statusLabels = {
      Draft: "Draft",
      Active: "Active",
      Completed: "Completed",
    };

    Alert.alert(
      "Confirm Status Change",
      `Are you sure you want to change the exam status to ${statusLabels[newStatus]}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => updateStatus(newStatus) },
      ],
    );
  };

  const updateStatus = async (
    newStatus: "Draft" | "Scheduled" | "Active" | "Completed",
    scheduleDate?: Date,
  ) => {
    try {
      setLoading(true);

      await ExamService.updateExamStatus(examId, newStatus, scheduleDate);

      if (isMountedRef.current) {
        Toast.show({
          type: "success",
          text1: "Status Updated",
          text2: `Exam status changed to ${newStatus}`,
        });

        onStatusChanged();
      }
    } catch (error: any) {
      console.error("Error updating status:", error);
      if (isMountedRef.current) {
        Toast.show({
          type: "error",
          text1: "Update Failed",
          text2: error.message || "Failed to update exam status",
        });
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleScheduleConfirm = () => {
    // Close everything first
    setShowDatePicker(false);
    setTimeout(() => {
      if (isMountedRef.current) {
        setShowScheduleModal(false);
        updateStatus("Scheduled", scheduleDate);
      }
    }, 100);
  };

  const handleModalClose = () => {
    setShowDatePicker(false);
    setTimeout(() => {
      if (isMountedRef.current) {
        setShowScheduleModal(false);
      }
    }, 100);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    // Immediately close the picker to prevent crashes
    setShowDatePicker(false);

    if (event.type === "dismissed" || !selectedDate) {
      return;
    }

    if (isMountedRef.current && selectedDate) {
      setScheduleDate(selectedDate);
    }
  };

  const openDatePicker = () => {
    if (isMountedRef.current) {
      setShowDatePicker(true);
    }
  };

  if (availableTransitions.length === 0) {
    return null; // No status changes available
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Status Actions</Text>
      <View style={styles.buttonContainer}>
        {availableTransitions.map((transition) => (
          <TouchableOpacity
            key={transition.status}
            style={[
              styles.statusButton,
              { backgroundColor: transition.color },
              loading && styles.statusButtonDisabled,
            ]}
            onPress={() => handleStatusChange(transition.status as any)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name={getStatusIcon(transition.status)}
                  size={18}
                  color="#fff"
                />
                <Text style={styles.statusButtonText}>{transition.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Schedule Modal */}
      <Modal
        visible={showScheduleModal}
        transparent
        animationType="fade"
        onRequestClose={handleModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="calendar-outline" size={48} color="#ff9800" />
            <Text style={styles.modalTitle}>Schedule Exam</Text>
            <Text style={styles.modalMessage}>
              Select the date and time when this exam should become active.
            </Text>

            <TouchableOpacity
              style={styles.dateButton}
              onPress={openDatePicker}
            >
              <Ionicons name="calendar-outline" size={20} color="#3d5a3d" />
              <Text style={styles.dateButtonText}>
                {scheduleDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={handleModalClose}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleScheduleConfirm}
              >
                <Text style={styles.modalConfirmText}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Separate DateTimePicker - only render when needed */}
      {showDatePicker && isMountedRef.current && (
        <DateTimePicker
          value={scheduleDate}
          mode="datetime"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}
    </View>
  );
}

const getStatusIcon = (status: string): any => {
  switch (status) {
    case "Scheduled":
      return "time-outline";
    case "Active":
      return "play-circle-outline";
    case "Completed":
      return "checkmark-circle-outline";
    case "Draft":
      return "document-outline";
    default:
      return "ellipse-outline";
  }
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f3f7f4",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#cad9cf",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2b4337",
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  statusButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    minWidth: 120,
    justifyContent: "center",
  },
  statusButtonDisabled: {
    opacity: 0.6,
  },
  statusButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    maxWidth: 400,
    width: "100%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2b4337",
    marginTop: 16,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: "#4f6b5a",
    textAlign: "center",
    marginBottom: 24,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f7f4",
    borderWidth: 1,
    borderColor: "#cad9cf",
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 24,
    width: "100%",
  },
  dateButtonText: {
    fontSize: 14,
    color: "#2b4337",
    flex: 1,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cad9cf",
  },
  modalCancelText: {
    color: "#3d5a3d",
    fontSize: 15,
    fontWeight: "600",
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: "#ff9800",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  modalConfirmText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
