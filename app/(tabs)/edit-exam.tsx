import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Toast from "react-native-toast-message";
import { auth, db } from "../../config/firebase";
import { DARK_MODE_STORAGE_KEY } from "../../constants/preferences";
import { AuditLogService } from "../../services/auditLogService";
import { ExamService } from "../../services/examService";
import { ExamMetadata } from "../../types/exam";

export default function EditExamScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const examId = params.examId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalMetadata, setOriginalMetadata] = useState<ExamMetadata | null>(
    null,
  );

  // Real-time conflict detection
  const [remoteVersion, setRemoteVersion] = useState<number>(1);
  const [conflictDetected, setConflictDetected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isInitialLoadRef = useRef(true);

  // Editable fields
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [section, setSection] = useState("");
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Non-editable fields (for display)
  const [examCode, setExamCode] = useState("");
  const [status, setStatus] = useState<
    "Draft" | "Scheduled" | "Active" | "Completed"
  >("Draft");
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [version, setVersion] = useState(1);

  // Validation errors
  const [titleError, setTitleError] = useState("");
  const [dateError, setDateError] = useState("");

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [headerTopPadding, setHeaderTopPadding] = useState(56);

  useEffect(() => {
    const top =
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 16 : 56;
    setHeaderTopPadding(top);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const savedDarkMode = await AsyncStorage.getItem(
            DARK_MODE_STORAGE_KEY,
          );
          setDarkModeEnabled(savedDarkMode === "true");
        } catch (error) {
          console.warn("Failed to load dark mode preference:", error);
        }
      })();
    }, []),
  );

  const colors = darkModeEnabled
    ? {
        bg: "#111815",
        headerBg: "#1a2520",
        cardBg: "#1f2b26",
        border: "#34483f",
        title: "#e7f1eb",
      }
    : {
        bg: "#edf3ee",
        headerBg: "#3d5a3d",
        cardBg: "#f3f7f4",
        border: "#cad9cf",
        title: "#eef7f0",
      };

  useEffect(() => {
    loadExamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // Real-time listener for concurrent edit detection
  useEffect(() => {
    if (!examId) return;

    const examRef = doc(db, "exams", examId);

    const unsubscribe = onSnapshot(
      examRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const currentRemoteVersion = data.version || 1;

        // Skip initial load
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          setRemoteVersion(currentRemoteVersion);
          return;
        }

        // Check if version changed (someone else edited)
        if (currentRemoteVersion > remoteVersion && !saving) {
          setRemoteVersion(currentRemoteVersion);
          setConflictDetected(true);

          Toast.show({
            type: "warning",
            text1: "Exam Updated",
            text2: "This exam was modified by another user",
            visibilityTime: 5000,
          });
        }
      },
      (error) => {
        console.error("Error listening to exam changes:", error);
      },
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [examId, remoteVersion, saving]);

  useEffect(() => {
    checkForChanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subject, section, scheduleDate]);

  const loadExamData = async () => {
    try {
      setLoading(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        Toast.show({
          type: "error",
          text1: "Authentication Error",
          text2: "You must be logged in to edit exams.",
        });
        router.back();
        return;
      }

      // Check authorization
      const authorized = await ExamService.isAuthorized(
        currentUser.uid,
        examId,
      );
      if (!authorized) {
        Toast.show({
          type: "error",
          text1: "Access Denied",
          text2: "You are not authorized to edit this exam.",
        });
        router.back();
        return;
      }

      const examData = await ExamService.getExamById(examId);
      if (!examData) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Exam not found.",
        });
        router.back();
        return;
      }

      // Check if exam is in Draft status
      if (examData.metadata.status !== "Draft") {
        Alert.alert(
          "Edit Restricted",
          `Cannot edit exam. Exam status is "${examData.metadata.status}". Only Draft exams can be edited.`,
          [{ text: "OK", onPress: () => router.back() }],
        );
        return;
      }

      // Check if there's an active scan session
      const hasActiveScan = await ExamService.hasActiveScanSession(examId);
      if (hasActiveScan) {
        Alert.alert(
          "Edit Restricted",
          "Cannot edit exam. There is an active scan session for this exam.",
          [{ text: "OK", onPress: () => router.back() }],
        );
        return;
      }

      // Set editable fields
      setOriginalMetadata(examData.metadata);
      setTitle(examData.metadata.title);
      setSubject(examData.metadata.subject || "");
      setSection(examData.metadata.section || "");
      setScheduleDate(
        examData.metadata.date ? new Date(examData.metadata.date) : null,
      );

      // Set non-editable fields
      setExamCode(examData.metadata.examCode);
      setStatus(examData.metadata.status);
      setTotalQuestions(examData.totalQuestions);
      setVersion(examData.metadata.version);

      // Initialize remote version tracking
      setRemoteVersion(examData.metadata.version);
      setConflictDetected(false);
    } catch (error) {
      console.error("Error loading exam:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load exam data.",
      });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const checkForChanges = () => {
    if (!originalMetadata) return;

    const changed =
      title !== originalMetadata.title ||
      subject !== (originalMetadata.subject || "") ||
      section !== (originalMetadata.section || "") ||
      scheduleDate?.toISOString() !==
        (originalMetadata.date
          ? new Date(originalMetadata.date).toISOString()
          : null);

    setHasChanges(changed);
  };

  const validateInputs = (): boolean => {
    let isValid = true;

    // Validate title
    if (!title.trim()) {
      setTitleError("Title is required");
      isValid = false;
    } else if (title.trim().length < 3) {
      setTitleError("Title must be at least 3 characters");
      isValid = false;
    } else if (title.trim().length > 100) {
      setTitleError("Title must not exceed 100 characters");
      isValid = false;
    } else {
      setTitleError("");
    }

    // Validate date
    if (scheduleDate) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (scheduleDate < now) {
        setDateError("Schedule date cannot be in the past");
        isValid = false;
      } else {
        setDateError("");
      }
    } else {
      setDateError("");
    }

    return isValid;
  };

  const handleSave = () => {
    if (!validateInputs()) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Please fix the errors before saving.",
      });
      return;
    }

    if (!hasChanges) {
      Toast.show({
        type: "info",
        text1: "No Changes",
        text2: "No changes detected.",
      });
      return;
    }

    // Check for conflicts before showing confirmation
    if (conflictDetected) {
      Alert.alert(
        "Conflict Detected",
        "This exam was modified by another user. Your changes may overwrite theirs. Do you want to refresh and see the latest version?",
        [
          {
            text: "Refresh",
            onPress: () => {
              loadExamData();
              setConflictDetected(false);
            },
          },
          {
            text: "Save Anyway",
            style: "destructive",
            onPress: () => setShowConfirmModal(true),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }

    setShowConfirmModal(true);
  };

  const getErrorText = (error: any): string =>
    [
      error?.message ?? "",
      error?.code ?? "",
      error?.name ?? "",
      String(error ?? ""),
    ]
      .join(" ")
      .toLowerCase();

  const isTransientNetworkError = (error: any): boolean => {
    const text = getErrorText(error);
    return (
      text.includes("network") ||
      text.includes("offline") ||
      text.includes("unavailable") ||
      text.includes("deadline-exceeded") ||
      text.includes("loadbundlefromserverrequesterror") ||
      text.includes("could not load bundle")
    );
  };

  const updateExamWithRetry = async (
    updateData: {
      title?: string;
      subject?: string | null;
      section?: string | null;
      date?: string | null;
    },
    expectedVersion: number,
  ): Promise<number> => {
    const maxAttempts = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await ExamService.updateExamWithVersionCheck(
          examId,
          updateData,
          expectedVersion,
        );
      } catch (error) {
        lastError = error;
        if (!isTransientNetworkError(error) || attempt === maxAttempts) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }

    throw lastError;
  };

  const confirmSave = async () => {
    setShowConfirmModal(false);
    setSaving(true);

    let updateApplied = false;
    let persistedVersion: number | null = null;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const startTime = Date.now();

      // Prepare update data
      const updateData = {
        title: title.trim(),
        subject: subject.trim() || null,
        section: section.trim() || null,
        date: scheduleDate?.toISOString() || null,
      };

      // Track changes for audit log
      const changes: Record<string, { old: any; new: any }> = {};
      if (originalMetadata) {
        if (updateData.title !== originalMetadata.title) {
          changes.title = {
            old: originalMetadata.title,
            new: updateData.title,
          };
        }
        if (updateData.subject !== (originalMetadata.subject ?? null)) {
          changes.subject = {
            old: originalMetadata.subject ?? null,
            new: updateData.subject,
          };
        }
        if (updateData.section !== (originalMetadata.section ?? null)) {
          changes.section = {
            old: originalMetadata.section ?? null,
            new: updateData.section,
          };
        }
        if (updateData.date !== (originalMetadata.date ?? null)) {
          changes.date = {
            old: originalMetadata.date ?? null,
            new: updateData.date,
          };
        }
      }

      // Update exam with version check
      const updatedVersion = await updateExamWithRetry(
        updateData,
        version, // Current version we're editing
      );
      updateApplied = true;
      persistedVersion = updatedVersion;

      // Log audit trail
      await AuditLogService.logExamEdit(
        examId,
        currentUser.uid,
        changes,
        updatedVersion,
        true,
      );

      // Update template if it exists
      try {
        const { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } = await import("firebase/firestore");
        const templatesQuery = query(
          collection(db, "templates"),
          where("examId", "==", examId)
        );
        const templatesSnapshot = await getDocs(templatesQuery);
        
        if (!templatesSnapshot.empty) {
          const templateDoc = templatesSnapshot.docs[0];
          const templateUpdateData: any = {
            examName: updateData.title,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid,
          };
          
          // Update template name if exam title changed
          if (changes.title) {
            templateUpdateData.name = `${updateData.title}_Template`;
            templateUpdateData.description = `Answer sheet template for ${updateData.title}`;
          }
          
          await updateDoc(doc(db, "templates", templateDoc.id), templateUpdateData);
          console.log("Template updated successfully");
        }
      } catch (templateError) {
        console.error("Error updating template:", templateError);
        // Don't fail the exam update if template update fails
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Update local state
      setVersion(updatedVersion);
      setRemoteVersion(updatedVersion);
      setOriginalMetadata({
        ...originalMetadata!,
        title: updateData.title,
        subject: updateData.subject || undefined,
        section: updateData.section || undefined,
        date: updateData.date || undefined,
        version: updatedVersion,
        updatedAt: new Date(),
      });
      setHasChanges(false);
      setConflictDetected(false);

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `Exam updated successfully in ${(duration / 1000).toFixed(2)}s`,
      });

      // Navigate back after a short delay
      setTimeout(() => {
        router.replace(
          `/(tabs)/exam-preview?examId=${examId}&refresh=${Date.now()}`,
        );
      }, 1500);
    } catch (error: any) {
      console.error("Error saving exam:", error);

      // If the exam was already updated but a downstream step failed,
      // automatically rollback to last persisted metadata.
      if (updateApplied && persistedVersion && originalMetadata) {
        try {
          const rollbackData = {
            title: originalMetadata.title,
            subject: originalMetadata.subject ?? null,
            section: originalMetadata.section ?? null,
            date: originalMetadata.date ?? null,
          };

          const rolledBackVersion = await ExamService.updateExamWithVersionCheck(
            examId,
            rollbackData,
            persistedVersion,
          );

          setVersion(rolledBackVersion);
          setRemoteVersion(rolledBackVersion);
          setTitle(originalMetadata.title);
          setSubject(originalMetadata.subject || "");
          setSection(originalMetadata.section || "");
          setScheduleDate(
            originalMetadata.date ? new Date(originalMetadata.date) : null,
          );
          setHasChanges(false);
          setConflictDetected(false);
        } catch (rollbackError) {
          console.error("Rollback failed after save error:", rollbackError);
          await loadExamData();
        }
      }

      // Enhanced error handling
      let errorTitle = "Save Failed";
      let errorMessage =
        updateApplied && persistedVersion
          ? "Failed to complete save. Your changes were rolled back to the last saved state."
          : "Failed to save changes. Please try again.";
      const errorText = getErrorText(error);

      if (errorText.includes("version conflict")) {
        errorTitle = "Version Conflict";
        errorMessage =
          "This exam was modified by another user while you were editing. Please refresh and try again.";
        Alert.alert(errorTitle, errorMessage, [
          {
            text: "Refresh",
            onPress: () => {
              loadExamData();
              setConflictDetected(false);
            },
          },
          { text: "Cancel", style: "cancel" },
        ]);
      } else if (errorText.includes("conflict")) {
        errorTitle = "Sync Conflict";
        errorMessage =
          "This exam was modified by another user. Please refresh and try again.";
        Alert.alert(errorTitle, errorMessage, [
          { text: "Refresh", onPress: loadExamData },
          { text: "Cancel", style: "cancel" },
        ]);
      } else if (isTransientNetworkError(error)) {
        errorTitle = "Network Error";
        errorMessage =
          "Unable to save changes due to a weak or unstable connection. Please check your internet and try again.";
        Toast.show({
          type: "error",
          text1: errorTitle,
          text2: errorMessage,
          visibilityTime: 5000,
        });
        Alert.alert(errorTitle, errorMessage);
      } else {
        Toast.show({
          type: "error",
          text1: errorTitle,
          text2: error.message || errorMessage,
          visibilityTime: 4000,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setScheduleDate(selectedDate);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#00a550" />
        <Text style={styles.loadingText}>Loading exam data...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: headerTopPadding,
            backgroundColor: colors.headerBg,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity style={styles.backIcon} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.title} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.title }]}>Edit Exam</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Conflict Warning Banner */}
        {conflictDetected && (
          <View style={styles.conflictBanner}>
            <Ionicons name="warning" size={24} color="#ff9800" />
            <View style={styles.conflictTextContainer}>
              <Text style={styles.conflictTitle}>Conflict Detected</Text>
              <Text style={styles.conflictMessage}>
                This exam was modified by another user. Your changes may
                overwrite theirs.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => {
                loadExamData();
                setConflictDetected(false);
              }}
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status Badge */}
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: ExamService.getStatusColor(status) },
          ]}
        >
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {/* Editable Fields Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={styles.sectionTitle}>Editable Fields</Text>

          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              Exam Title <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, titleError ? styles.inputError : null]}
              value={title}
              onChangeText={setTitle}
              placeholder="Enter exam title"
              placeholderTextColor="#9ca3af"
              maxLength={100}
            />
            {titleError ? (
              <Text style={styles.errorText}>{titleError}</Text>
            ) : null}
            <Text style={styles.helperText}>{title.length}/100 characters</Text>
          </View>

          {/* Subject */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Subject</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="Enter subject (optional)"
              placeholderTextColor="#9ca3af"
              maxLength={50}
            />
          </View>

          {/* Section */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Section</Text>
            <TextInput
              style={styles.input}
              value={section}
              onChangeText={setSection}
              placeholder="Enter section (optional)"
              placeholderTextColor="#9ca3af"
              maxLength={50}
            />
          </View>

          {/* Schedule Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Schedule Date</Text>
            <TouchableOpacity
              style={[styles.dateButton, dateError ? styles.inputError : null]}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="#3d5a3d" />
              <Text style={styles.dateButtonText}>
                {scheduleDate
                  ? ExamService.formatDate(scheduleDate)
                  : "Select date (optional)"}
              </Text>
            </TouchableOpacity>
            {dateError ? (
              <Text style={styles.errorText}>{dateError}</Text>
            ) : null}
            {scheduleDate && (
              <TouchableOpacity
                style={styles.clearDateButton}
                onPress={() => setScheduleDate(null)}
              >
                <Text style={styles.clearDateText}>Clear date</Text>
              </TouchableOpacity>
            )}
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={scheduleDate || new Date()}
              mode="date"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}
        </View>

        {/* Locked Fields Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Locked Fields</Text>
            <View style={styles.lockedBadge}>
              <Ionicons name="lock-closed" size={12} color="#fff" />
              <Text style={styles.lockedText}>Read-only</Text>
            </View>
          </View>

          <View style={styles.lockedField}>
            <Text style={styles.lockedLabel}>Exam Code</Text>
            <Text style={styles.lockedValue}>{examCode}</Text>
          </View>

          <View style={styles.lockedField}>
            <Text style={styles.lockedLabel}>Total Questions</Text>
            <Text style={styles.lockedValue}>{totalQuestions}</Text>
          </View>

          <View style={styles.lockedField}>
            <Text style={styles.lockedLabel}>Version</Text>
            <Text style={styles.lockedValue}>v{version}</Text>
          </View>

          <Text style={styles.lockedNote}>
            Structural changes like question count cannot be modified after exam
            creation.
          </Text>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View
        style={[
          styles.actionButtons,
          { backgroundColor: darkModeEnabled ? "#1a2520" : "#e5efe8", borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={saving}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.saveButton,
            (!hasChanges || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color="#fff"
              />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="alert-circle-outline" size={48} color="#ff9800" />
            <Text style={styles.modalTitle}>Confirm Changes</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to save these changes? This will update the
              exam version.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmSave}
              >
                <Text style={styles.modalConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#edf3ee",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#edf3ee",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#3d5a3d",
    borderBottomWidth: 1,
    borderBottomColor: "#2f4a38",
  },
  backIcon: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#eef7f0",
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  conflictBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff3cd",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    padding: 16,
    marginBottom: 16,
    borderRadius: 8,
    gap: 12,
  },
  conflictTextContainer: {
    flex: 1,
  },
  conflictTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#856404",
    marginBottom: 4,
  },
  conflictMessage: {
    fontSize: 13,
    color: "#856404",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ff9800",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  refreshButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  statusText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#f3f7f4",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#cad9cf",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2b4337",
    marginBottom: 12,
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e74c3c",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  lockedText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2b4337",
    marginBottom: 8,
  },
  required: {
    color: "#e74c3c",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cad9cf",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#2b4337",
  },
  inputError: {
    borderColor: "#e74c3c",
    borderWidth: 2,
  },
  errorText: {
    color: "#e74c3c",
    fontSize: 12,
    marginTop: 4,
  },
  helperText: {
    color: "#607a69",
    fontSize: 12,
    marginTop: 4,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cad9cf",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: "#2b4337",
  },
  clearDateButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  clearDateText: {
    color: "#e74c3c",
    fontSize: 14,
  },
  lockedField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d7e4db",
  },
  lockedLabel: {
    fontSize: 14,
    color: "#4f6b5a",
  },
  lockedValue: {
    fontSize: 14,
    color: "#2b4337",
    fontWeight: "600",
  },
  lockedNote: {
    fontSize: 12,
    color: "#607a69",
    fontStyle: "italic",
    marginTop: 12,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#4f6b5a",
  },
  actionButtons: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    backgroundColor: "#e5efe8",
    borderTopWidth: 1,
    borderTopColor: "#cad9cf",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cad9cf",
  },
  cancelButtonText: {
    color: "#3d5a3d",
    fontSize: 15,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#2d7a5f",
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
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
    backgroundColor: "#2d7a5f",
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
