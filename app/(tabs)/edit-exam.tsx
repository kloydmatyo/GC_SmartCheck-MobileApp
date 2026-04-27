import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
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
  const NUM_QUESTIONS_OPTIONS = [20, 50, 100, 150, 200] as const;
  const router = useRouter();
  const params = useLocalSearchParams();
  const examId = params.examId as string;
  const classId = params.classId as string | undefined;
  const returnTo = params.returnTo as string | undefined;
  const returnTab = params.tab as string | undefined;
  const closeEditExam = () =>
    returnTo === "exam-preview"
      ? router.replace(
          `/(tabs)/exam-preview?examId=${examId}${
            classId ? `&classId=${classId}` : ""
          }${returnTab ? `&tab=${returnTab}` : ""}&refresh=${Date.now()}`,
        )
      : classId
        ? router.replace(`/(tabs)/class-details?classId=${classId}&tab=exams`)
        : router.back();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalMetadata, setOriginalMetadata] = useState<ExamMetadata | null>(
    null,
  );
  // Editable fields
  const [title, setTitle] = useState("");
  const [choicesPerItem, setChoicesPerItem] = useState<4 | 5>(4);
  const [initialTotalQuestions, setInitialTotalQuestions] = useState(0);
  const [initialChoicesPerItem, setInitialChoicesPerItem] = useState<4 | 5>(4);
  const [structureLocked, setStructureLocked] = useState(false);

  // Locked fields (for display)
  const [examCode, setExamCode] = useState("");
  const [status, setStatus] = useState<
    "Draft" | "Scheduled" | "Active" | "Completed"
  >("Draft");
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [version, setVersion] = useState(1);

  // Validation errors
  const [titleError, setTitleError] = useState("");

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showFinalizeConfirmModal, setShowFinalizeConfirmModal] =
    useState(false);
  const [showDiscardConfirmModal, setShowDiscardConfirmModal] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const displayStatus = structureLocked ? "Final" : status;
  const statusChipColors =
    displayStatus === "Final"
      ? {
          backgroundColor: darkModeEnabled ? "#173528" : "#E9F8F1",
          borderColor: darkModeEnabled ? "#24533E" : "#CFEEDD",
          textColor: "#14925F",
        }
      : {
          backgroundColor: darkModeEnabled ? "#2A313A" : "#F3F5F8",
          borderColor: darkModeEnabled ? "#414A56" : "#E2E8F0",
          textColor: darkModeEnabled ? "#D7DEE7" : "#6B7280",
        };

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
        inputBg: "#18211d",
        muted: "#9DB8A8",
      }
    : {
        bg: "#F7F7F8",
        headerBg: "#FFFFFF",
        cardBg: "#FFFFFF",
        border: "#E8EBF0",
        title: "#111827",
        inputBg: "#FFFFFF",
        muted: "#6B7280",
      };

  useEffect(() => {
    loadExamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => {
    if (!originalMetadata) return;
    const changed =
      title !== originalMetadata.title ||
      totalQuestions !== initialTotalQuestions ||
      choicesPerItem !== initialChoicesPerItem;
    setHasChanges(changed);
  }, [
    title,
    totalQuestions,
    choicesPerItem,
    originalMetadata,
    initialTotalQuestions,
    initialChoicesPerItem,
  ]);

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
        closeEditExam();
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
        closeEditExam();
        return;
      }

      const examData = await ExamService.getExamById(examId);
      if (!examData) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Exam not found.",
        });
        closeEditExam();
        return;
      }

      // Check if exam is in Draft status
      if (examData.metadata.status !== "Draft") {
        Alert.alert(
          "Edit Restricted",
          `Cannot edit exam. Exam status is "${examData.metadata.status}". Only Draft exams can be edited.`,
          [{ text: "OK", onPress: closeEditExam }],
        );
        return;
      }

      // Check if there's an active scan session
      const hasActiveScan = await ExamService.hasActiveScanSession(examId);
      if (hasActiveScan) {
        Alert.alert(
          "Edit Restricted",
          "Cannot edit exam. There is an active scan session for this exam.",
          [{ text: "OK", onPress: closeEditExam }],
        );
        return;
      }

      // Set editable field
      setOriginalMetadata(examData.metadata);
      setTitle(examData.metadata.title);
      setChoicesPerItem(examData.choiceFormat === "A-E" ? 5 : 4);
      setStructureLocked(Boolean(examData.metadata.structureLocked));

      // Set remaining fields
      setExamCode(examData.metadata.examCode);
      setStatus(examData.metadata.status);
      setTotalQuestions(examData.totalQuestions);
      setInitialTotalQuestions(examData.totalQuestions);
      setInitialChoicesPerItem(examData.choiceFormat === "A-E" ? 5 : 4);
      setVersion(examData.metadata.version);
    } catch (error) {
      console.error("Error loading exam:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load exam data.",
      });
      closeEditExam();
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing || saving) return;
    setRefreshing(true);
    try {
      await loadExamData();
    } finally {
      setRefreshing(false);
    }
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

    setShowConfirmModal(true);
  };

  const handleAttemptClose = () => {
    if (saving) return;
    if (hasChanges) {
      setShowDiscardConfirmModal(true);
      return;
    }
    closeEditExam();
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
      num_items?: number;
      choices_per_item?: 4 | 5;
      structureLocked?: boolean;
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

      const { NetworkService } = await import("@/services/networkService");
      const isOnline = await NetworkService.isOnline();

      const latestVersion = version;

      const startTime = Date.now();

      // Prepare update data
      const updateData = {
        title: title.trim(),
        num_items: totalQuestions,
        choices_per_item: choicesPerItem,
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
        if (updateData.num_items !== initialTotalQuestions) {
          changes.num_items = {
            old: initialTotalQuestions,
            new: updateData.num_items,
          };
        }
        if (updateData.choices_per_item !== initialChoicesPerItem) {
          changes.choices_per_item = {
            old: initialChoicesPerItem,
            new: updateData.choices_per_item,
          };
        }
      }

      // Update exam with version check
      const updatedVersion = await updateExamWithRetry(
        updateData,
        latestVersion,
      );
      updateApplied = true;
      persistedVersion = updatedVersion;

      if (isOnline && !examId.startsWith("staging_")) {
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
          const {
            collection,
            query,
            where,
            getDocs,
            updateDoc,
            doc,
            serverTimestamp,
          } = await import("firebase/firestore");
          const templatesQuery = query(
            collection(db, "templates"),
            where("examId", "==", examId),
          );
          const templatesSnapshot = await getDocs(templatesQuery);

          if (!templatesSnapshot.empty) {
            const templateDoc = templatesSnapshot.docs[0];
            const templateUpdateData: any = {
              examName: updateData.title,
              questionCount: updateData.num_items,
              choicesPerItem: updateData.choices_per_item,
              updatedAt: serverTimestamp(),
              updatedBy: currentUser.uid,
            };

            // Update template name if exam title changed
            if (changes.title) {
              templateUpdateData.name = `${updateData.title}_Template`;
              templateUpdateData.description = `Answer sheet template for ${updateData.title}`;
            }

            await updateDoc(
              doc(db, "templates", templateDoc.id),
              templateUpdateData,
            );
            console.log("Template updated successfully");
          }
        } catch (templateError) {
          console.error("Error updating template:", templateError);
          // Don't fail the exam update if template update fails
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Update local state
      setVersion(updatedVersion);
      setOriginalMetadata({
        ...originalMetadata!,
        title: updateData.title,
        version: updatedVersion,
        updatedAt: new Date(),
      });
      setInitialTotalQuestions(updateData.num_items);
      setInitialChoicesPerItem(updateData.choices_per_item);
      setHasChanges(false);

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `Exam updated successfully in ${(duration / 1000).toFixed(2)}s`,
      });

      closeEditExam();
    } catch (error: any) {
      console.error("Error saving exam:", error);

      // If the exam was already updated but a downstream step failed,
      // automatically rollback to last persisted metadata.
      if (updateApplied && persistedVersion && originalMetadata) {
        try {
          const rollbackData = {
            title: originalMetadata.title,
            num_items: initialTotalQuestions,
            choices_per_item: initialChoicesPerItem,
          };

          const rolledBackVersion =
            await ExamService.updateExamWithVersionCheck(
              examId,
              rollbackData,
              persistedVersion,
            );

          setVersion(rolledBackVersion);
          setTitle(originalMetadata.title);
          setTotalQuestions(initialTotalQuestions);
          setChoicesPerItem(initialChoicesPerItem);
          setHasChanges(false);
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
          { text: "Refresh", onPress: loadExamData },
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

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#00a550" />
        <Text style={styles.loadingText}>Loading exam data...</Text>
      </View>
    );
  }

  const confirmFinalize = async () => {
    setShowFinalizeConfirmModal(false);
    setSaving(true);

    try {
      const { NetworkService } = await import("@/services/networkService");
      const isOnline = await NetworkService.isOnline();

      let latestVersion = version;
      if (isOnline && !examId.startsWith("staging_")) {
        const { doc, getDoc } = await import("firebase/firestore");
        const latestExamSnap = await getDoc(doc(db, "exams", examId));
        latestVersion = latestExamSnap.exists()
          ? Number(latestExamSnap.data().version ?? version ?? 1)
          : version;
      }

      const updatedVersion = await updateExamWithRetry(
        {
          num_items: totalQuestions,
          choices_per_item: choicesPerItem,
          structureLocked: true,
        },
        latestVersion,
      );

      setStructureLocked(true);
      setVersion(updatedVersion);
      setInitialTotalQuestions(totalQuestions);
      setInitialChoicesPerItem(choicesPerItem);
      setOriginalMetadata((prev) =>
        prev
          ? {
              ...prev,
              structureLocked: true,
              version: updatedVersion,
              updatedAt: new Date(),
            }
          : prev,
      );
      setHasChanges(title !== (originalMetadata?.title ?? ""));

      Toast.show({
        type: "success",
        text1: "Finalized",
        text2: "Total questions and answer choices are now locked.",
      });
    } catch (error: any) {
      console.error("Error finalizing exam:", error);
      Toast.show({
        type: "error",
        text1: "Finalize Failed",
        text2: error?.message || "Could not finalize exam.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.container}>
        <View
          style={[
            styles.createScreenHeader,
            {
              backgroundColor: colors.headerBg,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={styles.createScreenHeaderSpacer} />
          <View style={styles.headerTitleGroup}>
            <Text style={[styles.createSheetTitle, { color: colors.title }]}>
              Edit Exam
            </Text>
            <View
              style={[
                styles.headerStatusBadge,
                {
                  backgroundColor: statusChipColors.backgroundColor,
                  borderColor: statusChipColors.borderColor,
                },
              ]}
            >
              <Text
                style={[
                  styles.headerStatusText,
                  { color: statusChipColors.textColor },
                ]}
              >
                {displayStatus}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.createSheetClose,
              { backgroundColor: darkModeEnabled ? "#24322c" : "#F3F5F8" },
              saving && styles.closeButtonDisabled,
            ]}
            onPress={handleAttemptClose}
            disabled={saving}
          >
            <Ionicons name="close" size={24} color="#A8AFBC" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.createSheetBody}
          contentContainerStyle={styles.createSheetBodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#20BE7B"
              colors={["#20BE7B"]}
            />
          }
        >
          <Text
            style={[
              styles.sheetLabel,
              { color: darkModeEnabled ? colors.title : "#374151" },
            ]}
          >
            Exam Name <Text style={styles.requiredStar}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: darkModeEnabled ? colors.title : "#111827",
              },
              title.trim().length >= 3 && styles.sheetInputValid,
              titleError ? styles.sheetInputError : null,
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="Enter exam name"
            placeholderTextColor="#B5BCC8"
            maxLength={100}
          />
          {titleError ? (
            <Text style={styles.fieldHint}>{titleError}</Text>
          ) : null}

          {!structureLocked && (
            <>
              <Text
                style={[
                  styles.sheetLabel,
                  { color: darkModeEnabled ? colors.title : "#374151" },
                ]}
              >
                Total Questions
              </Text>
              <View style={styles.questionOptionRow}>
                {NUM_QUESTIONS_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.questionOption,
                      totalQuestions === option && styles.questionOptionActive,
                    ]}
                    onPress={() => setTotalQuestions(option)}
                  >
                    <Text
                      style={[
                        styles.questionOptionText,
                        totalQuestions === option &&
                          styles.questionOptionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text
                style={[
                  styles.sheetLabel,
                  { color: darkModeEnabled ? colors.title : "#374151" },
                ]}
              >
                Number of Answer Choices
              </Text>
              <View style={styles.questionOptionRow}>
                <TouchableOpacity
                  style={[
                    styles.choiceOption,
                    choicesPerItem === 4 && styles.choiceOptionActive,
                  ]}
                  onPress={() => setChoicesPerItem(4)}
                >
                  <Text
                    style={[
                      styles.choiceOptionTitle,
                      choicesPerItem === 4 && styles.choiceOptionTitleActive,
                    ]}
                  >
                    A, B, C, D
                  </Text>
                  <Text
                    style={[
                      styles.choiceOptionSub,
                      choicesPerItem === 4 && styles.choiceOptionSubActive,
                    ]}
                  >
                    4 Choices
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.choiceOption,
                    choicesPerItem === 5 && styles.choiceOptionActive,
                  ]}
                  onPress={() => setChoicesPerItem(5)}
                >
                  <Text
                    style={[
                      styles.choiceOptionTitle,
                      choicesPerItem === 5 && styles.choiceOptionTitleActive,
                    ]}
                  >
                    A, B, C, D, E
                  </Text>
                  <Text
                    style={[
                      styles.choiceOptionSub,
                      choicesPerItem === 5 && styles.choiceOptionSubActive,
                    ]}
                  >
                    5 Choices
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View
            style={[
              styles.lockedCard,
              { backgroundColor: colors.cardBg, borderColor: colors.border },
            ]}
          >
            <View style={styles.lockedCardHeader}>
              <Text
                style={[
                  styles.lockedCardTitle,
                  { color: darkModeEnabled ? colors.title : "#111827" },
                ]}
              >
                Locked Fields
              </Text>
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={12} color="#fff" />
                <Text style={styles.lockedText}>Read-only</Text>
              </View>
            </View>

            <View style={styles.lockedField}>
              <Text style={styles.lockedLabel}>Exam Code</Text>
              <Text style={styles.lockedValue}>{examCode}</Text>
            </View>

            <View style={styles.lockedDivider} />

            <View style={styles.lockedField}>
              <Text style={styles.lockedLabel}>Status</Text>
              <Text style={styles.lockedValue}>{displayStatus}</Text>
            </View>

            <View style={styles.lockedDivider} />

            <View style={styles.lockedField}>
              <Text style={styles.lockedLabel}>Total Questions</Text>
              <Text style={styles.lockedValue}>
                {structureLocked ? totalQuestions : "Not finalized"}
              </Text>
            </View>

            <View style={styles.lockedDivider} />

            <View style={styles.lockedField}>
              <Text style={styles.lockedLabel}>Answer Choices</Text>
              <Text style={styles.lockedValue}>
                {structureLocked
                  ? choicesPerItem === 4
                    ? "A-D"
                    : "A-E"
                  : "Not finalized"}
              </Text>
            </View>

            <View style={styles.lockedDivider} />

            <View style={styles.lockedField}>
              <Text style={styles.lockedLabel}>Version</Text>
              <Text style={styles.lockedValue}>v{version}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.createScreenFooter}>
          {!hasChanges && (
            <Text style={styles.validationText}>No changes detected.</Text>
          )}
          {!structureLocked && (
            <TouchableOpacity
              style={[
                styles.secondaryActionButton,
                saving && styles.createButtonDisabled,
              ]}
              onPress={() => setShowFinalizeConfirmModal(true)}
              disabled={saving}
            >
              <Text style={styles.secondaryActionButtonText}>Finalize</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.sheetPrimaryButton,
              (!hasChanges || saving) && styles.createButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sheetPrimaryButtonText}>Save Changes</Text>
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
                Are you sure you want to save these changes? This will update
                the exam version.
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

        <Modal
          visible={showFinalizeConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFinalizeConfirmModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Ionicons name="lock-closed-outline" size={48} color="#ff9800" />
              <Text style={styles.modalTitle}>Finalize Exam</Text>
              <Text style={styles.modalMessage}>
                Once you click finalize, you will no longer be able to change
                the total questions and number of answer choices.
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowFinalizeConfirmModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmButton}
                  onPress={confirmFinalize}
                >
                  <Text style={styles.modalConfirmText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showDiscardConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDiscardConfirmModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Ionicons name="warning-outline" size={48} color="#ff9800" />
              <Text style={styles.modalTitle}>Discard Changes</Text>
              <Text style={styles.modalMessage}>
                You have unsaved exam changes. Leave without saving?
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowDiscardConfirmModal(false)}
                >
                  <Text style={styles.modalCancelText}>Stay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmButton}
                  onPress={() => {
                    setShowDiscardConfirmModal(false);
                    closeEditExam();
                  }}
                >
                  <Text style={styles.modalConfirmText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F8",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F7F7F8",
    padding: 20,
  },
  createScreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F5",
  },
  createScreenHeaderSpacer: {
    width: 44,
    height: 44,
  },
  headerTitleGroup: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createSheetTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  headerStatusBadge: {
    minWidth: 76,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerStatusText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  createSheetClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonDisabled: {
    opacity: 0.4,
  },
  createSheetBody: {
    flex: 1,
  },
  createSheetBodyContent: {
    padding: 20,
    paddingBottom: 120,
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
  sheetLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 10,
    marginTop: 14,
  },
  requiredStar: {
    color: "#EF4444",
  },
  sheetInput: {
    height: 62,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sheetInputValid: {
    borderColor: "#1FC27D",
    backgroundColor: "#F0FDF8",
  },
  sheetInputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FFF5F5",
  },
  sheetPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetPickerValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sheetPickerPlaceholder: {
    fontSize: 16,
    color: "#B5BCC8",
  },
  questionOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  questionOption: {
    width: "19%",
    height: 56,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    alignItems: "center",
    justifyContent: "center",
  },
  questionOptionActive: {
    backgroundColor: "#EAF7F0",
    borderColor: "#3ED598",
    shadowColor: "#1FC27D",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  questionOptionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#31394A",
  },
  questionOptionTextActive: {
    color: "#1DAF72",
  },
  choiceOption: {
    flex: 1,
    minHeight: 92,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "center",
    gap: 6,
  },
  choiceOptionActive: {
    backgroundColor: "#EAF7F0",
    borderColor: "#3ED598",
    shadowColor: "#1FC27D",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  choiceOptionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#31394A",
  },
  choiceOptionTitleActive: {
    color: "#1DAF72",
  },
  choiceOptionSub: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  choiceOptionSubActive: {
    color: "#1DAF72",
  },
  fieldHint: {
    fontSize: 11,
    color: "#EF4444",
    marginTop: 4,
    marginLeft: 4,
  },
  lockedCard: {
    marginTop: 22,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  lockedCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  lockedCardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
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
  lockedField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  lockedDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
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
  createScreenFooter: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 34,
    backgroundColor: "#F7F7F8",
    borderTopWidth: 1,
    borderTopColor: "#EEF1F5",
  },
  sheetPrimaryButton: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#1FC27D",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionButton: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1FC27D",
    backgroundColor: "#EAF7F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  secondaryActionButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#14925F",
  },
  sheetPrimaryButtonText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  createButtonDisabled: {
    opacity: 0.45,
  },
  validationText: {
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
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
