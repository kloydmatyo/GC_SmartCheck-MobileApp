import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    FlatList,
    GestureResponderEvent,
    KeyboardAvoidingView,
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
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { COLORS, RADIUS } from "../../constants/theme";
import { ClassService } from "../../services/classService";
import { Class } from "../../types/class";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CLASS_MENU_WIDTH = 190;
const CLASS_MENU_HEIGHT = 116;

function AnimatedFillBar({
  progress,
  color,
  height = 4,
}: {
  progress: number;
  color: string;
  height?: number;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trackWidth) return;
    animatedWidth.setValue(0);
    Animated.timing(animatedWidth, {
      toValue: trackWidth * Math.max(0, Math.min(progress, 1)),
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [animatedWidth, progress, trackWidth]);

  return (
    <View
      style={[styles.scoreTrack, { height }]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.scoreBar,
          {
            width: animatedWidth,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
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
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [classMenuPosition, setClassMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const openClassList = (classId: string) => {
    router.push(`/(tabs)/class-details?classId=${classId}`);
  };

  const formatShortDate = (value?: Date) => {
    if (!value) return "No date";
    return value.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getMockAverage = (studentCount: number) => {
    if (studentCount <= 1) return 100;
    if (studentCount === 2) return 100;
    if (studentCount === 3) return 100;
    return 92;
  };

  const getAccentColor = (score: number) => {
    if (score >= 85) return "#20BE7B";
    if (score >= 70) return "#F59E0B";
    return "#EF4444";
  };

  // Form state
  const [formData, setFormData] = useState({
    class_name: "",
    course_subject: "",
    room: "",
    schedule_day: [] as string[], // Changed to array
    schedule_time: "",
    school_year: "2025*2026",
    section_block: "",
    semester: "1st semester",
  });

  // Load classes from Firebase
  const loadClasses = async () => {
    try {
      setLoading(true);
      const fetchedClasses = await ClassService.getClassesByUser();
      setClasses(fetchedClasses);
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
        primary: "#20BE7B",
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
        primary: "#7EE0B6",
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

  // Create new class
  const handleCreateClass = async () => {
    // Validation
    if (!formData.class_name.trim()) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Class name is required",
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
        schedule_day: [], // Reset to empty array
        schedule_time: "",
        school_year: "2025*2026",
        section_block: "",
        semester: "1st semester",
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
      !cls.isArchived &&
      (cls.class_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.course_subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.section_block.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const renderClassCard = ({ item }: { item: Class }) => {
    const avgScore = getMockAverage(item.students.length);
    const accentColor = getAccentColor(avgScore);

    return (
      <TouchableOpacity
        style={styles.classCard}
        onPress={() => openClassList(item.id)}
        activeOpacity={0.9}
      >
        <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />
        <View style={styles.classCardBody}>
          <View style={styles.classHeader}>
            <View style={styles.classHeaderLeft}>
              <Text style={styles.className}>{item.class_name}</Text>
            </View>
            <View style={styles.classHeaderRight}>
              <Text style={[styles.classRate, { color: accentColor }]}>
                {avgScore} %
              </Text>
              <TouchableOpacity
                style={styles.cardMenuButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={(event) => openClassMenu(event, item)}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={18}
                  color="#99A1B2"
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.classMetaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={14} color="#7E8798" />
              <Text style={styles.metaText}>{item.students.length} students</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color="#7E8798" />
              <Text style={styles.metaText}>{formatShortDate(item.createdAt)}</Text>
            </View>
          </View>

          <AnimatedFillBar progress={avgScore / 100} color={accentColor} />
        </View>
      </TouchableOpacity>
    );
  };

  const openClassMenu = (event: GestureResponderEvent, classItem: Class) => {
    const { pageX, pageY } = event.nativeEvent;
    const left = Math.min(
      Math.max(12, pageX - CLASS_MENU_WIDTH + 28),
      SCREEN_WIDTH - CLASS_MENU_WIDTH - 12,
    );
    const top = Math.min(
      Math.max(80, pageY - 8),
      SCREEN_HEIGHT - CLASS_MENU_HEIGHT - 24,
    );

    setSelectedClass(classItem);
    setClassMenuPosition({ top, left });
    setClassMenuVisible(true);
  };

  const closeClassMenu = () => {
    setClassMenuVisible(false);
    setSelectedClass(null);
  };

  const archiveClass = async (classItem: Class) => {
    try {
      await ClassService.updateClass(classItem.id, { isArchived: true });
      setClassMenuVisible(false);
      setSelectedClass(null);
      Toast.show({
        type: "success",
        text1: "Archived",
        text2: `${classItem.class_name} moved to Archived`,
      });
      await loadClasses();
      router.push("/(tabs)/batch-history");
    } catch (error) {
      console.error("Error archiving class:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to archive class",
      });
    }
  };

  const handleArchiveClass = (classItem: Class) => {
    setSelectedClass(classItem);
    setClassMenuVisible(false);
    setArchiveConfirmVisible(true);
  };

  const deleteClass = async (classItem: Class) => {
    try {
      await ClassService.deleteClass(classItem.id);
      setClassMenuVisible(false);
      setSelectedClass(null);
      Toast.show({
        type: "success",
        text1: "Deleted",
        text2: `${classItem.class_name} deleted successfully`,
      });
      await loadClasses();
    } catch (error) {
      console.error("Error deleting class:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to delete class",
      });
    }
  };

  const handleDeleteClass = (classItem: Class) => {
    setSelectedClass(classItem);
    setClassMenuVisible(false);
    setDeleteConfirmVisible(true);
  };

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
              My Classes
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.addButton,
              darkModeEnabled ? styles.addButtonDark : styles.addButtonLight,
            ]}
            onPress={() => setModalVisible(true)}
          >
            <Text
              style={[
                styles.addButtonPlusText,
                darkModeEnabled
                  ? styles.addButtonPlusTextDark
                  : styles.addButtonPlusTextLight,
              ]}
            >
              +
            </Text>
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
          <Text style={[styles.headerTitle, { color: colors.title }]}>My Classes</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.addButton,
            darkModeEnabled ? styles.addButtonDark : styles.addButtonLight,
          ]}
          onPress={() => setModalVisible(true)}
        >
          <Text
            style={[
              styles.addButtonPlusText,
              darkModeEnabled
                ? styles.addButtonPlusTextDark
                : styles.addButtonPlusTextLight,
            ]}
          >
            +
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search classes..."
          placeholderTextColor="#C2C9D4"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
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
        <KeyboardAvoidingView
          style={styles.createScreen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.createScreenHeader}>
            <View style={styles.createScreenHeaderSpacer} />
            <Text style={styles.createSheetTitle}>Create Class</Text>
            <TouchableOpacity
              style={styles.createSheetClose}
              onPress={() => setModalVisible(false)}
              disabled={creating}
            >
              <Ionicons name="close" size={24} color="#A8AFBC" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.createSheetBody}
            contentContainerStyle={styles.createSheetBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetLabel}>Class Name</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="e.g. Biology 101"
              placeholderTextColor="#B5BCC8"
              value={formData.class_name}
              onChangeText={(text) =>
                setFormData({ ...formData, class_name: text })
              }
            />

            <Text style={styles.sheetLabel}>Program</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="e.g. Science Dept"
              placeholderTextColor="#B5BCC8"
              value={formData.course_subject}
              onChangeText={(text) =>
                setFormData({ ...formData, course_subject: text })
              }
            />

            <View style={styles.sheetRow}>
              <View style={styles.sheetHalf}>
                <Text style={styles.sheetLabel}>Course Block</Text>
                <TextInput
                  style={styles.sheetInput}
                  placeholder="e.g. Period 1"
                  placeholderTextColor="#B5BCC8"
                  value={formData.section_block}
                  onChangeText={(text) =>
                    setFormData({ ...formData, section_block: text })
                  }
                />
              </View>
              <View style={styles.sheetHalf}>
                <Text style={styles.sheetLabel}>Room</Text>
                <TextInput
                  style={styles.sheetInput}
                  placeholder="e.g. Room 402"
                  placeholderTextColor="#B5BCC8"
                  value={formData.room}
                  onChangeText={(text) =>
                    setFormData({ ...formData, room: text })
                  }
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.createScreenFooter}>
            <TouchableOpacity
              style={[styles.sheetPrimaryButton, creating && styles.createButtonDisabled]}
              onPress={handleCreateClass}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.sheetPrimaryButtonText}>Create Class</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={classMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={closeClassMenu}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={closeClassMenu}
        >
          <View
            style={[
              styles.menuContent,
              {
                top: classMenuPosition.top,
                left: classMenuPosition.left,
              },
            ]}
          >
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>
                {selectedClass?.class_name ?? "Class"}
              </Text>
              <TouchableOpacity
                style={styles.menuCloseButton}
                onPress={closeClassMenu}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => {
                if (selectedClass) {
                  handleArchiveClass(selectedClass);
                }
              }}
            >
              <Text style={[styles.menuActionText, { color: "#F59E0B" }]}>
                Archive Class
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => {
                if (selectedClass) {
                  handleDeleteClass(selectedClass);
                }
              }}
            >
              <Text style={[styles.menuActionText, { color: "#EF4444" }]}>
                Delete Class
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ConfirmationModal
        visible={archiveConfirmVisible}
        title="Archive Item"
        message={`Are you sure you want to archive ${selectedClass?.class_name ?? "this class"}? You can still view it later in the archived section.`}
        cancelText="Cancel"
        confirmText="Archive"
        destructive
        onCancel={() => setArchiveConfirmVisible(false)}
        onConfirm={() => {
          if (selectedClass) {
            setArchiveConfirmVisible(false);
            archiveClass(selectedClass);
          }
        }}
      />

      <ConfirmationModal
        visible={deleteConfirmVisible}
        title="Delete Item"
        message={`Are you sure you want to delete ${selectedClass?.class_name ?? "this class"}? This action cannot be undone.`}
        cancelText="Cancel"
        confirmText="Delete"
        destructive
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={() => {
          if (selectedClass) {
            setDeleteConfirmVisible(false);
            deleteClass(selectedClass);
          }
        }}
      />

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
    fontSize: 28,
    fontWeight: "800",
    color: "#1F2937",
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  addButtonLight: {
    backgroundColor: "#20BE7B",
    borderColor: "#57D7A0",
    shadowColor: "#20BE7B",
  },
  addButtonDark: {
    backgroundColor: "#20BE7B",
    borderColor: "#57D7A0",
    shadowColor: "#20BE7B",
  },
  addButtonPlusText: {
    fontSize: 26,
    lineHeight: 26,
    fontWeight: "400",
    marginTop: -2,
    textAlign: "center",
    includeFontPadding: false,
  },
  addButtonPlusTextLight: {
    color: "#F2FFF8",
  },
  addButtonPlusTextDark: {
    color: "#E9F8F1",
  },
  searchContainer: {
    marginHorizontal: 22,
    marginTop: 6,
    marginBottom: 18,
  },
  searchInput: {
    height: 40,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EBF0",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    color: "#1F2937",
  },
  listContent: {
    paddingHorizontal: 22,
    paddingBottom: 120,
  },
  classCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E7EBF0",
    overflow: "hidden",
    flexDirection: "row",
    minHeight: 96,
  },
  cardAccent: {
    width: 6,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  classCardBody: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  classHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  className: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1F2937",
    lineHeight: 24,
  },
  classHeaderLeft: {
    flex: 1,
    paddingRight: 8,
  },
  classHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  classRate: {
    fontSize: 18,
    fontWeight: "800",
  },
  cardMenuButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  classMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  metaText: {
    fontSize: 13,
    color: "#7E8798",
  },
  scoreTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E6ECE8",
    overflow: "hidden",
  },
  scoreBar: {
    height: "100%",
    borderRadius: 999,
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
  createScreen: {
    flex: 1,
    backgroundColor: "#F7F7F8",
  },
  createScreenHeader: {
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
  createScreenHeaderSpacer: {
    width: 44,
    height: 44,
  },
  createSheetTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  createSheetClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F5F8",
    alignItems: "center",
    justifyContent: "center",
  },
  createSheetBody: {
    flex: 1,
  },
  createSheetBodyContent: {
    padding: 20,
    paddingBottom: 120,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 10,
    marginTop: 14,
  },
  sheetInput: {
    height: 62,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sheetRow: {
    flexDirection: "row",
    gap: 14,
  },
  sheetHalf: {
    flex: 1,
  },
  sheetPrimaryButton: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#1FC27D",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetPrimaryButtonText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  createScreenFooter: {
    padding: 20,
    backgroundColor: "#F7F7F8",
    borderTopWidth: 1,
    borderTopColor: "#EEF1F5",
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
  dayButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: "#2f6b49",
    backgroundColor: "#3d5a3d",
  },
  dayButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayButtonText: {
    fontSize: 14,
    color: "#d0e5d6",
  },
  dayButtonTextActive: {
    color: COLORS.white,
    fontWeight: "600",
  },
  semesterButtons: {
    gap: 8,
  },
  semesterButton: {
    padding: 12,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: "#2f6b49",
    backgroundColor: "#3d5a3d",
  },
  semesterButtonActive: {
    backgroundColor: "#2d4a2d",
    borderColor: "#4CAF50",
  },
  semesterButtonText: {
    fontSize: 14,
    color: "#d0e5d6",
    textAlign: "center",
  },
  semesterButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
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
    backgroundColor: "rgba(0, 0, 0, 0.08)",
    position: "relative",
  },
  menuContent: {
    position: "absolute",
    width: CLASS_MENU_WIDTH,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2f433a",
    flex: 1,
    paddingVertical: 6,
    paddingRight: 8,
  },
  menuCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  menuAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: RADIUS.small,
  },
  menuActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2f6550",
  },
});
