import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS, RADIUS } from "../../constants/theme";
import { OfflineStorageService } from "../../services/offlineStorageService";
import {
  StorageInfo,
  StorageMonitorService,
} from "../../services/storageMonitorService";

interface StorageManagementModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function StorageManagementModal({
  visible,
  onClose,
}: StorageManagementModalProps) {
  const [loading, setLoading] = useState(true);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [categoryUsage, setCategoryUsage] = useState({
    downloadedExams: 0,
    pendingUpdates: 0,
    other: 0,
  });

  useEffect(() => {
    if (visible) {
      loadStorageInfo();
    }
  }, [visible]);

  const loadStorageInfo = async () => {
    try {
      setLoading(true);
      const info = await StorageMonitorService.getStorageInfo();
      const usage = await StorageMonitorService.getStorageByCategory();
      setStorageInfo(info);
      setCategoryUsage(usage);
    } catch (error) {
      console.error("Error loading storage info:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearOldData = () => {
    Alert.alert(
      "Clear Old Data",
      "This will remove the oldest 25% of downloaded exams. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await StorageMonitorService.clearOldData();
            loadStorageInfo();
          },
        },
      ],
    );
  };

  const handleClearAllOffline = () => {
    Alert.alert(
      "Clear All Offline Data",
      "This will remove all downloaded exams and pending updates. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await OfflineStorageService.clearAllData();
            Alert.alert("Success", "All offline data cleared");
            loadStorageInfo();
          },
        },
      ],
    );
  };

  const handleEmergencyClear = () => {
    Alert.alert(
      "Emergency Clear",
      "This will remove ALL app data from storage, including settings. Use this if you're getting 'Row too big' errors. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Everything",
          style: "destructive",
          onPress: async () => {
            await OfflineStorageService.emergencyClear();
            Alert.alert(
              "Success",
              "All storage cleared. Please restart the app.",
            );
            onClose();
          },
        },
      ],
    );
  };

  const handleTestLimits = async () => {
    try {
      setLoading(true);
      const result = await StorageMonitorService.testStorageLimits();
      Alert.alert(
        "Storage Test Complete",
        `Max item size: ${StorageMonitorService.formatBytes(result.maxItemSize)}\n` +
        `Estimated limit: ${StorageMonitorService.formatBytes(result.estimatedLimit)}`,
      );
    } catch (error) {
      Alert.alert("Error", "Failed to test storage limits");
    } finally {
      setLoading(false);
      loadStorageInfo();
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 95) return "#FF3B30";
    if (percentage >= 80) return "#FF9500";
    return "#00a550";
  };

  if (loading || !storageInfo) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading storage info...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={COLORS.textDark} />
          </TouchableOpacity>
          <Text style={styles.title}>Storage Management</Text>
          <TouchableOpacity
            onPress={loadStorageInfo}
            style={styles.refreshButton}
          >
            <Ionicons name="refresh" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Usage Overview */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Storage Usage</Text>

            <View style={styles.usageContainer}>
              <View style={styles.usageCircle}>
                <Text
                  style={[
                    styles.usagePercentage,
                    { color: getUsageColor(storageInfo.usagePercentage) },
                  ]}
                >
                  {storageInfo.usagePercentage.toFixed(1)}%
                </Text>
                <Text style={styles.usageLabel}>Used</Text>
              </View>

              <View style={styles.usageDetails}>
                <View style={styles.usageRow}>
                  <Text style={styles.usageText}>Used:</Text>
                  <Text style={styles.usageValue}>
                    {StorageMonitorService.formatBytes(storageInfo.usedSize)}
                  </Text>
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.usageText}>Available:</Text>
                  <Text style={styles.usageValue}>
                    {StorageMonitorService.formatBytes(
                      storageInfo.availableSize,
                    )}
                  </Text>
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.usageText}>Total:</Text>
                  <Text style={styles.usageValue}>
                    {StorageMonitorService.formatBytes(storageInfo.totalSize)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(storageInfo.usagePercentage, 100)}%`,
                    backgroundColor: getUsageColor(storageInfo.usagePercentage),
                  },
                ]}
              />
            </View>
          </View>

          {/* Category Breakdown */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Storage by Category</Text>

            <View style={styles.categoryItem}>
              <Ionicons name="document" size={20} color="#007AFF" />
              <Text style={styles.categoryLabel}>Downloaded Exams</Text>
              <Text style={styles.categoryValue}>
                {StorageMonitorService.formatBytes(
                  categoryUsage.downloadedExams,
                )}
              </Text>
            </View>

            <View style={styles.categoryItem}>
              <Ionicons name="cloud-upload" size={20} color="#FF9500" />
              <Text style={styles.categoryLabel}>Pending Updates</Text>
              <Text style={styles.categoryValue}>
                {StorageMonitorService.formatBytes(
                  categoryUsage.pendingUpdates,
                )}
              </Text>
            </View>

            <View style={styles.categoryItem}>
              <Ionicons name="folder" size={20} color="#666" />
              <Text style={styles.categoryLabel}>Other Data</Text>
              <Text style={styles.categoryValue}>
                {StorageMonitorService.formatBytes(categoryUsage.other)}
              </Text>
            </View>
          </View>

          {/* Largest Items */}
          {storageInfo.largestItems.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Largest Items</Text>
              {storageInfo.largestItems.slice(0, 5).map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemKey} numberOfLines={1}>
                    {item.key.replace("@", "")}
                  </Text>
                  <Text style={styles.itemSize}>
                    {StorageMonitorService.formatBytes(item.size)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Actions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Actions</Text>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleClearOldData}
            >
              <Ionicons name="trash-outline" size={20} color="#FF9500" />
              <Text style={styles.actionButtonText}>Clear Old Data (25%)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleClearAllOffline}
            >
              <Ionicons name="trash" size={20} color="#FF3B30" />
              <Text style={[styles.actionButtonText, { color: "#FF3B30" }]}>
                Clear All Offline Data
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleTestLimits}
            >
              <Ionicons name="flask-outline" size={20} color="#007AFF" />
              <Text style={styles.actionButtonText}>Test Storage Limits</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    paddingTop: 60,
    backgroundColor: COLORS.white,
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
    fontWeight: "700",
    color: COLORS.textDark,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.textMid,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textDark,
    marginBottom: 16,
  },
  usageContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginBottom: 16,
  },
  usageCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f9f9f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#e0e0e0",
  },
  usagePercentage: {
    fontSize: 24,
    fontWeight: "700",
  },
  usageLabel: {
    fontSize: 12,
    color: COLORS.textMid,
    marginTop: 4,
  },
  usageDetails: {
    flex: 1,
    gap: 8,
  },
  usageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  usageText: {
    fontSize: 14,
    color: COLORS.textMid,
  },
  usageValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    gap: 12,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textDark,
  },
  categoryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMid,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  itemKey: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMid,
  },
  itemSize: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f9f9f9",
    borderRadius: RADIUS.md,
    marginBottom: 12,
    gap: 12,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  modal: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.large,
    padding: 40,
    alignItems: "center",
  },
});
