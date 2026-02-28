import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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

export default function ClassesScreen() {
  const router = useRouter();
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
    }, []),
  );

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

  // Toggle day selection
  const toggleDay = (day: string) => {
    setFormData((prev) => {
      const currentDays = prev.schedule_day;
      if (currentDays.includes(day)) {
        // Remove day if already selected
        return {
          ...prev,
          schedule_day: currentDays.filter((d) => d !== day),
        };
      } else {
        // Add day if not selected
        return {
          ...prev,
          schedule_day: [...currentDays, day],
        };
      }
    });
  };

  const filteredClasses = classes.filter(
    (cls) =>
      cls.class_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.course_subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.section_block.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderClassCard = ({ item }: { item: Class }) => (
    <TouchableOpacity
      style={styles.classCard}
      onPress={() => openClassList(item.id)}
      activeOpacity={0.9}
    >
      <View style={styles.classHeader}>
        <View style={styles.classHeaderLeft}>
          <Text style={styles.classCode}>{item.section_block.toUpperCase()}</Text>
          <Text style={styles.className}>{item.class_name}</Text>
          <Text style={styles.classSubject}>{item.course_subject}</Text>
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
          <Ionicons name="time-outline" size={14} color="#d9efe2" />
          <Text style={styles.classInfoText}>
            {Array.isArray(item.schedule_day)
              ? item.schedule_day.join(", ")
              : item.schedule_day}{" "}
            {item.schedule_time}
          </Text>
        </View>
        <View style={styles.classInfo}>
          <Ionicons name="location-outline" size={14} color="#d9efe2" />
          <Text style={styles.classInfoText}>Room {item.room}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaBadge}>
          <Text style={styles.metaLabel}>SY</Text>
          <Text style={styles.metaValue}>{item.school_year}</Text>
        </View>
        <View style={styles.metaBadge}>
          <Text style={styles.metaLabel}>Sem</Text>
          <Text style={styles.metaValue}>{item.semester}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.viewButton}
        onPress={() => openClassList(item.id)}
      >
        <Ionicons name="people-outline" size={14} color={COLORS.white} />
        <Text style={styles.viewButtonText}>View Class List</Text>
      </TouchableOpacity>

      <View style={styles.recentRow}>
        <Text style={styles.recentTitle}>Recent Quizzes</Text>
        <TouchableOpacity
          style={styles.recentToggle}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setCollapsedRecent((prev) => ({
              ...prev,
              [item.id]: !prev[item.id],
            }));
          }}
        >
          <Ionicons
            name={collapsedRecent[item.id] ? "chevron-up" : "chevron-down"}
            size={16}
            color="#8ad0ae"
          />
        </TouchableOpacity>
      </View>
      {!collapsedRecent[item.id] && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={styles.quizCardsRow}
          >
            <View style={styles.quizMiniCard}>
              <Text style={styles.quizMiniDate}>Feb 14, 2026</Text>
              <Text style={styles.quizMiniTitle}>Template 1</Text>
            </View>
            <View style={styles.quizMiniCard}>
              <Text style={styles.quizMiniDate}>Feb 14, 2026</Text>
              <Text style={styles.quizMiniTitle}>Template 2</Text>
            </View>
            <View style={styles.quizMiniCard}>
              <Text style={styles.quizMiniDate}>Feb 14, 2026</Text>
              <Text style={styles.quizMiniTitle}>Template 3</Text>
            </View>
          </ScrollView>
        </>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Classes</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Classes</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
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
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create New Class</Text>
            <View style={styles.modalHeaderPlaceholder} />
          </View>

          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
              <Text style={styles.label}>Class Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., CS 101"
                placeholderTextColor="#9ab79f"
                value={formData.class_name}
                onChangeText={(text) =>
                  setFormData({ ...formData, class_name: text })
                }
              />

              <Text style={styles.label}>Course Subject *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Computer Science"
                placeholderTextColor="#9ab79f"
                value={formData.course_subject}
                onChangeText={(text) =>
                  setFormData({ ...formData, course_subject: text })
                }
              />

              <Text style={styles.label}>Section/Block</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., A"
                placeholderTextColor="#9ab79f"
                value={formData.section_block}
                onChangeText={(text) =>
                  setFormData({ ...formData, section_block: text })
                }
              />

              <Text style={styles.label}>Room</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 404"
                placeholderTextColor="#9ab79f"
                value={formData.room}
                onChangeText={(text) =>
                  setFormData({ ...formData, room: text })
                }
              />

              <Text style={styles.label}>Schedule Day (Select multiple)</Text>
              <View style={styles.dayButtons}>
                {[
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dayButton,
                      formData.schedule_day.includes(day) &&
                        styles.dayButtonActive,
                    ]}
                    onPress={() => toggleDay(day)}
                  >
                    <Text
                      style={[
                        styles.dayButtonText,
                        formData.schedule_day.includes(day) &&
                          styles.dayButtonTextActive,
                      ]}
                    >
                      {day.substring(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Schedule Time</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 10:00am"
                placeholderTextColor="#9ab79f"
                value={formData.schedule_time}
                onChangeText={(text) =>
                  setFormData({ ...formData, schedule_time: text })
                }
              />

              <Text style={styles.label}>School Year</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 2025*2026"
                placeholderTextColor="#9ab79f"
                value={formData.school_year}
                onChangeText={(text) =>
                  setFormData({ ...formData, school_year: text })
                }
              />

              <Text style={styles.label}>Semester</Text>
              <View style={styles.semesterButtons}>
                {["1st semester", "2nd semester", "Summer"].map((sem) => (
                  <TouchableOpacity
                    key={sem}
                    style={[
                      styles.semesterButton,
                      formData.semester === sem && styles.semesterButtonActive,
                    ]}
                    onPress={() => setFormData({ ...formData, semester: sem })}
                  >
                    <Text
                      style={[
                        styles.semesterButtonText,
                        formData.semester === sem &&
                          styles.semesterButtonTextActive,
                      ]}
                    >
                      {sem}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
              disabled={creating}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.createButton,
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

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#edf1ee",
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
    backgroundColor: "#3f6b54",
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
    backgroundColor: "#4f715f",
    borderRadius: RADIUS.medium,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#3f5f4f",
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
  classCode: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.white,
    marginBottom: 4,
  },
  className: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e6f2ec",
    marginBottom: 2,
  },
  classSubject: {
    fontSize: 13,
    color: "#cce1d5",
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
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  metaBadge: {
    flex: 1,
    backgroundColor: "rgba(233, 245, 238, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(221, 239, 230, 0.3)",
    borderRadius: RADIUS.small,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaLabel: {
    fontSize: 10,
    color: "#cce2d7",
    marginBottom: 1,
    fontWeight: "700",
  },
  metaValue: {
    fontSize: 12,
    color: "#ecf7f1",
    fontWeight: "700",
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2e7d68",
    paddingVertical: 10,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: "#2a725f",
    marginBottom: 12,
  },
  viewButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "700",
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
    paddingBottom: 20,
    backgroundColor: "#f5f5f5",
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
