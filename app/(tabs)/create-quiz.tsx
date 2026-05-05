import ConfirmationModal from "@/components/common/ConfirmationModal";
import StatusModal from "@/components/common/StatusModal";
import { auth, db } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { ClassService } from "@/services/classService";
import { ExamService } from "@/services/examService";
import { UserService } from "@/services/userService";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const NUM_QUESTIONS_OPTIONS = [20, 50, 100, 150, 200];
const MAX_FIELD_LENGTH = 50;

interface ClassOption {
  id: string;
  class_name: string;
  section_block?: string;
  course_subject?: string;
  isArchived?: boolean;
}

const generateExamCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars like 0/O, 1/I/L
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `EX-${code}`;
};

const formatDateForStorage = (date: Date): string =>
  date.toISOString().split("T")[0];

export default function CreateQuizScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const classIdParam = params.classId as string | undefined;
  const goBack = () =>
    classIdParam
      ? router.replace(
          `/(tabs)/class-details?classId=${classIdParam}&tab=exams`,
        )
      : router.replace("/(tabs)/index");
  const [loading, setLoading] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // Form state
  const [quizName, setQuizName] = useState("");
  const [numQuestions, setNumQuestions] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [examType] = useState<"board" | "diagnostic">("board");
  const [choicesPerItem, setChoicesPerItem] = useState<4 | 5>(4);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [createdExamId, setCreatedExamId] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewExamCode, setReviewExamCode] = useState<string | null>(null);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const createLockRef = useRef(false);
  const [statusModal, setStatusModal] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  // Reset form when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const forceRefreshTick = refreshNonce;
      void forceRefreshTick;
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

      setQuizName("");
      setNumQuestions(null);
      setSubject("");
      setChoicesPerItem(4);
      setSelectedClassId(classIdParam || null);
      setLoading(false);
      createLockRef.current = false;
      setReviewVisible(false);
      setReviewExamCode(null);

      const loadClasses = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setClassOptions([]);
          return;
        }

        try {
          setClassesLoading(true);
          const fetchedClasses = await ClassService.getClassesByUser();
          
          // Map to ClassOption type and filter out archived classes
          const activeClasses: ClassOption[] = fetchedClasses
            .filter((cls: any) => !cls.isArchived)
            .map((cls: any) => ({
              id: cls.id,
              class_name: cls.class_name,
              course_subject: cls.course_subject,
              section_block: cls.section_block,
            }));

          setClassOptions(activeClasses);
        } catch (err) {
          console.error("Error loading classes:", err);
          setClassOptions([]);
        } finally {
          setClassesLoading(false);
        }
      };
      loadClasses();
    }, [classIdParam, refreshNonce]),
  );

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNonce((value) => value + 1);
    setTimeout(() => setRefreshing(false), 500);
  }, [refreshing]);

  const colors = darkModeEnabled
    ? {
        screenBg: "#111815",
        headerBg: "#1a2520",
        cardBg: "#1f2b26",
        border: "#34483f",
        text: "#e7f1eb",
        subtext: "#9db1a6",
        primary: "#1f3a2f",
        primaryDark: "#2b3b34",
        accent: "#8fd1ad",
      }
    : {
        screenBg: "#f5f5f5",
        headerBg: "#3d5a3d",
        cardBg: "#3d5a3d",
        border: "#e0e0e0",
        text: "#E8F5E9",
        subtext: "#B8D4B8",
        primary: "#3d5a3d",
        primaryDark: "#2f4a38",
        accent: "#4CAF50",
      };

  const openReview = () => {
    if (!quizName.trim()) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please enter a quiz name",
      });
      return;
    }

    if (quizName.trim().length > MAX_FIELD_LENGTH) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Exam name must be 50 characters or fewer",
      });
      return;
    }

    if (!numQuestions) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please select the number of questions",
      });
      return;
    }

    if (!reviewExamCode) {
      setReviewExamCode(generateExamCode());
    }
    setReviewVisible(true);
  };

  const handleSave = async () => {
    if (createLockRef.current) return;

    // Validation
    if (!quizName.trim()) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please enter a quiz name",
      });
      return;
    }

    if (quizName.trim().length > MAX_FIELD_LENGTH) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Exam name must be 50 characters or fewer",
      });
      return;
    }

    if (!numQuestions) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please select the number of questions",
      });
      return;
    }

    try {
      createLockRef.current = true;
      setLoading(true);
      const currentUser = auth.currentUser;

      console.log("=== Quiz Creation Debug ===");
      console.log("Current user:", currentUser);
      console.log("User UID:", currentUser?.uid);
      console.log("User email:", currentUser?.email);

      if (!currentUser) {
        setStatusModal({
          visible: true,
          type: "error",
          title: "Error",
          message: "You must be logged in to create a quiz",
        });
        return;
      }

      // Get user's instructor ID
      const userProfile = await UserService.getUserProfile();
      const instructorId = userProfile?.instructorId || "INSTRUCTOR-000";

      console.log("User profile:", userProfile);
      console.log("Instructor ID:", instructorId);

      const currentDate = formatDateForStorage(new Date());
      const selectedClass =
        classOptions.find((cls) => cls.id === selectedClassId) || null;

      const examCode = reviewExamCode || generateExamCode();
      if (!reviewExamCode) {
        setReviewExamCode(examCode);
      }

      // Prepare exam data
      const baseExamData = {
        title: quizName.trim(),
        subject: subject.trim() || selectedClass?.course_subject || "General",
        examType: examType,
        num_items: numQuestions,
        choices_per_item: choicesPerItem,
        status: "Draft",
        createdBy: currentUser.uid,
        created_at: currentDate,
        classId: selectedClass?.id || null,
        className: selectedClass?.class_name || null,
        instructorId: instructorId,
        examCode: examCode,
        version: 1,
        // For offline staging
        answerKeyJson: JSON.stringify({
          questionSettings: Array.from({ length: numQuestions }, (_, i) => ({
            questionNumber: i + 1,
            correctAnswer: "",
            points: 1,
          })),
        }),
      };

      console.log("Saving quiz via ExamService...");
      const result = await ExamService.createExam(baseExamData);

      if (result.startsWith("staging_")) {
        console.log("Quiz saved to staging realm (OFFLINE)");
        setCreatedExamId(result);
        setReviewVisible(false);
        setStatusModal({
          visible: true,
          type: "success",
          title: "Saved Offline",
          message: "Quiz saved locally. Redirecting to answer key...",
        });
        setTimeout(() => {
          setStatusModal((prev) => ({ ...prev, visible: false }));
          router.replace(`/(tabs)/edit-answer-key?examId=${result}`);
        }, 1500);
        return;
      }

      const newExamId = result;
      setCreatedExamId(newExamId);
      setReviewVisible(false);

      // Create default answer key and template in Firestore (Online path)
      // We wrap these in a try-catch and timeout to prevent hangs if the network is flaky
      try {
        const answerKeyId = `ak_${newExamId}_${Date.now()}`;
        const answerKeyData = {
          examId: newExamId,
          id: answerKeyId,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          locked: false,
          version: 1,
          // answers array — required by the web app's AnswerKeyService
          answers: Array.from({ length: numQuestions }, () => ""),
          questionSettings: Array.from({ length: numQuestions }, (_, i) => ({
            questionNumber: i + 1,
            correctAnswer: "",
            points: 1,
          })),
        };

        // Attempt to create answer key with timeout
        await Promise.race([
          setDoc(doc(db, "answerKeys", answerKeyId), answerKeyData),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Answer key creation timed out")),
              5000,
            ),
          ),
        ]);

        // Attempt to create template with timeout
        try {
          const templateData = {
            name: `${quizName.trim()}_Template`,
            numQuestions,
            choicesPerQuestion: choicesPerItem,
            createdBy: currentUser.uid,
            examId: newExamId,
            examName: quizName.trim(),
            examCode,
            createdAt: serverTimestamp(),
          };
          await Promise.race([
            addDoc(collection(db, "templates"), templateData),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Template creation timed out")),
                5000,
              ),
            ),
          ]);
        } catch (templateErr) {
          console.warn("Template creation failed or timed out:", templateErr);
        }
      } catch (akErr) {
        console.warn("Answer key creation failed or timed out:", akErr);
        // Even if secondary tasks fail, we already have the exam doc, so we can proceed.
      }

      console.log("=== Quiz Creation Complete ===");

      const nextParams = classIdParam
        ? `&classId=${encodeURIComponent(classIdParam)}&tab=exams`
        : "";
      router.replace(
        `/(tabs)/edit-answer-key?examId=${newExamId}${nextParams}`,
      );
    } catch (error) {
      console.error("Error creating quiz:", error);
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to create quiz. Please try again.",
      });
    } finally {
      setLoading(false);
      createLockRef.current = false;
    }
  };

  const canProceed = Boolean(
    quizName.trim() &&
    quizName.trim().length <= MAX_FIELD_LENGTH &&
    numQuestions,
  );
  const hasUnsavedExamDraft = Boolean(
    quizName.trim() ||
    numQuestions ||
    subject.trim() ||
    choicesPerItem !== 4 ||
    reviewVisible,
  );

  const handleAttemptClose = () => {
    if (loading || createLockRef.current) return;
    if (hasUnsavedExamDraft) {
      setDiscardConfirmVisible(true);
      return;
    }
    goBack();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.screenBg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.lightHeader}>
        <View style={styles.placeholder} />
        <Text style={styles.lightHeaderTitle}>Create Exam</Text>
        <TouchableOpacity
          style={[
            styles.closeButton,
            (loading || createLockRef.current) && { opacity: 0.45 },
          ]}
          onPress={handleAttemptClose}
          disabled={loading || createLockRef.current}
        >
          <Ionicons name="close" size={22} color="#A8AFBC" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#20BE7B"
            colors={["#20BE7B"]}
          />
        }
      >
        <View style={styles.section}>
          <Text style={styles.formLabel}>Exam Name</Text>
          <TextInput
            style={styles.lightInput}
            placeholder="Enter exam name"
            placeholderTextColor="#B5BCC8"
            value={quizName}
            onChangeText={setQuizName}
            editable={!loading}
            maxLength={MAX_FIELD_LENGTH}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.formLabel}>Number of Questions</Text>
          <View style={styles.questionOptionRow}>
            {NUM_QUESTIONS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.questionOption,
                  numQuestions === option && styles.questionOptionActive,
                ]}
                onPress={() => {
                  setNumQuestions(option);
                }}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.questionOptionText,
                    numQuestions === option && styles.questionOptionTextActive,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.formLabel}>Number of Answer Choices</Text>
          <View style={styles.questionOptionRow}>
            <TouchableOpacity
              style={[
                styles.choiceOption,
                choicesPerItem === 4 && styles.choiceOptionActive,
              ]}
              onPress={() => setChoicesPerItem(4)}
              disabled={loading}
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
                4 Choices (Most Common)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.choiceOption,
                choicesPerItem === 5 && styles.choiceOptionActive,
              ]}
              onPress={() => setChoicesPerItem(5)}
              disabled={loading}
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
                5 Choices (Extended)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={styles.lightFooter}>
        <TouchableOpacity
          style={[
            styles.primaryActionButton,
            !canProceed && styles.primaryActionButtonDisabled,
            loading && styles.saveButtonDisabled,
          ]}
          onPress={openReview}
          disabled={loading || !canProceed}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.primaryActionText}>Next: Set Answer Key</Text>
              <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={reviewVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setReviewVisible(false)}
      >
        <View style={styles.reviewOverlay}>
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewIconWrap}>
                <Ionicons name="clipboard-outline" size={18} color="#1F2937" />
              </View>
              <View style={styles.reviewHeaderText}>
                <Text style={styles.reviewTitle}>Review Exam Details</Text>
                <Text style={styles.reviewSubtitle}>
                  Confirm before creating
                </Text>
              </View>
            </View>

            <View style={styles.reviewDivider} />

            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Exam Name</Text>
              <Text style={styles.reviewValue}>{quizName.trim()}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Number of Questions</Text>
              <View style={styles.reviewPill}>
                <Text style={styles.reviewPillText}>{numQuestions}</Text>
              </View>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Answer Choices</Text>
              <View style={styles.reviewPill}>
                <Text style={styles.reviewPillText}>
                  {choicesPerItem === 4 ? "A, B, C, D" : "A, B, C, D, E"}
                </Text>
              </View>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Exam Code</Text>
              <View style={styles.reviewValueRow}>
                <Text style={styles.reviewValue}>
                  {reviewExamCode || "Pending"}
                </Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => {
                    if (!reviewExamCode) return;
                    Clipboard.setString(reviewExamCode);
                    setStatusModal({
                      visible: true,
                      type: "info",
                      title: "Copied",
                      message: "Exam code copied to clipboard",
                    });
                  }}
                  disabled={!reviewExamCode}
                >
                  <Ionicons
                    name="copy-outline"
                    size={16}
                    color={reviewExamCode ? "#1F2937" : "#9CA3AF"}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={[
                  styles.reviewSecondaryButton,
                  (loading || createLockRef.current) &&
                    styles.reviewSecondaryButtonDisabled,
                ]}
                onPress={() => {
                  if (loading || createLockRef.current) return;
                  setReviewVisible(false);
                }}
                disabled={loading || createLockRef.current}
              >
                <Text style={styles.reviewSecondaryText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reviewPrimaryButton}
                onPress={handleSave}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.reviewPrimaryText}>Create Exam</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <StatusModal
        visible={statusModal.visible}
        type={statusModal.type}
        title={statusModal.title}
        message={statusModal.message}
        onClose={() =>
          setStatusModal({
            visible: false,
            type: "info",
            title: "",
            message: "",
          })
        }
      />

      <ConfirmationModal
        visible={discardConfirmVisible}
        title="Discard Changes"
        message="You have unsaved exam details. Leave without saving?"
        cancelText="Stay"
        confirmText="Discard"
        destructive
        onCancel={() => setDiscardConfirmVisible(false)}
        onConfirm={() => {
          setDiscardConfirmVisible(false);
          goBack();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F8",
  },
  lightHeader: {
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
  lightHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1D2433",
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F5F8",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  section: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#30384A",
    marginBottom: 10,
  },
  lightInput: {
    height: 64,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingHorizontal: 18,
    fontSize: 16,
    color: "#1F2937",
  },
  questionOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
  classButtons: {
    gap: 10,
  },
  lightClassButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    padding: 14,
  },
  lightClassButtonActive: {
    backgroundColor: "#EAF7F0",
    borderColor: "#3ED598",
  },
  lightClassButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#31394A",
  },
  lightClassButtonTextActive: {
    color: "#1DAF72",
  },
  inlineInfoBox: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    backgroundColor: "#FFFFFF",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineInfoText: {
    fontSize: 14,
    color: "#6F7787",
    flex: 1,
  },
  lightFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#F7F7F8",
    borderTopWidth: 1,
    borderTopColor: "#EEF1F5",
  },
  primaryActionButton: {
    backgroundColor: "#1FC27D",
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#1FC27D",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryActionButtonDisabled: {
    backgroundColor: "#C9D2DD",
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  primaryActionText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  reviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    padding: 20,
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  reviewIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EAF7F0",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewHeaderText: {
    flex: 1,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  reviewSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: "#EEF2F7",
    marginVertical: 14,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  reviewValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  reviewValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F8",
  },
  reviewPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F5F8",
  },
  reviewPillText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  reviewActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  reviewSecondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewSecondaryButtonDisabled: {
    opacity: 0.45,
  },
  reviewSecondaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  reviewPrimaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1FC27D",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  choiceOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  choiceOptionActive: {
    backgroundColor: "#EAF7F0",
    borderColor: "#3ED598",
  },
  choiceOptionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#31394A",
    textAlign: "center",
  },
  choiceOptionTitleActive: {
    color: "#1DAF72",
  },
  choiceOptionSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#8A93A2",
    textAlign: "center",
  },
  choiceOptionSubActive: {
    color: "#1DAF72",
  },
});
