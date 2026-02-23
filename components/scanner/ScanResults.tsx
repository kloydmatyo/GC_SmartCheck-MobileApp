import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GradingResult } from "../../types/scanning";

interface ScanResultsProps {
  result: GradingResult;
  imageUri?: string;
  questionCount?: number;
  onClose: () => void;
  onScanAnother: () => void;
}

export default function ScanResults({
  result,
  imageUri,
  questionCount,
  onClose,
  onScanAnother,
}: ScanResultsProps) {
  const [isImageModalVisible, setImageModalVisible] = useState(false);
  const [isEditingId, setIsEditingId] = useState(false);
  const [editedStudentId, setEditedStudentId] = useState(
    result.studentId || ""
  );
  const details = result?.details || [];

  const totalQuestions =
    questionCount ??
    (details.length > 0 ? details.length : result?.totalPoints ?? 20);

  const handleSaveId = () => {
    setIsEditingId(false);
    // You can add logic here to save to storage if needed
    // e.g., await StorageService.updateStudentId(result.id, editedStudentId);
  };

  const handleCancelEdit = () => {
    setEditedStudentId(result.studentId || "");
    setIsEditingId(false);
  };

  return (
    <View style={styles.container}>
      {/* Institution Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.institution}>GORDON COLLEGE</Text>
          <Text style={styles.location}>OLONGAPO CITY</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>
            {result.score}/{result.totalPoints}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Scanned Image Thumbnail */}
        {imageUri && (
          <View style={styles.imageSection}>
            <Text style={styles.sectionTitle}>Original Capture</Text>
            <TouchableOpacity
              onPress={() => setImageModalVisible(true)}
              style={styles.thumbnailContainer}
            >
              <Image
                source={{ uri: imageUri }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.imageOverlay}>
                <Ionicons name="expand" size={20} color="white" />
                <Text style={styles.overlayText}>Tap to Enlarge</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Student ID - Editable Section */}
        {result.studentId && result.studentId !== "00000000" && (
          <View
            style={[
              styles.studentIdSection,
              isEditingId && styles.studentIdSectionEditing,
            ]}
          >
            <View style={styles.studentIdLeft}>
              <Text style={styles.studentIdLabel}>Student ZipGrade ID</Text>
              {isEditingId ? (
                <TextInput
                  style={styles.studentIdInput}
                  value={editedStudentId}
                  onChangeText={setEditedStudentId}
                  placeholder="Enter Student ID"
                  placeholderTextColor="#999"
                  maxLength={20}
                  autoFocus
                />
              ) : (
                <Text style={styles.studentIdValue}>{editedStudentId}</Text>
              )}
            </View>

            {isEditingId ? (
              <View style={styles.editButtonsContainer}>
                <TouchableOpacity
                  style={styles.iconButtonCancel}
                  onPress={handleCancelEdit}
                >
                  <Ionicons name="close" size={18} color="#F44336" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButtonSave}
                  onPress={handleSaveId}
                >
                  <Ionicons name="checkmark" size={18} color="#4CAF50" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditingId(true)}
              >
                <Ionicons name="pencil" size={18} color="#5C6BC0" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Scanned Items Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Scanned {totalQuestions}-Question Sheet
          </Text>
          {details.map((item) => (
            <View key={item.questionNumber} style={styles.row}>
              <View style={styles.qBox}>
                <Text style={styles.qLabel}>{item.questionNumber}</Text>
              </View>
              <View style={styles.comparisonContainer}>
                <View style={styles.scanGroup}>
                  <Text style={styles.miniLabel}>SCANNED</Text>
                  <Text
                    style={[
                      styles.bubbleValue,
                      item.isCorrect ? styles.correctColor : styles.errorColor,
                    ]}
                  >
                    {item.studentAnswer || "—"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#DDD" />
                <View style={styles.scanGroup}>
                  <Text style={styles.miniLabel}>KEY</Text>
                  <Text style={styles.bubbleValue}>{item.correctAnswer}</Text>
                </View>
              </View>
              <Ionicons
                name={item.isCorrect ? "checkmark-circle" : "close-circle"}
                size={22}
                color={item.isCorrect ? "#4CAF50" : "#F44336"}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Full Screen Image Modal */}
      <Modal
        visible={isImageModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalBackground}>
          <TouchableOpacity
            style={styles.closeModal}
            onPress={() => setImageModalVisible(false)}
          >
            <Ionicons name="close-circle" size={40} color="white" />
          </TouchableOpacity>
          <Image
            source={{ uri: imageUri }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        </View>
      </Modal>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
          <Text style={styles.btnTextSecondary}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={onScanAnother}>
          <Text style={styles.btnTextPrimary}>Next Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F4F7" },
  header: {
    padding: 20,
    backgroundColor: "#1A237E",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  institution: { color: "white", fontSize: 18, fontWeight: "800" },
  location: { color: "#BBDEFB", fontSize: 12 },
  scoreBadge: { backgroundColor: "white", padding: 8, borderRadius: 8 },
  scoreText: { fontWeight: "bold", fontSize: 18, color: "#1A237E" },
  content: { flex: 1, padding: 15 },

  // Image styles
  imageSection: { marginBottom: 15 },
  thumbnailContainer: {
    height: 180,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#000",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  thumbnail: { width: "100%", height: "100%", opacity: 0.8 },
  imageOverlay: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 6,
    borderRadius: 8,
  },
  overlayText: { color: "white", fontSize: 12, marginLeft: 5, fontWeight: "600" },

  // Student ID
  studentIdSection: {
    backgroundColor: "#E8EAF6",
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  studentIdSectionEditing: {
    backgroundColor: "#F3E5F5",
    borderWidth: 2,
    borderColor: "#5C6BC0",
  },
  studentIdLeft: {
    flex: 1,
  },
  studentIdLabel: { fontSize: 12, color: "#5C6BC0", fontWeight: "700" },
  studentIdValue: { fontSize: 16, fontWeight: "800", color: "#1A237E", letterSpacing: 2, marginTop: 4 },
  studentIdInput: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A237E",
    letterSpacing: 2,
    marginTop: 4,
    borderBottomWidth: 2,
    borderBottomColor: "#5C6BC0",
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  editButton: {
    padding: 8,
    marginLeft: 10,
  },
  editButtonsContainer: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 10,
  },
  iconButtonSave: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  iconButtonCancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFEBEE",
    justifyContent: "center",
    alignItems: "center",
  },

  // Modal
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
  },
  fullImage: { width: "100%", height: "80%" },
  closeModal: { position: "absolute", top: 50, right: 20, zIndex: 10 },

  // List
  section: {
    backgroundColor: "white",
    borderRadius: 15,
    padding: 15,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#666",
    marginBottom: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  qBox: { width: 35 },
  qLabel: { fontWeight: "bold", color: "#333" },
  comparisonContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
  },
  scanGroup: { alignItems: "center" },
  miniLabel: { fontSize: 8, color: "#AAA", fontWeight: "bold" },
  bubbleValue: { fontSize: 18, fontWeight: "700" },
  correctColor: { color: "#4CAF50" },
  errorColor: { color: "#F44336" },
  footer: {
    padding: 20,
    flexDirection: "row",
    gap: 10,
    backgroundColor: "white",
  },
  btnPrimary: {
    flex: 2,
    backgroundColor: "#1A237E",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: "#EEE",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  btnTextPrimary: { color: "white", fontWeight: "bold" },
  btnTextSecondary: { color: "#666" },
});