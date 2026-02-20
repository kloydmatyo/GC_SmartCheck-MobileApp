import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { ClassService } from "../../services/classService";
import { Class, Student } from "../../types/class";

export default function ClassDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const classId = params.classId as string;

  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addStudentModalVisible, setAddStudentModalVisible] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);

  // Student form state
  const [studentForm, setStudentForm] = useState({
    student_id: "",
    first_name: "",
    last_name: "",
    email: "",
  });

  useEffect(() => {
    loadClassData();
  }, [classId]);

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
    Alert.alert(
      "Remove Student",
      `Are you sure you want to remove ${studentName} from this class?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await ClassService.removeStudent(classId, studentId);
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
            }
          },
        },
      ],
    );
  };

  const renderStudentItem = ({ item }: { item: Student }) => (
    <View style={styles.studentCard}>
      <View style={styles.studentInfo}>
        <View style={styles.studentAvatar}>
          <Text style={styles.studentAvatarText}>
            {item.first_name.charAt(0)}
            {item.last_name.charAt(0)}
          </Text>
        </View>
        <View style={styles.studentDetails}>
          <Text style={styles.studentName}>
            {item.first_name} {item.last_name}
          </Text>
          <Text style={styles.studentId}>ID: {item.student_id}</Text>
          {item.email && <Text style={styles.studentEmail}>{item.email}</Text>}
        </View>
      </View>
      <TouchableOpacity
        onPress={() =>
          handleRemoveStudent(
            item.student_id,
            `${item.first_name} ${item.last_name}`,
          )
        }
      >
        <Ionicons name="trash-outline" size={20} color="#e74c3c" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00a550" />
        <Text style={styles.loadingText}>Loading class details...</Text>
      </View>
    );
  }

  if (error || !classData) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#e74c3c" />
        <Text style={styles.errorText}>{error || "Class not found"}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadClassData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backIcon} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Class Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Class Info Section */}
        <View style={styles.section}>
          <Text style={styles.classCode}>
            {classData.section_block.toUpperCase()}
          </Text>
          <Text style={styles.className}>{classData.class_name}</Text>
          <Text style={styles.courseSubject}>{classData.course_subject}</Text>
        </View>

        {/* Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Class Information</Text>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Room</Text>
              <Text style={styles.infoValue}>{classData.room || "N/A"}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Schedule</Text>
              <Text style={styles.infoValue}>
                {Array.isArray(classData.schedule_day)
                  ? classData.schedule_day.join(", ")
                  : classData.schedule_day}{" "}
                {classData.schedule_time}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="school-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>School Year</Text>
              <Text style={styles.infoValue}>{classData.school_year}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Semester</Text>
              <Text style={styles.infoValue}>{classData.semester}</Text>
            </View>
          </View>
        </View>

        {/* Students Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Students ({classData.students.length})
            </Text>
            <TouchableOpacity
              style={styles.addStudentButton}
              onPress={() => setAddStudentModalVisible(true)}
            >
              <Ionicons name="add-circle" size={24} color="#00a550" />
            </TouchableOpacity>
          </View>

          {classData.students.length === 0 ? (
            <View style={styles.emptyStudents}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No students yet</Text>
              <Text style={styles.emptySubtext}>
                Tap + to add your first student
              </Text>
            </View>
          ) : (
            <FlatList
              data={classData.students}
              renderItem={renderStudentItem}
              keyExtractor={(item) => item.student_id}
              scrollEnabled={false}
            />
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Student</Text>
              <TouchableOpacity
                onPress={() => setAddStudentModalVisible(false)}
              >
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Student ID *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 202311070"
                value={studentForm.student_id}
                onChangeText={(text) =>
                  setStudentForm({ ...studentForm, student_id: text })
                }
                keyboardType="numeric"
              />

              <Text style={styles.label}>First Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., John"
                value={studentForm.first_name}
                onChangeText={(text) =>
                  setStudentForm({ ...studentForm, first_name: text })
                }
              />

              <Text style={styles.label}>Last Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Doe"
                value={studentForm.last_name}
                onChangeText={(text) =>
                  setStudentForm({ ...studentForm, last_name: text })
                }
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., student@example.com"
                value={studentForm.email}
                onChangeText={(text) =>
                  setStudentForm({ ...studentForm, email: text })
                }
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setAddStudentModalVisible(false)}
                disabled={addingStudent}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
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

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 20,
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
  backIcon: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  classCode: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00a550",
    marginBottom: 8,
  },
  className: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  courseSubject: {
    fontSize: 16,
    color: "#666",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  addStudentButton: {
    padding: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  studentCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    marginBottom: 8,
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
    backgroundColor: "#00a550",
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
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  studentId: {
    fontSize: 14,
    color: "#666",
  },
  studentEmail: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  emptyStudents: {
    alignItems: "center",
    paddingVertical: 40,
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: "#e74c3c",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#00a550",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
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
    color: "#666",
    fontSize: 16,
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
    maxHeight: "70%",
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
  addButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#00a550",
    alignItems: "center",
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
});
