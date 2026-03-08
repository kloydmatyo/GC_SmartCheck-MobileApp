import { auth, db } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { generateTemplatePDF } from "@/services/templatePdfGenerator";

interface Template {
  id: string;
  name: string;
  description: string;
  numQuestions: number;
  choicesPerQuestion: number;
  layout: "single" | "double" | "quad";
  includeStudentId: boolean;
  studentIdLength: number;
  createdBy: string;
  instructorId?: string;
  classId?: string;
  className?: string;
  examId?: string;
  examName?: string;
  examCode?: string;
  createdAt: any;
  updatedAt?: any;
  updatedBy?: string;
  isArchived?: boolean;
  archivedAt?: any;
  archivedBy?: string;
}

interface Class {
  id: string;
  class_name: string;
}

interface Exam {
  id: string;
  title: string;
}

const ITEMS_PER_PAGE = 9;

// Helper function to format dates
const formatDate = (dateValue: any): string => {
  if (!dateValue) return "N/A";

  try {
    if (dateValue.toDate && typeof dateValue.toDate === "function") {
      return dateValue.toDate().toLocaleDateString();
    }
    if (typeof dateValue === "string") {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return "N/A";
      return date.toLocaleDateString();
    }
    if (dateValue instanceof Date) {
      return dateValue.toLocaleDateString();
    }
    if (dateValue.seconds) {
      return new Date(dateValue.seconds * 1000).toLocaleDateString();
    }
    return "N/A";
  } catch {
    return "N/A";
  }
};

