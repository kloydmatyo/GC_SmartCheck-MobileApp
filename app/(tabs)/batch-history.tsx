import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { BatchHistoryService } from "../../services/batchHistoryService";
import { ExamBatch } from "../../types/batch";

export default function BatchHistoryScreen() {
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [batches, setBatches] = useState<ExamBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    loadBatchHistory();
    loadStatistics();
  }, [filterStatus]);

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const savedDarkMode = await AsyncStorage.getItem(
            DARK_MODE_STORAGE_KEY,
          );
          setDarkModeEnabled(savedDarkMode === "true");
        } catch (error) {
          console.warn("Failed to load dark mode preference:", error);
        }
      })();
    }, []),
  );

  const colors = darkModeEnabled
    ? {
        bg: "#111815",
        headerBg: "#1a2520",
        headerBorder: "#2b3b34",
        title: "#e7f1eb",
        subtitle: "#9db1a6",
        cardBg: "#1f2b26",
        cardBorder: "#34483f",
        inputBg: "#2a3a33",
        primary: "#1f3a2f",
        accent: "#8fd1ad",
      }
    : {
        bg: "#eef1ef",
        headerBg: "#3d5a3d",
        headerBorder: "#2f4a38",
        title: "#e8f6ee",
        subtitle: "#b8d4b8",
        cardBg: "#3d5a3d",
        cardBorder: "#3d5a3d",
        inputBg: "#3d5a3d",
        primary: "#3d5a3d",
        accent: "#8fd1ad",
      };

  const loadBatchHistory = async () => {
    try {
      setLoading(true);
      const filter: any = {};

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
      setRefreshing(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const stats = await BatchHistoryService.getBatchStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error("Error loading statistics:", error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadBatchHistory();
    loadStatistics();
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
    <View
      key={batch.batchId}
      style={[
        styles.batchCard,
        { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
      ]}
    >
      <View style={styles.batchHeader}>
        <View style={styles.batchTitleRow}>
          <Ionicons
            name={getStatusIcon(batch.status) as any}
            size={20}
            color={getStatusColor(batch.status)}
          />
          <Text style={[styles.batchTitle, { color: colors.title }]}>{batch.examTitle}</Text>
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
          <Ionicons name="barcode" size={16} color={colors.subtitle} />
          <Text style={[styles.detailText, { color: colors.subtitle }]}>Batch ID: {batch.batchId}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="code" size={16} color={colors.subtitle} />
          <Text style={[styles.detailText, { color: colors.subtitle }]}>Exam Code: {batch.examCode}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="document" size={16} color={colors.subtitle} />
          <Text style={[styles.detailText, { color: colors.subtitle }]}>
            Template: {batch.templateName} (v{batch.version})
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="copy" size={16} color={colors.subtitle} />
          <Text style={[styles.detailText, { color: colors.subtitle }]}>Sheets: {batch.sheetsGenerated}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="time" size={16} color={colors.subtitle} />
          <Text style={[styles.detailText, { color: colors.subtitle }]}>
            {BatchHistoryService.formatDate(batch.createdAt)}
          </Text>
        </View>

        {batch.metadata && (
          <View style={styles.detailRow}>
            <Ionicons name="information-circle" size={16} color={colors.subtitle} />
            <Text style={[styles.detailText, { color: colors.subtitle }]}>
              {batch.metadata.totalQuestions} questions •{" "}
              {batch.metadata.columns} column(s)
            </Text>
          </View>
        )}
      </View>

      {batch.status !== "deleted" && (
        <View style={[styles.batchActions, { borderTopColor: colors.cardBorder }]}>
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
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.headerBg,
            borderBottomColor: colors.headerBorder,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.title }]}>Batch History</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Statistics */}
      <View style={styles.statsContainer}>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Text style={[styles.statValue, { color: colors.accent }]}>{statistics.totalBatches}</Text>
          <Text style={[styles.statLabel, { color: colors.subtitle }]}>Total Batches</Text>
        </View>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Text style={[styles.statValue, { color: colors.accent }]}>{statistics.totalSheets}</Text>
          <Text style={[styles.statLabel, { color: colors.subtitle }]}>Total Sheets</Text>
        </View>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Text style={[styles.statValue, { color: colors.accent }]}>{statistics.printedBatches}</Text>
          <Text style={[styles.statLabel, { color: colors.subtitle }]}>Printed</Text>
        </View>
      </View>

      {/* Search and Filter */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder }]}>
          <Ionicons name="search" size={20} color={colors.subtitle} />
          <TextInput
            style={[styles.searchInput, { color: colors.title }]}
            placeholder="Search by exam, code, or batch ID..."
            placeholderTextColor={colors.subtitle}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={loadBatchHistory}
          />
        </View>
      </View>

      <View style={styles.filterContainer}>
        {(["all", "generated", "printed", "deleted"] as const).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterButton,
              { backgroundColor: colors.inputBg, borderColor: colors.cardBorder },
              filterStatus === status && styles.filterButtonActive,
              filterStatus === status && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => setFilterStatus(status)}
          >
            <Text
              style={[
                styles.filterButtonText,
                { color: colors.subtitle },
                filterStatus === status && styles.filterButtonTextActive,
              ]}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Batch List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.subtitle }]}>Loading batch history...</Text>
        </View>
      ) : batches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={darkModeEnabled ? "#5b6d64" : "#9aaea3"} />
          <Text style={[styles.emptyText, { color: colors.subtitle }]}>No batches found</Text>
          <Text style={[styles.emptySubtext, { color: colors.subtitle }]}>
            Generate answer sheets to create batch records
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.batchList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {batches.map(renderBatchItem)}
        </ScrollView>
      )}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    padding: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#333",
  },
  placeholder: {
    width: 34,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingTop: 12,
    marginBottom: 10,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#007AFF",
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  searchContainer: {
    paddingHorizontal: 10,
    paddingTop: 0,
    paddingBottom: 10,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 14,
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
    paddingHorizontal: 10,
  },
  batchCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
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
    fontWeight: "800",
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
    fontSize: 13,
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
    borderRadius: 10,
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
