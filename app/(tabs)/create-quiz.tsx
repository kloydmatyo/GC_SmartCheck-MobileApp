import StatusModal from "@/components/common/StatusModal";
import { auth, db } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
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
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const NUM_QUESTIONS_OPTIONS = [20, 50, 100];
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

const toStartOfDay = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export default function CreateQuizScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const classIdParam = params.classId as string | undefined;
  const goBack = () =>
    classIdParam
      ? router.replace(
          `/(tabs)/class-details?classId=${classIdParam}&tab=exams`,
        )
      : router.replace("/(tabs)/quizzes");
  const [loading, setLoading] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // Form state
  const [quizName, setQuizName] = useState("");
  const [numQuestions, setNumQuestions] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [examType] = useState<"board" | "diagnostic">("board");
  const [choicesPerItem] = useState<number>(5);
  const [examDate, setExamDate] = useState<Date | null>(new Date());
  const [classesLoading, setClassesLoading] = useState(false);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [createdExamId, setCreatedExamId] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewExamCode, setReviewExamCode] = useState<string | null>(null);
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
      setExamDate(new Date());
      setSelectedClassId(classIdParam || null);
      setLoading(false);
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
          const { NetworkService } = await import("@/services/networkService");
          const isOnline = await NetworkService.isOnline();
          let classes: ClassOption[] = [];

          if (isOnline) {
            try {
              const classesQuery = query(
                collection(db, "classes"),
                where("createdBy", "==", currentUser.uid),
              );
              // Provide a short timeout so UI won't freeze on flaky networks
              const classesSnapshot = await Promise.race([
                getDocs(classesQuery),
                new Promise<any>((_, reject) =>
                  setTimeout(() => reject(new Error("timeout")), 3000),
                ),
              ]);

              classes = classesSnapshot.docs
                .map((classDoc: any) => ({
                  id: classDoc.id,
                  ...(classDoc.data() as Omit<ClassOption, "id">),
                }))
                .filter((cls: any) => !cls.isArchived);
            } catch (err) {
              console.warn(
                "Firestore classes fetch failed, falling back to cache",
                err,
              );
            }
          }

          // Fallback to cache if offline or Firestore query failed
          if (!isOnline || classes.length === 0) {
            const { RealmService } = await import("@/services/realmService");
            const cacheRealm = await RealmService.getCacheRealm();
            const cachedClasses = cacheRealm
              .objects<any>("ClassCache")
              .filtered(`createdBy == "${currentUser.uid}"`);

            classes = cachedClasses.map((c: any) => ({
              id: c.id,
              class_name: c.class_name,
              course_subject: c.course_subject,
              section_block: c.section_block,
              isArchived: false, // We assume cached active ones aren't archived
            }));
          }

          // Always add unsynced classes from the Staging Realm
          const { RealmService } = await import("@/services/realmService");
          const stagingRealm = await RealmService.getStagingRealm();
          const stagingClasses = stagingRealm.objects<any>("OfflineClass");

          const sClasses = stagingClasses.map((c: any) => ({
            id: `staging_${c._id.toHexString()}`,
            class_name: c.class_name,
            course_subject: c.course_subject,
            section_block: c.section_block,
            isArchived: false,
          }));

          setClassOptions([...classes, ...sClasses]);
        } catch (error) {
          console.warn("Could not load classes:", error);
          setClassOptions([]);
        } finally {
          setClassesLoading(false);
        }
      };

      loadClasses();
    }, [classIdParam]),
  );

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

    if (!examDate) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please select an exam date",
      });
      return;
    }

    const today = toStartOfDay(new Date());
    const selectedDate = toStartOfDay(examDate);
    if (selectedDate < today) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Exam date cannot be in the past",
      });
      return;
    }

    if (!reviewExamCode) {
      setReviewExamCode(generateExamCode());
    }
    setReviewVisible(true);
  };

  const handleSave = async () => {
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



    if (!examDate) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please select an exam date",
      });
      return;
    }

    const today = toStartOfDay(new Date());
    const selectedDate = toStartOfDay(examDate);
    if (selectedDate < today) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Exam date cannot be in the past",
      });
      return;
    }

    try {
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

      const currentDate = formatDateForStorage(examDate);
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

      // Create default answer key in Firestore (Online path)
      const answerKeyId = `ak_${newExamId}_${Date.now()}`;
      const answerKeyData = {
        examId: newExamId,
        id: answerKeyId,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        locked: false,
        version: 1,
        questionSettings: Array.from({ length: numQuestions }, (_, i) => ({
          questionNumber: i + 1,
          correctAnswer: "",
          points: 1,
        })),
      };

      await setDoc(doc(db, "answerKeys", answerKeyId), answerKeyData);

      // Create template automatically (Online path)
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
        await addDoc(collection(db, "templates"), templateData);
      } catch (err) {
        console.warn("Template creation failed:", err);
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
    }
  };

  const canProceed = Boolean(
    quizName.trim() &&
    quizName.trim().length <= MAX_FIELD_LENGTH &&
    numQuestions,
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.screenBg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.lightHeader}>
        <View style={styles.placeholder} />
        <Text style={styles.lightHeaderTitle}>Create Exam</Text>
        <TouchableOpacity
          style={[styles.closeButton, loading && { opacity: 0.45 }]}
          onPress={goBack}
          disabled={loading}
        >
          <Ionicons name="close" size={22} color="#A8AFBC" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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
                <Text style={styles.reviewSubtitle}>Confirm before creating</Text>
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
              <Text style={styles.reviewLabel}>Exam Date</Text>
              <Text style={styles.reviewValue}>
                {examDate ? formatDateForStorage(examDate) : "Not set"}
              </Text>
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
                style={styles.reviewSecondaryButton}
                onPress={() => setReviewVisible(false)}
                disabled={loading}
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
    gap: 12,
  },
  questionOption: {
    flex: 1,
    height: 78,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
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
    fontSize: 18,
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
});
