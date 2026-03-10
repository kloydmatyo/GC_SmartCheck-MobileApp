import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import {
    ActivityIndicator,
    Animated,
    DeviceEventEmitter,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Toast from "react-native-toast-message";
import { COLORS, RADIUS } from "../../constants/theme";
import { ClassService } from "../../services/classService";
import { StudentImportService } from "../../services/studentImportService";
import { Class, Student } from "../../types/class";

export default function ClassDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const classId = params.classId as string;
  const mode = params.mode as string | undefined;
  const showClassDetails = mode !== "list";

  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addStudentModalVisible, setAddStudentModalVisible] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [activeTab, setActiveTab] = useState<"students" | "quizzes">(
    "students",
  );
  const [studentSearch, setStudentSearch] = useState("");
  const [quizSearch, setQuizSearch] = useState("");
  const [removeStudentConfirmVisible, setRemoveStudentConfirmVisible] =
    useState(false);
  const [studentToRemove, setStudentToRemove] = useState<{
    studentId: string;
    studentName: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // Student form state
  const [studentForm, setStudentForm] = useState({
    student_id: "",
    first_name: "",
    last_name: "",
    email: "",
  });
  const [listNavWidth, setListNavWidth] = useState(0);
  const studentSearchInputRef = useRef<TextInput>(null);
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  const listNavPillWidth = listNavWidth > 0 ? (listNavWidth - 6) / 2 : 120;

  const goToClasses = () => {
    router.replace("/(tabs)/classes");
  };

  const loadDarkModePreference = React.useCallback(async () => {
    try {
      const savedDarkMode = await AsyncStorage.getItem(DARK_MODE_STORAGE_KEY);
      setDarkModeEnabled(savedDarkMode === "true");
    } catch (error) {
      console.warn("Failed to load dark mode preference:", error);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadDarkModePreference();
    }, [loadDarkModePreference]),
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "darkModeChanged",
      (value: boolean) => {
        setDarkModeEnabled(Boolean(value));
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    loadClassData();
  }, [classId]);

  useEffect(() => {
    Animated.timing(tabSlideAnim, {
      toValue: activeTab === "students" ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [activeTab, tabSlideAnim]);

  const colors = darkModeEnabled
    ? {
        screenBg: "#111815",
        surface: "#1a2520",
        surfaceSoft: "#1f2b26",
        surfaceMuted: "#22302a",
        quizCardBg: "#18211d",
        quizCardBorder: "#2f4139",
        quizBadgeBg: "#284136",
        quizBadgeText: "#d7ebe1",
        quizActionBg: "#24352d",
        border: "#34483f",
        borderSoft: "#2b3b34",
        text: "#e7f1eb",
        textSecondary: "#b9c9c0",
        textMuted: "#8fa39a",
        inputBg: "#22302a",
        inputBorder: "#34483f",
        inputPlaceholder: "#8fa39a",
        headerIconBg: "#22302a",
        studentCardBg: "#2a3129",
        studentCardBorder: "#4c473f",
        scoreBadgeBg: "#39362f",
        scoreBadgeBorder: "#6f6758",
        badgeBg: "#395046",
        badgeText: "#dcece4",
        emptyIcon: "#4f655b",
        modalOverlay: "rgba(5, 10, 8, 0.78)",
      }
    : {
        screenBg: "#edf1ee",
        surface: COLORS.white,
        surfaceSoft: "#4f715f",
        surfaceMuted: "#f4f5f2",
        quizCardBg: "#3f6b54",
        quizCardBorder: "#355b49",
        quizBadgeBg: "#2d4f3e",
        quizBadgeText: "#d8ebdf",
        quizActionBg: "#1f3449",
        border: "#d5dfd9",
        borderSoft: "#3f5f4f",
        text: "#24362f",
        textSecondary: "#6a7b72",
        textMuted: "#8ea094",
        inputBg: "#f8fbf9",
        inputBorder: "#d5dfd9",
        inputPlaceholder: "#c3dbcf",
        headerIconBg: "#e2efe8",
        studentCardBg: "#e0cfb4",
        studentCardBorder: "#6f6c62",
        scoreBadgeBg: "#e9d8bf",
        scoreBadgeBorder: "#d7c8af",
        badgeBg: "#7da78f",
        badgeText: "#214132",
        emptyIcon: "#ccc",
        modalOverlay: "rgba(15, 25, 20, 0.55)",
      };

  const loadClassData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ClassService.getClassById(classId);
      if (!data) {
        setError("Class not found");
        return;
      }
      setClassData(data);
    } catch (err) {
      console.error("Error loading class:", err);
      setError("Failed to load class data");
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async () => {
    // Validation
    if (!studentForm.student_id.trim()) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Student ID is required",
      });
      return;
    }

    if (!studentForm.first_name.trim() || !studentForm.last_name.trim()) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "First name and last name are required",
      });
      return;
    }

    try {
      setAddingStudent(true);
      await ClassService.addStudent(classId, studentForm);

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Student added successfully",
      });

      // Reset form
      setStudentForm({
        student_id: "",
        first_name: "",
        last_name: "",
        email: "",
      });

      setAddStudentModalVisible(false);
      loadClassData(); // Reload class data
    } catch (error) {
      console.error("Error adding student:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to add student",
      });
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = (studentId: string, studentName: string) => {
    setStudentToRemove({ studentId, studentName });
    setRemoveStudentConfirmVisible(true);
  };

  const handleBulkImport = async () => {
    try {
      // Pick document
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      
      setImporting(true);
      setImportProgress(0);

      // Read file content
      let fileContent: string;
      const isExcel = file.mimeType?.includes('spreadsheet') || 
                      file.mimeType?.includes('excel') || 
                      file.name.endsWith('.xlsx') ||
                      file.name.endsWith('.xls');
      
      if (isExcel) {
        // For XLSX, read as base64
        try {
          fileContent = await FileSystem.readAsStringAsync(file.uri, {
            encoding: 'base64',
          });
        } catch (error) {
          console.error('Error reading XLSX file:', error);
          Toast.show({
            type: 'error',
            text1: 'File Read Error',
            text2: 'Unable to read Excel file. Please try a CSV file instead.',
          });
          setImporting(false);
          return;
        }
      } else {
        // For CSV, read as UTF8
        fileContent = await FileSystem.readAsStringAsync(file.uri, {
          encoding: 'utf8',
        });
      }

      // Parse the file directly without using the full import service
      // to avoid global duplicate checks
      const isExcelFile = isExcel;
      let rows;
      
      if (isExcelFile) {
        rows = StudentImportService.parseXLSX(fileContent);
      } else {
        rows = StudentImportService.parseCSV(fileContent);
      }

      setImportProgress(30);

      // Validate rows
      const validStudents = [];
      const errors = [];
      
      for (const row of rows) {
        const rowErrors = StudentImportService.validateRow(row);
        if (rowErrors.length === 0) {
          validStudents.push({
            student_id: row.studentId,
            first_name: row.firstName,
            last_name: row.lastName,
            email: row.email || '',
          });
        } else {
          errors.push(...rowErrors);
        }
      }

      setImportProgress(60);

      // Check for duplicates within the current class only
      const existingStudentIds = new Set(
        classData.students.map(s => s.student_id)
      );

      // Add students to the class
      let successCount = 0;
      for (const student of validStudents) {
        // Check if student already exists in THIS class
        if (existingStudentIds.has(student.student_id)) {
          errors.push({
            rowNumber: 0,
            field: 'student_id',
            value: student.student_id,
            error: 'Student already exists in this class',
            severity: 'warning' as const,
          });
          continue;
        }

        try {
          await ClassService.addStudent(classId, student);
          existingStudentIds.add(student.student_id); // Track added students
          successCount++;
        } catch (error) {
          console.error('Error adding student to class:', error);
          errors.push({
            rowNumber: 0,
            field: 'student_id',
            value: student.student_id,
            error: error instanceof Error ? error.message : 'Failed to add student',
            severity: 'error' as const,
          });
        }
      }

      setImportProgress(100);

      // Show results
      if (errors.length > 0) {
        console.log('[Import] Errors:', JSON.stringify(errors, null, 2));
        
        Toast.show({
          type: successCount > 0 ? 'warning' : 'error',
          text1: successCount > 0 ? 'Import Completed with Errors' : 'Import Failed',
          text2: successCount > 0 
            ? `${successCount} students added, ${errors.length} errors`
            : `${errors.length} errors found`,
          visibilityTime: 5000,
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Import Successful',
          text2: `${successCount} students added successfully`,
        });
      }

      // Reload class data
      await loadClassData();
      
    } catch (error) {
      console.error('Import error:', error);
      Toast.show({
        type: 'error',
        text1: 'Import Failed',
        text2: error instanceof Error ? error.message : 'Failed to import students',
      });
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  };

  const filteredStudents = (classData?.students ?? []).filter((student) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
    return (
      fullName.includes(q) ||
      student.student_id.toLowerCase().includes(q) ||
      (student.email ?? "").toLowerCase().includes(q)
    );
  });
  const recentQuizzes = [
    {
      id: "q1",
      title: `Midterm Exam - ${classData?.section_block.toUpperCase() ?? ""}`,
      subject: classData?.course_subject ?? "N/A",
      date: "Feb 11, 2026",
      students: classData?.students.length ?? 0,
    },
  ];
  const filteredQuizzes = recentQuizzes.filter((quiz) =>
    quiz.title.toLowerCase().includes(quizSearch.toLowerCase()),
  );

  const getScore = (studentId: string) => {
    const numeric = parseInt(studentId.replace(/\D/g, "").slice(-2) || "0", 10);
    return Math.max(2, Math.min(49, (numeric % 50) || 32));
  };

  const getScoreColor = (score: number) => {
    if (score >= 40) return "#00a550";
    if (score >= 25) return "#ff9800";
    return "#e74c3c";
  };

  const renderStudentItem = ({ item }: { item: Student }) => (
    <View
      style={[
        styles.studentCard,
        {
          backgroundColor: colors.studentCardBg,
          borderColor: colors.studentCardBorder,
        },
      ]}
    >
      <View style={styles.studentInfo}>
        <View style={styles.studentAvatar}>
          <Text style={styles.studentAvatarText}>
            {item.first_name.charAt(0)}
            {item.last_name.charAt(0)}
          </Text>
        </View>
        <View style={styles.studentDetails}>
          <Text
            style={[
              styles.studentName,
              { color: darkModeEnabled ? colors.text : "#2c3d35" },
            ]}
          >
            {item.first_name} {item.last_name}
          </Text>
          <Text
            style={[
              styles.studentId,
              { color: darkModeEnabled ? colors.textSecondary : "#6a7b72" },
            ]}
          >
            ID: {item.student_id}
          </Text>
          {item.email && (
            <Text
              style={[
                styles.studentEmail,
                { color: darkModeEnabled ? colors.textMuted : "#85968d" },
              ]}
            >
              {item.email}
            </Text>
          )}
        </View>
      </View>
      {showClassDetails ? (
        <TouchableOpacity
          onPress={() =>
            handleRemoveStudent(
              item.student_id,
              `${item.first_name} ${item.last_name}`,
            )
          }
        >
          <Ionicons name="trash-outline" size={20} color={COLORS.error} />
        </TouchableOpacity>
      ) : (
        <View
          style={[
            styles.scoreBadge,
            {
              backgroundColor: colors.scoreBadgeBg,
              borderColor: colors.scoreBadgeBorder,
            },
          ]}
        >
          <Text
            style={[
              styles.scoreText,
              { color: getScoreColor(getScore(item.student_id)) },
            ]}
          >
            {getScore(item.student_id)}/50
          </Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.screenBg }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading class details...
        </Text>
      </View>
    );
  }

  if (error || !classData) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.screenBg }]}>
        <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
        <Text style={styles.errorText}>{error || "Class not found"}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadClassData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goToClasses}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
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
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.backIcon, { backgroundColor: colors.headerIconBg }]}
          onPress={goToClasses}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={darkModeEnabled ? colors.text : "#2b4337"}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {showClassDetails ? "Class Details" : ""}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {showClassDetails && (
          <>
            {/* Class Info Section */}
            <View style={[styles.section, styles.heroSection]}>
              <Text style={styles.classCode}>
                {classData.section_block.toUpperCase()}
              </Text>
              <Text style={styles.className}>{classData.class_name}</Text>
              <Text style={styles.courseSubject}>{classData.course_subject}</Text>
            </View>

            {/* Details Section */}
            <View style={[styles.section, styles.classInfoSection]}>
              <Text style={[styles.sectionTitle, styles.sectionTitleOnDark]}>
                Class Information
              </Text>

              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={20} color="#d2e8dc" />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, styles.infoLabelOnDark]}>
                    Room
                  </Text>
                  <Text style={[styles.infoValue, styles.infoValueOnDark]}>
                    {classData.room || "N/A"}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Class List Nav */}
        <View
          style={[
            styles.section,
            showClassDetails ? styles.listSwitchSection : styles.listSwitchSectionLight,
            showClassDetails
              ? {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.borderSoft,
                }
              : {
                  backgroundColor: darkModeEnabled
                    ? colors.surface
                    : colors.surfaceMuted,
                  borderColor: darkModeEnabled
                    ? colors.border
                    : colors.surfaceMuted,
                },
          ]}
        >
          <View
            style={[
              styles.listNav,
              {
                backgroundColor: darkModeEnabled ? "#2a3129" : "#e7e2d3",
                borderColor: darkModeEnabled ? "#4b5b53" : "#d4c5a0",
              },
            ]}
            onLayout={(event) => setListNavWidth(event.nativeEvent.layout.width)}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.listNavActivePill,
                { width: listNavPillWidth },
                {
                  backgroundColor: darkModeEnabled ? "#35523f" : "#3f6f52",
                },
                {
                  transform: [
                    {
                      translateX: tabSlideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, listNavPillWidth],
                      }),
                    },
                  ],
                },
              ]}
            />
            <TouchableOpacity
              style={styles.listNavButton}
              onPress={() => setActiveTab("students")}
            >
              <Text
                style={[
                  styles.listNavText,
                  { color: darkModeEnabled ? colors.textSecondary : "#4d5f55" },
                  activeTab === "students" && styles.listNavTextActive,
                ]}
              >
                Student List
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.listNavButton}
              onPress={() => setActiveTab("quizzes")}
            >
              <Text
                style={[
                  styles.listNavText,
                  { color: darkModeEnabled ? colors.textSecondary : "#4d5f55" },
                  activeTab === "quizzes" && styles.listNavTextActive,
                ]}
              >
                Recent Quizzes
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.studentSearchRow,
              {
                backgroundColor: darkModeEnabled ? colors.inputBg : "#3f6b54",
                borderColor: darkModeEnabled ? colors.inputBorder : "#355b49",
              },
            ]}
          >
            <Ionicons
              name="search"
              size={16}
              color={darkModeEnabled ? colors.textSecondary : "#d2e8dc"}
            />
            <TextInput
              ref={studentSearchInputRef}
              style={[
                styles.studentSearchInput,
                { color: darkModeEnabled ? colors.text : "#ecf7f1" },
              ]}
              placeholder={
                activeTab === "students" ? "Search student..." : "Search quizzes..."
              }
              placeholderTextColor={colors.inputPlaceholder}
              value={activeTab === "students" ? studentSearch : quizSearch}
              onChangeText={
                activeTab === "students" ? setStudentSearch : setQuizSearch
              }
              autoCapitalize="none"
            />
            <View
              style={[
                styles.studentCountBadge,
                { backgroundColor: colors.badgeBg },
              ]}
            >
              <Ionicons
                name={activeTab === "students" ? "people-outline" : "document-text-outline"}
                size={12}
                color={colors.badgeText}
              />
              <Text
                style={[styles.studentCountText, { color: colors.badgeText }]}
              >
                {activeTab === "students"
                  ? filteredStudents.length
                  : filteredQuizzes.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Students / Quizzes Section */}
        <View
          style={[
            styles.section,
            showClassDetails ? styles.listContentSection : styles.listContentSectionLight,
            showClassDetails
              ? {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.borderSoft,
                }
              : {
                  backgroundColor: darkModeEnabled
                    ? colors.surface
                    : colors.surfaceMuted,
                  borderColor: darkModeEnabled
                    ? colors.border
                    : colors.surfaceMuted,
                },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, styles.sectionTitleOnDark]}>
              {activeTab === "students"
                ? `Students (${filteredStudents.length})`
                : "Recent Quizzes"}
            </Text>
            {activeTab === "students" && (
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.importButton}
                  onPress={handleBulkImport}
                  disabled={importing}
                >
                  {importing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addStudentButton}
                  onPress={() => setAddStudentModalVisible(true)}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {activeTab === "students" && classData.students.length === 0 ? (
            <View style={styles.emptyStudents}>
              <Ionicons
                name="people-outline"
                size={48}
                color={colors.emptyIcon}
              />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No students yet
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                Tap + to add your first student
              </Text>
            </View>
          ) : activeTab === "students" ? (
            <FlatList
              data={filteredStudents}
              renderItem={renderStudentItem}
              keyExtractor={(item) => item.student_id}
              scrollEnabled={false}
            />
          ) : filteredQuizzes.length === 0 ? (
            <View
              style={[
                styles.quizPlaceholderCard,
                {
                  backgroundColor: darkModeEnabled
                    ? colors.surfaceMuted
                    : "rgba(233, 245, 238, 0.16)",
                  borderColor: darkModeEnabled
                    ? colors.border
                    : "rgba(221, 239, 230, 0.3)",
                },
              ]}
            >
              <Text
                style={[styles.quizPlaceholderTitle, { color: colors.text }]}
              >
                No recent quizzes yet
              </Text>
              <Text
                style={[
                  styles.quizPlaceholderSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                Create a quiz to see latest results for this class.
              </Text>
            </View>
          ) : (
            filteredQuizzes.map((quiz) => (
              <View
                key={quiz.id}
                style={[
                  styles.quizCard,
                  {
                    backgroundColor: colors.quizCardBg,
                    borderColor: colors.quizCardBorder,
                  },
                ]}
              >
                <Text style={[styles.quizCardTitle, { color: colors.text }]}>
                  {quiz.title}
                </Text>
                <Text
                  style={[styles.quizCardSubject, { color: colors.textSecondary }]}
                >
                  {quiz.subject}
                </Text>
                <View style={styles.quizMetaRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={12}
                    color={darkModeEnabled ? colors.textSecondary : "#cde2d8"}
                  />
                  <Text
                    style={[
                      styles.quizMetaText,
                      {
                        color: darkModeEnabled
                          ? colors.textSecondary
                          : "#d5e9de",
                      },
                    ]}
                  >
                    {quiz.date}
                  </Text>
                </View>
                <View style={styles.quizActionsRow}>
                  <View
                    style={[
                      styles.quizStudentsBadge,
                      {
                        backgroundColor: colors.quizBadgeBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quizStudentsBadgeText,
                        { color: colors.quizBadgeText },
                      ]}
                    >
                      {quiz.students} STUDENTS
                    </Text>
                  </View>
                  <View style={styles.quizRightActions}>
                    <TouchableOpacity
                      style={[
                        styles.quizActionBtn,
                        { backgroundColor: colors.quizActionBg },
                      ]}
                    >
                      <Ionicons name="share-social-outline" size={12} color="#fff" />
                      <Text style={styles.quizActionText}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.quizActionBtn,
                        { backgroundColor: colors.quizActionBg },
                      ]}
                    >
                      <Ionicons name="download-outline" size={12} color="#fff" />
                      <Text style={styles.quizActionText}>Export</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add Student Modal */}
      <Modal
        visible={addStudentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddStudentModalVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { backgroundColor: colors.modalOverlay },
          ]}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Add Student
              </Text>
              <TouchableOpacity
                onPress={() => setAddStudentModalVisible(false)}
              >
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Student ID *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.inputBorder,
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                  },
                ]}
                placeholder="e.g., 202311070"
                placeholderTextColor={colors.inputPlaceholder}
                value={studentForm.student_id}
                onChangeText={(text) =>
                  setStudentForm({ ...studentForm, student_id: text })
                }
                keyboardType="numeric"
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                First Name *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.inputBorder,
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                  },
                ]}
                placeholder="e.g., John"
                placeholderTextColor={colors.inputPlaceholder}
                value={studentForm.first_name}
                onChangeText={(text) =>
                  setStudentForm({ ...studentForm, first_name: text })
                }
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Last Name *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.inputBorder,
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                  },
                ]}
                placeholder="e.g., Doe"
                placeholderTextColor={colors.inputPlaceholder}
                value={studentForm.last_name}
                onChangeText={(text) =>
                  setStudentForm({ ...studentForm, last_name: text })
                }
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Email
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.inputBorder,
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                  },
                ]}
                placeholder="e.g., student@example.com"
                placeholderTextColor={colors.inputPlaceholder}
                value={studentForm.email}
                onChangeText={(text) =>
                  setStudentForm({ ...studentForm, email: text })
                }
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View
              style={[styles.modalFooter, { borderTopColor: colors.border }]}
            >
              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  {
                    borderColor: colors.inputBorder,
                    backgroundColor: darkModeEnabled
                      ? colors.surfaceMuted
                      : "#f7f9f8",
                  },
                ]}
                onPress={() => setAddStudentModalVisible(false)}
                disabled={addingStudent}
              >
                <Text
                  style={[
                    styles.cancelButtonText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addButton,
                  addingStudent && styles.addButtonDisabled,
                ]}
                onPress={handleAddStudent}
                disabled={addingStudent}
              >
                {addingStudent ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.addButtonText}>Add Student</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={removeStudentConfirmVisible}
        title="Remove Student"
        message={
          studentToRemove
            ? `Are you sure you want to remove ${studentToRemove.studentName} from this class?`
            : "Are you sure you want to remove this student from this class?"
        }
        cancelText="Cancel"
        confirmText="Remove"
        destructive
        onCancel={() => {
          setRemoveStudentConfirmVisible(false);
          setStudentToRemove(null);
        }}
        onConfirm={async () => {
          if (!studentToRemove) return;
          setRemoveStudentConfirmVisible(false);
          try {
            await ClassService.removeStudent(classId, studentToRemove.studentId);
            Toast.show({
              type: "success",
              text1: "Success",
              text2: "Student removed successfully",
            });
            loadClassData();
          } catch (error) {
            console.error("Error removing student:", error);
            Toast.show({
              type: "error",
              text1: "Error",
              text2: "Failed to remove student",
            });
          } finally {
            setStudentToRemove(null);
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
    backgroundColor: "#edf1ee",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#edf1ee",
    padding: 20,
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
  backIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e2efe8",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#24362f",
    minWidth: 120,
    textAlign: "center",
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.medium,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#d5dfd9",
  },
  classInfoSection: {
    backgroundColor: "#4f715f",
    borderColor: "#3f5f4f",
  },
  listSwitchSection: {
    backgroundColor: "#4f715f",
    borderColor: "#3f5f4f",
  },
  listSwitchSectionLight: {
    backgroundColor: "#f4f5f2",
    borderColor: "#f4f5f2",
    padding: 0,
    marginBottom: 8,
  },
  listContentSection: {
    backgroundColor: "#4f715f",
    borderColor: "#3f5f4f",
    paddingTop: 10,
  },
  listContentSectionLight: {
    backgroundColor: "#f4f5f2",
    borderColor: "#f4f5f2",
    padding: 0,
    marginBottom: 0,
  },
  heroSection: {
    backgroundColor: "#4f715f",
    borderColor: "#3f5f4f",
  },
  classCode: {
    fontSize: 30,
    fontWeight: "800",
    color: "#ecf7f1",
    marginBottom: 4,
  },
  className: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ecf7f1",
    marginBottom: 3,
  },
  courseSubject: {
    fontSize: 14,
    color: "#cce2d7",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#24362f",
    marginBottom: 14,
  },
  sectionTitleOnDark: {
    color: "#e8f3ed",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  listNav: {
    flexDirection: "row",
    backgroundColor: "#e7e2d3",
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: "#d4c5a0",
    padding: 3,
    marginBottom: 12,
    position: "relative",
  },
  listNavActivePill: {
    position: "absolute",
    left: 3,
    top: 3,
    bottom: 3,
    borderRadius: RADIUS.small,
    backgroundColor: "#3f6f52",
  },
  listNavButton: {
    flex: 1,
    borderRadius: RADIUS.small,
    paddingVertical: 8,
    alignItems: "center",
    zIndex: 2,
  },
  listNavText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4d5f55",
  },
  listNavTextActive: {
    color: COLORS.white,
  },
  studentSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3f6b54",
    borderWidth: 1,
    borderColor: "#355b49",
    borderRadius: RADIUS.small,
    paddingHorizontal: 12,
    paddingVertical: 1,
    gap: 8,
  },
  studentSearchInput: {
    flex: 1,
    height: 40,
    color: "#ecf7f1",
    fontSize: 14,
  },
  studentCountBadge: {
    minWidth: 34,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#7da78f",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  studentCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#214132",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  importButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2d7a5f",
    alignItems: "center",
    justifyContent: "center",
  },
  addStudentButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 12,
    backgroundColor: "rgba(233, 245, 238, 0.16)",
    padding: 10,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: "rgba(221, 239, 230, 0.28)",
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: "#759084",
    marginBottom: 4,
  },
  infoLabelOnDark: {
    color: "#cce2d7",
  },
  infoValue: {
    fontSize: 18,
    color: "#2d4439",
    fontWeight: "700",
  },
  infoValueOnDark: {
    color: "#f2fbf6",
  },
  studentCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#e0cfb4",
    borderRadius: RADIUS.small,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#6f6c62",
  },
  scoreBadge: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: "#d7c8af",
    backgroundColor: "#e9d8bf",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: "800",
  },
  studentInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  studentAvatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2c3d35",
    marginBottom: 2,
  },
  studentId: {
    fontSize: 11,
    color: "#6a7b72",
  },
  studentEmail: {
    fontSize: 12,
    color: "#85968d",
    marginTop: 2,
  },
  emptyStudents: {
    alignItems: "center",
    paddingVertical: 40,
  },
  quizPlaceholderCard: {
    backgroundColor: "rgba(233, 245, 238, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(221, 239, 230, 0.3)",
    borderRadius: RADIUS.small,
    padding: 14,
  },
  quizPlaceholderTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#e8f4ed",
    marginBottom: 4,
  },
  quizPlaceholderSubtitle: {
    fontSize: 13,
    color: "#cce2d7",
  },
  quizCard: {
    backgroundColor: "#3f6b54",
    borderWidth: 1,
    borderColor: "#355b49",
    borderRadius: RADIUS.small,
    padding: 12,
    marginBottom: 8,
  },
  quizCardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#e8f4ed",
    marginBottom: 2,
  },
  quizCardSubject: {
    fontSize: 13,
    color: "#cce2d7",
    marginBottom: 8,
  },
  quizMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  quizMetaText: {
    color: "#d5e9de",
    fontSize: 12,
  },
  quizActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quizRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quizStudentsBadge: {
    backgroundColor: "#2d4f3e",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quizStudentsBadgeText: {
    color: "#d8ebdf",
    fontSize: 10,
    fontWeight: "700",
  },
  quizActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1f3449",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  quizActionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 16,
    color: "#6d8076",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#8ea094",
    marginTop: 4,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#5d7267",
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.error,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: RADIUS.small,
    marginBottom: 12,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonText: {
    color: "#5d7267",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 25, 20, 0.55)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xlarge,
    borderTopRightRadius: RADIUS.xlarge,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#dde5e0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1f2f2a",
  },
  modalBody: {
    padding: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#34463d",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d5dfd9",
    borderRadius: RADIUS.small,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: "#f8fbf9",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#dde5e0",
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: "#d4ddd8",
    backgroundColor: "#f7f9f8",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    color: "#5c6d64",
    fontWeight: "700",
  },
  addButton: {
    flex: 1,
    padding: 14,
    borderRadius: RADIUS.small,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: "700",
  },
});
