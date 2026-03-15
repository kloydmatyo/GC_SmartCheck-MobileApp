import ConfirmationModal from "@/components/common/ConfirmationModal";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Animated,
  Dimensions,
  DeviceEventEmitter,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Toast from "react-native-toast-message";
import * as XLSX from "xlsx";

import { auth, db } from "@/config/firebase";
import { StudentImportModal } from "@/components/student/StudentImportModal";

import { DashboardService } from "@/services/dashboardService";
import { ImportResult } from "@/types/student";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { COLORS, RADIUS } from "../../constants/theme";
import { ClassService } from "../../services/classService";
import { Class } from "../../types/class";

type DetailTab = "students" | "exams" | "scan" | "stats";

type StudentRow = {
  id: string;
  initials: string;
  name: string;
  average: number;
  scans: number;
  color: string;
};

type ExamRow = {
  id: string;
  title: string;
  questions: number;
  scans: number;
  average: number;
  subject: string;
  examCode?: string;
  classId?: string;
  className?: string;
};

function scoreColor(value: number) {
  if (value >= 85) return "#20BE7B";
  if (value >= 70) return "#F59E0B";
  return "#EF4444";
}

function avatarColor(index: number) {
  const colors = ["#CFF0DD", "#D7E6F8", "#F6DEDD", "#F7E7BE"];
  return colors[index % colors.length];
}

function buildStudentAverage(studentId: string, index: number) {
  const digits = Number(studentId.replace(/\D/g, "").slice(-2) || index + 70);
  return 60 + (digits % 35);
}

