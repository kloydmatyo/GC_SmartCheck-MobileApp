import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
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
import { ClassService } from "../../services/classService";
import { Class } from "../../types/class";

export default function ClassesScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);

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
      cls.course_subject.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderClassCard = ({ item }: { item: Class }) => (
    <TouchableOpacity
      style={styles.classCard}
      onPress={() => router.push(`/(tabs)/class-details?classId=${item.id}`)}
    >
      <View style={styles.classHeader}>
        <View style={styles.classHeaderLeft}>
          <Text style={styles.classCode}>
            {item.section_block.toUpperCase()}
          </Text>
          <Text style={styles.className}>{item.class_name}</Text>
          <Text style={styles.classSubject}>{item.course_subject}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#666" />
      </View>
      <View style={styles.classFooter}>
        <View style={styles.classInfo}>
          <Ionicons name="people" size={16} color="#666" />
          <Text style={styles.classInfoText}>
            {item.students.length} Students
          </Text>
        </View>
        <View style={styles.classInfo}>
          <Ionicons name="time" size={16} color="#666" />
          <Text style={styles.classInfoText}>
            {Array.isArray(item.schedule_day)
              ? item.schedule_day.join(", ")
              : item.schedule_day}{" "}
            {item.schedule_time}
          </Text>
        </View>
        <View style={styles.classInfo}>
          <Ionicons name="location" size={16} color="#666" />
          <Text style={styles.classInfoText}>Room {item.room}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Classes</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add-circle" size={28} color="#00a550" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00a550" />
          <Text style={styles.loadingText}>Loading classes...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Classes</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add-circle" size={28} color="#00a550" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#666"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search classes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
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
              Tap the + button to create your first class
            </Text>
          </View>
        }
      />

      {/* Create Class Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Class</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>Class Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., CS 101"
                value={formData.class_name}
                onChangeText={(text) =>
                  setFormData({ ...formData, class_name: text })
                }
              />

              <Text style={styles.label}>Course Subject *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Computer Science"
                value={formData.course_subject}
                onChangeText={(text) =>
                  setFormData({ ...formData, course_subject: text })
                }
              />

              <Text style={styles.label}>Section/Block</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., A"
                value={formData.section_block}
                onChangeText={(text) =>
                  setFormData({ ...formData, section_block: text })
                }
              />

              <Text style={styles.label}>Room</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 404"
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
                value={formData.schedule_time}
                onChangeText={(text) =>
                  setFormData({ ...formData, schedule_time: text })
                }
              />

              <Text style={styles.label}>School Year</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 2025*2026"
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
        </View>
      </Modal>

      <Toast />
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
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  addButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginVertical: 16,
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  classCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  classHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  classHeaderLeft: {
    flex: 1,
  },
  classCode: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00a550",
    marginBottom: 4,
  },
  className: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  classSubject: {
    fontSize: 14,
    color: "#666",
  },
  classFooter: {
    gap: 8,
  },
  classInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  classInfoText: {
    fontSize: 14,
    color: "#666",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
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
  emptySubtext: {
    fontSize: 14,
    color: "#ccc",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  modalBody: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#333",
    backgroundColor: "#fff",
  },
  dayButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  dayButtonActive: {
    backgroundColor: "#00a550",
    borderColor: "#00a550",
  },
  dayButtonText: {
    fontSize: 14,
    color: "#666",
  },
  dayButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  semesterButtons: {
    gap: 8,
  },
  semesterButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  semesterButtonActive: {
    backgroundColor: "#00a550",
    borderColor: "#00a550",
  },
  semesterButtonText: {
    fontSize: 14,
    color: "#666",
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
    borderTopColor: "#e0e0e0",
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  createButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#00a550",
    alignItems: "center",
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
});
