import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { auth, db } from "@/config/firebase";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { StudentImportModal } from "@/components/student/StudentImportModal";
import { DashboardService } from "@/services/dashboardService";
import { ImportResult } from "@/types/student";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [examMenuVisible, setExamMenuVisible] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamRow | null>(null);
  const [archiveClassConfirmVisible, setArchiveClassConfirmVisible] = useState(false);
  const [deleteClassConfirmVisible, setDeleteClassConfirmVisible] = useState(false);
  const [archiveExamConfirmVisible, setArchiveExamConfirmVisible] = useState(false);
  const [deleteExamConfirmVisible, setDeleteExamConfirmVisible] = useState(false);
  const [examRows, setExamRows] = useState<ExamRow[]>([]);
  const [examRowsLoading, setExamRowsLoading] = useState(true);
  const [examMenuPosition, setExamMenuPosition] = useState({ top: 0, left: 0 });
  const examLoadRequestRef = React.useRef(0);

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
        type: "success",
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
        type: "success",
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
        type: "success",
        text1: "Deleted",
        text2: "Exam deleted successfully",
      });
      loadExams();
    } catch (error) {
      console.error("Error deleting exam:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to delete exam",
      });
    }
  };

  const handleDeleteClass = async () => {
    if (!classData) return;

    try {
      await ClassService.deleteClass(classData.id);
      setDeleteClassConfirmVisible(false);
      setSettingsMenuVisible(false);
      Toast.show({
        type: "success",
        text1: "Deleted",
        text2: `${classData.class_name} deleted successfully`,
      });
      router.replace("/(tabs)/classes");
    } catch (error) {
      console.error("Error deleting class:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to delete class",
      });
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

    return {
      average: Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length),
      highest: Math.max(...averages),
      lowest: Math.min(...averages),
      totalScanned: students.reduce((sum, student) => sum + student.scans, 0),
      passed: averages.filter((value) => value >= 75).length,
      failed: averages.filter((value) => value < 75).length,
      distribution,
    };
  }, [students]);

  const renderTab = () => {
    if (activeTab === "students") {
      return (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search students..."
                placeholderTextColor="#7B8794"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => setShowImportModal(true)}
            >
              <Ionicons name="download-outline" size={18} color="#13A76B" />
            </TouchableOpacity>
          </View>

          {!students.length ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconWrap}>
                <Ionicons name="people-outline" size={28} color="#20BE7B" />
              </View>
              <Text style={styles.emptyStateTitle}>No students yet</Text>
              <Text style={styles.emptyStateText}>
                This class does not have any students yet. Tap the import button to
                add a student list.
              </Text>
            </View>
          ) : !filteredStudents.length ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconWrap}>
                <Ionicons name="search-outline" size={26} color="#20BE7B" />
              </View>
              <Text style={styles.emptyStateTitle}>No matching students</Text>
              <Text style={styles.emptyStateText}>
                No students matched your search. Try a different name.
              </Text>
            </View>
          ) : (
            filteredStudents.map((student) => (
              <TouchableOpacity
                key={student.id}
                style={styles.studentCard}
                activeOpacity={0.88}
                onPress={() => router.push("/(tabs)/quizzes")}
              >
                <View style={[styles.studentAvatar, { backgroundColor: student.color }]}>
                  <Text style={styles.studentAvatarText}>{student.initials}</Text>
                </View>
                <View style={styles.studentBody}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentSubtext}>{student.scans} scans</Text>
                </View>
                <View style={styles.studentScoreWrap}>
                  <Text
                    style={[styles.studentScore, { color: scoreColor(student.average) }]}
                  >
                    {student.average} %
                  </Text>
                  <Text style={styles.studentAvgLabel}>Avg</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C5CBD6" />
              </TouchableOpacity>
            ))
          )}
        </>
      );
    }

    if (activeTab === "exams") {
      return (
        <>
          <TouchableOpacity
            style={styles.createExamButton}
            onPress={() => router.push(`/(tabs)/create-quiz?classId=${classId}`)}
            activeOpacity={0.88}
          >
            <Ionicons name="add" size={18} color="#109B67" />
            <Text style={styles.createExamText}>Create Exam</Text>
          </TouchableOpacity>

          {examRowsLoading ? (
            <View style={styles.emptyStateCard}>
              <ActivityIndicator size="small" color="#20BE7B" />
              <Text style={styles.emptyStateTitle}>Loading exams...</Text>
              <Text style={styles.emptyStateText}>
                Please wait while we load this class&apos;s exams.
              </Text>
            </View>
          ) : !examRows.length ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconWrap}>
                <Ionicons name="document-text-outline" size={26} color="#20BE7B" />
              </View>
              <Text style={styles.emptyStateTitle}>No exams yet</Text>
              <Text style={styles.emptyStateText}>
                This class does not have any exams yet. Tap Create Exam to add one.
              </Text>
            </View>
          ) : !filteredExams.length ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconWrap}>
                <Ionicons name="search-outline" size={26} color="#20BE7B" />
              </View>
              <Text style={styles.emptyStateTitle}>No matching exams</Text>
              <Text style={styles.emptyStateText}>
                No exams matched your search. Try a different title or subject.
              </Text>
            </View>
          ) : (
            filteredExams.map((exam) => (
              <View key={exam.id} style={styles.examCard}>
                <TouchableOpacity
                  style={styles.examCardPressable}
                  activeOpacity={0.88}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/exam-preview",
                      params: {
                        examId: String(exam.id),
                        classId: String(classId),
                        tab: "answerKey",
                        refresh: String(Date.now()),
                      },
                    })
                  }
                >
                  <View style={styles.examBody}>
                    <Text style={styles.examTitle}>{exam.title}</Text>
                    <Text style={styles.examMeta}>
                      {exam.questions} Questions • {exam.scans} Scans
                    </Text>
                    {exam.examCode ? (
                      <Text style={styles.examCodeMeta}>{exam.examCode}</Text>
                    ) : null}
                  </View>
                  <View style={styles.examRight}>
                    <Text style={[styles.examAverage, { color: scoreColor(exam.average) }]}>
                      {exam.average} %
                    </Text>
                    <Text style={styles.studentAvgLabel}>Avg</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.examMenuButton}
                  onPress={(event) =>
                    openExamMenu(
                      exam,
                      event.nativeEvent.pageX,
                      event.nativeEvent.pageY,
                    )
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`More actions for ${exam.title}`}
                >
                  <Ionicons name="ellipsis-vertical" size={16} color="#A3ACBA" />
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
            <Ionicons name="settings-outline" size={34} color="#20BE7B" />
          </View>
          <Text style={styles.scanTitle}>Ready to Scan</Text>
          <Text style={styles.scanDescription}>
            Scan answer sheets for {classData?.class_name}. {examRows.length === 1 ? `This will use the "${examRows[0].title}" exam.` : "Select the exam on the next screen."}
          </Text>
          <TouchableOpacity
            style={styles.startScanButton}
            onPress={() => {
              const examIdParam = examRows.length === 1 ? `&examId=${examRows[0].id}` : "";
              router.push(`/(tabs)/scanner?classId=${classId}${examIdParam}`);
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.startScanText}>Start Scanning</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const maxDistribution = Math.max(...stats.distribution.map((item) => item.count), 1);

    return (
      <>
        <View style={styles.statsHeroCard}>
          <Text style={styles.statsHeroLabel}>Class Average</Text>
          <Text style={styles.statsHeroValue}>{stats.average} %</Text>
          <View style={styles.statsHeroBar}>
            <AnimatedStatBar progress={stats.average / 100} />
          </View>
          <View style={styles.statsHeroFooter}>
            <Text style={styles.statsPassedText}>{stats.passed} Passed</Text>
            <Text style={styles.statsFailedText}>{stats.failed} Failed</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statsSmallCard}>
            <Text style={styles.statsSmallLabel}>Highest Score</Text>
            <Text style={styles.statsSmallValue}>{stats.highest}%</Text>
          </View>
          <View style={styles.statsSmallCard}>
            <Text style={styles.statsSmallLabel}>Lowest Score</Text>
            <Text style={styles.statsSmallValue}>{stats.lowest}%</Text>
          </View>
          <View style={styles.statsSmallCard}>
            <Text style={styles.statsSmallLabel}>Total Scanned</Text>
            <Text style={styles.statsSmallValue}>{stats.totalScanned}</Text>
          </View>
        </View>

        <View style={styles.distributionCard}>
          <Text style={styles.distributionTitle}>Score Distribution</Text>
          {stats.distribution.map((item) => (
            <View key={item.label} style={styles.distributionRow}>
              <Text style={styles.distributionLabel}>{item.label}</Text>
              <View style={styles.distributionTrack}>
                <AnimatedStatBar progress={item.count / maxDistribution} />
              </View>
              <Text style={styles.distributionCount}>{item.count}</Text>
            </View>
          ))}
        </View>
      </>
    );
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
        message={`Are you sure you want to archive ${classData?.class_name ?? "this class"}? You can still view it later in the archived section.`}
        cancelText="Cancel"
        confirmText="Archive"
        destructive
        onCancel={() => setArchiveClassConfirmVisible(false)}
        onConfirm={handleArchiveClass}
      />

      <ConfirmationModal
        visible={deleteClassConfirmVisible}
        title="Delete Item"
        message={`Are you sure you want to delete ${classData?.class_name ?? "this class"}? This action cannot be undone.`}
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
        visible={deleteExamConfirmVisible}
        title="Delete Item"
        message={`Are you sure you want to delete ${selectedExam?.title ?? "this exam"}? This action cannot be undone.`}
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

      <Toast />
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
});
