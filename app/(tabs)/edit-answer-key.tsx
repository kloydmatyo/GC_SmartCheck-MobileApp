import ConfirmationModal from "@/components/common/ConfirmationModal";
import StatusModal from "@/components/common/StatusModal";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { auth, db } from "@/config/firebase";
import { NetworkService } from "@/services/networkService";
import { OfflineStorageService } from "@/services/offlineStorageService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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

  const goToQuizzes = () => router.replace("/(tabs)/quizzes");
  const goToExamPreview = () =>
    router.replace(
      `/(tabs)/exam-preview?examId=${examId}&refresh=${Date.now()}`,
    );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [choicesPerItem, setChoicesPerItem] = useState(4);
  const [answerKeyId, setAnswerKeyId] = useState("");
  const [answerKeyVersion, setAnswerKeyVersion] = useState(1);
  const [remoteVersion, setRemoteVersion] = useState(1);
  const [conflictDetected, setConflictDetected] = useState(false);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [incompleteConfirmVisible, setIncompleteConfirmVisible] =
    useState(false);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const pendingSaveResolveRef = useRef<((value: boolean) => void) | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [statusModal, setStatusModal] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
    onClose?: () => void;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  useEffect(() => {
    loadAnswerKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      if (pendingSaveResolveRef.current) {
        pendingSaveResolveRef.current(false);
        pendingSaveResolveRef.current = null;
      }
    };
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
        bg: "#f5f5f5",
        headerBg: "#3d5a3d",
        cardBg: "#ffffff",
        border: "#e0e0e0",
        title: "#333333",
      };

  useEffect(() => {
    if (!answerKeyId || isOffline) return;

    const answerKeyRef = doc(db, "answerKeys", answerKeyId);
    const unsubscribe = onSnapshot(answerKeyRef, (snapshot) => {
      if (!snapshot.exists()) return;

      const data = snapshot.data();
      const latestVersion = Number(data.version ?? 1);

      setRemoteVersion((prev) => (latestVersion > prev ? latestVersion : prev));

      if (latestVersion <= answerKeyVersion) return;

      if (saving) return;

      if (hasLocalChanges) {
        setConflictDetected(true);
        return;
      }

      setAnswers(parseAnswersFromAnswerKey(data, answers.length));
      setAnswerKeyVersion(latestVersion);
      setConflictDetected(false);
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      unsubscribeRef.current = null;
    };
  }, [answerKeyId, isOffline, saving, hasLocalChanges, answerKeyVersion, answers.length]);

  const parseAnswersFromAnswerKey = (
    data: Record<string, any>,
    fallbackCount: number,
  ): QuestionAnswer[] => {
    const settingsAnswers = Array.isArray(data.questionSettings)
      ? data.questionSettings
          .slice()
          .sort((a: any, b: any) => a.questionNumber - b.questionNumber)
          .map((q: any) => String(q.correctAnswer ?? ""))
      : [];

    const numericAnswers = Object.keys(data)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => String(data[key] ?? ""));

    const mergedAnswers =
      settingsAnswers.length > 0 ? settingsAnswers : numericAnswers;

    const totalCount = Math.max(
      fallbackCount,
      mergedAnswers.length,
      Number(data.numItems ?? 0),
      1,
    );

    return Array.from({ length: totalCount }, (_, i) => ({
      questionNumber: i + 1,
      answer: mergedAnswers[i] || "",
    }));
  };

  const resolveAnswerKeyDoc = async (
    examIdStr: string,
    createdAtMillis?: number,
  ): Promise<{ id: string; data: Record<string, any> | null }> => {
    const answerKeysQuery = query(
      collection(db, "answerKeys"),
      where("examId", "==", examIdStr),
    );
    const answerKeysSnapshot = await getDocs(answerKeysQuery);

    if (!answerKeysSnapshot.empty) {
      let selected = answerKeysSnapshot.docs[0];
      let selectedScore =
        Number(selected.data().updatedAt?.toMillis?.() ?? 0) * 1_000_000 +
        Number(selected.data().version ?? 1);

      answerKeysSnapshot.docs.slice(1).forEach((candidate) => {
        const data = candidate.data();
        const score =
          Number(data.updatedAt?.toMillis?.() ?? 0) * 1_000_000 +
          Number(data.version ?? 1);
        if (score > selectedScore) {
          selected = candidate;
          selectedScore = score;
        }
      });

      return {
        id: selected.id,
        data: selected.data() as Record<string, any>,
      };
    }

    if (createdAtMillis) {
      return { id: `ak_${examIdStr}_${createdAtMillis}`, data: null };
    }

    return { id: `ak_${examIdStr}`, data: null };
  };

  const loadAnswerKey = async () => {
    try {
      setLoading(true);

      // Check if we're online
      const online = await NetworkService.isOnline();
      setIsOffline(!online);

      if (online) {
        try {
          // Load exam data from Firebase
          const examRef = doc(db, "exams", examId as string);
          const examSnap = await getDoc(examRef);

          if (!examSnap.exists()) {
            setStatusModal({
              visible: true,
              type: "error",
              title: "Error",
              message: "Exam not found",
              onClose: goToQuizzes,
            });
            return;
          }

          const examData = examSnap.data();

          // Check if exam is in Draft status
          if (examData.status !== "Draft") {
            setStatusModal({
              visible: true,
              type: "error",
              title: "Edit Restricted",
              message: `Cannot edit answer key. Exam status is "${examData.status}". Only Draft exams can be edited.`,
              onClose: goToQuizzes,
            });
            return;
          }

          const numItems = examData.num_items || 20;
          const choices = examData.choices_per_item || 4;
          setChoicesPerItem(choices);

          const resolvedAnswerKey = await resolveAnswerKeyDoc(
            examId as string,
            examData.createdAt?.toMillis?.(),
          );

          setAnswerKeyId(resolvedAnswerKey.id);

          const initialAnswers = resolvedAnswerKey.data
            ? parseAnswersFromAnswerKey(resolvedAnswerKey.data, numItems)
            : Array.from({ length: numItems }, (_, i) => ({
                questionNumber: i + 1,
                answer: "",
              }));

          setAnswers(initialAnswers);
          const loadedVersion = Number(resolvedAnswerKey.data?.version ?? 1);
          setAnswerKeyVersion(loadedVersion);
          setRemoteVersion(loadedVersion);
          setConflictDetected(false);
          setHasLocalChanges(false);
          return;
        } catch (onlineError) {
          console.warn(
            "Failed loading live answer key, attempting offline fallback:",
            onlineError,
          );
        }
      }

      // Offline fallback
      const offlineExam = await OfflineStorageService.getDownloadedExam(
        examId as string,
      );

      if (!offlineExam) {
        setStatusModal({
          visible: true,
          type: "error",
          title: "Offline",
          message:
            "This exam is not available offline. Please connect to the internet or download it first.",
          onClose: goToQuizzes,
        });
        return;
      }

      const numItems = offlineExam.questions?.length || 20;
      const choices = 4;
      setChoicesPerItem(choices);

      const answerKeyIdStr = `ak_${examId}_offline`;
      setAnswerKeyId(answerKeyIdStr);

      const initialAnswers: QuestionAnswer[] = Array.from(
        { length: numItems },
        (_, i) => ({
          questionNumber: i + 1,
          answer: offlineExam.answerKey?.answers?.[i] || "",
        }),
      );

      setAnswers(initialAnswers);
      setAnswerKeyVersion(Number(offlineExam.version ?? 1));
      setRemoteVersion(Number(offlineExam.version ?? 1));
      setConflictDetected(false);
      setHasLocalChanges(false);
    } catch (error) {
      console.error("Error loading answer key:", error);
      setStatusModal({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to load answer key",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionNumber: number, answer: string) => {
    setHasLocalChanges(true);
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
          setIncompleteCount(emptyAnswers.length);
          pendingSaveResolveRef.current = resolve;
          setIncompleteConfirmVisible(true);
        });

        if (!shouldContinue) {
          setSaving(false);
          return;
        }
      }

      // Check if we're offline
      const online = await NetworkService.isOnline();

      if (!online) {
        // Save offline - queue for sync
        const offlineExam = await OfflineStorageService.getDownloadedExam(
          examId as string,
        );
        if (offlineExam) {
          // Update offline exam with new answer key
          const updatedExam = {
            ...offlineExam,
            answerKey: {
              answers: answers.map((a) => a.answer),
              locked: false,
            },
            updatedAt: new Date(),
            version: (offlineExam.version || 1) + 1,
          };

          await OfflineStorageService.downloadExam(updatedExam);

          // Queue update for sync
          await OfflineStorageService.queueUpdate(examId as string, "update", {
            answerKey: updatedExam.answerKey,
          });

          setStatusModal({
            visible: true,
            type: "success",
            title: "Saved Offline",
            message:
              "Answer key saved offline. Changes will sync when you're back online.",
            onClose: goToQuizzes,
          });
        }
        return;
      }

      // Online - save to Firebase
      if (conflictDetected || remoteVersion > answerKeyVersion) {
        setStatusModal({
          visible: true,
          type: "error",
          title: "Conflict Detected",
          message:
            "This answer key was updated on another device. We reloaded the latest version. Please review and save again.",
          onClose: loadAnswerKey,
        });
        return;
      }

      let nextVersion = 1;
      const examRef = doc(db, "exams", examId as string);
      const answerKeyRef = doc(db, "answerKeys", answerKeyId);

      await runTransaction(db, async (transaction) => {
        const [examSnap, answerKeySnap] = await Promise.all([
          transaction.get(examRef),
          transaction.get(answerKeyRef),
        ]);

        if (!examSnap.exists()) {
          throw new Error("Exam not found");
        }

        const examData = examSnap.data();
        if (examData.status !== "Draft") {
          throw new Error(
            `Cannot edit answer key. Exam status is "${examData.status}".`,
          );
        }

        const serverVersion = Number(answerKeySnap.data()?.version ?? 1);
        if (answerKeySnap.exists() && serverVersion !== answerKeyVersion) {
          throw new Error(
            `Answer key version conflict. Current version is ${serverVersion}.`,
          );
        }

        nextVersion = answerKeySnap.exists() ? serverVersion + 1 : 1;

        const answerKeyData: Record<string, any> = {
          examId: examId as string,
          id: answerKeyId,
          createdBy:
            answerKeySnap.data()?.createdBy || auth.currentUser?.uid || null,
          createdAt: answerKeySnap.data()?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
          locked: false,
          version: nextVersion,
          questionSettings: answers.map((item) => ({
            questionNumber: item.questionNumber,
            correctAnswer: item.answer,
            points: 1,
            choiceLabels: {},
          })),
          numItems: answers.length,
        };

        answers.forEach((item, index) => {
          answerKeyData[index.toString()] = item.answer;
        });

        transaction.set(answerKeyRef, answerKeyData, { merge: true });
      });

      setAnswerKeyVersion(nextVersion);
      setRemoteVersion(nextVersion);
      setConflictDetected(false);
      setHasLocalChanges(false);

      setStatusModal({
        visible: true,
        type: "success",
        title: "Success",
        message: "Answer key saved successfully!",
        onClose: goToQuizzes,
      });
    } catch (error) {
      console.error("Error saving answer key:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save answer key";
      const isConflict = /conflict/i.test(errorMessage);

      setStatusModal({
        visible: true,
        type: isConflict ? "info" : "error",
        title: isConflict ? "Conflict Detected" : "Error",
        message: isConflict
          ? "Another device saved newer answer key changes. We loaded the latest data. Please re-apply your edits and save again."
          : "Failed to save answer key",
        onClose: isConflict ? loadAnswerKey : undefined,
      });
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
      <View
        style={[
          styles.questionCard,
          {
            backgroundColor: darkModeEnabled ? "#1f2b26" : "#fff",
            borderColor: darkModeEnabled ? "#34483f" : "#e0e0e0",
          },
        ]}
      >
        <Text style={[styles.questionNumber, { color: darkModeEnabled ? "#e7f1eb" : "#333" }]}>
          Question {item.questionNumber}
        </Text>
        <View style={styles.choicesContainer}>
          {choices.map((choice) => (
            <TouchableOpacity
              key={choice}
                style={[
                  styles.choiceButton,
                  darkModeEnabled && {
                    backgroundColor: "#2a3a33",
                    borderColor: "#34483f",
                  },
                  item.answer === choice && styles.choiceButtonSelected,
                ]}
              onPress={() => handleAnswerSelect(item.questionNumber, choice)}
              disabled={loading || saving}
            >
                <Text
                  style={[
                    styles.choiceText,
                    darkModeEnabled && { color: "#9db1a6" },
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
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
          <TouchableOpacity style={styles.backButton} onPress={goToQuizzes}>
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
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity style={styles.backButton} onPress={goToQuizzes}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Answer Key</Text>
        {isOffline ? (
          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
          </View>
        ) : (
          <View style={styles.placeholder} />
        )}
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
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
          },
        ]}
      >
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

      <ConfirmationModal
        visible={incompleteConfirmVisible}
        title="Incomplete Answer Key"
        message={`${incompleteCount} question(s) don't have answers yet. Save anyway?`}
        cancelText="Cancel"
        confirmText="Save Anyway"
        onCancel={() => {
          setIncompleteConfirmVisible(false);
          pendingSaveResolveRef.current?.(false);
          pendingSaveResolveRef.current = null;
        }}
        onConfirm={() => {
          setIncompleteConfirmVisible(false);
          pendingSaveResolveRef.current?.(true);
          pendingSaveResolveRef.current = null;
        }}
      />

      <StatusModal
        visible={statusModal.visible}
        type={statusModal.type}
        title={statusModal.title}
        message={statusModal.message}
        onClose={() => {
          const onClose = statusModal.onClose;
          setStatusModal({
            visible: false,
            type: "info",
            title: "",
            message: "",
          });
          if (onClose) onClose();
        }}
      />
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
  offlineBadge: {
    backgroundColor: "#ff9800",
    borderRadius: 16,
    padding: 6,
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
    flexWrap: "wrap",
  },
  choiceButton: {
    width: 44,
    height: 44,
    backgroundColor: "#f5f5f5",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
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
