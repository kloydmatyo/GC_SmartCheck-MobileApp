/**
 * Student Validation Result Component
 * Displays validation status and messages
 * Requirements: 7 (Create validation result UI component)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ValidationResult } from '@/types/student';

interface StudentValidationResultProps {
  validation: ValidationResult;
  compact?: boolean;
}

export function StudentValidationResult({ validation, compact = false }: StudentValidationResultProps) {
  // Determine status icon and color
  const getStatusDisplay = () => {
    switch (validation.status) {
      case 'VALID':
      case 'OFFLINE_CACHED':
        return {
          icon: 'checkmark-circle' as const,
          color: '#00a550',
          bgColor: '#e8f5e9',
          label: validation.status === 'VALID' ? 'Valid' : 'Valid (Offline)'
        };
      case 'INVALID_ID':
      case 'INVALID_FORMAT':
        return {
          icon: 'close-circle' as const,
          color: '#e74c3c',
          bgColor: '#ffebee',
          label: 'Invalid ID'
        };
      case 'INACTIVE_STUDENT':
        return {
          icon: 'alert-circle' as const,
          color: '#ff9800',
          bgColor: '#fff3e0',
          label: 'Inactive Student'
        };
      case 'NOT_IN_SECTION':
        return {
          icon: 'warning' as const,
          color: '#ff9800',
          bgColor: '#fff3e0',
          label: 'Wrong Section'
        };
      case 'VALIDATION_ERROR':
        return {
          icon: 'bug' as const,
          color: '#9e9e9e',
          bgColor: '#f5f5f5',
          label: 'Validation Error'
        };
    }
  };

  const display = getStatusDisplay();

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: display.bgColor }]}>
        <Ionicons name={display.icon} size={16} color={display.color} />
        <Text style={[styles.compactLabel, { color: display.color }]}>
          {display.label}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: display.bgColor, borderLeftColor: display.color }]}>
      <View style={styles.header}>
        <Ionicons name={display.icon} size={24} color={display.color} />
        <Text style={[styles.statusLabel, { color: display.color }]}>
          {display.label}
        </Text>
      </View>
      
      <Text style={styles.message}>{validation.message}</Text>
      
      <View style={styles.footer}>
        <Text style={styles.metaText}>
          Student ID: {validation.studentId}
        </Text>
        <Text style={styles.metaText}>
          Source: {validation.source.toUpperCase()}
        </Text>
      </View>

      {validation.studentData && (
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>
            {validation.studentData.last_name}, {validation.studentData.first_name}
          </Text>
          {validation.studentData.section && (
            <Text style={styles.studentSection}>
              Section: {validation.studentData.section}
            </Text>
          )}
        </View>
      )}

      {validation.errorDetails && (
        <Text style={styles.errorDetails}>
          Details: {validation.errorDetails}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  message: {
    fontSize: 14,
    color: '#333',
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
  },
  studentInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 4,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  studentSection: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  errorDetails: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  compactLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
});
