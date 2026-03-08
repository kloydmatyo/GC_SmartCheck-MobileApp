import { auth, db } from "@/config/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

type ArchivedMode = "classes" | "exams";

type ArchivedClass = {
  id: string;
  title: string;
  studentCount: number;
  dateLabel: string;
};

type ArchivedExam = {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
};

function formatDateLabel(value: any) {
  if (!value) return "No date";
  const parsed =
    typeof value?.toDate === "function"
      ? value.toDate()
      : typeof value === "string"
        ? new Date(value)
        : value;

  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return "No date";

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ArchivedScreen() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ArchivedMode>("classes");
  const [searchQuery, setSearchQuery] = useState("");
  const [archivedClasses, setArchivedClasses] = useState<ArchivedClass[]>([]);
  const [archivedExams, setArchivedExams] = useState<ArchivedExam[]>([]);

  const loadArchivedItems = useCallback(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        const currentUser = auth.currentUser;
        if (!currentUser) {
          if (active) {
            setArchivedClasses([]);
            setArchivedExams([]);
          }
          return;
        }

        const [classSnapshot, examSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(db, "classes"),
              where("createdBy", "==", currentUser.uid),
              where("isArchived", "==", true),
            ),
          ),
          getDocs(
            query(
              collection(db, "exams"),
              where("createdBy", "==", currentUser.uid),
              where("isArchived", "==", true),
            ),
          ),
        ]);

        if (!active) return;

        setArchivedClasses(
          classSnapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              title: data.class_name || "Archived Class",
              studentCount: Array.isArray(data.students) ? data.students.length : 0,
              dateLabel: formatDateLabel(data.updatedAt || data.createdAt || data.created_at),
            };
          }),
        );

        setArchivedExams(
          examSnapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              title: data.title || "Archived Exam",
              subtitle: data.subject || data.className || "Exam",
              dateLabel: formatDateLabel(data.updatedAt || data.createdAt || data.created_at),
            };
          }),
        );
      } catch (error) {
        console.error("Error loading archived items:", error);
        if (active) {
          setArchivedClasses([]);
          setArchivedExams([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadArchivedItems);

  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return archivedClasses.filter((item) => !q || item.title.toLowerCase().includes(q));
  }, [archivedClasses, searchQuery]);

  const filteredExams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return archivedExams.filter(
      (item) =>
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q),
    );
  }, [archivedExams, searchQuery]);

  const restoreClass = async (id: string) => {
    try {
      await updateDoc(doc(db, "classes", id), { isArchived: false });
      Toast.show({
        type: "success",
        text1: "Restored",
        text2: "Class moved out of Archived",
      });
      loadArchivedItems();
    } catch (error) {
      console.error("Error restoring class:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to restore class",
      });
    }
  };

  const restoreExam = async (id: string) => {
    try {
      await updateDoc(doc(db, "exams", id), { isArchived: false });
      Toast.show({
        type: "success",
        text1: "Restored",
        text2: "Exam moved out of Archived",
      });
      loadArchivedItems();
    } catch (error) {
      console.error("Error restoring exam:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to restore exam",
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Archived Items</Text>

      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.segment, mode === "classes" && styles.segmentActive]}
          onPress={() => setMode("classes")}
        >
          <Text
            style={[styles.segmentText, mode === "classes" && styles.segmentTextActive]}
          >
            Classes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, mode === "exams" && styles.segmentActive]}
          onPress={() => setMode("exams")}
        >
          <Text
            style={[styles.segmentText, mode === "exams" && styles.segmentTextActive]}
          >
            Exams
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="#C4CAD5" />
        <TextInput
          style={styles.searchInput}
          placeholder={
            mode === "classes" ? "Search archived classes..." : "Search archived exams..."
          }
          placeholderTextColor="#C4CAD5"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#20BE7B" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {mode === "classes"
            ? filteredClasses.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardAccent} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <View style={styles.archivedBadge}>
                        <Text style={styles.archivedBadgeText}>Archived</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={() => restoreClass(item.id)}
                      >
                        <Ionicons name="archive-outline" size={18} color="#20BE7B" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Ionicons name="people-outline" size={14} color="#9AA2B1" />
                        <Text style={styles.metaText}>{item.studentCount} students</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={14} color="#9AA2B1" />
                        <Text style={styles.metaText}>{item.dateLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.grayBar} />
                  </View>
                </View>
              ))
            : filteredExams.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardAccent} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <View style={styles.archivedBadge}>
                        <Text style={styles.archivedBadgeText}>Archived</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={() => restoreExam(item.id)}
                      >
                        <Ionicons name="archive-outline" size={18} color="#20BE7B" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.examSubtitle}>{item.subtitle}</Text>
                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={14} color="#9AA2B1" />
                        <Text style={styles.metaText}>{item.dateLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.grayBar} />
                  </View>
                </View>
              ))}

          {mode === "classes" && !filteredClasses.length && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No archived classes</Text>
            </View>
          )}
          {mode === "exams" && !filteredExams.length && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No archived exams</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F8",
    paddingTop: 56,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "#F2F4F7",
    borderRadius: 16,
    padding: 6,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: "#FFFFFF",
  },
  segmentText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#8E97A6",
  },
  segmentTextActive: {
    color: "#1F2937",
  },
  searchWrap: {
    marginHorizontal: 20,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    overflow: "hidden",
    flexDirection: "row",
  },
  cardAccent: {
    width: 6,
    backgroundColor: "#B9BCC2",
  },
  cardBody: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  archivedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  archivedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  restoreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 18,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: "#8E97A6",
  },
  examSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 10,
  },
  grayBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#ECEFF3",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    color: "#8E97A6",
  },
});
