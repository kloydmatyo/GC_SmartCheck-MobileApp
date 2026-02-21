/**
 * Invalid Grade Review Screen Component
 * Displays and manages invalid grading entries for instructor review
 * Requirements: 21 (Add a review screen for invalid entries)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradingResultExtended } from '@/types/student';
import { StudentValidationResult } from './StudentValidationResult';

interface InvalidGradeReviewProps {
  results: GradingResultExtended[];
  onRevalidate?: (studentId: string) => Promise<void>;
  onDismiss?: (studentId: string) => void;
  onRefresh?: () => Promise<void>;
}

export function InvalidGradeReview({ 
  results, 
  onRevalidate, 
  onDismiss,
  onRefresh 
}: InvalidGradeReviewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Filter only invalid results that require review
  const invalidResults = results.filter(r => r.reviewRequired && r.score === null);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleExpand = (studentId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(studentId)) {
      newExpanded.delete(studentId);
    } else {
      newExpanded.add(studentId);
    }
    setExpandedItems(newExpanded);
  };

  const getStatusInfo = (gradeStatus: string) => {
    switch (gradeStatus) {
      case 'NULL_INVALID_ID':
        return {
          icon: 'close-circle' as const,
          color: '#e74c3c',
          label: 'Invalid Student ID',
          description: 'Student ID not found in database'
        };
      case 'NULL_INACTIVE':
        return {
          icon: 'alert-circle' as const,
          color: '#ff9800',
          label: 'Inactive Student',
          description: 'Student account is marked as inactive'
        };
      case 'NULL_NOT_IN_SECTION':
        return {
          icon: 'warning' as const,
          color: '#ff9800',
          label: 'Wrong Section',
          description: 'Student not enrolled in this section'
        };
      default:
        return {
          icon: 'help-circle' as const,
          color: '#9e9e9e',
          label: 'Unknown Issue',
          description: 'Review required'
        };
    }
  };

  const renderItem = ({ item }: { item: GradingResultExtended }) => {
    const isExpanded = expandedItems.has(item.studentId);
    const statusInfo = getStatusInfo(item.gradeStatus);

    return (
      <View style={styles.card}>
        <TouchableOpacity 
          style={styles.cardHeader}
          onPress={() => toggleExpand(item.studentId)}
        >
          <View style={styles.headerLeft}>
            <Ionicons name={statusInfo.icon} size={24} color={statusInfo.color} />
            <View style={styles.headerInfo}>
              <Text style={styles.studentId}>{item.studentId}</Text>
              <Text style={[styles.statusLabel, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
          
          <Ionicons 
            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color="#666" 
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.cardContent}>
            <Text style={styles.description}>{statusInfo.description}</Text>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reason Code:</Text>
              <Text style={styles.detailValue}>{item.reasonCode || 'N/A'}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Validation Status:</Text>
              <Text style={styles.detailValue}>{item.validationStatus}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Graded At:</Text>
              <Text style={styles.detailValue}>
                {new Date(item.gradedAt).toLocaleString()}
              </Text>
            </View>

            <View style={styles.actions}>
              {onRevalidate && (
                <TouchableOpacity 
                  style={[styles.actionButton, styles.revalidateButton]}
                  onPress={() => onRevalidate(item.studentId)}
                >
                  <Ionicons name="refresh" size={16} color="#00a550" />
                  <Text style={styles.revalidateButtonText}>Revalidate</Text>
                </TouchableOpacity>
              )}
              
              {onDismiss && (
                <TouchableOpacity 
                  style={[styles.actionButton, styles.dismissButton]}
                  onPress={() => onDismiss(item.studentId)}
                >
                  <Ionicons name="checkmark" size={16} color="#666" />
                  <Text style={styles.dismissButtonText}>Dismiss</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>Invalid Grades Review</Text>
        <Text style={styles.headerSubtitle}>
          {invalidResults.length} {invalidResults.length === 1 ? 'entry' : 'entries'} requiring review
        </Text>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="checkmark-circle" size={64} color="#00a550" />
      <Text style={styles.emptyTitle}>All Clear!</Text>
      <Text style={styles.emptySubtitle}>
        No invalid grades requiring review
      </Text>
    </View>
  );

  // Group by reason code for summary
  const summaryByReason = invalidResults.reduce((acc, result) => {
    const reason = result.gradeStatus;
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <View style={styles.container}>
      {renderHeader()}

      {/* Summary Cards */}
      {invalidResults.length > 0 && (
        <View style={styles.summarySection}>
          {Object.entries(summaryByReason).map(([status, count]) => {
            const info = getStatusInfo(status);
            return (
              <View key={status} style={styles.summaryCard}>
                <Ionicons name={info.icon} size={20} color={info.color} />
                <View style={styles.summaryInfo}>
                  <Text style={styles.summaryCount}>{count}</Text>
                  <Text style={styles.summaryLabel}>{info.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* List */}
      <FlatList
        data={invalidResults}
        renderItem={renderItem}
        keyExtractor={(item) => item.studentId}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          ) : undefined
        }
        contentContainerStyle={invalidResults.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  summarySection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryInfo: {
    marginLeft: 12,
  },
  summaryCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerInfo: {
    marginLeft: 12,
  },
  studentId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  cardContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 6,
  },
  revalidateButton: {
    backgroundColor: '#e8f5e9',
  },
  revalidateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00a550',
    marginLeft: 6,
  },
  dismissButton: {
    backgroundColor: '#f5f5f5',
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
});