function AnimatedStatBar({
  progress,
  color = "#20BE7B",
  height = 8,
}: {
  progress: number;
  color?: string;
  height?: number;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const animatedWidth = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trackWidth) return;
    animatedWidth.setValue(0);
    Animated.timing(animatedWidth, {
      toValue: trackWidth * Math.max(0, Math.min(progress, 1)),
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [animatedWidth, progress, trackWidth]);

  return (
    <View
      style={[styles.animatedBarTrack, { height }]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.animatedBarFill,
          {
            width: animatedWidth,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

export default function ClassDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const classId = params.classId as string;
  const requestedTab = params.tab as DetailTab | undefined;

  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>(
    requestedTab && ["students", "exams", "scan", "stats"].includes(requestedTab)
      ? requestedTab
      : "students",
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
  const [sortBy, setSortBy] = useState<'id_asc' | 'id_desc' | 'fname_asc' | 'fname_desc'>('id_asc');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: "" });
  const [importErrors, setImportErrors] = useState<{
    visible: boolean;
    successCount: number;
    errors: Array<{ student_id: string; error: string }>;
  }>({ visible: false, successCount: 0, errors: [] });

  // Student form state
  const [studentForm, setStudentForm] = useState({
    student_id: "",
    first_name: "",
    last_name: "",
    email: "",
  });
  const [listNavWidth, setListNavWidth] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [examRows, setExamRows] = useState<ExamRow[]>([]);
  const [examRowsLoading, setExamRowsLoading] = useState(false);
  const examLoadRequestRef = useRef(0);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [archiveClassConfirmVisible, setArchiveClassConfirmVisible] = useState(false);
  const [deleteClassConfirmVisible, setDeleteClassConfirmVisible] = useState(false);
  const [examMenuVisible, setExamMenuVisible] = useState(false);
  const [examMenuPosition, setExamMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedExam, setSelectedExam] = useState<ExamRow | null>(null);
  const [archiveExamConfirmVisible, setArchiveExamConfirmVisible] = useState(false);
  const [deleteExamConfirmVisible, setDeleteExamConfirmVisible] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
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

  const loadClassData = useCallback(async () => {
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
  }, [classId]);

  const loadExams = useCallback(async () => {
    const requestId = ++examLoadRequestRef.current;
    try {
      setExamRowsLoading(true);
      setExamRows([]);
      const currentUser = auth.currentUser;
      if (!currentUser || !classData) {
        setExamRows([]);
        return;
      }

      const examSnapshot = await getDocs(
        query(collection(db, "exams"), where("createdBy", "==", currentUser.uid)),
      );

      const linkedExams = examSnapshot.docs
        .map((item) => {
          const data = item.data();
          const subject = String(data.subject || "General");
          const title = String(data.title || "Untitled Exam");
          const examCode = String(data.examCode || "").trim();
          const questions =
            Number(data.num_items || data.totalQuestions || 0) ||
            (Array.isArray(data.questions) ? data.questions.length : 0) ||
            (Array.isArray(data.questionSettings) ? data.questionSettings.length : 0);
          const linkedClassId = String(data.classId || "");
          const linkedClassName = String(data.className || "");

          return {
            id: item.id,
            title,
            questions: questions || 0,
            scans: 0,
            average: 0,
            subject,
            examCode,
            classId: linkedClassId,
            className: linkedClassName,
            isArchived: Boolean(data.isArchived),
          };
        })
        .filter((exam) => {
          if (exam.isArchived) return false;
          const className = classData.class_name.trim().toLowerCase();
          return (
            (exam.classId && exam.classId === classData.id) ||
            (exam.className && exam.className.trim().toLowerCase() === className)
          );
        });

      const examsWithStats = await Promise.all(
        linkedExams.map(async (exam) => {
          try {
            const stats = await DashboardService.getExamStats(exam.id);
            return {
              ...exam,
              scans: stats.totalGraded,
              average: stats.classAverage,
            };
          } catch (error) {
            console.warn(`Failed to load stats for exam ${exam.id}:`, error);
            return exam;
          }
        }),
      );

      if (requestId !== examLoadRequestRef.current) return;
      setExamRows(examsWithStats);
    } catch (error) {
      console.error("Error loading exams:", error);
      if (requestId !== examLoadRequestRef.current) return;
      setExamRows([]);
    } finally {
      if (requestId !== examLoadRequestRef.current) return;
      setExamRowsLoading(false);
    }
  }, [classData]);

  useEffect(() => {
    examLoadRequestRef.current += 1;
    setExamRows([]);
    setExamRowsLoading(true);
    clearExamSelection();
  }, [classId]);

  useEffect(() => {
    if (
      requestedTab &&
      ["students", "exams", "scan", "stats"].includes(requestedTab)
    ) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  const handleArchiveClass = async () => {
    if (!classData) return;

    try {
      await ClassService.updateClass(classData.id, { isArchived: true });
      setArchiveClassConfirmVisible(false);
      setSettingsMenuVisible(false);
      Toast.show({
        type: "archive_result",
        text1: "Archived",
        text2: `${classData.class_name} moved to Archived`,
      });
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

  useFocusEffect(
    useCallback(() => {
      loadClassData();
    }, [loadClassData]),
  );

  useFocusEffect(
    useCallback(() => {
      loadExams();
    }, [loadExams]),
  );

  const students = useMemo<StudentRow[]>(() => {
    if (!classData) return [];
    return classData.students.map((student, index) => {
      const average = buildStudentAverage(student.student_id, index);
      return {
        id: student.student_id,
        initials: `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`.toUpperCase(),
        name: `${student.first_name} ${student.last_name}`,
        average,
        scans: 1,
        color: avatarColor(index),
      };
    });
  }, [classData]);

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter((student) => student.name.toLowerCase().includes(q));
  }, [searchQuery, students]);

  const filteredExams = useMemo(() => {
    if (!searchQuery.trim()) return examRows;
    const q = searchQuery.toLowerCase();
    return examRows.filter(
      (exam) =>
        exam.title.toLowerCase().includes(q) ||
        exam.subject.toLowerCase().includes(q),
    );
  }, [examRows, searchQuery]);

  const openExamMenu = useCallback((exam: ExamRow, pageX?: number, pageY?: number) => {
    const menuWidth = 164;
    const screenWidth = Dimensions.get("window").width;
    const fallbackLeft = Math.max(16, screenWidth - menuWidth - 20);
    const left =
      typeof pageX === "number"
        ? Math.min(Math.max(16, pageX - menuWidth + 24), screenWidth - menuWidth - 16)
        : fallbackLeft;
    const top = typeof pageY === "number" ? Math.max(96, pageY - 8) : 150;

    setSelectedExam(exam);
    setExamMenuPosition({ top, left });
    setExamMenuVisible(true);
  }, []);

  const closeExamMenu = useCallback(() => {
    setExamMenuVisible(false);
  }, []);

  const clearExamSelection = useCallback(() => {
    setSelectedExam(null);
    setArchiveExamConfirmVisible(false);
    setDeleteExamConfirmVisible(false);
  }, []);

  const handleImportComplete = async (result: ImportResult) => {
    if (!classData) {
      setShowImportModal(false);
      return;
    }

    const importedStudents = result.processedRows.map((row) => ({
      student_id: row.studentId,
      first_name: row.firstName,
      last_name: row.lastName,
      email: row.email,
    }));

    const merged = [...classData.students];
    const seen = new Set(merged.map((student) => student.student_id));

    importedStudents.forEach((student) => {
      if (!seen.has(student.student_id)) {
        seen.add(student.student_id);
        merged.push(student);
      }
    });

    try {
      await ClassService.updateClass(classData.id, { students: merged });
      setShowImportModal(false);
      Toast.show({
        type: "success",
        text1: "Imported",
        text2: `${importedStudents.length} students added to ${classData.class_name}`,
      });
      await loadClassData();
    } catch (error) {
      console.error("Error attaching imported students to class:", error);
      Toast.show({
        type: "error",
        text1: "Import Error",
        text2: "Students were imported but could not be added to this class.",
      });
    }
  };

  const handleArchiveExam = async () => {
    if (!selectedExam) return;
    try {
      const examTitle = selectedExam.title;
      await updateDoc(doc(db, "exams", selectedExam.id), { isArchived: true });
      closeExamMenu();
      clearExamSelection();
      Toast.show({
        type: "archive_result",
        text1: "Archived",
        text2: `${examTitle} moved to Archived`,
      });
      loadExams();
    } catch (error) {
      console.error("Error archiving exam:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to archive exam",
      });
    }
  };

  const handleDeleteExam = async () => {
    if (!selectedExam) return;
    try {
      await deleteDoc(doc(db, "exams", selectedExam.id));
      closeExamMenu();
      clearExamSelection();
      Toast.show({
        type: "delete_result",
        text1: "Deleted",
        text2: "Exam deleted successfully",
      });
      loadExams();
    } catch (error) {
      console.error("Error deleting exam:", error);
      Toast.show({ type: "error", text1: "Error", text2: "Failed to delete exam" });
    }
  };

  const handleDeleteClass = async () => {
    if (!classData) return;
    try {
      await ClassService.deleteClass(classData.id);
      setDeleteClassConfirmVisible(false);
      Toast.show({ type: "delete_result", text1: "Deleted", text2: `${classData.class_name} has been deleted` });
      router.replace("/(tabs)/classes");
    } catch (error) {
      console.error("Error deleting class:", error);
      Toast.show({ type: "error", text1: "Error", text2: "Failed to delete class" });
    }
  };

  const handleExportStudents = async () => {
    if (!classData || classData.students.length === 0) {
      Toast.show({
        type: 'info',
        text1: 'No Students',
        text2: 'There are no students to export',
      });
      return;
    }

    try {
      setExporting(true);

      // Prepare data for Excel
      const exportData = classData.students.map((student, index) => ({
        'No.': index + 1,
        'Student ID': student.student_id,
        'First Name': student.first_name,
        'Last Name': student.last_name,
        'Email': student.email || '',
      }));

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      ws['!cols'] = [
        { wch: 5 },  // No.
        { wch: 15 }, // Student ID
        { wch: 20 }, // First Name
        { wch: 20 }, // Last Name
        { wch: 30 }, // Email
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Students');

      // Generate filename
      const className = classData.class_name.replace(/[^a-z0-9]/gi, '_');
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${className}_Students_${timestamp}.xlsx`;

      // Write file
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      // Save file
      if (Platform.OS === 'web') {
        // Web: trigger download
        const blob = await (await fetch(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${wbout}`)).blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        Toast.show({
          type: 'success',
          text1: 'Export Successful',
          text2: `Downloaded ${classData.students.length} students`,
        });
      } else {
        // Native: Let user choose save location
        try {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          
          if (!permissions.granted) {
            Toast.show({
              type: 'error',
              text1: 'Permission Denied',
              text2: 'Storage access is required to save the file',
            });
            return;
          }

          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );

          await FileSystem.writeAsStringAsync(fileUri, wbout, {
            encoding: FileSystem.EncodingType.Base64,
          });

          Toast.show({
            type: 'success',
            text1: 'File Downloaded',
            text2: `${classData.students.length} students saved to ${filename}`,
            visibilityTime: 4000,
          });
        } catch (permError) {
          // Fallback to app directory if permission issues
          console.log('Permission error, falling back to app directory:', permError);
          const fileUri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(fileUri, wbout, {
            encoding: FileSystem.EncodingType.Base64,
          });

          Toast.show({
            type: 'success',
            text1: 'File Saved',
            text2: Platform.OS === 'ios' 
              ? `Open Files app > On My ${Platform.OS === 'ios' ? 'iPhone/iPad' : 'Device'} > ${filename}`
              : `File saved to app folder: ${filename}`,
            visibilityTime: 5000,
          });
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      Toast.show({
        type: 'error',
        text1: 'Export Failed',
        text2: 'Could not export student list',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleBulkImport = async (fileContent: string, isExcel: boolean) => {
    try {
      const isExcelFile = isExcel;
      let rows;

      const headerErrors = isExcelFile
        ? StudentImportService.validateXLSXHeaders(fileContent)
        : StudentImportService.validateCSVHeaders(fileContent);

      if (headerErrors.length > 0) {
        setImportErrors({
          visible: true,
          successCount: 0,
          errors: headerErrors.map((e) => ({
            student_id: e.field,
            error: e.error,
          })),
        });
        setImporting(false);
        return;
      }

      if (isExcelFile) {
        rows = StudentImportService.parseXLSX(fileContent);
      } else {
        rows = StudentImportService.parseCSV(fileContent);
      }

      setImportProgress(30);

      const validStudents: any[] = [];
      const errors: any[] = [];

      for (const row of rows) {
        const rowErrors = StudentImportService.validateRow(row);
        if (rowErrors.length === 0) {
          validStudents.push({
            rowNumber: row.rowNumber,
            student_id: row.studentId,
            first_name: row.firstName,
            last_name: row.lastName,
            email: row.email || "",
          });
        } else {
          errors.push(...rowErrors);
        }
      }

      const existingStudentIds = new Set(
        (classData?.students ?? []).map((s) => s.student_id)
      );

      const duplicateInClassErrors = validStudents
        .filter((student) => existingStudentIds.has(student.student_id))
        .map((student) => ({
          rowNumber: student.rowNumber,
          field: "student_id",
          value: student.student_id,
          error: "Student already exists in this class",
          severity: "warning" as const,
        }));

      if (duplicateInClassErrors.length > 0) {
        errors.push(...duplicateInClassErrors);
      }

      let successCount = 0;
      for (const student of validStudents) {
        try {
          await ClassService.addStudent(classId, student);
          existingStudentIds.add(student.student_id);
          successCount++;
        } catch (err) {
          console.error("Error adding student to class:", err);
          let cleanMessage = "Failed to add student";
          if (err instanceof Error) {
            cleanMessage = err.message.replace(/^Error:\s*/i, "").trim();
          }
          errors.push({
            rowNumber: 0,
            field: "student_id",
            value: student.student_id,
            error: cleanMessage,
            severity: cleanMessage.toLowerCase().includes("already exists") ? "warning" as const : "error" as const,
          });
        }
      }

      setImportProgress(100);

      if (errors.length > 0) {
        setImportErrors({
          visible: true,
          successCount,
          errors: errors.map((e) => ({
            student_id: e.value,
            error: e.error,
          })),
        });
      } else {
        Toast.show({
          type: "success",
          text1: "Import Successful",
          text2: `${successCount} students added successfully`,
        });
      }
    } catch (error) {
      console.error("Error during bulk import:", error);
      Toast.show({
        type: "error",
        text1: "Import Failed",
        text2: "Could not import students",
      });
    } finally {
      setImporting(false);
    }
  };

  const requestArchiveClass = () => {
    setSettingsMenuVisible(false);
    setArchiveClassConfirmVisible(true);
  };

  const requestDeleteClass = () => {
    setSettingsMenuVisible(false);
    setDeleteClassConfirmVisible(true);
  };

  const requestArchiveExam = () => {
    if (!selectedExam) return;
    setExamMenuVisible(false);
    setArchiveExamConfirmVisible(true);
  };

  const requestDeleteExam = () => {
    if (!selectedExam) return;
    setExamMenuVisible(false);
    setDeleteExamConfirmVisible(true);
  };

  const stats = useMemo(() => {
    if (!students.length) {
      return {
        average: 0,
        highest: 0,
        lowest: 0,
        totalScanned: 0,
        passed: 0,
        failed: 0,
        distribution: [
          { label: "90-100", count: 0 },
          { label: "80-89", count: 0 },
          { label: "70-79", count: 0 },
          { label: "60-69", count: 0 },
          { label: "< 60", count: 0 },
        ],
      };
    }

    const averages = students.map((student) => student.average);
    const distribution = [
      { label: "90-100", count: averages.filter((value) => value >= 90).length },
      { label: "80-89", count: averages.filter((value) => value >= 80 && value < 90).length },
      { label: "70-79", count: averages.filter((value) => value >= 70 && value < 80).length },
      { label: "60-69", count: averages.filter((value) => value >= 60 && value < 70).length },
      { label: "< 60", count: averages.filter((value) => value < 60).length },
    ];

    const total = averages.length;
    const sum = averages.reduce((a, b) => a + b, 0);
    return {
      average: total ? Math.round(sum / total) : 0,
      highest: total ? Math.max(...averages) : 0,
      lowest: total ? Math.min(...averages) : 0,
      totalScanned: total,
      passed: averages.filter((v) => v >= 75).length,
      failed: averages.filter((v) => v < 75).length,
      distribution,
    };
  }, [students]);

  const colors = darkModeEnabled
    ? {
        surface: "#1E2A24",
        border: "#2E3D35",
        text: "#E8F0EB",
        textSecondary: "#9DB8A8",
        textMuted: "#6B8A78",
        badgeBg: "#2A3D35",
      }
    : {
        surface: "#FFFFFF",
        border: "#E8EBF0",
        text: "#111827",
        textSecondary: "#6B7280",
        textMuted: "#9CA3AF",
        badgeBg: "#E9F8F1",
      };

  const sortedStudents = useMemo(() => {
    const arr = [...filteredStudents];
    switch (sortBy) {
      case 'id_asc': return arr.sort((a, b) => a.id.localeCompare(b.id));
      case 'id_desc': return arr.sort((a, b) => b.id.localeCompare(a.id));
      case 'fname_asc': return arr.sort((a, b) => a.name.localeCompare(b.name));
      case 'fname_desc': return arr.sort((a, b) => b.name.localeCompare(a.name));
      default: return arr;
    }
  }, [filteredStudents, sortBy]);

  const renderTab = () => {
    if (activeTab === "students") {
      return (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color="#8E97A6" />
              <TextInput
                ref={studentSearchInputRef}
                style={styles.searchInput}
                placeholder="Search students..."
                placeholderTextColor="#8E97A6"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.sortButton} onPress={() => setSortModalVisible(true)}>
                <Ionicons name="swap-vertical-outline" size={14} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportButton} onPress={handleExportStudents}>
                <Ionicons name="download-outline" size={14} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.importButton} onPress={() => setShowImportModal(true)}>
                <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          {sortedStudents.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconWrap}>
                <Ionicons name="people-outline" size={26} color="#20BE7B" />
              </View>
              <Text style={styles.emptyStateTitle}>No Students Yet</Text>
              <Text style={styles.emptyStateText}>Add students to get started.</Text>
            </View>
          ) : (
            sortedStudents.map((student) => (
              <TouchableOpacity
                key={student.id}
                style={styles.studentCard}
                onPress={() => {
                  setStudentToRemove({ studentId: student.id, studentName: student.name });
                  setRemoveStudentConfirmVisible(true);
                }}
              >
                <View style={[styles.studentAvatar, { backgroundColor: student.color }]}>
                  <Text style={styles.studentAvatarText}>{student.initials}</Text>
                </View>
                <View style={styles.studentBody}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentSubtext}>ID: {student.id}</Text>
                </View>
                <View style={styles.studentScoreWrap}>
                  <Text style={[styles.studentScore, { color: scoreColor(student.average) }]}>
                    {student.average}%
                  </Text>
                  <Text style={styles.studentAvgLabel}>avg</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      );
    }

    if (activeTab === "exams") {
      return (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color="#8E97A6" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search exams..."
                placeholderTextColor="#8E97A6"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
          <TouchableOpacity
            style={styles.createExamButton}
            onPress={() => router.push(`/(tabs)/create-quiz?classId=${classId}`)}
          >
            <Ionicons name="add-circle-outline" size={18} color="#20BE7B" />
            <Text style={styles.createExamText}>Create New Exam</Text>
          </TouchableOpacity>
          {examRowsLoading ? (
            <ActivityIndicator size="small" color="#20BE7B" style={{ marginTop: 20 }} />
          ) : filteredExams.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconWrap}>
                <Ionicons name="document-text-outline" size={26} color="#20BE7B" />
              </View>
              <Text style={styles.emptyStateTitle}>No Exams Yet</Text>
              <Text style={styles.emptyStateText}>Create an exam to get started.</Text>
            </View>
          ) : (
            filteredExams.map((exam) => (
              <View key={exam.id} style={styles.examCard}>
                <TouchableOpacity
                  style={styles.examCardPressable}
                  onPress={() => router.push(`/(tabs)/exam-preview?examId=${exam.id}&classId=${classId}`)}
                >
                  <View style={styles.examBody}>
                    <Text style={styles.examTitle}>{exam.title}</Text>
                    <Text style={styles.examMeta}>{exam.questions} items · {exam.subject}</Text>
                    {exam.examCode ? <Text style={styles.examCodeMeta}>Code: {exam.examCode}</Text> : null}
                  </View>
                  <View style={styles.examRight}>
                    <Text style={[styles.examAverage, { color: scoreColor(exam.average) }]}>
                      {exam.average > 0 ? `${exam.average}%` : "—"}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.examMenuButton}
                  onPress={(e) => {
                    e.currentTarget.measure((_fx, _fy, _w, _h, px, py) => {
                      openExamMenu(exam, px, py);
                    });
                  }}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#8E97A6" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </>
      );
    }

    if (activeTab === "scan") {
      return (
        <View style={styles.scanPanel}>
          <View style={styles.scanIconWrap}>
            <Ionicons name="scan-outline" size={36} color="#20BE7B" />
          </View>
          <Text style={styles.scanTitle}>Scan Answer Sheets</Text>
          <Text style={styles.scanDescription}>
            Use the camera to scan and grade answer sheets for this class.
          </Text>
          <TouchableOpacity
            style={styles.startScanButton}
            onPress={() => router.push(`/(tabs)/scanner?classId=${classId}`)}
          >
            <Text style={styles.startScanText}>Start Scanning</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeTab === "stats") {
      return (
        <>
          <View style={styles.statsHeroCard}>
            <Text style={styles.statsHeroLabel}>Class Average</Text>
            <Text style={styles.statsHeroValue}>{stats.average}%</Text>
            <View style={styles.statsHeroBar}>
              <AnimatedStatBar progress={stats.average / 100} />
            </View>
            <View style={styles.statsHeroFooter}>
              <Text style={styles.statsPassedText}>Passed: {stats.passed}</Text>
              <Text style={styles.statsFailedText}>Failed: {stats.failed}</Text>
            </View>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statsSmallCard}>
              <Text style={styles.statsSmallLabel}>Highest</Text>
              <Text style={[styles.statsSmallValue, { color: "#20BE7B" }]}>{stats.highest}%</Text>
            </View>
            <View style={styles.statsSmallCard}>
              <Text style={styles.statsSmallLabel}>Lowest</Text>
              <Text style={[styles.statsSmallValue, { color: "#EF4444" }]}>{stats.lowest}%</Text>
            </View>
            <View style={styles.statsSmallCard}>
              <Text style={styles.statsSmallLabel}>Students</Text>
              <Text style={styles.statsSmallValue}>{stats.totalScanned}</Text>
            </View>
          </View>
          <View style={styles.distributionCard}>
            <Text style={styles.distributionTitle}>Score Distribution</Text>
            {stats.distribution.map((item) => (
              <View key={item.label} style={styles.distributionRow}>
                <Text style={styles.distributionLabel}>{item.label}</Text>
                <View style={styles.distributionTrack}>
                  <AnimatedStatBar
                    progress={stats.totalScanned > 0 ? item.count / stats.totalScanned : 0}
                  />
                </View>
                <Text style={styles.distributionCount}>{item.count}</Text>
              </View>
            ))}
          </View>
        </>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#20BE7B" />
        <Text style={styles.loadingText}>Loading class details...</Text>
      </View>
    );
  }

  if (error || !classData) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={58} color="#EF4444" />
        <Text style={styles.errorText}>{error || "Class not found"}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadClassData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.replace("/(tabs)/classes")}>
          <Ionicons name="arrow-back" size={22} color="#5C6575" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{classData.class_name}</Text>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setSettingsMenuVisible(true)}
        >
          <Ionicons name="settings-outline" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsBar}>
        {(["students", "exams", "scan", "stats"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={styles.tabButton}
            onPress={() => {
              setActiveTab(tab);
              setSearchQuery("");
            }}
          >
            <Text
              style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {activeTab === tab && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderTab()}
      </ScrollView>

      <Modal
        visible={settingsMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSettingsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setSettingsMenuVisible(false)}
        >
          <View style={styles.menuContent}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle} numberOfLines={1}>
                {classData?.class_name || "Class"}
              </Text>
              <TouchableOpacity
                style={styles.menuCloseButton}
                onPress={() => setSettingsMenuVisible(false)}
              >
                <Ionicons name="close" size={18} color="#98A2B3" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setSettingsMenuVisible(false);
                Toast.show({
                  type: "info",
                  text1: "Sync to Web",
                  text2: "Sync to Web is still not available.",
                });
              }}
            >
              <Text style={styles.menuItemText}>Sync to Web</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setSettingsMenuVisible(false);
                Toast.show({
                  type: "info",
                  text1: "Export",
                  text2: "Export Results is not wired yet.",
                });
              }}
            >
              <Text style={styles.menuItemText}>Export Results</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                requestArchiveClass();
              }}
            >
              <Text style={[styles.menuItemText, styles.menuArchiveText]}>
                Archive Class
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                requestDeleteClass();
              }}
            >
              <Text style={[styles.menuItemText, styles.menuDeleteText]}>
                Delete Class
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>


