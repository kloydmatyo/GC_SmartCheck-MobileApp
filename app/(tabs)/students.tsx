/**
 * Students Screen - Enhanced with Subsystem 2 Features
 * Requirements: 33-42 (Mobile Search & Filtering), 43-51 (Offline Caching)
 */

import { CacheSyncIndicator } from "@/components/student/CacheSyncIndicator";
import { StudentImportModal } from "@/components/student/StudentImportModal";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { auth, db } from "@/config/firebase";
import { StudentExtended } from "@/types/student";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
    collection,
    getDocs,
    limit,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function StudentsScreen() {
  const insets = useSafeAreaInsets();
  const sectionOptions = Array.from({ length: 26 }, (_, index) =>
    String.fromCharCode(65 + index),
  );
  const emptyStudentForm = {
    student_id: "",
    first_name: "",
    last_name: "",
    grade: "",
    email: "",
    section: "",
  };

  // REQ 33, 34: Search with debounce
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // REQ 35: Filter state
  const [selectedSection, setSelectedSection] = useState<string | undefined>(
    undefined,
  );
  const [activeOnly, setActiveOnly] = useState(true);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // REQ 37: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  // REQ 38: Sorting state
  const [sortBy, setSortBy] = useState<"name" | "student_id" | "section">(
    "name",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Data state
  const [students, setStudents] = useState<StudentExtended[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // REQ 40: Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // REQ 22: Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentModalMode, setStudentModalMode] = useState<"add" | "edit">(
    "add",
  );
  const [selectedStudent, setSelectedStudent] = useState<StudentExtended | null>(
    null,
  );
  const [pendingDeleteStudent, setPendingDeleteStudent] =
    useState<StudentExtended | null>(null);
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

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
      let active = true;
      (async () => {
        await loadDarkModePreference();
        if (!active) return;
      })();
      return () => {
        active = false;
      };
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

  const colors = darkModeEnabled
      ? {
        background: "#111815",
        header: "#1a2520",
        card: "#1f2b26",
        border: "#34483f",
        text: "#e7f1eb",
        textSecondary: "#b9c9c0",
        muted: "#9db1a6",
        primary: "#1f3a2f",
        primaryDark: "#2b3b34",
        accent: "#8fd1ad",
        accentDark: "#6cb992",
        accentSoft: "#2a3a33",
        chip: "#22302a",
        chipText: "#b9c9c0",
        chipActiveBg: "#1f3a2f",
        chipActiveBorder: "#8fd1ad",
        inputBg: "#1f3a2f",
        inputText: "#e7f1eb",
        inputPlaceholder: "#8fa39a",
        searchIcon: "#9db1a6",
        headerButtonBg: "#22302a",
        inactive: "#4b6358",
        dangerSoft: "#3f2a2a",
        modalOverlay: "rgba(0, 0, 0, 0.6)",
        studentCardBg: "#1f2b26",
        studentCardBorder: "#34483f",
        formCard: "#1f3a2f",
        formCardAlt: "#2a3a33",
        formAccent: "#8fd1ad",
        formSubtext: "#b9c9c0",
      }
    : {
        background: "#eef1ef",
        header: "#fff",
        card: "#fff",
        border: "#d8dfda",
        text: "#24362f",
        textSecondary: "#5e7268",
        muted: "#8da096",
        primary: "#3d5a3d",
        primaryDark: "#2f4a38",
        accent: "#3d5a3d",
        accentDark: "#2f4a38",
        accentSoft: "#e2ece6",
        chip: "#e8ece9",
        chipText: "#5e7268",
        chipActiveBg: "#3d5a3d",
        chipActiveBorder: "#2f4a38",
        inputBg: "#3d5a3d",
        inputText: "#ecf7f1",
        inputPlaceholder: "#b8d4c4",
        searchIcon: "#d6e9de",
        headerButtonBg: "#edf3ef",
        inactive: "#ccc",
        dangerSoft: "#ffebee",
        modalOverlay: "rgba(0, 0, 0, 0.5)",
        studentCardBg: "#f0ead6",
        studentCardBorder: "#d4c5a0",
        formCard: "#3d5a3d",
        formCardAlt: "#2d4a2d",
        formAccent: "#4CAF50",
        formSubtext: "#B8D4B8",
      };
  const pickerAccent = "#3f6b54";
  const pickerAccentDark = "#2f4f3f";

  // REQ 35: Available sections for filter picker
  const [availableSections, setAvailableSections] = useState<string[]>([]);

  // Initialize database and load students
  useEffect(() => {
    initializeAndLoad();
  }, []);

  // REQ 34: Debounce search query (prevent API spam)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1); // Reset to first page on new search
    }, 500); // 500ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // REQ 35, 38: Reset to page 1 when any filter or sort dimension changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSection, activeOnly, sortBy, sortOrder]);

  // Load students when query, filters, or pagination changes
  useEffect(() => {
    loadStudents();
  }, [
    debouncedQuery,
    selectedSection,
    activeOnly,
    sortBy,
    sortOrder,
    currentPage,
  ]);

  const initializeAndLoad = async () => {
    try {
      const { StudentDatabaseService } =
        await import("../../services/studentDatabaseService");

      await StudentDatabaseService.initializeDatabase();

      // Auto-download from Firestore when cache is empty (fresh install / first run)
      const meta = await StudentDatabaseService.getCacheMetadata();
      if (meta.studentCount === 0) {
        try {
          await StudentDatabaseService.downloadStudentDatabase();
        } catch (e) {
          console.warn(
            "[Students] Auto-download failed (Firestore fallback active):",
            e,
          );
        }
      }

      // Populate section filter options from cache
      const sections = await StudentDatabaseService.getUniqueSections();
      setAvailableSections(sections);

      await loadStudents();
    } catch (error) {
      console.error("Failed to initialize:", error);
    }
  };

  // REQ 36, 37, 38: Load students with server-side SQLite queries
  const loadStudents = async () => {
    try {
      setIsLoading(true);

      // REQ 36: Use SQLite/cache for indexed queries (no auth required for local read)
      try {
        const { StudentDatabaseService } =
          await import("../../services/studentDatabaseService");

        // Convert sortBy to match SQLite method
        const sortField = sortBy === "student_id" ? "student_id" : sortBy;

        const result = await StudentDatabaseService.searchStudents(
          debouncedQuery || undefined,
          selectedSection || undefined,
          activeOnly,
          sortField as "name" | "student_id" | "section",
          sortOrder,
          currentPage,
          pageSize,
        );

        setStudents(result.students);
        setTotalCount(result.total);
      } catch (sqliteError) {
        console.warn(
          "[Students] SQLite query failed, falling back to Firestore:",
          sqliteError,
        );

        // Guard Firestore fallback — requires authentication
        if (!auth.currentUser) {
          console.warn("[Students] Not authenticated — skipping Firestore fallback");
          setStudents([]);
          setTotalCount(0);
          return;
        }

        // Fallback to Firestore if SQLite fails
        const studentsRef = collection(db, "students");
        let q = query(studentsRef);

        const queryConstraints: any[] = [];

        if (activeOnly !== undefined) {
          queryConstraints.push(where("is_active", "==", activeOnly));
        }

        if (selectedSection) {
          queryConstraints.push(where("section", "==", selectedSection));
        }

        const sortField =
          sortBy === "name"
            ? "last_name"
            : sortBy === "student_id"
              ? "student_id"
              : "section";
        queryConstraints.push(orderBy(sortField, sortOrder));
        queryConstraints.push(limit(pageSize));

        q = query(studentsRef, ...queryConstraints);

        const querySnapshot = await getDocs(q);
        let allStudents: StudentExtended[] = [];
        const seenIds = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const studentId = data.student_id || doc.id;
          if (seenIds.has(studentId)) return; // deduplicate
          seenIds.add(studentId);
          allStudents.push({
            id: doc.id,
            student_id: studentId,
            first_name: data.first_name || data.firstName || "",
            last_name: data.last_name || data.lastName || "",
            grade: data.grade,
            email: data.email,
            section: data.section,
            is_active: data.is_active !== false,
            createdBy: data.createdBy,
            created_at: data.created_at,
            updated_at: data.updated_at,
          });
        });

        // Populate sections from Firestore results when cache was empty
        const uniqueSections = [
          ...new Set(
            allStudents.map((s) => s.section).filter(Boolean) as string[],
          ),
        ].sort();
        setAvailableSections((prev) =>
          prev.length > 0 ? prev : uniqueSections,
        );

        // Client-side search filter as fallback
        if (debouncedQuery) {
          const searchLower = debouncedQuery.toLowerCase();
          allStudents = allStudents.filter(
            (s) =>
              s.first_name.toLowerCase().includes(searchLower) ||
              s.last_name.toLowerCase().includes(searchLower) ||
              s.student_id.toLowerCase().includes(searchLower),
          );
        }

        setStudents(allStudents);
        setTotalCount(allStudents.length);
      }
    } catch (error) {
      console.error("Failed to load students:", error);
      setStudents([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Re-sync from Firestore, then reload the local view
      const { StudentDatabaseService } =
        await import("../../services/studentDatabaseService");
      await StudentDatabaseService.downloadStudentDatabase();
      const sections = await StudentDatabaseService.getUniqueSections();
      setAvailableSections(sections);
      await loadStudents();
    } catch (error) {
      console.error("Refresh failed:", error);
      Alert.alert(
        "Refresh Failed",
        "Could not sync with the server. Showing cached data.",
        [{ text: "OK" }],
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleImportComplete = async () => {
    setShowImportModal(false);
    // Refresh section list so newly imported sections appear in the filter immediately
    try {
      const { StudentDatabaseService } =
        await import("../../services/studentDatabaseService");
      const sections = await StudentDatabaseService.getUniqueSections();
      setAvailableSections(sections);
    } catch {
      // non-critical — sections will update on next pull-to-refresh
    }
    await loadStudents();
  };

  const openAddStudentModal = () => {
    setStudentModalMode("add");
    setSelectedStudent(null);
    setStudentForm(emptyStudentForm);
    setShowStudentModal(true);
  };

  const openEditStudentModal = (student: StudentExtended) => {
    setStudentModalMode("edit");
    setSelectedStudent(student);
    setStudentForm({
      student_id: student.student_id,
      first_name: student.first_name,
      last_name: student.last_name,
      grade: student.grade || "",
      email: student.email || "",
      section: student.section || "",
    });
    setShowStudentModal(true);
  };

  const closeStudentModal = () => {
    if (isSavingStudent) return;
    setShowStudentModal(false);
    setShowSectionPicker(false);
    setSelectedStudent(null);
    setStudentForm(emptyStudentForm);
  };

  const sanitizeNameInput = (value: string) =>
    value.replace(/[^A-Za-z\s'-]/g, "");

  const sanitizeStudentIdInput = (value: string) => value.replace(/[^0-9]/g, "");

  const sanitizeGradeInput = (value: string) => value.replace(/[^0-9]/g, "");

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSaveStudent = async () => {
    if (
      !studentForm.student_id.trim() ||
      !studentForm.first_name.trim() ||
      !studentForm.last_name.trim() ||
      !studentForm.grade.trim() ||
      !studentForm.section.trim()
    ) {
      Alert.alert("Missing fields", "Student ID, first name, last name, grade, and block are required.");
      return;
    }

    if (!/^[A-Za-z\s'-]+$/.test(studentForm.first_name.trim())) {
      Alert.alert(
        "Invalid first name",
        "First name can only contain letters, spaces, apostrophes, and hyphens.",
      );
      return;
    }

    if (!/^[A-Za-z\s'-]+$/.test(studentForm.last_name.trim())) {
      Alert.alert(
        "Invalid last name",
        "Last name can only contain letters, spaces, apostrophes, and hyphens.",
      );
      return;
    }

    if (!/^\d+$/.test(studentForm.grade.trim())) {
      Alert.alert("Invalid grade", "Grade must contain numbers only.");
      return;
    }

    if (
      studentForm.email.trim() &&
      !isValidEmail(studentForm.email.trim())
    ) {
      Alert.alert("Invalid email", "Enter a valid email address or leave it blank.");
      return;
    }

    try {
      setIsSavingStudent(true);
      const { StudentDatabaseService } =
        await import("../../services/studentDatabaseService");

      if (studentModalMode === "add") {
        await StudentDatabaseService.createStudent(studentForm);
      } else {
        await StudentDatabaseService.updateStudent(selectedStudent?.id || selectedStudent?.student_id || studentForm.student_id, {
          first_name: studentForm.first_name,
          last_name: studentForm.last_name,
          grade: studentForm.grade,
          email: studentForm.email,
          section: studentForm.section,
        });
      }

      const sections = await StudentDatabaseService.getUniqueSections();
      setAvailableSections(sections);
      await loadStudents();
      closeStudentModal();
    } catch (error) {
      console.warn("Failed to save student:", error);
      const message =
        error instanceof Error ? error.message : "Could not save student.";
      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes("already exists") ||
        normalizedMessage.includes("duplicate")
      ) {
        Alert.alert(
          "Student ID already exists",
          "Use a different Student ID or edit the existing student record instead.",
        );
        return;
      }

      Alert.alert(
        "Save failed",
        message,
      );
    } finally {
      setIsSavingStudent(false);
    }
  };

  const handleDeleteStudent = (student: StudentExtended) => {
    setPendingDeleteStudent(student);
  };

  const confirmDeleteStudent = async () => {
    if (!pendingDeleteStudent) return;

    try {
      const { StudentDatabaseService } =
        await import("../../services/studentDatabaseService");
      await StudentDatabaseService.deleteStudent(
        pendingDeleteStudent.id || pendingDeleteStudent.student_id,
      );
      setPendingDeleteStudent(null);
      const sections = await StudentDatabaseService.getUniqueSections();
      setAvailableSections(sections);
      await loadStudents();
    } catch (error) {
      console.error("Failed to delete student:", error);
      Alert.alert(
        "Delete failed",
        error instanceof Error ? error.message : "Could not delete student.",
      );
    }
  };

  // REQ 42: Clear filters
  const handleClearFilters = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedSection(undefined);
    setActiveOnly(true);
    setCurrentPage(1);
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const changeSortBy = (field: "name" | "student_id" | "section") => {
    if (sortBy === field) {
      toggleSortOrder();
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const renderStudentCard = ({ item }: { item: StudentExtended }) => (
    <View
      style={[
        styles.studentCard,
        { backgroundColor: colors.studentCardBg, borderColor: colors.studentCardBorder },
      ]}
    >
      <View style={styles.studentHeader}>
        <View style={[styles.avatarContainer, { backgroundColor: colors.primary }]}>
          <Ionicons name="person" size={24} color="#fff" />
        </View>
        <View style={styles.studentInfo}>
          <Text style={[styles.studentName, { color: colors.text }]}>
            {item.last_name}, {item.first_name}
          </Text>
          <Text style={[styles.studentId, { color: colors.textSecondary }]}>
            ID: {item.student_id}
          </Text>
          {item.grade ? (
            <Text style={[styles.studentMeta, { color: colors.textSecondary }]}>
              Grade {item.grade}
            </Text>
          ) : null}
          {item.section && (
            <Text style={[styles.studentClass, { color: colors.textSecondary }]}>
              Block {item.section}
            </Text>
          )}
        </View>
        <View style={styles.studentBadges}>
          {!item.is_active && (
            <View style={[styles.inactiveBadge, { backgroundColor: colors.dangerSoft }]}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.studentActionButton, { backgroundColor: colors.headerButtonBg }]}
            onPress={() => openEditStudentModal(item)}
          >
            <Ionicons name="create-outline" size={16} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.studentActionButton,
              { backgroundColor: darkModeEnabled ? "#3f2a2a" : "#ffebee" },
            ]}
            onPress={() => handleDeleteStudent(item)}
          >
            <Ionicons name="trash-outline" size={16} color="#d9534f" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // REQ 35: Filter dropdown modal
  const renderFilterModal = () => (
    <Modal
      visible={showFilterModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowFilterModal(false)}
    >
      <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
        <View
          style={[
            styles.modalContent,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.modalHeader,
              {
                borderBottomColor: colors.border,
                backgroundColor: darkModeEnabled ? "#22302a" : "#f3f7f4",
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>Filters</Text>
            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.filterSection, { borderBottomColor: colors.border }]}>
            <Text style={[styles.filterLabel, { color: colors.text }]}>Status</Text>
            <TouchableOpacity
              style={[
                styles.filterToggle,
                {
                  backgroundColor: activeOnly ? colors.chipActiveBg : colors.background,
                  borderColor: activeOnly ? colors.chipActiveBorder : colors.border,
                },
              ]}
              onPress={() => setActiveOnly(!activeOnly)}
            >
              <Ionicons
                name={activeOnly ? "checkbox" : "square-outline"}
                size={24}
                color={activeOnly ? "#e7f1eb" : colors.accent}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  { color: activeOnly ? "#e7f1eb" : colors.text },
                ]}
              >
                Active students only
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.filterSection, { borderBottomColor: colors.border }]}>
            <Text style={[styles.filterLabel, { color: colors.text }]}>Sort By</Text>
            {(["name", "student_id", "section"] as const).map((field) => (
              <TouchableOpacity
                key={field}
                style={[
                  styles.sortOption,
                  {
                    backgroundColor:
                      sortBy === field ? colors.chipActiveBg : colors.background,
                    borderColor:
                      sortBy === field ? colors.chipActiveBorder : colors.border,
                  },
                ]}
                onPress={() => changeSortBy(field)}
              >
                <View style={styles.sortOptionLeft}>
                  <Ionicons
                    name={
                      field === "name"
                        ? "person-outline"
                        : field === "student_id"
                          ? "card-outline"
                          : "albums-outline"
                    }
                    size={16}
                    color={sortBy === field ? "#e7f1eb" : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.sortOptionText,
                      { color: sortBy === field ? "#e7f1eb" : colors.text },
                    ]}
                  >
                    {field === "name"
                      ? "Name"
                      : field === "student_id"
                        ? "Student ID"
                        : "Section"}
                  </Text>
                </View>
                {sortBy === field && (
                  <Ionicons
                    name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                    size={20}
                    color={colors.accent}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              setShowFilterModal(false);
              loadStudents();
            }}
          >
            <Text style={styles.applyButtonText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderDeleteStudentModal = () => (
    <Modal
      visible={Boolean(pendingDeleteStudent)}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setPendingDeleteStudent(null)}
    >
      <View
        style={[
          styles.deleteModalOverlay,
          { backgroundColor: colors.modalOverlay },
        ]}
      >
        <View
          style={[
            styles.deleteModalCard,
            {
              backgroundColor: colors.card,
              borderColor: darkModeEnabled ? "#34483f" : "#d8dfda",
            },
          ]}
        >
          <View
            style={[
              styles.deleteModalIconWrap,
              { backgroundColor: darkModeEnabled ? "#3f2a2a" : "#fde8e7" },
            ]}
          >
            <Ionicons name="trash-outline" size={24} color="#d9534f" />
          </View>

          <Text style={[styles.deleteModalTitle, { color: colors.text }]}>
            Delete student
          </Text>
          <Text
            style={[styles.deleteModalMessage, { color: colors.textSecondary }]}
          >
            Delete {pendingDeleteStudent?.first_name} {pendingDeleteStudent?.last_name}?
            This cannot be undone.
          </Text>

          <View style={styles.deleteModalActions}>
            <TouchableOpacity
              style={[
                styles.deleteModalSecondaryButton,
                {
                  backgroundColor: darkModeEnabled ? "#22302a" : "#f3f7f4",
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setPendingDeleteStudent(null)}
            >
              <Text
                style={[
                  styles.deleteModalSecondaryText,
                  { color: colors.textSecondary },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteModalPrimaryButton}
              onPress={confirmDeleteStudent}
            >
              <Text style={styles.deleteModalPrimaryText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // REQ 37: Pagination controls
  const renderPagination = () => {
    const totalPages = Math.ceil(totalCount / pageSize);
    if (totalPages <= 1) return null;

    return (
      <View
        style={[
          styles.paginationContainer,
          {
            backgroundColor: colors.primary,
            borderTopColor: colors.primaryDark,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.pageButton,
            {
              backgroundColor: colors.primaryDark,
              borderColor: colors.primaryDark,
            },
            currentPage === 1 && styles.pageButtonDisabled,
          ]}
          onPress={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={currentPage === 1 ? "#9ab79f" : "#e8f5e9"}
          />
        </TouchableOpacity>

        <Text style={[styles.pageInfo, { color: "#ecf7f1" }]}>
          Page {currentPage} of {totalPages} ({totalCount} students)
        </Text>

        <TouchableOpacity
          style={[
            styles.pageButton,
            {
              backgroundColor: colors.primaryDark,
              borderColor: colors.primaryDark,
            },
            currentPage === totalPages && styles.pageButtonDisabled,
          ]}
          onPress={() =>
            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
          }
          disabled={currentPage === totalPages}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={currentPage === totalPages ? "#9ab79f" : "#e8f5e9"}
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.header, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Students</Text>
        <View style={styles.headerActions}>
          {/* REQ 44: Download/Refresh button */}
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.headerButtonBg }]}
            onPress={handleRefresh}
            disabled={isRefreshing}
          >
            <Ionicons name="cloud-download" size={24} color={colors.accent} />
          </TouchableOpacity>
          {/* REQ 22: Import button */}
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.headerButtonBg }]}
            onPress={() => setShowImportModal(true)}
          >
            <Ionicons name="cloud-upload" size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* REQ 49: Cache Status Display */}
      <View
        style={[
          styles.cacheSection,
          { backgroundColor: colors.header, borderBottomColor: colors.border },
        ]}
      >
        <CacheSyncIndicator compact onRefresh={loadStudents} />
      </View>

      {/* REQ 33: Search Bar */}
      <View
        style={[
          styles.searchContainer,
          { backgroundColor: colors.inputBg, borderColor: colors.primaryDark },
        ]}
      >
        <Ionicons
          name="search"
          size={20}
          color={colors.searchIcon}
          style={styles.searchIcon}
        />
        <TextInput
          style={[styles.searchInput, { color: colors.inputText }]}
          placeholder="Search by name, ID, or section..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={colors.inputPlaceholder}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color={colors.inputPlaceholder} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter and Sort Controls */}
      <View style={styles.controlsRow}>
        {/* REQ 35: Filter button */}
        <TouchableOpacity
          style={[
            styles.filterButton,
            { backgroundColor: colors.accentSoft, borderColor: colors.border },
          ]}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="options" size={20} color={colors.accent} />
          <Text style={[styles.filterButtonText, { color: colors.accent }]}>
            Filters
          </Text>
        </TouchableOpacity>

        <View style={styles.filterPills}>
          <View
            style={[
              styles.filterPill,
              {
                backgroundColor: activeOnly ? colors.chipActiveBg : colors.chip,
                borderColor: activeOnly ? colors.chipActiveBorder : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: activeOnly ? "#e7f1eb" : colors.chipText },
              ]}
            >
              Active
            </Text>
          </View>
          <View
            style={[
              styles.filterPill,
              {
                backgroundColor: colors.chip,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.filterPillText, { color: colors.chipText }]}>
              {sortBy === "name" ? "Name" : sortBy === "student_id" ? "ID" : "Section"}{" "}
              {sortOrder === "asc" ? "↑" : "↓"}
            </Text>
          </View>
        </View>

        {/* REQ 42: Clear filters button */}
        {(searchQuery || selectedSection || !activeOnly) && (
          <TouchableOpacity
            style={[
              styles.clearButton,
              { backgroundColor: colors.chip, borderColor: colors.border },
            ]}
            onPress={handleClearFilters}
          >
            <Ionicons name="close" size={16} color={colors.textSecondary} />
            <Text style={[styles.clearButtonText, { color: colors.textSecondary }]}>
              Clear
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.sortIndicator}>
          <Text style={[styles.sortText, { color: colors.textSecondary }]}>
            Sort:{" "}
            {sortBy === "name"
              ? "Name"
              : sortBy === "student_id"
                ? "ID"
                : "Section"}{" "}
            {sortOrder === "asc" ? "↑" : "↓"}
          </Text>
        </View>
      </View>

      {/* Stats Summary */}
      <View style={styles.summaryContainer}>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.primary, borderColor: colors.primaryDark },
          ]}
        >
          <Text style={styles.summaryValue}>{totalCount}</Text>
          <Text style={styles.summaryLabel}>Total Students</Text>
        </View>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.primary, borderColor: colors.primaryDark },
          ]}
        >
          <Text style={styles.summaryValue}>{students.length}</Text>
          <Text style={styles.summaryLabel}>Current Page</Text>
        </View>
      </View>

      {/* REQ 40: Loading indicator */}
      {isLoading && !isRefreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading students...
          </Text>
        </View>
      )}

      {/* Students List */}
      <FlatList
        data={students}
        renderItem={renderStudentCard}
        keyExtractor={(item) => item.student_id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={colors.inactive} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {searchQuery ? "No students found" : "No students in database"}
              </Text>
              {!searchQuery && (
                <TouchableOpacity
                  style={[styles.emptyActionButton, { backgroundColor: colors.accent }]}
                  onPress={openAddStudentModal}
                >
                  <Text style={styles.emptyActionText}>Add Student</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />

      {/* REQ 37: Pagination controls */}
      {renderPagination()}

      {/* REQ 35: Filter modal */}
      {renderFilterModal()}

      {renderDeleteStudentModal()}

      {/* REQ 22: Import modal */}
      <StudentImportModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleImportComplete}
      />

      <Modal
        visible={showStudentModal}
        animationType="slide"
        transparent={false}
        onRequestClose={closeStudentModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          enabled={Platform.OS === "ios"}
          style={[
            styles.modalKeyboardWrap,
            { backgroundColor: colors.formCard },
          ]}
        >
          <View
            style={[
              styles.modalOverlay,
              styles.studentModalOverlay,
              { backgroundColor: colors.formCard },
            ]}
          >
            <View
              style={[
                styles.modalContent,
                styles.studentModalContent,
                { backgroundColor: colors.card, borderTopColor: colors.border },
              ]}
            >
                <View
                  style={[
                    styles.modalHeader,
                    styles.studentModalHeader,
                    { paddingTop: insets.top + 12 },
                    {
                      borderBottomColor: darkModeEnabled ? "#34483f" : "#4d6a4d",
                      backgroundColor: colors.formCard,
                    },
                  ]}
              >
                <View style={styles.modalTitleWrap}>
                  <Text style={[styles.modalTitle, { color: "#E8F5E9" }]}>
                    {studentModalMode === "add" ? "Add Student" : "Edit Student"}
                  </Text>
                  <Text style={[styles.modalEyebrow, { color: colors.formSubtext }]}>
                    Student record details
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeStudentModal}
                  disabled={isSavingStudent}
                  style={[
                    styles.modalCloseButton,
                    { backgroundColor: colors.formCardAlt, borderColor: colors.formAccent },
                  ]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={20} color="#E8F5E9" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.studentFormBody}
                contentContainerStyle={styles.studentFormContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
              {[
                {
                  label: "Student ID *",
                  key: "student_id" as const,
                  placeholder: "e.g., 2026-0001",
                  autoCapitalize: "characters" as const,
                },
                {
                  label: "First Name *",
                  key: "first_name" as const,
                  placeholder: "John",
                  autoCapitalize: "words" as const,
                },
                {
                  label: "Last Name *",
                  key: "last_name" as const,
                  placeholder: "Doe",
                  autoCapitalize: "words" as const,
                },
                {
                  label: "Grade *",
                  key: "grade" as const,
                  placeholder: "e.g., 10",
                  autoCapitalize: "none" as const,
                },
                {
                  label: "Email",
                  key: "email" as const,
                  placeholder: "john@example.com",
                  autoCapitalize: "none" as const,
                },
              ].map((field) => (
                <View key={field.key} style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.formSubtext }]}>
                    {field.label}
                  </Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      {
                        borderColor: darkModeEnabled ? "#34483f" : "#3d5a3d",
                        backgroundColor: darkModeEnabled ? "#2a3a33" : "#2d4a2d",
                        color: "#E8F5E9",
                      },
                      field.key === "student_id" && studentModalMode === "edit"
                        ? styles.formInputDisabled
                        : null,
                    ]}
                    value={studentForm[field.key]}
                    onChangeText={(text) =>
                      setStudentForm((prev) => ({
                        ...prev,
                        [field.key]:
                          field.key === "student_id"
                            ? sanitizeStudentIdInput(text)
                            : field.key === "first_name" || field.key === "last_name"
                            ? sanitizeNameInput(text)
                            : field.key === "grade"
                              ? sanitizeGradeInput(text)
                              : text,
                      }))
                    }
                    placeholder={field.placeholder}
                    placeholderTextColor={darkModeEnabled ? "#8fa39a" : "#B8D4B8"}
                    editable={
                      !(field.key === "student_id" && studentModalMode === "edit")
                    }
                    autoCapitalize={field.autoCapitalize}
                    keyboardType={
                      field.key === "email"
                        ? "email-address"
                        : field.key === "grade" || field.key === "student_id"
                          ? "number-pad"
                          : "default"
                    }
                  />
                </View>
              ))}

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.formSubtext }]}>
                  Block / Section *
                </Text>
                <TouchableOpacity
                  style={[
                    styles.sectionDropdown,
                    {
                      borderColor: showSectionPicker
                        ? pickerAccent
                        : darkModeEnabled
                          ? "#34483f"
                          : "#3d5a3d",
                      backgroundColor: darkModeEnabled ? "#22302a" : "#2f4a38",
                    },
                  ]}
                  onPress={() => setShowSectionPicker((current) => !current)}
                >
                  <Text
                    style={[
                      styles.sectionDropdownText,
                      { color: studentForm.section ? "#E8F5E9" : colors.formSubtext },
                    ]}
                  >
                    {studentForm.section || "Select block"}
                  </Text>
                  <Ionicons
                    name={showSectionPicker ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={showSectionPicker ? "#E8F5E9" : colors.formSubtext}
                  />
                </TouchableOpacity>

                {showSectionPicker ? (
                  <View
                    style={[
                      styles.sectionDropdownMenu,
                      {
                        backgroundColor: darkModeEnabled ? "#18211d" : "#edf3ef",
                        borderColor: pickerAccentDark,
                      },
                    ]}
                  >
                    <ScrollView
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.sectionDropdownMenuContent}
                    >
                      {sectionOptions.map((option) => {
                        const selected = studentForm.section === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            style={[
                              styles.sectionDropdownOption,
                              {
                                backgroundColor: selected
                                  ? pickerAccent
                                  : darkModeEnabled
                                    ? "#22302a"
                                    : "#f6faf7",
                                borderColor: selected
                                  ? "#58b56f"
                                  : darkModeEnabled
                                    ? "#2f4339"
                                    : "#d2ddd7",
                              },
                            ]}
                            onPress={() => {
                              setStudentForm((prev) => ({ ...prev, section: option }));
                              setShowSectionPicker(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.sectionDropdownOptionText,
                                { color: selected ? "#f4fbf7" : colors.text },
                              ]}
                            >
                              Block {option}
                            </Text>
                            {selected ? (
                              <Ionicons name="checkmark" size={16} color="#dff3e6" />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
              </ScrollView>

              <View
                style={[
                  styles.modalFooterActions,
                  {
                    borderTopColor: darkModeEnabled ? "#34483f" : "#4d6a4d",
                    backgroundColor: colors.formCard,
                    paddingBottom: Math.max(insets.bottom, 16),
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.modalSecondaryButton,
                    {
                      borderColor: darkModeEnabled ? "#34483f" : "#4d6a4d",
                      backgroundColor: colors.formCardAlt,
                    },
                  ]}
                  onPress={closeStudentModal}
                  disabled={isSavingStudent}
                >
                  <Text style={[styles.modalSecondaryButtonText, { color: "#E8F5E9" }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalPrimaryButton,
                    {
                      backgroundColor: colors.formCardAlt,
                      borderColor: colors.formAccent,
                    },
                    isSavingStudent && styles.modalPrimaryButtonDisabled,
                  ]}
                  onPress={handleSaveStudent}
                  disabled={isSavingStudent}
                >
                  {isSavingStudent ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>
                      {studentModalMode === "add" ? "Add Student" : "Save Changes"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: darkModeEnabled ? "#1f3a2f" : colors.primary,
            shadowColor: darkModeEnabled ? "#000" : colors.primary,
            borderWidth: darkModeEnabled ? 1 : 0,
            borderColor: darkModeEnabled ? "#4f7a67" : "transparent",
          },
        ]}
        onPress={openAddStudentModal}
      >
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.fabText}>New Student</Text>
      </TouchableOpacity>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  cacheSection: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: "#333",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    flexWrap: "wrap",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#e8f5e9",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 20,
    gap: 6,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#00a550",
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 16,
    gap: 4,
  },
  clearButtonText: {
    fontSize: 12,
    color: "#666",
  },
  sortIndicator: {
    marginLeft: "auto",
    alignItems: "flex-end",
  },
  sortText: {
    fontSize: 13,
    color: "#666",
  },
  filterPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  summaryContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#00a550",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2f4a38",
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#fff",
    opacity: 0.9,
  },
  loadingOverlay: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  studentCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  studentHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#00a550",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 2,
  },
  studentId: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  studentMeta: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  studentClass: {
    fontSize: 12,
    color: "#00a550",
    fontWeight: "500",
  },
  studentBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  studentActionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveBadge: {
    backgroundColor: "#ffebee",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#e74c3c",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    gap: 16,
  },
  pageButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#d0dbd4",
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageInfo: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
  },
  emptyActionButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#00a550",
    borderRadius: 8,
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  // Filter Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalKeyboardWrap: {
    flex: 1,
  },
  studentModalOverlay: {
    justifyContent: "flex-start",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  deleteModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  deleteModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
  },
  deleteModalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  deleteModalTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 10,
  },
  deleteModalMessage: {
    fontSize: 15,
    lineHeight: 22,
  },
  deleteModalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  deleteModalSecondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteModalSecondaryText: {
    fontSize: 15,
    fontWeight: "700",
  },
  deleteModalPrimaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#d9534f",
  },
  deleteModalPrimaryText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  studentModalContent: {
    flex: 1,
    maxHeight: "100%",
    borderRadius: 0,
    paddingBottom: 0,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  studentModalHeader: {
    paddingRight: 16,
    paddingVertical: 18,
  },
  modalTitleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#333",
  },
  modalEyebrow: {
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  filterSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterToggleText: {
    fontSize: 15,
    color: "#333",
  },
  sortOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    marginBottom: 8,
  },
  sortOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sortOptionText: {
    fontSize: 15,
    color: "#333",
  },
  applyButton: {
    margin: 20,
    padding: 16,
    backgroundColor: "#00a550",
    borderRadius: 12,
    alignItems: "center",
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  studentFormBody: {
    flex: 1,
  },
  studentFormContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 24,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  formInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  formInputDisabled: {
    opacity: 0.78,
  },
  sectionDropdown: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionDropdownText: {
    fontSize: 15,
  },
  sectionDropdownMenu: {
    marginTop: 10,
    borderWidth: 1.5,
    borderRadius: 16,
    maxHeight: 220,
    overflow: "hidden",
  },
  sectionDropdownMenuContent: {
    padding: 10,
    gap: 8,
  },
  sectionDropdownOption: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionDropdownOptionText: {
    fontSize: 15,
    fontWeight: "700",
  },
  modalFooterActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  modalSecondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  modalPrimaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  modalPrimaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#E8F5E9",
  },
  fab: {
    position: "absolute",
    bottom: 78,
    right: 18,
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    gap: 8,
    elevation: 6,
    shadowColor: "#3d5a3d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
