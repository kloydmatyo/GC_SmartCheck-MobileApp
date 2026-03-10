import ConfirmationModal from "@/components/common/ConfirmationModal";
import StatusModal from "@/components/common/StatusModal";
import { auth, db } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { ExamService } from "@/services/examService";
import { UserService } from "@/services/userService";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
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

interface ClassOption {
  id: string;
  class_name: string;
  section_block?: string;
  course_subject?: string;
  isArchived?: boolean;
}

const formatDateForStorage = (date: Date): string =>
  date.toISOString().split("T")[0];

const formatDateForDisplay = (date: Date): string =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const toStartOfDay = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export default function CreateQuizScreen() {
  const router = useRouter();
  const goToQuizzes = () => router.replace("/(tabs)/quizzes");
  const [loading, setLoading] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // Form state
  const [quizName, setQuizName] = useState("");
  const [numQuestions, setNumQuestions] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [examType, setExamType] = useState<"board" | "diagnostic" | null>(
    null,
  );
  const [choicesPerItem, setChoicesPerItem] = useState<number | null>(null);
  const [examDate, setExamDate] = useState<Date | null>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [postSaveConfirmVisible, setPostSaveConfirmVisible] = useState(false);
  const [createdExamId, setCreatedExamId] = useState("");
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
      setExamType(null);
      setChoicesPerItem(null);
      setExamDate(new Date());
      setShowDatePicker(false);
      setSelectedClassId(null);
      setCreatedExamId("");
      setLoading(false);

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
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
              ]);

              classes = classesSnapshot.docs
                .map((classDoc: any) => ({
                  id: classDoc.id,
                  ...(classDoc.data() as Omit<ClassOption, "id">),
                }))
                .filter((cls: any) => !cls.isArchived);
            } catch (err) {
              console.warn("Firestore classes fetch failed, falling back to cache", err);
            }
          }

          // Fallback to cache if offline or Firestore query failed
          if (!isOnline || classes.length === 0) {
            const { RealmService } = await import("@/services/realmService");
            const cacheRealm = await RealmService.getCacheRealm();
            const cachedClasses = cacheRealm.objects<any>("ClassCache").filtered(`createdBy == "${currentUser.uid}"`);

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
    }, []),
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

  const handleDateChange = (_event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      const today = toStartOfDay(new Date());
      const picked = toStartOfDay(selectedDate);
      setExamDate(picked < today ? today : selectedDate);
    }
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

    if (!choicesPerItem) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please select choices per item",
      });
      return;
    }

    if (!examType) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please select an exam type",
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

      // Generate exam code
      const generateExamCode = (title: string, date: string): string => {
        const initials = title.trim().substring(0, 3).toUpperCase();
        const dateCode = date.replace(/-/g, "");
        const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `${initials}-${dateCode}-${randomSuffix}`;
      };

      const examCode = generateExamCode(quizName.trim(), currentDate);

      // Prepare exam data
      const baseExamData = {
        title: quizName.trim(),
        subject: subject.trim() || "General",
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
        setStatusModal({
          visible: true,
          type: "success",
          title: "Saved Offline",
          message: "Quiz saved locally. Redirecting to answer key...",
        });
        setTimeout(() => {
          setStatusModal(prev => ({ ...prev, visible: false }));
          router.replace(`/(tabs)/edit-answer-key?examId=${result}`);
        }, 1500);
        return;
      }

      const newExamId = result;
      setCreatedExamId(newExamId);

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

      setCreatedExamId(newExamId);
      // Automatically go to edit answer key instead of showing a modal
      router.replace(`/(tabs)/edit-answer-key?examId=${newExamId}`);
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

  const handleEditAnswerKey = () => {
    setStatusModal({
      visible: true,
      type: "info",
      title: "Save First",
      message: "Please save the quiz first before editing the answer key",
    });
  };

  const handleScanAnswerKey = () => {
    setStatusModal({
      visible: true,
      type: "info",
      title: "Save First",
      message: "Please save the quiz first before scanning the answer key",
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.screenBg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity style={styles.backButton} onPress={goToQuizzes}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create New Quiz</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Quiz Name */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: darkModeEnabled ? "#b9c9c0" : "#666" }]}>QUIZ NAME *</Text>
          <TextInput
            style={[
              styles.input,
              darkModeEnabled && {
                backgroundColor: "#2a3a33",
                borderWidth: 1,
                borderColor: "#34483f",
                color: "#e7f1eb",
              },
            ]}
            placeholder="e.g., Midterm Exam - BSIT - 3B"
            placeholderTextColor={darkModeEnabled ? "#8fa39a" : "#8B9D8B"}
            value={quizName}
            onChangeText={setQuizName}
            editable={!loading}
          />
        </View>

        {/* Number of Questions */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: darkModeEnabled ? "#b9c9c0" : "#666" }]}>NUMBER OF QUESTIONS *</Text>
          <View style={styles.choiceButtons}>
            {NUM_QUESTIONS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.choiceButton,
                  darkModeEnabled && {
                    backgroundColor: "#2a3a33",
                    borderColor: "#34483f",
                  },
                  numQuestions === option && styles.choiceButtonActive,
                  darkModeEnabled &&
                  numQuestions === option && {
                    backgroundColor: "#1f3a2f",
                    borderColor: "#8fd1ad",
                  },
                ]}
                onPress={() => setNumQuestions(option)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.choiceButtonText,
                    darkModeEnabled && { color: "#dbe8e1" },
                    numQuestions === option && styles.choiceButtonTextActive,
                    darkModeEnabled &&
                    numQuestions === option && { color: "#8fd1ad" },
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Subject (Optional) */}
        {/* Choices Per Item */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: darkModeEnabled ? "#b9c9c0" : "#666" }]}>CHOICES PER ITEM *</Text>
          <View style={styles.choiceButtons}>
            <TouchableOpacity
              style={[
                styles.choiceButton,
                darkModeEnabled && {
                  backgroundColor: "#2a3a33",
                  borderColor: "#34483f",
                },
                choicesPerItem === 4 && styles.choiceButtonActive,
                darkModeEnabled &&
                choicesPerItem === 4 && {
                  backgroundColor: "#1f3a2f",
                  borderColor: "#8fd1ad",
                },
              ]}
              onPress={() => setChoicesPerItem(4)}
              disabled={loading}
            >
              <Text
                style={[
                  styles.choiceButtonText,
                  darkModeEnabled && { color: "#dbe8e1" },
                  choicesPerItem === 4 && styles.choiceButtonTextActive,
                  darkModeEnabled &&
                  choicesPerItem === 4 && { color: "#8fd1ad" },
                ]}
              >
                A-D (4 choices)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.choiceButton,
                darkModeEnabled && {
                  backgroundColor: "#2a3a33",
                  borderColor: "#34483f",
                },
                choicesPerItem === 5 && styles.choiceButtonActive,
                darkModeEnabled &&
                choicesPerItem === 5 && {
                  backgroundColor: "#1f3a2f",
                  borderColor: "#8fd1ad",
                },
              ]}
              onPress={() => setChoicesPerItem(5)}
              disabled={loading}
            >
              <Text
                style={[
                  styles.choiceButtonText,
                  darkModeEnabled && { color: "#dbe8e1" },
                  choicesPerItem === 5 && styles.choiceButtonTextActive,
                  darkModeEnabled &&
                  choicesPerItem === 5 && { color: "#8fd1ad" },
                ]}
              >
                A-E (5 choices)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Class Selection */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: darkModeEnabled ? "#b9c9c0" : "#666" }]}>CLASS *</Text>
          {classesLoading ? (
            <View
              style={[
                styles.loadingClassesRow,
                darkModeEnabled && {
                  backgroundColor: "#2a3a33",
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <ActivityIndicator size="small" color="#E8F5E9" />
              <Text style={[styles.loadingClassesText, darkModeEnabled && { color: "#b9c9c0" }]}>Loading classes...</Text>
            </View>
          ) : classOptions.length === 0 ? (
            <View
              style={[
                styles.emptyClassesBox,
                darkModeEnabled && {
                  backgroundColor: "#2a3a33",
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.emptyClassesText, darkModeEnabled && { color: "#b9c9c0" }]}>No classes found</Text>
            </View>
          ) : (
            <View style={styles.classButtons}>
              {classOptions.map((cls) => {
                const selected = selectedClassId === cls.id;
                return (
                  <TouchableOpacity
                    key={cls.id}
                    style={[
                      styles.classButton,
                      darkModeEnabled && {
                        backgroundColor: "#2a3a33",
                        borderColor: colors.border,
                      },
                      selected && styles.classButtonActive,
                      darkModeEnabled &&
                      selected && {
                        backgroundColor: colors.primary,
                        borderColor: colors.accent,
                      },
                    ]}
                    onPress={() => setSelectedClassId(cls.id)}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.classButtonTitle,
                        darkModeEnabled && { color: "#e7f1eb" },
                        selected && styles.classButtonTextActive,
                        darkModeEnabled && selected && { color: "#8fd1ad" },
                      ]}
                      numberOfLines={1}
                    >
                      {cls.class_name}
                    </Text>
                    <Text
                      style={[
                        styles.classButtonSubtitle,
                        darkModeEnabled && { color: "#b9c9c0" },
                        selected && styles.classButtonTextActive,
                        darkModeEnabled && selected && { color: "#8fd1ad" },
                      ]}
                      numberOfLines={1}
                    >
                      {cls.section_block || cls.course_subject || "Class"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Exam Type */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: darkModeEnabled ? "#b9c9c0" : "#666" }]}>EXAM TYPE *</Text>
          <View style={styles.choiceButtons}>
            <TouchableOpacity
              style={[
                styles.choiceButton,
                darkModeEnabled && {
                  backgroundColor: "#2a3a33",
                  borderColor: "#34483f",
                },
                examType === "board" && styles.choiceButtonActive,
                darkModeEnabled &&
                examType === "board" && {
                  backgroundColor: "#1f3a2f",
                  borderColor: "#8fd1ad",
                },
              ]}
              onPress={() => setExamType("board")}
              disabled={loading}
            >
              <Text
                style={[
                  styles.choiceButtonText,
                  darkModeEnabled && { color: "#dbe8e1" },
                  examType === "board" && styles.choiceButtonTextActive,
                  darkModeEnabled &&
                  examType === "board" && { color: "#8fd1ad" },
                ]}
              >
                Board Exam
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.choiceButton,
                darkModeEnabled && {
                  backgroundColor: "#2a3a33",
                  borderColor: "#34483f",
                },
                examType === "diagnostic" && styles.choiceButtonActive,
                darkModeEnabled &&
                examType === "diagnostic" && {
                  backgroundColor: "#1f3a2f",
                  borderColor: "#8fd1ad",
                },
              ]}
              onPress={() => setExamType("diagnostic")}
              disabled={loading}
            >
              <Text
                style={[
                  styles.choiceButtonText,
                  darkModeEnabled && { color: "#dbe8e1" },
                  examType === "diagnostic" && styles.choiceButtonTextActive,
                  darkModeEnabled &&
                  examType === "diagnostic" && { color: "#8fd1ad" },
                ]}
              >
                Diagnostic Test
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Exam Date */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: darkModeEnabled ? "#b9c9c0" : "#666" }]}>EXAM DATE *</Text>
          <TouchableOpacity
            style={[
              styles.dateButton,
              darkModeEnabled && {
                backgroundColor: "#2a3a33",
                borderColor: "#34483f",
              },
            ]}
            onPress={() => setShowDatePicker(true)}
            disabled={loading}
          >
            <Ionicons name="calendar-outline" size={20} color={darkModeEnabled ? "#8fd1ad" : "#E8F5E9"} />
            <Text style={[styles.dateButtonText, darkModeEnabled && { color: "#e7f1eb" }]}>
              {examDate ? formatDateForDisplay(examDate) : "Select exam date"}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={examDate || new Date()}
              mode="date"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}
        </View>

       {/* Manual Editing Section */}
        <View
          style={[
            styles.manualSection,
            darkModeEnabled && {
              backgroundColor: "#2a3a33",
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.manualHeader}>
            <Text style={[styles.manualTitle, darkModeEnabled && { color: "#e7f1eb" }]}>Manual Editing</Text>
            <Text style={[styles.manualSubtitle, darkModeEnabled && { color: "#b9c9c0" }]}>
              Set the correct options for each question to enable automatic
              grading.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.editButton,
              darkModeEnabled && {
                backgroundColor: colors.primary,
                borderColor: colors.primaryDark,
              },
            ]}
            onPress={handleEditAnswerKey}
            disabled={loading}
          >
            <Ionicons
              name="create-outline"
              size={20}
              color={darkModeEnabled ? colors.accent : "#fff"}
            />
            <Text style={[styles.editButtonText, darkModeEnabled && { color: colors.accent }]}>Edit Answer Key</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Save Button */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.screenBg,
            borderTopColor: darkModeEnabled ? colors.border : "#e0e0e0",
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.saveButton,
            darkModeEnabled && {
              backgroundColor: colors.primary,
              borderWidth: 1,
              borderColor: colors.primaryDark,
            },
            loading && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={24} color="#fff" />
              <Text style={styles.saveButtonText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ConfirmationModal
        visible={postSaveConfirmVisible}
        title="Quiz Created"
        message="Quiz created successfully. Would you like to edit the answer key now?"
        cancelText="Later"
        confirmText="Edit Answer Key"
        onCancel={() => {
          setPostSaveConfirmVisible(false);
          setCreatedExamId("");
          goToQuizzes();
        }}
        onConfirm={() => {
          if (!createdExamId) return;
          setPostSaveConfirmVisible(false);
          router.replace(`/(tabs)/edit-answer-key?examId=${createdExamId}`);
          setCreatedExamId("");
        }}
      />

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
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#3d5a3d",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#E8F5E9",
  },
  choiceButtons: {
    flexDirection: "row",
    gap: 12,
  },
  choiceButton: {
    flex: 1,
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#3d5a3d",
  },
  choiceButtonActive: {
    backgroundColor: "#2d4a2d",
    borderColor: "#4CAF50",
  },
  choiceButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#E8F5E9",
  },
  choiceButtonTextActive: {
    color: "#4CAF50",
  },
  classButtons: {
    gap: 10,
  },
  classButton: {
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: "#3d5a3d",
  },
  classButtonActive: {
    backgroundColor: "#2d4a2d",
    borderColor: "#4CAF50",
  },
  classButtonTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#E8F5E9",
    marginBottom: 3,
  },
  classButtonSubtitle: {
    fontSize: 12,
    color: "#B8D4B8",
  },
  classButtonTextActive: {
    color: "#4CAF50",
  },
  loadingClassesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 14,
  },
  loadingClassesText: {
    fontSize: 13,
    color: "#B8D4B8",
  },
  emptyClassesBox: {
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 14,
  },
  emptyClassesText: {
    fontSize: 13,
    color: "#B8D4B8",
  },
  dateButton: {
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#3d5a3d",
  },
  dateButtonText: {
    fontSize: 15,
    color: "#E8F5E9",
    fontWeight: "600",
  },
  manualSection: {
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  manualHeader: {
    marginBottom: 16,
  },
  manualTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#E8F5E9",
    marginBottom: 8,
  },
  manualSubtitle: {
    fontSize: 13,
    color: "#B8D4B8",
    lineHeight: 18,
  },
  editButton: {
    backgroundColor: "#2d4a2d",
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#4CAF50",
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4CAF50",
  },
  scanButton: {
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  scanTextContainer: {
    flex: 1,
  },
  scanTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#E8F5E9",
    marginBottom: 4,
  },
  scanSubtitle: {
    fontSize: 13,
    color: "#B8D4B8",
    lineHeight: 18,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#f5f5f5",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  saveButton: {
    backgroundColor: "#3d5a3d",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
});
