/**
 * Student Import Modal Component
 * Handles bulk CSV/Excel import with validation and progress
 * Requirements: 22-32 (Bulk Student Import System)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { StudentImportService } from '@/services/studentImportService';
import { ImportResult, ImportValidationError } from '@/types/student';

interface StudentImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImportComplete: (result: ImportResult) => void;
}

export function StudentImportModal({ visible, onClose, onImportComplete }: StudentImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  /**
   * REQ 22: File picker integration
   */
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true
      });

      if (result.canceled) return;

      const file = result.assets[0];
      
      // REQ 23: Validate file type and size
      const errors = StudentImportService.validateFile(
        file.uri,
        file.size || 0,
        file.mimeType || 'text/csv'
      );

      if (errors.length > 0) {
        Alert.alert(
          'Invalid File',
          errors.map(e => e.error).join('\n'),
          [{ text: 'OK' }]
        );
        return;
      }

      setSelectedFile(file);
      setResult(null);
      setProgress(0);

    } catch (error) {
      console.error('File picker error:', error);
      Alert.alert('Error', 'Failed to select file');
    }
  };

  /**
   * REQ 24-32: Process import with validation and progress
   */
  const handleProcessImport = async () => {
    if (!selectedFile) return;

    try {
      setIsProcessing(true);
      setProgress(0);

      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(selectedFile.uri);

      // REQ 24-32: Process with validation, duplicates, batch insert, etc.
      const importResult = await StudentImportService.processImport(
        selectedFile.uri,
        selectedFile.size || 0,
        selectedFile.mimeType || 'text/csv',
        fileContent,
        (progress) => setProgress(progress) // REQ 29: Progress bar
      );

      setResult(importResult);

      // Show completion alert
      if (importResult.errorCount === 0) {
        Alert.alert(
          'Import Successful',
          `Successfully imported ${importResult.successCount} students`,
          [{ text: 'OK' }]
        );
        onImportComplete(importResult);
      } else {
        Alert.alert(
          'Import Completed with Errors',
          `Imported: ${importResult.successCount}\nErrors: ${importResult.errorCount}\nWarnings: ${importResult.warningCount}`,
          [{ text: 'View Details' }]
        );
      }

    } catch (error) {
      console.error('Import error:', error);
      Alert.alert('Import Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Reset and close modal
   */
  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    setProgress(0);
    onClose();
  };

  /**
   * REQ 27: Display error row list
   */
  const renderErrorList = () => {
    if (!result || result.errors.length === 0) return null;

    return (
      <View style={styles.errorSection}>
        <Text style={styles.errorTitle}>
          {result.errorCount} Errors, {result.warningCount} Warnings
        </Text>
        
        <ScrollView style={styles.errorList} nestedScrollEnabled>
          {result.errors.map((error, index) => (
            <View 
              key={index} 
              style={[
                styles.errorItem,
                { borderLeftColor: error.severity === 'error' ? '#e74c3c' : '#ff9800' }
              ]}
            >
              <View style={styles.errorHeader}>
                <Ionicons 
                  name={error.severity === 'error' ? 'close-circle' : 'warning'} 
                  size={16} 
                  color={error.severity === 'error' ? '#e74c3c' : '#ff9800'}
                />
                <Text style={styles.errorRow}>Row {error.rowNumber}</Text>
              </View>
              <Text style={styles.errorField}>Field: {error.field}</Text>
              <Text style={styles.errorMessage}>{error.error}</Text>
              {error.value && (
                <Text style={styles.errorValue}>Value: "{error.value}"</Text>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  /**
   * Render import summary
   */
  const renderSummary = () => {
    if (!result) return null;

    return (
      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>Import Summary</Text>
        
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{result.totalRows}</Text>
            <Text style={styles.summaryLabel}>Total Rows</Text>
          </View>
          
          <View style={[styles.summaryItem, { backgroundColor: '#e8f5e9' }]}>
            <Text style={[styles.summaryValue, { color: '#00a550' }]}>
              {result.successCount}
            </Text>
            <Text style={styles.summaryLabel}>Imported</Text>
          </View>
          
          <View style={[styles.summaryItem, { backgroundColor: '#ffebee' }]}>
            <Text style={[styles.summaryValue, { color: '#e74c3c' }]}>
              {result.errorCount}
            </Text>
            <Text style={styles.summaryLabel}>Errors</Text>
          </View>
          
          <View style={[styles.summaryItem, { backgroundColor: '#fff3e0' }]}>
            <Text style={[styles.summaryValue, { color: '#ff9800' }]}>
              {result.duplicateCount}
            </Text>
            <Text style={styles.summaryLabel}>Duplicates</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Import Students</Text>
          <TouchableOpacity onPress={handleClose} disabled={isProcessing}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* File Picker Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select CSV File</Text>
            <Text style={styles.sectionHint}>
              File should contain: student_id, first_name, last_name, email (optional), section (optional)
            </Text>
            
            <TouchableOpacity 
              style={styles.fileButton} 
              onPress={handlePickFile}
              disabled={isProcessing}
            >
              <Ionicons name="document-attach" size={24} color="#00a550" />
              <Text style={styles.fileButtonText}>
                {selectedFile ? selectedFile.name : 'Choose File'}
              </Text>
            </TouchableOpacity>

            {selectedFile && (
              <View style={styles.fileInfo}>
                <Text style={styles.fileName}>{selectedFile.name}</Text>
                <Text style={styles.fileSize}>
                  {((selectedFile.size || 0) / 1024).toFixed(2)} KB
                </Text>
              </View>
            )}
          </View>

          {/* Progress Bar - REQ 29 */}
          {isProcessing && (
            <View style={styles.progressSection}>
              <Text style={styles.progressText}>
                Processing... {Math.round(progress)}%
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <ActivityIndicator size="large" color="#00a550" style={{ marginTop: 16 }} />
            </View>
          )}

          {/* Summary */}
          {renderSummary()}

          {/* Error List - REQ 27 */}
          {renderErrorList()}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.button, styles.cancelButton]} 
            onPress={handleClose}
            disabled={isProcessing}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.button, 
              styles.importButton,
              (!selectedFile || isProcessing) && styles.buttonDisabled
            ]} 
            onPress={handleProcessImport}
            disabled={!selectedFile || isProcessing}
          >
            <Ionicons name="cloud-upload" size={20} color="#fff" />
            <Text style={styles.importButtonText}>Import</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
  },
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#00a550',
    borderStyle: 'dashed',
  },
  fileButtonText: {
    fontSize: 16,
    color: '#00a550',
    fontWeight: '600',
    marginLeft: 8,
  },
  fileInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  fileSize: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressSection: {
    padding: 16,
    backgroundColor: '#fff',
    marginVertical: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00a550',
  },
  summarySection: {
    padding: 16,
    backgroundColor: '#fff',
    marginVertical: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  errorSection: {
    padding: 16,
    backgroundColor: '#fff',
    marginVertical: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e74c3c',
    marginBottom: 12,
  },
  errorList: {
    maxHeight: 300,
  },
  errorItem: {
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  errorRow: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
  },
  errorField: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  errorMessage: {
    fontSize: 13,
    color: '#333',
    marginTop: 4,
  },
  errorValue: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  importButton: {
    backgroundColor: '#00a550',
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