<ConfirmationModal
  visible={archiveClassConfirmVisible}
  title="Archive Item"
  message={`Are you sure you want to archive ${
    classData?.class_name ?? "this class"
  }? You can still view it later in the archived section.`}
  cancelText="Cancel"
  confirmText="Archive"
  destructive
  onCancel={() => setArchiveClassConfirmVisible(false)}
  onConfirm={handleArchiveClass}
/>

<ConfirmationModal
  visible={deleteClassConfirmVisible}
  title="Delete Item"
  message={`Are you sure you want to delete ${
    classData?.class_name ?? "this class"
  }? This action cannot be undone.`}
  cancelText="Cancel"
  confirmText="Delete"
  destructive
  onCancel={() => setDeleteClassConfirmVisible(false)}
  onConfirm={handleDeleteClass}
/>

      <Modal
        visible={examMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={closeExamMenu}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={closeExamMenu}
        >
          <View
            style={[
              styles.examMenuContent,
              {
                top: examMenuPosition.top,
                left: examMenuPosition.left,
              },
            ]}
          >
            <View style={styles.examMenuHeader}>
              <Text style={styles.menuTitle} numberOfLines={1}>
                {selectedExam?.title || "Exam"}
              </Text>
              <TouchableOpacity
                style={styles.menuCloseButton}
                onPress={closeExamMenu}
              >
                <Ionicons name="close" size={18} color="#98A2B3" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                closeExamMenu();
                router.push(`/(tabs)/scanner?classId=${classId}&examId=${selectedExam?.id}`);
              }}
            >
              <Text style={styles.menuItemText}>Scan answer sheet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={requestArchiveExam}>
              <Text style={[styles.menuItemText, styles.menuArchiveText]}>Archive Exam</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={requestDeleteExam}>
              <Text style={[styles.menuItemText, styles.menuDeleteText]}>Delete Exam</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sort Modal */}
      <Modal
        visible={sortModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSortModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.sortModalOverlay}
          activeOpacity={1}
          onPress={() => setSortModalVisible(false)}
        >
          <View style={[styles.sortModalContent, darkModeEnabled && { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sortModalTitle, darkModeEnabled && { color: colors.text }]}>Sort Students</Text>

            <Text style={[styles.sortModalGroupLabel, darkModeEnabled && { color: colors.textMuted }]}>BY STUDENT ID</Text>
            {(['id_asc', 'id_desc'] as const).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.sortOption, sortBy === option && styles.sortOptionActive, darkModeEnabled && sortBy === option && { backgroundColor: colors.badgeBg }]}
                onPress={() => { setSortBy(option); setSortModalVisible(false); }}
              >
                <Ionicons
                  name={option === 'id_asc' ? 'arrow-up-outline' : 'arrow-down-outline'}
                  size={16}
                  color={sortBy === option ? COLORS.primary : (darkModeEnabled ? colors.textSecondary : '#555')}
                />
                <Text style={[styles.sortOptionText, sortBy === option && styles.sortOptionTextActive, darkModeEnabled && { color: sortBy === option ? COLORS.primary : colors.text }]}>
                  {option === 'id_asc' ? 'Ascending (0 → 9)' : 'Descending (9 → 0)'}
                </Text>
                {sortBy === option && <Ionicons name="checkmark" size={16} color={COLORS.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}

            <Text style={[styles.sortModalGroupLabel, darkModeEnabled && { color: colors.textMuted }]}>BY FIRST NAME</Text>
            {(['fname_asc', 'fname_desc'] as const).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.sortOption, sortBy === option && styles.sortOptionActive, darkModeEnabled && sortBy === option && { backgroundColor: colors.badgeBg }]}
                onPress={() => { setSortBy(option); setSortModalVisible(false); }}
              >
                <Ionicons
                  name={option === 'fname_asc' ? 'arrow-up-outline' : 'arrow-down-outline'}
                  size={16}
                  color={sortBy === option ? COLORS.primary : (darkModeEnabled ? colors.textSecondary : '#555')}
                />
                <Text style={[styles.sortOptionText, sortBy === option && styles.sortOptionTextActive, darkModeEnabled && { color: sortBy === option ? COLORS.primary : colors.text }]}>
                  {option === 'fname_asc' ? 'A → Z' : 'Z → A'}
                </Text>
                {sortBy === option && <Ionicons name="checkmark" size={16} color={COLORS.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Duplicate Student Warning Modal */}
      <ConfirmationModal
        visible={duplicateWarning.visible}
        title="Duplicate Student ID"
        message={duplicateWarning.message}
        confirmText="OK"
        onConfirm={() => {
          setDuplicateWarning({ visible: false, message: "" });
        }}
      />

      {/* Import Errors Modal */}
      <Modal
        visible={importErrors.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setImportErrors({ visible: false, successCount: 0, errors: [] });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.importErrorModal, { backgroundColor: colors.surface }]}>
            <View style={styles.importErrorHeader}>
              <Ionicons 
                name={importErrors.successCount > 0 ? "warning" : "close-circle"} 
                size={48} 
                color={importErrors.successCount > 0 ? "#ff9800" : "#e74c3c"} 
              />
              <Text style={[styles.importErrorTitle, { color: colors.text }]}>
                {importErrors.successCount > 0 ? "Import Completed with Issues" : "Import Failed"}
              </Text>
              <Text style={[styles.importErrorSubtitle, { color: colors.textSecondary }]}>
                {importErrors.successCount > 0 
                  ? `${importErrors.successCount} students added, ${importErrors.errors.length} skipped`
                  : `${importErrors.errors.length} errors found`}
              </Text>
            </View>

            <ScrollView style={styles.importErrorList}>
              {importErrors.errors.map((err, index) => (
                <View key={index} style={[styles.importErrorItem, { borderLeftColor: "#ff9800" }]}>
                  <Text style={[styles.importErrorId, { color: colors.text }]}>
                    {err.student_id}
                  </Text>
                  <Text style={[styles.importErrorMessage, { color: colors.textSecondary }]}>
                    {err.error}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.importErrorButton, { backgroundColor: COLORS.primary }]}
              onPress={() => {
                setImportErrors({ visible: false, successCount: 0, errors: [] });
              }}
            >
              <Text style={styles.importErrorButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={archiveExamConfirmVisible}
        title="Archive Item"
        message={`Are you sure you want to archive ${selectedExam?.title ?? "this exam"}? You can still view it later in the archived section.`}
        cancelText="Cancel"
        confirmText="Archive"
        destructive
        onCancel={clearExamSelection}
        onConfirm={() => {
          setArchiveExamConfirmVisible(false);
          handleArchiveExam();
        }}
      />

      <ConfirmationModal
        visible={removeStudentConfirmVisible}
        title="Remove Student"
        message={`Are you sure you want to remove ${studentToRemove?.studentName ?? "this student"} from this class?`}
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

            let cleanMessage = "Failed to remove student";
            if (error instanceof Error) {
              cleanMessage = error.message.replace(/^Error:\s*/i, "").trim();
            }

            Toast.show({
              type: "error",
              text1: "Cannot Remove Student",
              text2: cleanMessage,
            });
          } finally {
            setStudentToRemove(null);
          }
        }}
      />