export default function TemplatesScreen() {
  const router = useRouter();
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterExam, setFilterExam] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  // Load dark mode preference
  useFocusEffect(
    useCallback(() => {
      const loadDarkMode = async () => {
        const darkMode = await AsyncStorage.getItem(DARK_MODE_STORAGE_KEY);
        setDarkModeEnabled(darkMode === "true");
      };
      loadDarkMode();
      fetchTemplates();
      fetchClassesAndExams();
    }, [])
  );

  const fetchClassesAndExams = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      // Get user's instructor ID
      const { UserService } = await import("@/services/userService");
      const userProfile = await UserService.getUserProfile();
      const instructorId = userProfile?.instructorId;
      
      if (!instructorId) {
        console.log("No instructorId found for user");
        return;
      }
      
      // Fetch classes
      const classesQuery = query(
        collection(db, "classes"),
        where("instructorId", "==", instructorId)
      );
      const classesSnapshot = await getDocs(classesQuery);
      const fetchedClasses = classesSnapshot.docs.map((doc) => ({
        id: doc.id,
        class_name: doc.data().class_name || "Unnamed Class",
      }));
      setClasses(fetchedClasses);

      // Fetch exams
      const examsQuery = query(
        collection(db, "exams"),
        where("instructorId", "==", instructorId)
      );
      const examsSnapshot = await getDocs(examsQuery);
      const fetchedExams = examsSnapshot.docs.map((doc) => ({
        id: doc.id,
        title: doc.data().title || "Unnamed Exam",
      }));
      setExams(fetchedExams);
    } catch (error) {
      console.error("Error fetching classes/exams:", error);
    }
  };

  const fetchTemplates = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Get user's instructor ID
      const { UserService } = await import("@/services/userService");
      const userProfile = await UserService.getUserProfile();
      const instructorId = userProfile?.instructorId;
      
      if (!instructorId) {
        console.log("No instructorId found for user");
        setTemplates([]);
        setLoading(false);
        return;
      }
      
      const templatesQuery = query(
        collection(db, "templates"),
        where("instructorId", "==", instructorId)
      );
      const templatesSnapshot = await getDocs(templatesQuery);
      const fetchedTemplates = templatesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Template));
      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load templates",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter templates
  const filteredTemplates = templates
    .filter((t) => (showArchived ? t.isArchived : !t.isArchived))
    .filter((t) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.className?.toLowerCase().includes(query) ||
        t.examName?.toLowerCase().includes(query)
      );
    })
    .filter((t) => filterClass === "all" || t.classId === filterClass)
    .filter((t) => filterExam === "all" || t.examId === filterExam)
    .sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });

  const totalPages = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE);
  const paginatedTemplates = filteredTemplates.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleDownload = async (template: Template) => {
    try {
      Toast.show({
        type: "info",
        text1: "Generating PDF...",
      });
      await generateTemplatePDF({
        name: template.name,
        description: template.description,
        numQuestions: template.numQuestions,
        choicesPerQuestion: template.choicesPerQuestion,
        examName: template.examName,
        className: template.className,
        examCode: template.examCode,
      });
      Toast.show({
        type: "success",
        text1: "Success",
        text2: `Downloaded ${template.name}`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to generate PDF",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;

    try {
      await deleteDoc(doc(db, "templates", selectedTemplate.id));
      setTemplates((prev) => prev.filter((t) => t.id !== selectedTemplate.id));
      Toast.show({
        type: "success",
        text1: "Success",
        text2: `"${selectedTemplate.name}" deleted successfully`,
      });
    } catch (error) {
      console.error("Error deleting template:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to delete template",
      });
    } finally {
      setShowDeleteDialog(false);
      setSelectedTemplate(null);
    }
  };

  const handleArchive = async () => {
    if (!selectedTemplate || !auth.currentUser) return;

    try {
      await updateDoc(doc(db, "templates", selectedTemplate.id), {
        isArchived: true,
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser.uid,
      });

      setTemplates((prev) =>
        prev.map((t) =>
          t.id === selectedTemplate.id
            ? {
                ...t,
                isArchived: true,
                archivedAt: new Date().toISOString(),
                archivedBy: auth.currentUser!.uid,
              }
            : t
        )
      );

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `"${selectedTemplate.name}" archived successfully`,
      });
    } catch (error) {
      console.error("Error archiving template:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to archive template",
      });
    } finally {
      setShowArchiveDialog(false);
      setSelectedTemplate(null);
    }
  };

  const handleRestore = async (template: Template) => {
    if (!auth.currentUser) return;

    try {
      await updateDoc(doc(db, "templates", template.id), {
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
      });

      setTemplates((prev) =>
        prev.map((t) =>
          t.id === template.id
            ? { ...t, isArchived: false, archivedAt: undefined, archivedBy: undefined }
            : t
        )
      );

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `"${template.name}" restored successfully`,
      });
    } catch (error) {
      console.error("Error restoring template:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to restore template",
      });
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterClass("all");
    setFilterExam("all");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchQuery || filterClass !== "all" || filterExam !== "all";

  const styles = getStyles(darkModeEnabled);

  const renderTemplate = ({ item }: { item: Template }) => (
    <View
      style={[
        styles.templateCard,
        item.isArchived && styles.templateCardArchived,
      ]}
    >
      <View style={styles.templateHeader}>
        <View style={styles.iconContainer}>
          <Ionicons name="document-text" size={24} color="#2563eb" />
        </View>
        <View style={styles.badgeContainer}>
          {item.isArchived && (
            <View style={styles.archivedBadge}>
              <Text style={styles.archivedBadgeText}>Archived</Text>
            </View>
          )}
          <View style={styles.questionsBadge}>
            <Text style={styles.questionsBadgeText}>
              {item.numQuestions} Questions
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.templateTitle}>{item.name}</Text>
      <Text style={styles.templateDescription} numberOfLines={2}>
        {item.description || "No description"}
      </Text>

      <View style={styles.templateMeta}>
        {item.createdAt && (
          <Text style={styles.metaText}>
            Created: {formatDate(item.createdAt)}
          </Text>
        )}
        {item.updatedAt && (
          <Text style={styles.metaText}>
            • Updated: {formatDate(item.updatedAt)}
          </Text>
        )}
      </View>

      <View style={styles.templateInfo}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Choices:</Text>
          <Text style={styles.infoValue}>
            A-{String.fromCharCode(64 + item.choicesPerQuestion)}
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Items:</Text>
          <Text style={styles.infoValue}>{item.numQuestions}</Text>
        </View>
      </View>

      {(item.className || item.examName) && (
        <View style={styles.linkedInfo}>
          {item.className && (
            <View style={styles.linkedItem}>
              <Text style={styles.linkedLabel}>Class:</Text>
              <Text style={styles.linkedValue}>{item.className}</Text>
            </View>
          )}
          {item.examName && (
            <View style={styles.linkedItem}>
              <Text style={styles.linkedLabel}>Exam:</Text>
              <Text style={styles.linkedValue}>{item.examName}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.downloadButton}
          onPress={() => handleDownload(item)}
        >
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={styles.downloadButtonText}>Download</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.secondaryActions}>
        {!item.isArchived ? (
          <TouchableOpacity
            style={styles.archiveButton}
            onPress={() => {
              setSelectedTemplate(item);
              setShowArchiveDialog(true);
            }}
          >
            <Ionicons name="archive-outline" size={16} color="#d97706" />
            <Text style={styles.archiveButtonText}>Archive</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={() => handleRestore(item)}
            >
              <Ionicons name="refresh-outline" size={16} color="#16a34a" />
              <Text style={styles.restoreButtonText}>Restore</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => {
                setSelectedTemplate(item);
                setShowDeleteDialog(true);
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Answer Sheet Templates</Text>
        <Text style={styles.headerSubtitle}>
          View and manage templates generated from exams
        </Text>
        <TouchableOpacity
          style={styles.archivedToggle}
          onPress={() => setShowArchived(!showArchived)}
        >
          <Ionicons
            name="archive"
            size={20}
            color={showArchived ? "#fff" : "#6b7280"}
          />
          <Text
            style={[
              styles.archivedToggleText,
              showArchived && styles.archivedToggleTextActive,
            ]}
          >
            {showArchived ? "Viewing Archived" : "View Archived"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search and Filter */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons
            name="search"
            size={20}
            color="#9ca3af"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, description, class, or exam..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.filterButton,
            showFilters && styles.filterButtonActive,
          ]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="filter" size={20} color="#fff" />
          {hasActiveFilters && <View style={styles.filterBadge} />}
        </TouchableOpacity>
        {hasActiveFilters && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearFilters}
          >
            <Ionicons name="close" size={20} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded Filters */}
      {showFilters && (
        <View style={styles.filtersExpanded}>
          <Text style={styles.filterLabel}>Filter by Class</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                filterClass === "all" && styles.filterChipActive,
              ]}
              onPress={() => setFilterClass("all")}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterClass === "all" && styles.filterChipTextActive,
                ]}
              >
                All Classes
              </Text>
            </TouchableOpacity>
            {classes.map((cls) => (
              <TouchableOpacity
                key={cls.id}
                style={[
                  styles.filterChip,
                  filterClass === cls.id && styles.filterChipActive,
                ]}
                onPress={() => setFilterClass(cls.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterClass === cls.id && styles.filterChipTextActive,
                  ]}
                >
                  {cls.class_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.filterLabel}>Filter by Exam</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                filterExam === "all" && styles.filterChipActive,
              ]}
              onPress={() => setFilterExam("all")}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterExam === "all" && styles.filterChipTextActive,
                ]}
              >
                All Exams
              </Text>
            </TouchableOpacity>
            {exams.map((exam) => (
              <TouchableOpacity
                key={exam.id}
                style={[
                  styles.filterChip,
                  filterExam === exam.id && styles.filterChipActive,
                ]}
                onPress={() => setFilterExam(exam.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterExam === exam.id && styles.filterChipTextActive,
                  ]}
                >
                  {exam.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Results Summary */}
      {!loading && templates.length > 0 && (
        <View style={styles.resultsSummary}>
          <Text style={styles.resultsText}>
            Showing {paginatedTemplates.length} of {filteredTemplates.length}{" "}
            templates
            {hasActiveFilters &&
              ` (filtered from ${templates.filter((t) => (showArchived ? t.isArchived : !t.isArchived)).length} total)`}
            {showArchived && " (archived)"}
          </Text>
          {totalPages > 1 && (
            <Text style={styles.resultsText}>
              Page {currentPage} of {totalPages}
            </Text>
          )}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading templates...</Text>
        </View>
      ) : filteredTemplates.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="document-text-outline" size={48} color="#2563eb" />
          </View>
          <Text style={styles.emptyTitle}>
            {templates.length === 0
              ? "No templates generated yet"
              : hasActiveFilters
                ? "No templates match your filters"
                : showArchived
                  ? "No archived templates"
                  : "No active templates"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {templates.length === 0
              ? "Templates are automatically created when you create an exam"
              : hasActiveFilters
                ? "Try adjusting your search or filter criteria"
                : showArchived
                  ? "Archived templates will appear here"
                  : "Templates are automatically generated when exams are created"}
          </Text>
          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={clearFilters}
            >
              <Ionicons name="close" size={20} color="#2563eb" />
              <Text style={styles.clearFiltersButtonText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <FlatList
            data={paginatedTemplates}
            renderItem={renderTemplate}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[
                  styles.paginationButton,
                  currentPage === 1 && styles.paginationButtonDisabled,
                ]}
                onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={currentPage === 1 ? "#9ca3af" : "#2563eb"}
                />
                <Text
                  style={[
                    styles.paginationButtonText,
                    currentPage === 1 && styles.paginationButtonTextDisabled,
                  ]}
                >
                  Previous
                </Text>
              </TouchableOpacity>

              <View style={styles.paginationPages}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => (
                    <TouchableOpacity
                      key={page}
                      style={[
                        styles.paginationPage,
                        currentPage === page && styles.paginationPageActive,
                      ]}
                      onPress={() => setCurrentPage(page)}
                    >
                      <Text
                        style={[
                          styles.paginationPageText,
                          currentPage === page &&
                            styles.paginationPageTextActive,
                        ]}
                      >
                        {page}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.paginationButton,
                  currentPage === totalPages &&
                    styles.paginationButtonDisabled,
                ]}
                onPress={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                <Text
                  style={[
                    styles.paginationButtonText,
                    currentPage === totalPages &&
                      styles.paginationButtonTextDisabled,
                  ]}
                >
                  Next
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={currentPage === totalPages ? "#9ca3af" : "#2563eb"}
                />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Template</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to delete "{selectedTemplate?.name}"? This
              action cannot be undone.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowDeleteDialog(false)}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonDelete}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.modalButtonDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Archive Confirmation Modal */}
      <Modal
        visible={showArchiveDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowArchiveDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Archive Template</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to archive "{selectedTemplate?.name}"? You
              can restore it later from the archived templates view.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowArchiveDialog(false)}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonArchive}
                onPress={handleArchive}
              >
                <Ionicons name="archive-outline" size={18} color="#fff" />
                <Text style={styles.modalButtonArchiveText}>Archive</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Guidelines Card */}
      <View style={styles.guidelinesCard}>
        <View style={styles.guidelinesHeader}>
          <Ionicons name="information-circle" size={20} color="#2563eb" />
          <Text style={styles.guidelinesTitle}>Template Guidelines</Text>
        </View>
        <View style={styles.guidelinesList}>
          <View style={styles.guidelineItem}>
            <Text style={styles.guidelineBullet}>•</Text>
            <Text style={styles.guidelineText}>
              Templates are automatically created when you create an exam
            </Text>
          </View>
          <View style={styles.guidelineItem}>
            <Text style={styles.guidelineBullet}>•</Text>
            <Text style={styles.guidelineText}>
              Templates include alignment markers for optical scanning accuracy
            </Text>
          </View>
          <View style={styles.guidelineItem}>
            <Text style={styles.guidelineBullet}>•</Text>
            <Text style={styles.guidelineText}>
              Print on standard A4 white paper for best results
            </Text>
          </View>
          <View style={styles.guidelineItem}>
            <Text style={styles.guidelineBullet}>•</Text>
            <Text style={styles.guidelineText}>
              Instruct students to use #2 pencils and fill bubbles completely
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const getStyles = (darkMode: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: darkMode ? "#1f2937" : "#f9fafb",
    },
    header: {
      padding: 20,
      backgroundColor: darkMode ? "#111827" : "#fff",
      borderBottomWidth: 1,
      borderBottomColor: darkMode ? "#374151" : "#e5e7eb",
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: darkMode ? "#fff" : "#111827",
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: darkMode ? "#9ca3af" : "#6b7280",
      marginBottom: 12,
    },
    archivedToggle: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: darkMode ? "#374151" : "#f3f4f6",
      gap: 8,
    },
    archivedToggleText: {
      fontSize: 14,
      color: "#6b7280",
    },
    archivedToggleTextActive: {
      color: "#fff",
    },
    searchContainer: {
      flexDirection: "row",
      padding: 16,
      gap: 8,
      backgroundColor: darkMode ? "#111827" : "#fff",
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: darkMode ? "#374151" : "#f3f4f6",
      borderRadius: 8,
      paddingHorizontal: 12,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      height: 40,
      color: darkMode ? "#fff" : "#111827",
      fontSize: 14,
    },
    filterButton: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: "#2563eb",
      alignItems: "center",
      justifyContent: "center",
    },
    filterButtonActive: {
      backgroundColor: "#1d4ed8",
    },
    filterBadge: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#ef4444",
    },
    clearButton: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: darkMode ? "#374151" : "#f3f4f6",
      alignItems: "center",
      justifyContent: "center",
    },
    filtersExpanded: {
      padding: 16,
      backgroundColor: darkMode ? "#111827" : "#fff",
      borderTopWidth: 1,
      borderTopColor: darkMode ? "#374151" : "#e5e7eb",
    },
    filterLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: darkMode ? "#9ca3af" : "#6b7280",
      marginBottom: 8,
      marginTop: 8,
    },
    filterScroll: {
      marginBottom: 8,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: darkMode ? "#374151" : "#f3f4f6",
      marginRight: 8,
    },
    filterChipActive: {
      backgroundColor: "#2563eb",
    },
    filterChipText: {
      fontSize: 14,
      color: darkMode ? "#9ca3af" : "#6b7280",
    },
    filterChipTextActive: {
      color: "#fff",
    },
    resultsSummary: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: darkMode ? "#111827" : "#fff",
    },
    resultsText: {
      fontSize: 12,
      color: darkMode ? "#9ca3af" : "#6b7280",
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 14,
      color: darkMode ? "#9ca3af" : "#6b7280",
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: darkMode ? "#1e3a8a" : "#dbeafe",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: darkMode ? "#fff" : "#111827",
      marginBottom: 8,
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 14,
      color: darkMode ? "#9ca3af" : "#6b7280",
      textAlign: "center",
      marginBottom: 16,
    },
    clearFiltersButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#2563eb",
      gap: 8,
    },
    clearFiltersButtonText: {
      fontSize: 14,
      color: "#2563eb",
      fontWeight: "600",
    },
    listContainer: {
      padding: 16,
    },
    templateCard: {
      backgroundColor: darkMode ? "#111827" : "#fff",
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: darkMode ? "#374151" : "#e5e7eb",
    },
    templateCardArchived: {
      opacity: 0.75,
      backgroundColor: darkMode ? "#1f2937" : "#f9fafb",
    },
    templateHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: darkMode ? "#1e3a8a" : "#dbeafe",
      alignItems: "center",
      justifyContent: "center",
    },
    badgeContainer: {
      flexDirection: "row",
      gap: 8,
    },
    archivedBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: darkMode ? "#4b5563" : "#f3f4f6",
    },
    archivedBadgeText: {
      fontSize: 10,
      fontWeight: "600",
      color: darkMode ? "#9ca3af" : "#6b7280",
    },
    questionsBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: darkMode ? "#1e3a8a" : "#dbeafe",
    },
    questionsBadgeText: {
      fontSize: 10,
      fontWeight: "600",
      color: darkMode ? "#93c5fd" : "#1e40af",
    },
    templateTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: darkMode ? "#fff" : "#111827",
      marginBottom: 4,
    },
    templateDescription: {
      fontSize: 14,
      color: darkMode ? "#9ca3af" : "#6b7280",
      marginBottom: 8,
    },
    templateMeta: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 12,
    },
    metaText: {
      fontSize: 12,
      color: darkMode ? "#9ca3af" : "#6b7280",
    },
    templateInfo: {
      flexDirection: "row",
      gap: 16,
      marginBottom: 12,
    },
    infoItem: {
      flexDirection: "row",
      gap: 4,
    },
    infoLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: darkMode ? "#9ca3af" : "#6b7280",
    },
    infoValue: {
      fontSize: 12,
      color: darkMode ? "#fff" : "#111827",
    },
    linkedInfo: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: darkMode ? "#1e3a8a" : "#dbeafe",
      marginBottom: 12,
    },
    linkedItem: {
      flexDirection: "row",
      gap: 4,
      marginBottom: 4,
    },
    linkedLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: darkMode ? "#93c5fd" : "#1e40af",
    },
    linkedValue: {
      fontSize: 12,
      color: darkMode ? "#60a5fa" : "#2563eb",
    },
    actionButtons: {
      marginBottom: 8,
    },
    downloadButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: "#2563eb",
      gap: 8,
    },
    downloadButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#fff",
    },
    secondaryActions: {
      flexDirection: "row",
      gap: 8,
    },
    archiveButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: darkMode ? "#78350f" : "#fef3c7",
      gap: 4,
    },
    archiveButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#d97706",
    },
    restoreButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: darkMode ? "#14532d" : "#dcfce7",
      gap: 4,
    },
    restoreButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#16a34a",
    },
    deleteButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: darkMode ? "#7f1d1d" : "#fee2e2",
      gap: 4,
    },
    deleteButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#dc2626",
    },
    pagination: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      backgroundColor: darkMode ? "#111827" : "#fff",
    },
    paginationButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      gap: 4,
    },
    paginationButtonDisabled: {
      opacity: 0.5,
    },
    paginationButtonText: {
      fontSize: 14,
      color: "#2563eb",
      fontWeight: "600",
    },
    paginationButtonTextDisabled: {
      color: "#9ca3af",
    },
    paginationPages: {
      flexDirection: "row",
      gap: 4,
    },
    paginationPage: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: darkMode ? "#374151" : "#f3f4f6",
    },
    paginationPageActive: {
      backgroundColor: "#2563eb",
    },
    paginationPageText: {
      fontSize: 14,
      color: darkMode ? "#9ca3af" : "#6b7280",
    },
    paginationPageTextActive: {
      color: "#fff",
      fontWeight: "600",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },
    modalContent: {
      backgroundColor: darkMode ? "#111827" : "#fff",
      borderRadius: 12,
      padding: 24,
      width: "100%",
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: darkMode ? "#fff" : "#111827",
      marginBottom: 12,
    },
    modalMessage: {
      fontSize: 14,
      color: darkMode ? "#9ca3af" : "#6b7280",
      marginBottom: 24,
      lineHeight: 20,
    },
    modalButtons: {
      flexDirection: "row",
      gap: 12,
    },
    modalButtonCancel: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: darkMode ? "#374151" : "#e5e7eb",
      alignItems: "center",
    },
    modalButtonCancelText: {
      fontSize: 14,
      fontWeight: "600",
      color: darkMode ? "#9ca3af" : "#6b7280",
    },
    modalButtonDelete: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: "#dc2626",
      gap: 8,
    },
    modalButtonDeleteText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#fff",
    },
    modalButtonArchive: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: "#d97706",
      gap: 8,
    },
    modalButtonArchiveText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#fff",
    },
    guidelinesCard: {
      margin: 16,
      padding: 16,
      borderRadius: 12,
      backgroundColor: darkMode ? "#1e3a8a" : "#dbeafe",
    },
    guidelinesHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    guidelinesTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: darkMode ? "#93c5fd" : "#1e40af",
    },
    guidelinesList: {
      gap: 8,
    },
    guidelineItem: {
      flexDirection: "row",
      gap: 8,
    },
    guidelineBullet: {
      fontSize: 14,
      fontWeight: "bold",
      color: "#2563eb",
    },
    guidelineText: {
      flex: 1,
      fontSize: 14,
      color: darkMode ? "#93c5fd" : "#1e40af",
      lineHeight: 20,
    },
  });
