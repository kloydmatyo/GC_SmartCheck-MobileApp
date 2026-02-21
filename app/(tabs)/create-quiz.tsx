import { auth, db } from "@/config/firebase";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import StatusModal from "@/components/common/StatusModal";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    addDoc,
    collection,
    doc,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import React, { useState } from "react";
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

export default function CreateQuizScreen() {
  const router = useRouter();
  const goToQuizzes = () => router.replace("/(tabs)/quizzes");
  const [loading, setLoading] = useState(false);

  // Form state
  const [quizName, setQuizName] = useState("");
  const [numQuestions, setNumQuestions] = useState("");
  const [subject, setSubject] = useState("");
  const [examType, setExamType] = useState("Diagnostic Test");
  const [choicesPerItem, setChoicesPerItem] = useState(4);
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

    const questionsCount = parseInt(numQuestions);
    if (!numQuestions || isNaN(questionsCount) || questionsCount <= 0) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Please enter a valid number of questions",
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

      const currentDate = new Date().toISOString().split("T")[0];

      // Create exam document
      const examData = {
        title: quizName.trim(),
        subject: subject.trim() || "N/A",
        examType: examType,
        num_items: questionsCount,
        choices_per_item: choicesPerItem,
        status: "draft",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        created_at: currentDate,
        approvedAt: null,
        approvedBy: null,
        classId: null,
        className: "N/A",
        examCode: null,
        logoUrl: null,
        student_id_length: 6,
        answer_keys: [],
        generated_sheets: [],
        choicePoints: {},
      };

      console.log("Creating exam with data:", examData);
      const examRef = await addDoc(collection(db, "exams"), examData);
      console.log("Exam created with ID:", examRef.id);

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
        questionSettings: Array.from({ length: questionsCount }, (_, i) => ({
          questionNumber: i + 1,
          correctAnswer: "",
          points: 1,
          choiceLabels: {},
        })),
        // Initialize empty answers
        ...Object.fromEntries(
          Array.from({ length: questionsCount }, (_, i) => [i.toString(), ""]),
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={goToQuizzes}
        >
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
          <Text style={styles.label}>QUIZ NAME</Text>
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
          <Text style={styles.label}>NUMBER OF QUESTIONS</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 10, 50, 100"
            placeholderTextColor="#8B9D8B"
            keyboardType="number-pad"
            value={numQuestions}
            onChangeText={setNumQuestions}
            editable={!loading}
          />
        </View>

        {/* Subject (Optional) */}
        <View style={styles.section}>
          <Text style={styles.label}>SUBJECT (OPTIONAL)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Mathematics, Science"
            placeholderTextColor="#8B9D8B"
            value={subject}
            onChangeText={setSubject}
            editable={!loading}
          />
        </View>

        {/* Choices Per Item */}
        <View style={styles.section}>
          <Text style={styles.label}>CHOICES PER ITEM</Text>
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
    backgroundColor: "#2d7a5f",
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
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
    backgroundColor: "#2d7a5f",
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
