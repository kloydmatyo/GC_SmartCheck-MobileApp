import { auth, db } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    LayoutAnimation,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from "react-native";
import Toast from "react-native-toast-message";
import { COLORS, RADIUS } from "../../constants/theme";
import { ClassService } from "../../services/classService";
import { Class } from "../../types/class";

interface RecentQuiz {
  id: string;
  title: string;
  date: string;
}

export default function ClassesScreen() {
  const router = useRouter();
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [classMenuVisible, setClassMenuVisible] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [collapsedRecent, setCollapsedRecent] = useState<
    Record<string, boolean>
  >({});
  const [recentQuizzes, setRecentQuizzes] = useState<
    Record<string, RecentQuiz[]>
  >({});
  const [blockPickerVisible, setBlockPickerVisible] = useState(false);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const openClassList = (classId: string) => {
    router.push(`/(tabs)/class-details?classId=${classId}&mode=list`);
  };

  // Form state
  const [formData, setFormData] = useState({
    class_name: "",
    course_subject: "",
    room: "",
    section_block: "",
  });

  // Fetch recent quizzes for each class
  const loadRecentQuizzes = async (classIds: string[]) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || classIds.length === 0) return;

      const q = query(
        collection(db, "exams"),
        where("createdBy", "==", currentUser.uid),
      );
      const snapshot = await getDocs(q);

      const byClass: Record<string, RecentQuiz[]> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const cid: string | undefined = data.classId;
        if (!cid || !classIds.includes(cid)) return;

        const rawDate =
          data.createdAt?.toDate?.() ||
          (data.created_at ? new Date(data.created_at) : null);
        const dateStr = rawDate
          ? rawDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "";

        if (!byClass[cid]) byClass[cid] = [];
        byClass[cid].push({
          id: docSnap.id,
          title: data.title || "Untitled",
          date: dateStr,
        });
      });

      // Keep only 5 most recent per class (already sorted by Firestore insertion order)
      Object.keys(byClass).forEach((cid) => {
        byClass[cid] = byClass[cid].slice(0, 5);
      });

      setRecentQuizzes(byClass);
    } catch (error) {
      console.error("Error loading recent quizzes:", error);
    }
  };

  // Load classes from Firebase
  const loadClasses = async () => {
    try {
      setLoading(true);
      const fetchedClasses = await ClassService.getClassesByUser();
      setClasses(fetchedClasses);
      await loadRecentQuizzes(fetchedClasses.map((c) => c.id));
    } catch (error) {
      console.error("Error loading classes:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load classes",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reload classes when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadClasses();
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
        screenBg: "#111815",
        headerBg: "#1a2520",
        headerBorder: "#2b3b34",
        title: "#e7f1eb",
        primary: "#1f3a2f",
        primaryDark: "#2b3b34",
        cardBg: "#1f2b26",
        cardBorder: "#34483f",
        recentHeaderBg: "#2a3d37",
        recentHeaderText: "#dcebe3",
        recentChevron: "#8fd1ad",
        recentQuizCardBg: "#18211d",
        recentQuizCardBorder: "#31443b",
        recentQuizDate: "#8fa39a",
        recentQuizTitle: "#e7f1eb",
      }
    : {
        screenBg: "#eef1ef",
        headerBg: "#fff",
        headerBorder: "#d8dfda",
        title: "#24362f",
        primary: "#3d5a3d",
        primaryDark: "#2f4a38",
        cardBg: "#3d5a3d",
        cardBorder: "#2f4a38",
        recentHeaderBg: "#324742",
        recentHeaderText: "#d4e8dd",
        recentChevron: "#8ad0ae",
        recentQuizCardBg: "#d6c4ac",
        recentQuizCardBorder: "#cab295",
        recentQuizDate: "#6f624f",
        recentQuizTitle: "#4f4538",
      };

  const modalColors = darkModeEnabled
    ? {
        bg: "#111815",
        headerBg: "#1a2520",
        panelSoft: "#2a3a33",
        border: "#34483f",
        text: "#e7f1eb",
        subtext: "#b9c9c0",
        accent: "#1f3a2f",
        accentStrong: "#8fd1ad",
      }
    : {
        bg: COLORS.white,
        headerBg: "#3d5a3d",
        panelSoft: "#3d5a3d",
        border: "#2f6b49",
        text: "#E8F5E9",
        subtext: "#B8D4B8",
        accent: "#2d7a5f",
        accentStrong: "#4CAF50",
      };

  // Create new class
  const handleCreateClass = async () => {
    // Validation
    if (!formData.class_name.trim()) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Program is required",
      });
      return;
    }

    if (!formData.course_subject.trim()) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Course subject is required",
      });
      return;
    }

    try {
      setCreating(true);
      await ClassService.createClass(formData);

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Class created successfully",
      });

      // Reset form
      setFormData({
        class_name: "",
        course_subject: "",
        room: "",
        section_block: "",
      });

      setModalVisible(false);
      loadClasses(); // Reload classes
    } catch (error) {
      console.error("Error creating class:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to create class",
      });
    } finally {
      setCreating(false);
    }
  };

  const filteredClasses = classes.filter(
    (cls) =>
      cls.class_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.course_subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.section_block.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderClassCard = ({ item }: { item: Class }) => (
    <TouchableOpacity
      style={[
        styles.classCard,
        { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
      ]}
      onPress={() => openClassList(item.id)}
      activeOpacity={0.9}
    >
      <View style={styles.classHeader}>
        <View style={styles.classHeaderLeft}>
          <Text style={styles.className}>{item.class_name}</Text>
          <Text style={styles.classSubject}>
            {item.course_subject} • {item.section_block}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.cardMenuButton}
          onPress={() => {
            setSelectedClass(item);
            setClassMenuVisible(true);
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.classFooter}>
        <View style={styles.classInfo}>
          <Ionicons name="people-outline" size={14} color="#d9efe2" />
          <Text style={styles.classInfoText}>
            {item.students.length} Students
          </Text>
        </View>
        <View style={styles.classInfo}>
          <Ionicons name="location-outline" size={14} color="#d9efe2" />
          <Text style={styles.classInfoText}>Room {item.room}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.viewButton}
        onPress={() => openClassList(item.id)}
      >
        <Ionicons name="people" size={15} color={COLORS.white} />
        <Text style={styles.viewButtonText}>View Class List</Text>
      </TouchableOpacity>

      <View
        style={[styles.recentRow, { backgroundColor: colors.recentHeaderBg }]}
      >
        <Text style={[styles.recentTitle, { color: colors.recentHeaderText }]}>
          Recent Quizzes
        </Text>
        <TouchableOpacity
          style={styles.recentToggle}
          onPress={() => {
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut,
            );
            setCollapsedRecent((prev) => ({
              ...prev,
              [item.id]: !prev[item.id],
            }));
          }}
        >
          <Ionicons
            name={collapsedRecent[item.id] ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.recentChevron}
          />
        </TouchableOpacity>
      </View>
      {!collapsedRecent[item.id] && (
        <>
          {(recentQuizzes[item.id] ?? []).length === 0 ? (
            <View style={styles.noQuizzesRow}>
              <Ionicons
                name="document-text-outline"
                size={16}
                color={colors.recentQuizDate}
              />
              <Text
                style={[styles.noQuizzesText, { color: colors.recentQuizDate }]}
              >
                No quizzes yet
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quizCardsRow}
            >
              {(recentQuizzes[item.id] ?? []).map((quiz) => (
                <TouchableOpacity
                  key={quiz.id}
                  style={[
                    styles.quizMiniCard,
                    {
                      backgroundColor: colors.recentQuizCardBg,
                      borderColor: colors.recentQuizCardBorder,
                    },
                  ]}
                  onPress={() =>
                    router.push(`/(tabs)/exam-preview?examId=${quiz.id}`)
                  }
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.quizMiniDate,
                      { color: colors.recentQuizDate },
                    ]}
                  >
                    {quiz.date}
                  </Text>
                  <Text
                    style={[
                      styles.quizMiniTitle,
                      { color: colors.recentQuizTitle },
                    ]}
                    numberOfLines={2}
                  >
                    {quiz.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.screenBg }]}>
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.headerBg,
              borderBottomColor: colors.headerBorder,
            },
          ]}
        >
          <View>
            <Text style={[styles.headerTitle, { color: colors.title }]}>
              Classes
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading classes...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.screenBg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.headerBg,
            borderBottomColor: colors.headerBorder,
          },
        ]}
      >
        <View>
          <Text style={[styles.headerTitle, { color: colors.title }]}>
            Classes
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View
        style={[styles.searchContainer, { backgroundColor: colors.primary }]}
      >
        <Ionicons
          name="search"
          size={16}
          color="#d6e9de"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search classes..."
          placeholderTextColor="#b8d4c4"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.searchBadge}>
          <Ionicons name="school-outline" size={12} color="#2f5f49" />
          <Text style={styles.searchBadgeText}>{filteredClasses.length}</Text>
        </View>
      </View>

      {/* Classes List */}
      <FlatList
        data={filteredClasses}
        renderItem={renderClassCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="school-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No classes found</Text>
            <Text style={styles.emptySubtext}>
              Tap + to create your first class
            </Text>
          </View>
        }
      />

      {/* Create Class Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={[styles.modalContent, { backgroundColor: modalColors.bg }]}
        >
          <View
            style={[
              styles.modalHeader,
              { backgroundColor: modalColors.headerBg },
            ]}
          >
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: modalColors.text }]}>
              Create New Class
            </Text>
            <View style={styles.modalHeaderPlaceholder} />
          </View>

          <ScrollView
            style={[
              styles.modalBody,
              { backgroundColor: darkModeEnabled ? modalColors.bg : "#f5f5f5" },
            ]}
            contentContainerStyle={styles.modalBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={[
                styles.label,
                { color: darkModeEnabled ? "#b9c9c0" : "#666" },
              ]}
            >
              Program *
            </Text>
            <TextInput
              style={[
                styles.input,
                darkModeEnabled && {
                  backgroundColor: modalColors.panelSoft,
                  borderColor: modalColors.border,
                  color: modalColors.text,
                },
              ]}
              placeholder="e.g., CS 101"
              placeholderTextColor={darkModeEnabled ? "#8fa39a" : "#9ab79f"}
              value={formData.class_name}
              onChangeText={(text) =>
                setFormData({ ...formData, class_name: text })
              }
            />

            <Text
              style={[
                styles.label,
                { color: darkModeEnabled ? "#b9c9c0" : "#666" },
              ]}
            >
              Course Subject *
            </Text>
            <TextInput
              style={[
                styles.input,
                darkModeEnabled && {
                  backgroundColor: modalColors.panelSoft,
                  borderColor: modalColors.border,
                  color: modalColors.text,
                },
              ]}
              placeholder="e.g., Computer Science"
              placeholderTextColor={darkModeEnabled ? "#8fa39a" : "#9ab79f"}
              value={formData.course_subject}
              onChangeText={(text) =>
                setFormData({ ...formData, course_subject: text })
              }
            />

            <Text
              style={[
                styles.label,
                { color: darkModeEnabled ? "#b9c9c0" : "#666" },
              ]}
            >
              Block
            </Text>
            <TouchableOpacity
              style={[
                styles.dropdownButton,
                darkModeEnabled && {
                  backgroundColor: modalColors.panelSoft,
                  borderColor: modalColors.border,
                },
              ]}
              onPress={() => setBlockPickerVisible(true)}
            >
              <Text
                style={[
                  styles.dropdownButtonText,
                  darkModeEnabled && { color: modalColors.text },
                  !formData.section_block && styles.dropdownPlaceholder,
                  !formData.section_block &&
                    darkModeEnabled && { color: "#8fa39a" },
                ]}
              >
                {formData.section_block
                  ? `Block ${formData.section_block}`
                  : "Select a block..."}
              </Text>
              <Ionicons
                name="chevron-down"
                size={20}
                color={darkModeEnabled ? modalColors.subtext : "#B8D4B8"}
              />
            </TouchableOpacity>

            <Text
              style={[
                styles.label,
                { color: darkModeEnabled ? "#b9c9c0" : "#666" },
              ]}
            >
              Room
            </Text>
            <TextInput
              style={[
                styles.input,
                darkModeEnabled && {
                  backgroundColor: modalColors.panelSoft,
                  borderColor: modalColors.border,
                  color: modalColors.text,
                },
              ]}
              placeholder="e.g., 404"
              placeholderTextColor={darkModeEnabled ? "#8fa39a" : "#9ab79f"}
              value={formData.room}
              onChangeText={(text) => setFormData({ ...formData, room: text })}
            />
          </ScrollView>

          <View
            style={[
              styles.modalFooter,
              {
                backgroundColor: darkModeEnabled
                  ? modalColors.bg
                  : COLORS.white,
                borderTopColor: darkModeEnabled
                  ? modalColors.border
                  : "#e4e8e6",
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.cancelButton,
                darkModeEnabled && {
                  backgroundColor: "#2a3a33",
                  borderColor: modalColors.border,
                },
              ]}
              onPress={() => setModalVisible(false)}
              disabled={creating}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  darkModeEnabled && { color: "#b9c9c0" },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.createButton,
                darkModeEnabled && {
                  backgroundColor: modalColors.accent,
                },
                creating && styles.createButtonDisabled,
              ]}
              onPress={handleCreateClass}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createButtonText}>Create Class</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={classMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setClassMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setClassMenuVisible(false)}
        >
          <View style={styles.menuContent}>
            <Text style={styles.menuTitle}>
              {selectedClass?.class_name ?? "Class"}
            </Text>
            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => {
                setClassMenuVisible(false);
                Toast.show({
                  type: "info",
                  text1: "Edit",
                  text2: "Edit action is available in frontend menu.",
                });
              }}
            >
              <Ionicons name="create-outline" size={18} color="#2f6550" />
              <Text style={styles.menuActionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => {
                setClassMenuVisible(false);
                Toast.show({
                  type: "info",
                  text1: "Delete",
                  text2: "Delete action is available in frontend menu.",
                });
              }}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              <Text style={[styles.menuActionText, { color: COLORS.error }]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Block Picker Modal */}
      <Modal
        visible={blockPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBlockPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setBlockPickerVisible(false)}
        >
          <View
            style={[
              styles.pickerContainer,
              darkModeEnabled && { backgroundColor: modalColors.bg },
            ]}
          >
            <View
              style={[
                styles.pickerHeader,
                darkModeEnabled && { borderBottomColor: modalColors.border },
              ]}
            >
              <Text
                style={[
                  styles.pickerTitle,
                  darkModeEnabled && { color: modalColors.text },
                ]}
              >
                Select a block...
              </Text>
              <TouchableOpacity onPress={() => setBlockPickerVisible(false)}>
                <Ionicons
                  name="close"
                  size={24}
                  color={darkModeEnabled ? modalColors.text : "#333"}
                />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerList}>
              {Array.from({ length: 26 }, (_, i) =>
                String.fromCharCode(65 + i),
              ).map((letter) => (
                <TouchableOpacity
                  key={letter}
                  style={[
                    styles.pickerItem,
                    darkModeEnabled && {
                      borderBottomColor: modalColors.border,
                    },
                    formData.section_block === letter &&
                      styles.pickerItemSelected,
                    darkModeEnabled &&
                      formData.section_block === letter && {
                        backgroundColor: modalColors.accent,
                      },
                  ]}
                  onPress={() => {
                    setFormData({ ...formData, section_block: letter });
                    setBlockPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      darkModeEnabled && { color: modalColors.text },
                      formData.section_block === letter &&
                        styles.pickerItemTextSelected,
                      darkModeEnabled &&
                        formData.section_block === letter && {
                          color: modalColors.accentStrong,
                        },
                    ]}
                  >
                    {letter}
                  </Text>
                  {formData.section_block === letter && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={
                        darkModeEnabled ? modalColors.accentStrong : "#4CAF50"
                      }
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef1ef",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1f2f2a",
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5e7268",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#2d7a5f",
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3d5a3d",
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#ecf7f1",
  },
  searchBadge: {
    minWidth: 34,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#95bba6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  searchBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2f5f49",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 28,
  },
  classCard: {
    backgroundColor: "#3d5a3d",
    borderRadius: RADIUS.medium,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#2f4a38",
  },
  classHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  classHeaderLeft: {
    flex: 1,
  },
  cardMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  className: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.white,
    marginBottom: 4,
  },
  classSubject: {
    fontSize: 14,
    color: "#b8d4c4",
    fontWeight: "500",
  },
  classFooter: {
    gap: 6,
    marginBottom: 10,
  },
  classInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  classInfoText: {
    fontSize: 12,
    color: "#e3f2ea",
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2e8b5c",
    paddingVertical: 11,
    borderRadius: RADIUS.small,
    borderWidth: 1.5,
    borderColor: "#1f6b43",
    marginBottom: 12,
    shadowColor: "#1a5c38",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  viewButtonText: {
    color: "#e8fff3",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  noQuizzesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  noQuizzesText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    backgroundColor: "#324742",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recentTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#d4e8dd",
  },
  recentToggle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  quizCardsRow: {
    gap: 8,
    paddingBottom: 8,
  },
  quizMiniCard: {
    width: 98,
    backgroundColor: "#d6c4ac",
    borderWidth: 1,
    borderColor: "#cab295",
    borderRadius: RADIUS.small,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  quizMiniDate: {
    fontSize: 10,
    color: "#6f624f",
    marginBottom: 4,
  },
  quizMiniTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4f4538",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7f75",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#8da096",
    marginTop: 4,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#3d5a3d",
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  modalTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  modalCloseButton: {
    width: 28,
    alignItems: "flex-start",
  },
  modalHeaderPlaceholder: {
    width: 28,
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "#f5f5f5",
  },
  modalBodyContent: {
    paddingBottom: 96,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#2f6b49",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#e8f5e9",
    backgroundColor: "#3d5a3d",
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: "#2f6b49",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#3d5a3d",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownButtonText: {
    fontSize: 16,
    color: "#e8f5e9",
  },
  dropdownPlaceholder: {
    color: "#9ab79f",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  pickerContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2f433a",
  },
  pickerList: {
    maxHeight: 400,
  },
  pickerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerItemSelected: {
    backgroundColor: "#e8f5e9",
  },
  pickerItemText: {
    fontSize: 16,
    color: "#2f433a",
    fontWeight: "600",
  },
  pickerItemTextSelected: {
    color: "#2d7a5f",
    fontWeight: "700",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e4e8e6",
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: "#d4c5a0",
    backgroundColor: "#f0ead6",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    color: "#5c6d64",
    fontWeight: "700",
  },
  createButton: {
    flex: 1,
    padding: 14,
    borderRadius: RADIUS.small,
    backgroundColor: "#2d7a5f",
    alignItems: "center",
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: "700",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  menuContent: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: "#d8dfda",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2f433a",
    marginBottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  menuAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: RADIUS.small,
  },
  menuActionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2f6550",
  },
});
