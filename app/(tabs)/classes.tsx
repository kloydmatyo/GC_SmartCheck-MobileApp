import ConfirmationModal from "@/components/common/ConfirmationModal";
import { auth } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { COLORS, RADIUS } from "../../constants/theme";
import { ClassService } from "../../services/classService";
import { ExamService } from "../../services/examService";
import { Class } from "../../types/class";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CLASS_MENU_WIDTH = 190;
const CLASS_MENU_HEIGHT = 116;
const MAX_FIELD_LENGTH = 50;

type RecentQuiz = {
  id: string;
  title: string;
  date: string;
};

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
  const params = useLocalSearchParams();
  const requestedEditClassId = params.editClassId as string | undefined;
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [classes, setClasses] = useState<Class[]>([]);
  const [recentQuizzes, setRecentQuizzes] = useState<
    Record<string, RecentQuiz[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [classMenuVisible, setClassMenuVisible] = useState(false);
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [consumedEditRequestId, setConsumedEditRequestId] = useState<
    string | null
  >(null);
  const [collapsedRecent, setCollapsedRecent] = useState<
    Record<string, boolean>
  >({});
  const [discardClassConfirmVisible, setDiscardClassConfirmVisible] =
    useState(false);

  const [classMenuPosition, setClassMenuPosition] = useState({
    top: 0,
    left: 0,
  });

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

  const YEAR_OPTIONS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

  // Form state
  const [formData, setFormData] = useState({
    class_name: "",
    course_subject: "",
    room: "",
    year: "",
  });
  const [yearPickerVisible, setYearPickerVisible] = useState(false);

  const resetForm = () => {
    setFormData({
      class_name: "",
      course_subject: "",
      room: "",
      year: "",
    });
    setEditingClassId(null);
  };

  // Fetch recent quizzes for each class (Optimized: uses ExamService Cache)
  const loadRecentQuizzes = async (classIds: string[]) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || classIds.length === 0) return;

      // Use the now optimized Local-First ExamService
      const allExams = await ExamService.getExamsByUser();

      const byClass: Record<string, RecentQuiz[]> = {};

      allExams.forEach((exam) => {
        const cid = exam.classId;
        // Also check if the 'class' field title matches if classId is missing (legacy)
        if (!cid || !classIds.includes(cid)) return;

        if (!byClass[cid]) byClass[cid] = [];
        byClass[cid].push({
          id: exam.id,
          title: exam.title || "Untitled",
          date: exam.date || "",
        });
      });

      // Keep only 5 most recent per class
      Object.keys(byClass).forEach((cid) => {
        byClass[cid] = byClass[cid].slice(0, 5);
      });

      setRecentQuizzes(byClass);
    } catch (error) {
      console.error("[ClassesScreen] Error loading recent quizzes:", error);
    }
  };

  // Load classes from Firebase
  const loadClasses = useCallback(async () => {
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
  }, []);

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
    }, [loadClasses]),
  );

  useEffect(() => {
    if (
      !requestedEditClassId ||
      requestedEditClassId === consumedEditRequestId ||
      classes.length === 0
    ) {
      return;
    }

    const targetClass = classes.find(
      (item) => item.id === requestedEditClassId,
    );
    if (!targetClass) return;

    setConsumedEditRequestId(requestedEditClassId);
    handleEditClass(targetClass);
  }, [requestedEditClassId, consumedEditRequestId, classes]);

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

  const trimmedForm = {
    class_name: formData.class_name.trim(),
    course_subject: formData.course_subject.trim(),
    room: formData.room.trim(),
  };
  const requiredFields = [
    trimmedForm.class_name,
    trimmedForm.course_subject,
    formData.year,
  ];
  const hasMissingRequired = requiredFields.some((value) => !value);
  const hasClassNameTooShort =
    trimmedForm.class_name.length > 0 && trimmedForm.class_name.length < 4;
  const hasCourseSubjectTooShort =
    trimmedForm.course_subject.length > 0 &&
    trimmedForm.course_subject.length < 5;
  const hasRoomInvalid =
    trimmedForm.room.length > 0 && !/^\d{3}$/.test(trimmedForm.room);
  const hasTooLong = [trimmedForm.class_name, trimmedForm.course_subject].some(
    (value) => value.length > MAX_FIELD_LENGTH,
  );
  const isClassFormValid =
    !hasMissingRequired &&
    !hasClassNameTooShort &&
    !hasCourseSubjectTooShort &&
    !hasRoomInvalid &&
    !hasTooLong &&
    trimmedForm.class_name.length >= 4 &&
    trimmedForm.course_subject.length >= 5;
  const canCreateClass = isClassFormValid && !creating;
  const hasClassFormChanges = editingClassId
    ? Boolean(
        selectedClass &&
        (trimmedForm.class_name !== (selectedClass.class_name ?? "") ||
          trimmedForm.course_subject !== (selectedClass.course_subject ?? "") ||
          trimmedForm.room !== (selectedClass.room ?? "") ||
          formData.year !== (selectedClass.year ?? "")),
      )
    : Boolean(
        trimmedForm.class_name ||
        trimmedForm.course_subject ||
        trimmedForm.room ||
        formData.year,
      );

  const handleAttemptCloseClassModal = () => {
    if (creating) return;
    if (hasClassFormChanges) {
      setDiscardClassConfirmVisible(true);
      return;
    }
    setModalVisible(false);
    resetForm();
  };

  const handleEditClass = (classItem: Class) => {
    setSelectedClass(classItem);
    setEditingClassId(classItem.id);
    setFormData({
      class_name: classItem.class_name ?? "",
      course_subject: classItem.course_subject ?? "",
      room: classItem.room ?? "",
      year: classItem.year ?? "",
    });
    setClassMenuVisible(false);
    setModalVisible(true);
  };

  const handleCreateClass = async () => {
    if (!trimmedForm.class_name) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Program is required",
      });
      return;
    }
    if (trimmedForm.class_name.length < 4) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Class Name must be at least 4 characters",
      });
      return;
    }
    if (!trimmedForm.course_subject) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Course subject is required",
      });
      return;
    }
    if (trimmedForm.course_subject.length < 5) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Course Subject must be at least 5 characters",
      });
      return;
    }
    if (trimmedForm.room && !/^\d{3}$/.test(trimmedForm.room)) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Room must be exactly 3 digits (e.g. 101)",
      });
      return;
    }
    if (hasTooLong) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Each field must be 50 characters or fewer",
      });
      return;
    }

    try {
      setCreating(true);
      if (editingClassId) {
        await ClassService.updateClass(editingClassId, {
          class_name: trimmedForm.class_name,
          course_subject: trimmedForm.course_subject,
          room: trimmedForm.room || undefined,
          year: formData.year,
        });
        Toast.show({
          type: "success",
          text1: "Success",
          text2: "Class updated successfully",
        });
      } else {
        await ClassService.createClass({
          class_name: trimmedForm.class_name,
          course_subject: trimmedForm.course_subject,
          room: trimmedForm.room || undefined,
          year: formData.year,
        });
        Toast.show({
          type: "success",
          text1: "Success",
          text2: "Class created successfully",
        });
      }

      resetForm();

      setModalVisible(false);
      loadClasses();
    } catch (error) {
      console.error("Error saving class:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: editingClassId
          ? "Failed to update class"
          : "Failed to create class",
      });
    } finally {
      setCreating(false);
    }
  };

  const normalizedQuery = (searchQuery ?? "").trim().toLowerCase();
  const filteredClasses = classes.filter((cls) => {
    if (cls.isArchived) return false;

    const className = String(cls.class_name ?? "").toLowerCase();
    const courseSubject = String(cls.course_subject ?? "").toLowerCase();
    const sectionBlock = String(cls.section_block ?? "").toLowerCase();
    const room = String(cls.room ?? "").toLowerCase();

    return (
      className.includes(normalizedQuery) ||
      courseSubject.includes(normalizedQuery) ||
      sectionBlock.includes(normalizedQuery) ||
      room.includes(normalizedQuery)
    );
  });

  const renderClassCard = ({ item }: { item: Class }) => {
    const avgScore = getMockAverage(item.students.length);
    const accentColor = getAccentColor(avgScore);

    return (
      <TouchableOpacity
        style={styles.classCardWrap}
        onPress={() => openClassList(item.id)}
        activeOpacity={0.9}
      >
        <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />
        <View style={styles.classCardSurface}>
          <View style={styles.classHeader}>
            <View style={styles.classHeaderLeft}>
              <Text style={styles.className}>{item.class_name}</Text>
              {!!item.course_subject && (
                <Text style={styles.classCourse}>{item.course_subject}</Text>
              )}
            </View>
            <View style={styles.classHeaderRight}>
              <TouchableOpacity
                style={styles.cardMenuButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={(event) => openClassMenu(event, item)}
              >
                <Ionicons name="ellipsis-vertical" size={18} color="#99A1B2" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.classMetaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={14} color="#7E8798" />
              <Text style={styles.metaText}>
                {item.students.length} students
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color="#7E8798" />
              <Text style={styles.metaText}>
                {formatShortDate(item.createdAt)}
              </Text>
            </View>
            {!!item.year && (
              <View style={styles.metaItem}>
                <Ionicons name="school-outline" size={14} color="#7E8798" />
                <Text style={styles.metaText}>{item.year}</Text>
              </View>
            )}
          </View>

          <View style={styles.classFooterBar} />
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
        type: "archive_result",
        text1: "Archived",
        text2: `${classItem.class_name} moved to Archived`,
      });
      await loadClasses();
      router.push("/(tabs)/batch-history");
    } catch (error) {
      console.warn(
        "Archive class failed:",
        error instanceof Error ? error.message : String(error),
      );
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
            onPress={() => {
              resetForm();
              setModalVisible(true);
            }}
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
          <Text style={[styles.headerTitle, { color: colors.title }]}>
            My Classes
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.addButton,
            darkModeEnabled ? styles.addButtonDark : styles.addButtonLight,
          ]}
          onPress={() => {
            resetForm();
            setModalVisible(true);
          }}
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
        <Ionicons name="search-outline" size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search classes..."
          placeholderTextColor="#7B8794"
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
        onRequestClose={handleAttemptCloseClassModal}
      >
        <KeyboardAvoidingView
          style={styles.createScreen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.createScreenHeader}>
            <View style={styles.createScreenHeaderSpacer} />
            <Text style={styles.createSheetTitle}>
              {editingClassId ? "Edit Class" : "Create Class"}
            </Text>
            <TouchableOpacity
              style={styles.createSheetClose}
              onPress={handleAttemptCloseClassModal}
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
            <Text style={styles.sheetLabel}>
              Program <Text style={styles.requiredStar}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.sheetInput,
                trimmedForm.class_name.length >= 4 && styles.sheetInputValid,
                trimmedForm.class_name.length > 0 &&
                  trimmedForm.class_name.length < 4 &&
                  styles.sheetInputError,
              ]}
              placeholder="Enter program name"
              placeholderTextColor="#B5BCC8"
              maxLength={MAX_FIELD_LENGTH}
              value={formData.class_name}
              onChangeText={(text) =>
                setFormData({ ...formData, class_name: text })
              }
            />
            {trimmedForm.class_name.length > 0 &&
              trimmedForm.class_name.length < 4 && (
                <Text style={styles.fieldHint}>
                  At least 4 characters required
                </Text>
              )}

            <Text style={styles.sheetLabel}>
              Course <Text style={styles.requiredStar}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.sheetInput,
                trimmedForm.course_subject.length >= 5 &&
                  styles.sheetInputValid,
                trimmedForm.course_subject.length > 0 &&
                  trimmedForm.course_subject.length < 5 &&
                  styles.sheetInputError,
              ]}
              placeholder="Enter course subject"
              placeholderTextColor="#B5BCC8"
              maxLength={MAX_FIELD_LENGTH}
              value={formData.course_subject}
              onChangeText={(text) =>
                setFormData({ ...formData, course_subject: text })
              }
            />
            {trimmedForm.course_subject.length > 0 &&
              trimmedForm.course_subject.length < 5 && (
                <Text style={styles.fieldHint}>
                  At least 5 characters required
                </Text>
              )}

            <Text style={styles.sheetLabel}>
              Year <Text style={styles.requiredStar}>*</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.sheetInput,
                formData.year && styles.sheetInputValid,
                styles.sheetPicker,
              ]}
              onPress={() => setYearPickerVisible(true)}
            >
              <Text
                style={
                  formData.year
                    ? styles.sheetPickerValue
                    : styles.sheetPickerPlaceholder
                }
              >
                {formData.year || "Select year level"}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#B5BCC8" />
            </TouchableOpacity>

            <View style={styles.sheetRow}>
              <View style={styles.sheetHalf}>
                <Text style={styles.sheetLabel}>
                  Room <Text style={styles.optionalLabel}>(Optional)</Text>
                </Text>
                <TextInput
                  style={[
                    styles.sheetInput,
                    trimmedForm.room.length === 3 &&
                      /^\d{3}$/.test(trimmedForm.room) &&
                      styles.sheetInputValid,
                    trimmedForm.room.length > 0 &&
                      !/^\d{3}$/.test(trimmedForm.room) &&
                      styles.sheetInputError,
                  ]}
                  placeholder="Enter room number (exactly 3 digits)"
                  placeholderTextColor="#B5BCC8"
                  keyboardType="numeric"
                  maxLength={3}
                  value={formData.room}
                  onChangeText={(text) => {
                    const digits = text.replace(/[^0-9]/g, "").slice(0, 3);
                    setFormData({ ...formData, room: digits });
                  }}
                />
                {trimmedForm.room.length > 0 &&
                  !/^\d{3}$/.test(trimmedForm.room) && (
                    <Text style={styles.fieldHint}>Exactly 3 digits</Text>
                  )}
              </View>
            </View>
          </ScrollView>

          <View style={styles.createScreenFooter}>
            {!isClassFormValid && (
              <Text style={styles.validationText}>
                {hasTooLong
                  ? "Keep each field under 50 characters."
                  : hasClassNameTooShort
                    ? "Class Name must be at least 4 characters."
                    : hasCourseSubjectTooShort
                      ? "Course Subject must be at least 5 characters."
                      : hasRoomInvalid
                        ? "Room must be exactly 3 digits."
                        : "Complete all required fields to continue."}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.sheetPrimaryButton,
                (!canCreateClass || creating) && styles.createButtonDisabled,
              ]}
              onPress={handleCreateClass}
              disabled={!canCreateClass}
            >
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.sheetPrimaryButtonText}>
                  {editingClassId ? "Save Changes" : "Create Class"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Year Picker Modal */}
      <Modal
        visible={yearPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setYearPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setYearPickerVisible(false)}
        >
          <View style={styles.yearPickerContent}>
            <Text style={styles.yearPickerTitle}>Select Year Level</Text>
            {YEAR_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.yearPickerItem,
                  formData.year === option && styles.yearPickerItemSelected,
                ]}
                onPress={() => {
                  setFormData({ ...formData, year: option });
                  setYearPickerVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.yearPickerItemText,
                    formData.year === option &&
                      styles.yearPickerItemTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.yearPickerClear}
              onPress={() => {
                setFormData({ ...formData, year: "" });
                setYearPickerVisible(false);
              }}
            >
              <Text style={styles.yearPickerClearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
                setClassMenuVisible(false);
                if (selectedClass) {
                  handleEditClass(selectedClass);
                }
              }}
            >
              <Text style={[styles.menuActionText, { color: "#20BE7B" }]}>
                Edit Class
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
        visible={discardClassConfirmVisible}
        title="Discard Changes"
        message="You have unsaved class changes. Leave without saving?"
        cancelText="Stay"
        confirmText="Discard"
        destructive
        onCancel={() => setDiscardClassConfirmVisible(false)}
        onConfirm={() => {
          setDiscardClassConfirmVisible(false);
          setModalVisible(false);
          resetForm();
        }}
      />
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
    borderWidth: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  addButtonLight: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    shadowColor: "transparent",
  },
  addButtonDark: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    shadowColor: "transparent",
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
    color: "#000000",
  },
  addButtonPlusTextDark: {
    color: "#000000",
  },
  searchContainer: {
    marginHorizontal: 22,
    marginTop: 6,
    marginBottom: 18,
    height: 40,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EBF0",
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 2,
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 22,
    paddingBottom: 120,
  },
  classCardWrap: {
    flexDirection: "row",
    marginBottom: 16,
    minHeight: 96,
    borderRadius: 24,
    overflow: "hidden",
  },
  cardAccent: {
    width: 6,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
  },
  classCardSurface: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EBF0",
    borderLeftWidth: 0,
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
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
  classCourse: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
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
    borderRadius: 0,
    backgroundColor: "#E6ECE8",
    overflow: "hidden",
  },
  classFooterBar: {
    height: 4,
    backgroundColor: "#20BE7B",
    borderRadius: 0,
  },
  scoreBar: {
    height: "100%",
    borderRadius: 0,
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
  sheetInputValid: {
    borderColor: "#1FC27D",
    backgroundColor: "#F0FDF8",
  },
  sheetInputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FFF5F5",
  },
  sheetPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetPickerValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sheetPickerPlaceholder: {
    fontSize: 16,
    color: "#B5BCC8",
  },
  requiredStar: {
    color: "#EF4444",
  },
  optionalLabel: {
    fontSize: 11,
    fontWeight: "400",
    color: "#9CA3AF",
  },
  fieldHint: {
    fontSize: 11,
    color: "#EF4444",
    marginTop: 4,
    marginLeft: 4,
  },
  yearPickerContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  yearPickerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F5",
    marginBottom: 8,
  },
  yearPickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  yearPickerItemSelected: {
    backgroundColor: "#F0FDF8",
  },
  yearPickerItemText: {
    fontSize: 16,
    color: "#374151",
    fontWeight: "600",
  },
  yearPickerItemTextSelected: {
    color: "#1FC27D",
    fontWeight: "800",
  },
  yearPickerClear: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: "#EEF1F5",
  },
  yearPickerClearText: {
    fontSize: 15,
    color: "#9CA3AF",
    fontWeight: "600",
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
  validationText: {
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "600",
    color: "#EF4444",
    textAlign: "center",
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
