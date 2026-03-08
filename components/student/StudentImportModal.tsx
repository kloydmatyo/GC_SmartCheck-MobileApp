import { StudentImportService } from "@/services/studentImportService";
import { ImportResult } from "@/types/student";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as XLSX from "xlsx";

interface ImportClassOption {
  id: string;
  label: string;
}

interface StudentImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImportComplete: (result: ImportResult) => void;
  classOptions?: ImportClassOption[];
  selectedClassId?: string | null;
  onSelectClass?: (classId: string) => void;
}

const ACCENT = "#7EE0B6";
const ACCENT_DARK = "#20BE7B";
const SHEET_BG = "#FFFFFF";
const TEXT_PRIMARY = "#171A1F";
const TEXT_SECONDARY = "#7D848F";
const BORDER = "#E8ECEF";

export function StudentImportModal({
  visible,
  onClose,
  onImportComplete,
  classOptions = [],
  selectedClassId,
  onSelectClass,
}: StudentImportModalProps) {
  const [selectedFile, setSelectedFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const selectedClassLabel =
    classOptions.find((option) => option.id === selectedClassId)?.label ||
    "Choose a class...";

  const selectedFileSize = useMemo(() => {
    if (!selectedFile?.size) return null;
    return `${(selectedFile.size / 1024).toFixed(2)} KB`;
  }, [selectedFile]);

  const handlePickFile = async () => {
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "text/plain",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled) return;

      const file = pickerResult.assets[0];
      let fileSize = file.size;

      if (fileSize == null) {
        try {
          const info = await FileSystem.getInfoAsync(file.uri);
          fileSize = info.exists && "size" in info ? info.size : undefined;
        } catch {
          fileSize = undefined;
        }
      }

      if (fileSize == null) {
        Alert.alert(
          "File Error",
          "Could not determine file size. Please try a different file.",
        );
        return;
      }

      const errors = StudentImportService.validateFile(
        file.uri,
        fileSize,
        file.mimeType || "text/csv",
      );

      if (errors.length > 0) {
        Alert.alert("Invalid File", errors.map((entry) => entry.error).join("\n"));
        return;
      }

      setSelectedFile({ ...file, size: fileSize });
      setResult(null);
      setProgress(0);
    } catch (error) {
      console.error("File picker error:", error);
      Alert.alert("Error", "Failed to select file.");
    }
  };

  const handleProcessImport = async () => {
    if (!selectedFile) return;

    try {
      setIsProcessing(true);
      setProgress(0);

      const mimeType = selectedFile.mimeType || "";
      const isXlsx =
        mimeType ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        selectedFile.name?.toLowerCase().endsWith(".xlsx");

      let fileContent: string;

      if (isXlsx) {
        const base64 = await FileSystem.readAsStringAsync(selectedFile.uri, {
          encoding: "base64" as any,
        });
        const workbook = XLSX.read(base64, { type: "base64" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        fileContent = XLSX.utils.sheet_to_csv(firstSheet);
      } else {
        fileContent = await FileSystem.readAsStringAsync(selectedFile.uri);
      }

      const importResult = await StudentImportService.processImport(
        selectedFile.uri,
        selectedFile.size || 0,
        selectedFile.mimeType || "text/csv",
        fileContent,
        (nextProgress) => setProgress(nextProgress),
      );

      setResult(importResult);

      if (importResult.errorCount === 0) {
        Alert.alert(
          "Import Successful",
          `Successfully imported ${importResult.successCount} students.`,
        );
        onImportComplete(importResult);
      } else {
        Alert.alert(
          "Import Completed with Errors",
          `Imported: ${importResult.successCount}\nErrors: ${importResult.errorCount}\nWarnings: ${importResult.warningCount}`,
        );
      }
    } catch (error) {
      console.error("Import error:", error);
      Alert.alert(
        "Import Failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setSelectedFile(null);
    setResult(null);
    setProgress(0);
    onClose();
  };

  const renderSummary = () => {
    if (!result) return null;

    return (
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Import Summary</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{result.totalRows}</Text>
            <Text style={styles.summaryLabel}>Rows</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemSuccess]}>
            <Text style={[styles.summaryValue, styles.summaryValueSuccess]}>
              {result.successCount}
            </Text>
            <Text style={styles.summaryLabel}>Imported</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemError]}>
            <Text style={[styles.summaryValue, styles.summaryValueError]}>
              {result.errorCount}
            </Text>
            <Text style={styles.summaryLabel}>Errors</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderErrors = () => {
    if (!result || result.errors.length === 0) return null;

    return (
      <View style={styles.errorCard}>
        <Text style={styles.errorTitle}>Import Details</Text>
        <ScrollView style={styles.errorList} nestedScrollEnabled>
          {result.errors.map((entry, index) => (
            <View key={`${entry.rowNumber}-${entry.field}-${index}`} style={styles.errorItem}>
              <Text style={styles.errorRow}>
                Row {entry.rowNumber} · {entry.field}
              </Text>
              <Text style={styles.errorMessage}>{entry.error}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Import Students</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              disabled={isProcessing}
            >
              <Ionicons name="close" size={26} color="#98A1AB" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Select Class</Text>
              <View style={styles.classList}>
                {classOptions.length > 0 ? (
                  classOptions.map((option) => {
                    const isSelected = option.id === selectedClassId;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.classOption,
                          isSelected ? styles.classOptionSelected : null,
                          isProcessing ? styles.disabledArea : null,
                        ]}
                        onPress={() => onSelectClass?.(option.id)}
                        disabled={isProcessing}
                      >
                        <Text
                          style={[
                            styles.classOptionText,
                            isSelected ? styles.classOptionTextSelected : null,
                          ]}
                          numberOfLines={1}
                        >
                          {option.label}
                        </Text>
                        {isSelected ? (
                          <Ionicons name="checkmark" size={16} color={ACCENT_DARK} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={styles.classEmptyState}>
                    <Text style={styles.classEmptyText}>
                      No classes available yet.
                    </Text>
                  </View>
                )}
              </View>

              {classOptions.length > 0 ? (
                <Text style={styles.selectedClassText}>{selectedClassLabel}</Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Select CSV File</Text>

              <TouchableOpacity
                style={[
                  styles.dropZone,
                  selectedFile ? styles.dropZoneSelected : null,
                  isProcessing ? styles.disabledArea : null,
                ]}
                onPress={handlePickFile}
                disabled={isProcessing}
              >
                <Ionicons
                  name={selectedFile ? "document-text" : "document-attach"}
                  size={30}
                  color={ACCENT_DARK}
                />
                <Text style={styles.dropZoneTitle}>
                  {selectedFile ? selectedFile.name : "Choose File"}
                </Text>
                <Text style={styles.dropZoneHint}>
                  {selectedFileSize ||
                    "Tap to browse files"}
                </Text>
              </TouchableOpacity>

              {selectedFile ? (
                <View style={styles.fileMeta}>
                  <Text style={styles.fileMetaName}>{selectedFile.name}</Text>
                  <Text style={styles.fileMetaText}>
                    {selectedFile.mimeType || "CSV"} {selectedFileSize ? `· ${selectedFileSize}` : ""}
                  </Text>
                </View>
              ) : null}
            </View>

            {isProcessing ? (
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Importing students</Text>
                  <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <ActivityIndicator size="small" color={ACCENT_DARK} style={styles.progressSpinner} />
              </View>
            ) : null}

            {renderSummary()}
            {renderErrors()}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerButton, styles.cancelButton]}
              onPress={handleClose}
              disabled={isProcessing}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.footerButton,
                styles.importButton,
                (!selectedFile || !selectedClassId || isProcessing) &&
                  styles.importButtonDisabled,
              ]}
              onPress={handleProcessImport}
              disabled={!selectedFile || !selectedClassId || isProcessing}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
              <Text style={styles.importButtonText}>Import</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    maxHeight: "82%",
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#E5E8EC",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT_PRIMARY,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F8FA",
  },
  content: {
    flexGrow: 0,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  classList: {
    gap: 10,
  },
  classOption: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFB",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  classOptionSelected: {
    borderColor: ACCENT,
    backgroundColor: "#F2FFF8",
  },
  classOptionText: {
    flex: 1,
    fontSize: 16,
    color: TEXT_PRIMARY,
    fontWeight: "600",
  },
  classOptionTextSelected: {
    color: ACCENT_DARK,
  },
  classEmptyState: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  classEmptyText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  selectedClassText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#565E67",
  },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#DCE3E8",
    borderRadius: 22,
    minHeight: 176,
    paddingHorizontal: 18,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBFCFD",
  },
  dropZoneSelected: {
    borderColor: ACCENT,
    backgroundColor: "#F3FFF9",
  },
  disabledArea: {
    opacity: 0.7,
  },
  dropZoneTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  dropZoneHint: {
    marginTop: 8,
    fontSize: 13,
    textAlign: "center",
    color: TEXT_SECONDARY,
  },
  fileMeta: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#F6FBF8",
    borderWidth: 1,
    borderColor: "#DDEFE5",
  },
  fileMetaName: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  fileMetaText: {
    marginTop: 4,
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  progressCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#F8FBF9",
    borderWidth: 1,
    borderColor: "#E1EFE7",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
  progressTrack: {
    marginTop: 12,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E8F3ED",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: ACCENT_DARK,
    borderRadius: 999,
  },
  progressSpinner: {
    marginTop: 14,
  },
  summaryCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#FBFCFD",
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 10,
  },
  summaryItem: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#F4F7F8",
  },
  summaryItemSuccess: {
    backgroundColor: "#ECFBF3",
  },
  summaryItemError: {
    backgroundColor: "#FFF2F1",
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT_PRIMARY,
  },
  summaryValueSuccess: {
    color: ACCENT_DARK,
  },
  summaryValueError: {
    color: "#E75A4D",
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  errorCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#FFF8F7",
    borderWidth: 1,
    borderColor: "#F6D9D6",
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#C85246",
    marginBottom: 12,
  },
  errorList: {
    maxHeight: 180,
  },
  errorItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1D9D6",
  },
  errorRow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#A64F47",
  },
  errorMessage: {
    marginTop: 4,
    fontSize: 13,
    color: "#6E5A59",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: "#FFFFFF",
  },
  footerButton: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#ECECEC",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#666666",
  },
  importButton: {
    backgroundColor: ACCENT,
  },
  importButtonDisabled: {
    opacity: 0.55,
  },
  importButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
