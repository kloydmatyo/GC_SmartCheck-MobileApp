import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StorageService } from "../../services/storageService";
import { GradingResult } from "../../types/scanning";

interface ScanResultsProps {
  result: GradingResult;
  imageUri?: string;
  questionCount?: number;
  onClose: () => void;
  onScanAnother: () => void;
  onRetrySave?: () => void;
}

export default function ScanResults({
  result,
  imageUri,
  questionCount,
  onClose,
  onScanAnother,
  onRetrySave,
}: ScanResultsProps) {
  const [isImageModalVisible, setImageModalVisible] = useState(false);
  const [isEditingId, setIsEditingId] = useState(false);
  const [editedStudentId, setEditedStudentId] = useState(
    result.studentId || "",
  );

  const details = result?.details || result?.answers || [];
  const totalQuestions =
    questionCount ??
    (details.length > 0 ? details.length : (result?.totalPoints ?? 20));

  const handleSaveId = async () => {
    setIsEditingId(false);
    try {
      if (result.metadata?.timestamp) {
        await StorageService.updateStudentId(
          result.metadata.timestamp,
          editedStudentId,
        );
        result.studentId = editedStudentId;
      }
    } catch (error) {
      console.error("Failed to update student ID:", error);
    }
  };

  const handleCancelEdit = () => {
    setEditedStudentId(result.studentId || "");
    setIsEditingId(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent />

      {/* Premium Header - Optimized Spacing */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.institution}>GORDON COLLEGE</Text>
          <Text style={styles.location}>OLONGAPO CITY</Text>
        </View>

        <View style={styles.scoreBadge}>
          <Text style={styles.scoreValue}>{result.score}</Text>
          <Text style={styles.scoreDivider}>/</Text>
          <Text style={styles.scoreTotal}>{result.totalPoints}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.screenGreeting}>Scan Result</Text>
          <Text style={styles.screenSubtext}>Review and verify the captured data</Text>
        </View>

        {/* Scanned Image Section */}
        {imageUri && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <Ionicons name="camera" size={16} color="#1FC27D" />
              </View>
              <Text style={styles.sectionTitle}>Source Image</Text>
            </View>
            <TouchableOpacity
              onPress={() => setImageModalVisible(true)}
              style={styles.thumbnailContainer}
              activeOpacity={0.9}
            >
              <Image
                source={{ uri: imageUri }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.imageOverlay}>
                <Ionicons name="expand" size={14} color="white" />
                <Text style={styles.overlayText}>Enlarge</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Student ID Section */}
        {result.studentId && (
          <View style={[styles.section, isEditingId && styles.sectionEditing]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconContainer, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="person" size={16} color="#1FC27D" />
              </View>
              <Text style={styles.sectionTitle}>Student Identity</Text>
              {!isEditingId && (
                <TouchableOpacity
                  style={styles.editIcon}
                  onPress={() => setIsEditingId(true)}
                >
                  <Ionicons name="create-outline" size={18} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            {isEditingId ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.studentIdInput}
                  value={editedStudentId}
                  onChangeText={setEditedStudentId}
                  placeholder="ID Number"
                  placeholderTextColor="#BBB"
                  maxLength={20}
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.actionBtnCancel}>
                    <Ionicons name="close" size={20} color="#FF4B4B" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveId} style={styles.actionBtnSave}>
                    <Ionicons name="checkmark" size={20} color="#1FC27D" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={styles.studentIdValue}>{editedStudentId || "Unknown"}</Text>
            )}
          </View>
        )}

        {/* Breakdown Section */}
        <View style={[styles.section, styles.breakdownSection]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="help-circle-outline" size={18} color="#2196F3" />
            </View>
            <Text style={styles.sectionTitle}>Point Breakdown ({totalQuestions} items)</Text>
          </View>

          <View style={styles.breakdownList}>
            {details.length > 0 ? (
              details.map((item, index) => {
                const studentAns = item.studentAnswer || (item as any).selectedAnswer || "—";
                const correctAns = item.correctAnswer || "—";
                const isCorrect = item.isCorrect ?? false;

                return (
                  <View key={index} style={[styles.row, index === details.length - 1 && styles.lastRow]}>
                    <View style={styles.qIndicator}>
                      <Text style={styles.qNumber}>{item.questionNumber}</Text>
                    </View>

                    <View style={styles.comparison}>
                      <View style={styles.ansBlock}>
                        <Text style={styles.ansLabel}>SCANNED</Text>
                        <Text style={[styles.ansValue, !isCorrect && styles.textError]}>{studentAns}</Text>
                      </View>

                      <Ionicons name="arrow-forward" size={12} color="#DDD" />

                      <View style={styles.ansBlock}>
                        <Text style={styles.ansLabel}>KEY</Text>
                        <Text style={styles.ansValue}>{correctAns}</Text>
                      </View>
                    </View>

                    <View style={[styles.statusTag, isCorrect ? styles.bgSuccess : styles.bgError]}>
                      <Ionicons
                        name={isCorrect ? "checkmark" : "close"}
                        size={12}
                        color="#FFF"
                      />
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyText}>No analysis data for this sheet.</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.discardBtn} onPress={onClose}>
          <Text style={styles.discardText}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextBtn} onPress={onScanAnother}>
          <Text style={styles.nextText}>Quick Scan</Text>
          <Ionicons name="scan-outline" size={18} color="#FFF" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>

      {/* Image Preview Modal */}
      <Modal visible={isImageModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setImageModalVisible(false)}
          >
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <Image source={{ uri: imageUri }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16, // Reduced from 20 for better edge fit
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 55,
    paddingBottom: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleContainer: {
    flex: 1,
  },
  institution: {
    color: "#1A1A1A",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  location: {
    color: "#717171",
    fontSize: 11,
    fontWeight: "600",
  },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
  },
  scoreValue: {
    color: "#1FC27D", // Theme Green Color
    fontSize: 20,
    fontWeight: "900",
  },
  scoreDivider: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
    marginHorizontal: 3,
  },
  scoreTotal: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16, // Reduced from 20 to avoid excessive blank space
    paddingTop: 24,
    paddingBottom: 40,
  },
  titleContainer: {
    marginBottom: 28,
  },
  screenGreeting: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1A1A1A",
    letterSpacing: -0.5,
  },
  screenSubtext: {
    fontSize: 14,
    color: "#717171",
    marginTop: 6,
  },
  section: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.02)",
  },
  sectionEditing: {
    borderColor: "#1FC27D",
    borderWidth: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  sectionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    color: "#1A1A1A",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 12,
    flex: 1,
  },
  editIcon: {
    padding: 6,
  },
  thumbnailContainer: {
    height: 220,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    opacity: 0.95,
  },
  imageOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  overlayText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 6,
  },
  studentIdValue: {
    color: "#1A1A1A",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  studentIdInput: {
    flex: 1,
    color: "#1FC27D",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
    paddingVertical: 6,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtnCancel: {
    padding: 10,
    backgroundColor: "#FFEBEE",
    borderRadius: 12,
  },
  actionBtnSave: {
    padding: 10,
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
  },
  breakdownSection: {
    paddingBottom: 8,
  },
  breakdownList: {
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F9FA",
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  qIndicator: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F1F3F5",
    alignItems: "center",
    justifyContent: "center",
  },
  qNumber: {
    color: "#495057",
    fontSize: 13,
    fontWeight: "700",
  },
  comparison: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 12,
  },
  ansBlock: {
    alignItems: "center",
  },
  ansLabel: {
    fontSize: 9,
    color: "#ADB5BD",
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ansValue: {
    color: "#1A1A1A",
    fontSize: 18,
    fontWeight: "700",
  },
  textError: {
    color: "#FF4B4B",
  },
  statusTag: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bgSuccess: { backgroundColor: "#1FC27D" },
  bgError: { backgroundColor: "#FF4B4B" },
  emptyText: {
    color: "#ADB5BD",
    textAlign: "center",
    paddingVertical: 40,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: 16, // Reduced from 20 to match container
    paddingVertical: 20,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    gap: 12,
  },
  discardBtn: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F3F5",
  },
  discardText: {
    color: "#717171",
    fontWeight: "700",
    fontSize: 16,
  },
  nextBtn: {
    flex: 2,
    backgroundColor: "#1FC27D",
    paddingVertical: 18,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1FC27D",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  nextText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 16,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  btnExport: {
    flex: 1.2,
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  modalClose: {
    position: "absolute",
    top: 55,
    right: 25,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    padding: 10,
    borderRadius: 24,
  },
  fullImage: {
    width: "100%",
    height: "85%",
  },
});
