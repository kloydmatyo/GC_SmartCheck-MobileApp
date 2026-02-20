import { auth, db } from "@/config/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface QuestionAnswer {
  questionNumber: number;
  answer: string;
}

export default function EditAnswerKeyScreen() {
  const router = useRouter();
  const { examId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [choicesPerItem, setChoicesPerItem] = useState(4);
  const [answerKeyId, setAnswerKeyId] = useState("");

  useEffect(() => {
    loadAnswerKey();
  }, [examId]);

  const loadAnswerKey = async () => {
    try {
      setLoading(true);

      // Load exam data
      const examRef = doc(db, "exams", examId as string);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        Alert.alert("Error", "Exam not found");
        router.back();
        return;
      }

      const examData = examSnap.data();
      const numItems = examData.num_items || 20;
      const choices = examData.choices_per_item || 4;
      setChoicesPerItem(choices);

      // Try to find existing answer key
      const answerKeyIdStr = `ak_${examId}_${examData.createdAt?.toMillis() || Date.now()}`;
      setAnswerKeyId(answerKeyIdStr);

      // Try to load existing answer key
      const answerKeyRef = doc(db, "answerKeys", answerKeyIdStr);
      const answerKeySnap = await getDoc(answerKeyRef);

      let initialAnswers: QuestionAnswer[] = [];

      if (answerKeySnap.exists()) {
        // Load existing answers
        const answerKeyData = answerKeySnap.data();
        initialAnswers = Array.from({ length: numItems }, (_, i) => ({
          questionNumber: i + 1,
          answer: answerKeyData[i.toString()] || "",
        }));
      } else {
        // Initialize empty answers
        initialAnswers = Array.from({ length: numItems }, (_, i) => ({
          questionNumber: i + 1,
          answer: "",
        }));
      }

      setAnswers(initialAnswers);
    } catch (error) {
      console.error("Error loading answer key:", error);
      Alert.alert("Error", "Failed to load answer key");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionNumber: number, answer: string) => {
    setAnswers((prev) =>
      prev.map((item) =>
        item.questionNumber === questionNumber ? { ...item, answer } : item,
      ),
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Check for incomplete answers (warning, not blocking)
      const emptyAnswers = answers.filter((a) => !a.answer);
      if (emptyAnswers.length > 0) {
        const shouldContinue = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Incomplete Answer Key",
            `${emptyAnswers.length} question(s) don't have answers yet. Save anyway?`,
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Save Anyway", onPress: () => resolve(true) },
            ],
          );
        });

        if (!shouldContinue) {
          setSaving(false);
          return;
        }
      }

      // Prepare answer key data
      const answerKeyData: any = {
        examId: examId as string,
        id: answerKeyId,
        createdBy: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        locked: false,
        version: 1,
        questionSettings: answers.map((item) => ({
          questionNumber: item.questionNumber,
          correctAnswer: item.answer,
          points: 1,
          choiceLabels: {},
        })),
      };

      // Add individual answer fields (0, 1, 2, etc.)
      answers.forEach((item, index) => {
        answerKeyData[index.toString()] = item.answer;
      });

      // Save answer key document (create or update)
      const answerKeyRef = doc(db, "answerKeys", answerKeyId);
      await setDoc(answerKeyRef, answerKeyData, { merge: true });

      Alert.alert("Success", "Answer key saved successfully!", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error("Error saving answer key:", error);
      Alert.alert("Error", "Failed to save answer key");
    } finally {
      setSaving(false);
    }
  };

  const getChoiceOptions = () => {
    const options = ["A", "B", "C", "D"];
    if (choicesPerItem === 5) {
      options.push("E");
    }
    return options;
  };

  const renderQuestion = ({ item }: { item: QuestionAnswer }) => {
    const choices = getChoiceOptions();

    return (
      <View style={styles.questionCard}>
        <Text style={styles.questionNumber}>
          Question {item.questionNumber}
        </Text>
        <View style={styles.choicesContainer}>
          {choices.map((choice) => (
            <TouchableOpacity
              key={choice}
              style={[
                styles.choiceButton,
                item.answer === choice && styles.choiceButtonSelected,
              ]}
              onPress={() => handleAnswerSelect(item.questionNumber, choice)}
              disabled={loading || saving}
            >
              <Text
                style={[
                  styles.choiceText,
                  item.answer === choice && styles.choiceTextSelected,
                ]}
              >
                {choice}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Answer Key</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2d7a5f" />
          <Text style={styles.loadingText}>Loading answer key...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Answer Key</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Questions List */}
      <FlatList
        data={answers}
        renderItem={renderQuestion}
        keyExtractor={(item) => item.questionNumber.toString()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={24}
                color="#fff"
              />
              <Text style={styles.saveButtonText}>Save Answer Key</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
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
    paddingTop: 50,
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  questionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  questionNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  choicesContainer: {
    flexDirection: "row",
    gap: 8,
  },
  choiceButton: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  choiceButtonSelected: {
    backgroundColor: "#2d7a5f",
    borderColor: "#2d7a5f",
  },
  choiceText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  choiceTextSelected: {
    color: "#fff",
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
