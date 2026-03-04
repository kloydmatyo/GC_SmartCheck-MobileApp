import ConfirmationModal from "@/components/common/ConfirmationModal";
import StatusModal from "@/components/common/StatusModal";
import { auth, db } from "@/config/firebase";
import { UserService } from "@/services/userService";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
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
        subject: subject.trim() || "General",
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
        answer_keys: [],
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

      setCreatedExamId(examRef.id);
      setPostSaveConfirmVisible(true);
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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goToQuizzes}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Quiz</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Quiz Name */}
        <View style={styles.section}>
          <Text style={styles.label}>QUIZ NAME *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Midterm Exam - BSIT - 3B"
            placeholderTextColor="#8B9D8B"
            value={quizName}
            onChangeText={setQuizName}
            editable={!loading}
          />
        </View>

        {/* Number of Questions */}
        <View style={styles.section}>
          <Text style={styles.label}>NUMBER OF QUESTIONS *</Text>
          <View style={styles.choiceButtons}>
            {NUM_QUESTIONS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.choiceButton,
                  numQuestions === option && styles.choiceButtonActive,
                ]}
                onPress={() => setNumQuestions(option)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.choiceButtonText,
                    numQuestions === option && styles.choiceButtonTextActive,
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
          <Text style={styles.label}>CHOICES PER ITEM *</Text>
          <View style={styles.choiceButtons}>
            <TouchableOpacity
              style={[
                styles.choiceButton,
                choicesPerItem === 4 && styles.choiceButtonActive,
              ]}
              onPress={() => setChoicesPerItem(4)}
              disabled={loading}
            >
              <Text
                style={[
                  styles.choiceButtonText,
                  choicesPerItem === 4 && styles.choiceButtonTextActive,
                ]}
              >
                A-D (4 choices)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.choiceButton,
                choicesPerItem === 5 && styles.choiceButtonActive,
              ]}
              onPress={() => setChoicesPerItem(5)}
              disabled={loading}
            >
              <Text
                style={[
                  styles.choiceButtonText,
                  choicesPerItem === 5 && styles.choiceButtonTextActive,
                ]}
              >
                A-E (5 choices)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Class Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>CLASS *</Text>
          {classesLoading ? (
            <View style={styles.loadingClassesRow}>
              <ActivityIndicator size="small" color="#E8F5E9" />
              <Text style={styles.loadingClassesText}>Loading classes...</Text>
            </View>
          ) : classOptions.length === 0 ? (
            <View style={styles.emptyClassesBox}>
              <Text style={styles.emptyClassesText}>No classes found</Text>
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
                      selected && styles.classButtonActive,
                    ]}
                    onPress={() => setSelectedClassId(cls.id)}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.classButtonTitle,
                        selected && styles.classButtonTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {cls.class_name}
                    </Text>
                    <Text
                      style={[
                        styles.classButtonSubtitle,
                        selected && styles.classButtonTextActive,
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
          <Text style={styles.label}>EXAM TYPE *</Text>
          <View style={styles.choiceButtons}>
            <TouchableOpacity
              style={[
                styles.choiceButton,
                examType === "board" && styles.choiceButtonActive,
              ]}
              onPress={() => setExamType("board")}
              disabled={loading}
            >
              <Text
                style={[
                  styles.choiceButtonText,
                  examType === "board" && styles.choiceButtonTextActive,
                ]}
              >
                Board Exam
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.choiceButton,
                examType === "diagnostic" && styles.choiceButtonActive,
              ]}
              onPress={() => setExamType("diagnostic")}
              disabled={loading}
            >
              <Text
                style={[
                  styles.choiceButtonText,
                  examType === "diagnostic" && styles.choiceButtonTextActive,
                ]}
              >
                Diagnostic Test
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Exam Date */}
        <View style={styles.section}>
          <Text style={styles.label}>EXAM DATE *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
            disabled={loading}
          >
            <Ionicons name="calendar-outline" size={20} color="#E8F5E9" />
            <Text style={styles.dateButtonText}>
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

        {/* Folder / Subject (Optional) */}
        <View style={styles.section}>
          <Text style={styles.label}>FOLDER / SUBJECT (OPTIONAL)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Mathematics, Science"
            placeholderTextColor="#8B9D8B"
            value={subject}
            onChangeText={setSubject}
            editable={!loading}
          />
        </View>

        {/* Manual Editing Section */}
        <View style={styles.manualSection}>
          <View style={styles.manualHeader}>
            <Text style={styles.manualTitle}>Manual Editing</Text>
            <Text style={styles.manualSubtitle}>
              Set the correct options for each question to enable automatic
              grading.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEditAnswerKey}
            disabled={loading}
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.editButtonText}>Edit Answer Key</Text>
          </TouchableOpacity>
        </View>

        {/* Answer Key Section */}
        <View style={styles.section}>
          <Text style={styles.label}>ANSWER KEY</Text>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={handleScanAnswerKey}
            disabled={loading}
          >
            <Ionicons name="camera-outline" size={32} color="#E8F5E9" />
            <View style={styles.scanTextContainer}>
              <Text style={styles.scanTitle}>Scan Answer Key</Text>
              <Text style={styles.scanSubtitle}>
                Use the camera scanner to scan the answer key
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
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
