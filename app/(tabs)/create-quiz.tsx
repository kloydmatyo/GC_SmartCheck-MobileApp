import StatusModal from "@/components/common/StatusModal";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { auth, db } from "@/config/firebase";
import { UserService } from "@/services/userService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
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
  KeyboardAvoidingView,
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
      ? router.replace(`/(tabs)/class-details?classId=${classIdParam}&tab=exams`)
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

      const loadClasses = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setClassOptions([]);
          return;
        }

        try {
          setClassesLoading(true);
          const classesQuery = query(
            collection(db, "classes"),
            where("createdBy", "==", currentUser.uid),
          );
          const classesSnapshot = await getDocs(classesQuery);
          const classes = classesSnapshot.docs
            .map((classDoc) => ({
              id: classDoc.id,
              ...(classDoc.data() as Omit<ClassOption, "id">),
            }))
            .filter((cls) => !cls.isArchived);

          setClassOptions(classes);
          if (classIdParam && classes.some((cls) => cls.id === classIdParam)) {
            setSelectedClassId(classIdParam);
          } else if (classes.length === 1) {
            setSelectedClassId(classes[0].id);
          }
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

    if (!selectedClassId) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please select a class",
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

      // Generate exam code from quiz name and date
      const generateExamCode = (title: string, date: string): string => {
        const words = title.trim().split(/\s+/);
        const initials = words
          .slice(0, 3)
          .map((word) => word.charAt(0).toUpperCase())
          .join("");

        const dateCode = date.replace(/-/g, "");
        const randomSuffix = Math.random()
          .toString(36)
          .substring(2, 5)
          .toUpperCase();

        return `${initials}-${dateCode}-${randomSuffix}`;
      };

      const examCode = generateExamCode(quizName.trim(), currentDate);

      // Create exam document
      const examData = {
        title: quizName.trim(),
        subject: subject.trim() || selectedClass?.course_subject || "General",
        examType: examType,
        num_items: numQuestions,
        choices_per_item: choicesPerItem,
        status: "Draft",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        created_at: currentDate,
        classId: selectedClass?.id || null,
        className: selectedClass?.class_name || null,
        instructorId: instructorId,
        examCode: examCode,
        version: 1,
        answerKeys: [],
        generated_sheets: [],
        choicePoints: {},
      };

      console.log("Creating exam with data:", examData);
      const examRef = await addDoc(collection(db, "exams"), examData);
      console.log("Exam created with ID:", examRef.id);

      // Create default answer key with specific ID
      const answerKeyId = `ak_${examRef.id}_${Date.now()}`;
      const answerKeyData = {
        examId: examRef.id,
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
          choiceLabels: {},
        })),
        ...Object.fromEntries(
          Array.from({ length: numQuestions }, (_, i) => [i.toString(), ""]),
        ),
      };

      console.log("Creating answer key with ID:", answerKeyId);
      await setDoc(doc(db, "answerKeys", answerKeyId), answerKeyData);
      console.log("Answer key created successfully");
      console.log("=== Quiz Creation Complete ===");

      const nextParams = classIdParam
        ? `&classId=${encodeURIComponent(classIdParam)}&tab=exams`
        : "";
      router.replace(`/(tabs)/edit-answer-key?examId=${examRef.id}${nextParams}`);
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

        {!classIdParam && (
          <View style={styles.section}>
            <Text style={styles.formLabel}>Class</Text>
            {classesLoading ? (
              <View style={styles.inlineInfoBox}>
                <ActivityIndicator size="small" color="#1FC27D" />
                <Text style={styles.inlineInfoText}>Loading classes...</Text>
              </View>
            ) : classOptions.length === 0 ? (
              <View style={styles.inlineInfoBox}>
                <Text style={styles.inlineInfoText}>No classes found</Text>
              </View>
            ) : (
              <View style={styles.classButtons}>
                {classOptions.map((cls) => {
                  const selected = selectedClassId === cls.id;
                  return (
                    <TouchableOpacity
                      key={cls.id}
                      style={[styles.lightClassButton, selected && styles.lightClassButtonActive]}
                      onPress={() => setSelectedClassId(cls.id)}
                      disabled={loading}
                    >
                      <Text
                        style={[
                          styles.lightClassButtonText,
                          selected && styles.lightClassButtonTextActive,
                        ]}
                      >
                        {cls.class_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {!!classIdParam && (
          <View style={styles.section}>
            <Text style={styles.formLabel}>Class</Text>
            <View style={styles.inlineInfoBox}>
              <Text style={styles.inlineInfoText}>
                {classOptions.find((cls) => cls.id === selectedClassId)?.class_name || "Selected class"}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.formLabel}>Answer Key</Text>
          <View style={styles.inlineInfoBox}>
            <Text style={styles.inlineInfoText}>
              You&apos;ll set the answer key on the next screen.
            </Text>
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
          onPress={handleSave}
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
});