<ConfirmationModal
  visible={deleteExamConfirmVisible}
  title="Delete Item"
  message={`Are you sure you want to delete ${
    selectedExam?.title ?? "this exam"
  }? This action cannot be undone.`}
  cancelText="Cancel"
  confirmText="Delete"
  destructive
  onCancel={clearExamSelection}
  onConfirm={() => {
    setDeleteExamConfirmVisible(false);
    handleDeleteExam();
  }}
/>

      <StudentImportModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleImportComplete}
      />


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F8",
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#F7F7F8",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF2",
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
  },
  tabsBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF2",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 12,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8E97A6",
  },
  tabLabelActive: {
    color: "#20BE7B",
  },
  tabIndicator: {
    marginTop: 12,
    width: "90%",
    height: 3,
    borderRadius: 999,
    backgroundColor: "#20BE7B",
  },
  content: {
    padding: 20,
    paddingBottom: 120,
    gap: 14,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchWrap: {
    flex: 1,
    height: 42,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 2,
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  exportButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#E9F8F1",
    alignItems: "center",
    justifyContent: "center",
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
  sortButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#4a7a6e",
    alignItems: "center",
    justifyContent: "center",
  },
  exportButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1e6b4f",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sortModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  sortModalContent: {
    width: 280,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d5dfd9",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  sortModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2f2a",
    marginBottom: 14,
  },
  sortModalGroupLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8ea094",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 10,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  sortOptionActive: {
    backgroundColor: "#e8f5ee",
  },
  sortOptionText: {
    fontSize: 14,
    color: "#2a3d37",
    flex: 1,
  },
  sortOptionTextActive: {
    fontWeight: "600",
    color: COLORS.primary,
  },
  importButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2d7a5f",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: "center",
    marginTop: 6,
  },
  emptyStateIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#E9F8F1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1F2937",
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#8E97A6",
    textAlign: "center",
  },
  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  studentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  studentAvatarText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2F6B56",
  },
  studentBody: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
  },
  studentSubtext: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  studentScoreWrap: {
    alignItems: "flex-end",
    marginRight: 10,
  },
  studentScore: {
    fontSize: 16,
    fontWeight: "800",
  },
  studentAvgLabel: {
    fontSize: 11,
    color: "#A4ACBA",
    marginTop: 2,
  },
  createExamButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#E9F8F1",
    borderWidth: 1,
    borderColor: "#D0F0E0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createExamText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#109B67",
  },
  examCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  examCardPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  examBody: {
    flex: 1,
  },
  examTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
  },
  examMeta: {
    marginTop: 5,
    fontSize: 12,
    color: "#9CA3AF",
  },
  examCodeMeta: {
    marginTop: 3,
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "600",
  },
  examRight: {
    alignItems: "flex-end",
    marginRight: 12,
  },
  examMenuButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  examAverage: {
    fontSize: 16,
    fontWeight: "800",
  },
  scanPanel: {
    alignItems: "center",
    paddingTop: 74,
  },
  scanIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#E8F8F1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  scanTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 12,
  },
  scanDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: "#8C95A4",
    textAlign: "center",
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  startScanButton: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    backgroundColor: "#20BE7B",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#20BE7B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  startScanText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  statsHeroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    padding: 18,
  },
  statsHeroLabel: {
    fontSize: 15,
    color: "#8E97A6",
    textAlign: "center",
  },
  statsHeroValue: {
    marginTop: 8,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: "800",
    color: "#20BE7B",
    textAlign: "center",
  },
  statsHeroBar: {
    marginTop: 18,
  },
  statsHeroFooter: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statsPassedText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#20BE7B",
  },
  statsFailedText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statsSmallCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    padding: 16,
  },
  statsSmallLabel: {
    fontSize: 13,
    color: "#8E97A6",
    marginBottom: 10,
  },
  statsSmallValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1F2937",
  },
  distributionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    padding: 18,
  },
  distributionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 18,
  },
  distributionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  distributionLabel: {
    width: 52,
    fontSize: 13,
    color: "#8E97A6",
  },
  distributionTrack: {
    flex: 1,
    marginHorizontal: 12,
  },
  animatedBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E8EBF0",
    overflow: "hidden",
  },
  animatedBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  distributionCount: {
    width: 16,
    textAlign: "right",
    fontSize: 13,
    color: "#1F2937",
    fontWeight: "700",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "flex-end",
    paddingTop: 92,
    paddingRight: 20,
  },
  menuContent: {
    width: 172,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingTop: 8,
    paddingBottom: 8,
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
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#273142",
    marginRight: 8,
  },
  menuCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F8FA",
    zIndex: 2,
    elevation: 2,
  },
  examMenuContent: {
    position: "absolute",
    width: 164,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  examMenuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 6,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 14,
    color: "#273142",
  },
  menuArchiveText: {
    color: "#F59E0B",
  },
  menuDeleteText: {
    color: "#EF4444",
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    color: "#6B7280",
  },
  errorText: {
    marginTop: 14,
    marginBottom: 18,
    fontSize: 16,
    color: "#EF4444",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#20BE7B",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  importErrorModal: {
    margin: 20,
    borderRadius: RADIUS.medium,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  importErrorHeader: {
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  importErrorTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 4,
  },
  importErrorSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  importErrorList: {
    maxHeight: 300,
    padding: 16,
  },
  importErrorItem: {
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    backgroundColor: "rgba(255, 152, 0, 0.05)",
    borderRadius: 4,
  },
  importErrorId: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  importErrorMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  importErrorButton: {
    margin: 16,
    padding: 14,
    borderRadius: RADIUS.small,
    alignItems: "center",
  },
  importErrorButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
})

