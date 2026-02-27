import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { BatchHistoryService } from "../../services/batchHistoryService";
import { ExamBatch } from "../../types/batch";

interface BatchHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  examId?: string;
}

export default function BatchHistoryModal({
  visible,
  onClose,
  examId,
}: BatchHistoryModalProps) {
  const [batches, setBatches] = useState<ExamBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "generated" | "printed" | "deleted"
  >("all");
  const [statistics, setStatistics] = useState({
    totalBatches: 0,
    totalSheets: 0,
    generatedBatches: 0,
    printedBatches: 0,
    deletedBatches: 0,
  });

  useEffect(() => {
    if (visible) {
      loadBatchHistory();
      loadStatistics();
    }
  }, [visible, examId, filterStatus]);

  const loadBatchHistory = async () => {
    try {
      setLoading(true);
      const filter: any = {};

      if (examId) {
        filter.examId = examId;
      }

      if (filterStatus !== "all") {
        filter.status = filterStatus;
      }

      if (searchQuery) {
        filter.searchQuery = searchQuery;
      }

      const history = await BatchHistoryService.getBatchHistory(filter);
      setBatches(history);
    } catch (error) {
      console.error("Error loading batch history:", error);
      Alert.alert("Error", "Failed to load batch history");
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const stats = await BatchHistoryService.getBatchStatistics(examId);
      setStatistics(stats);
    } catch (error) {
      console.error("Error loading statistics:", error);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    Alert.alert(
      "Delete Batch",
      "Are you sure you want to delete this batch? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await BatchHistoryService.deleteBatch(batchId);
              Alert.alert("Success", "Batch deleted successfully");
              loadBatchHistory();
              loadStatistics();
            } catch (error) {
              Alert.alert("Error", "Failed to delete batch");
            }
          },
        },
      ],
    );
  };

  const handleMarkAsPrinted = async (batchId: string) => {
    try {
      await BatchHistoryService.updateBatchStatus(batchId, "printed");
      Alert.alert("Success", "Batch marked as printed");
      loadBatchHistory();
      loadStatistics();
    } catch (error) {
      Alert.alert("Error", "Failed to update batch status");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "generated":
        return "#FF9500";
      case "printed":
        return "#00a550";
      case "deleted":
        return "#FF3B30";
      default:
        return "#666";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "generated":
        return "document-text";
      case "printed":
        return "print";
      case "deleted":
        return "trash";
      default:
        return "help-circle";
    }
  };

  const renderBatchItem = (batch: ExamBatch) => (
    <View key={batch.batchId} style={styles.batchCard}>
      <View style={styles.batchHeader}>
        <View style={styles.batchTitleRow}>
          <Ionicons
            name={getStatusIcon(batch.status) as any}
            size={20}
            color={getStatusColor(batch.status)}
          />
          <Text style={styles.batchTitle}>{batch.examTitle}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(batch.status) },
          ]}
        >
          <Text style={styles.statusText}>{batch.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.batchDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="barcode" size={16} color="#666" />
          <Text style={styles.detailText}>Batch ID: {batch.batchId}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="code" size={16} color="#666" />
          <Text style={styles.detailText}>Exam Code: {batch.examCode}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="document" size={16} color="#666" />
          <Text style={styles.detailText}>
            Template: {batch.templateName} (v{batch.version})
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="copy" size={16} color="#666" />
          <Text style={styles.detailText}>Sheets: {batch.sheetsGenerated}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="time" size={16} color="#666" />
          <Text style={styles.detailText}>
            {BatchHistoryService.formatDate(batch.createdAt)}
          </Text>
        </View>

        {batch.metadata && (
          <View style={styles.detailRow}>
            <Ionicons name="information-circle" size={16} color="#666" />
            <Text style={styles.detailText}>
              {batch.metadata.totalQuestions} questions •{" "}
              {batch.metadata.columns} column(s)
            </Text>
          </View>
        )}
      </View>

      {batch.status !== "deleted" && (
        <View style={styles.batchActions}>
          {batch.status === "generated" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.printButton]}
              onPress={() => handleMarkAsPrinted(batch.batchId)}
            >
              <Ionicons name="print" size={16} color="white" />
              <Text style={styles.actionButtonText}>Mark as Printed</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteBatch(batch.batchId)}
          >
            <Ionicons name="trash" size={16} color="white" />
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
          <Text style={styles.title}>Batch History</Text>
          <TouchableOpacity
            onPress={loadBatchHistory}
            style={styles.refreshButton}
          >
            <Ionicons name="refresh" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>

        {/* Statistics */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{statistics.totalBatches}</Text>
            <Text style={styles.statLabel}>Total Batches</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{statistics.totalSheets}</Text>
            <Text style={styles.statLabel}>Total Sheets</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{statistics.printedBatches}</Text>
            <Text style={styles.statLabel}>Printed</Text>
          </View>
        </View>

        {/* Search and Filter */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by exam, code, or batch ID..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={loadBatchHistory}
            />
          </View>
        </View>

        <View style={styles.filterContainer}>
          {(["all", "generated", "printed", "deleted"] as const).map(
            (status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterButton,
                  filterStatus === status && styles.filterButtonActive,
                ]}
                onPress={() => setFilterStatus(status)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterStatus === status && styles.filterButtonTextActive,
                  ]}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </View>

        {/* Batch List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading batch history...</Text>
          </View>
        ) : batches.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No batches found</Text>
            <Text style={styles.emptySubtext}>
              Generate answer sheets to create batch records
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.batchList}>
            {batches.map(renderBatchItem)}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  closeButton: {
    padding: 5,
  },
  refreshButton: {
    padding: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  statsContainer: {
    flexDirection: "row",
    padding: 15,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#007AFF",
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  searchContainer: {
    padding: 15,
    paddingTop: 0,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 15,
    paddingBottom: 15,
    gap: 10,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  filterButtonActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  filterButtonText: {
    fontSize: 14,
    color: "#666",
  },
  filterButtonTextActive: {
    color: "white",
    fontWeight: "600",
  },
  batchList: {
    flex: 1,
    padding: 15,
  },
  batchCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  batchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  batchTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  batchTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "white",
  },
  batchDetails: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: "#666",
  },
  batchActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  printButton: {
    backgroundColor: "#00a550",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 15,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
});
