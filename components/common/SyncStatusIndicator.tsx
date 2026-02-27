import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { COLORS, RADIUS } from "../../constants/theme";
import { NetworkService } from "../../services/networkService";
import { OfflineStorageService } from "../../services/offlineStorageService";
import { SyncResult, SyncService } from "../../services/syncService";

interface SyncStatusIndicatorProps {
  onPress?: () => void;
}

export default function SyncStatusIndicator({
  onPress,
}: SyncStatusIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    // Initialize services
    NetworkService.initialize();
    SyncService.initialize();

    // Load initial data
    loadSyncStatus();

    // Listen for network changes
    const unsubscribeNetwork = NetworkService.addListener((connected) => {
      setIsOnline(connected);
      if (connected) {
        loadSyncStatus();
      }
    });

    // Listen for sync events
    const unsubscribeSync = SyncService.addSyncListener(
      (result: SyncResult) => {
        setIsSyncing(false);
        loadSyncStatus();
      },
    );

    // Refresh every 30 seconds
    const interval = setInterval(loadSyncStatus, 30000);

    return () => {
      unsubscribeNetwork();
      unsubscribeSync();
      clearInterval(interval);
    };
  }, []);

  const loadSyncStatus = async () => {
    const stats = await OfflineStorageService.getStorageStats();
    setPendingCount(stats.pendingUpdatesCount);
    setLastSync(stats.lastSync);
    setIsSyncing(SyncService.isSyncInProgress());
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (isOnline && pendingCount > 0 && !isSyncing) {
      setIsSyncing(true);
      SyncService.forceSyncNow();
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return "#FF9500"; // Orange for offline
    if (isSyncing) return "#007AFF"; // Blue for syncing
    if (pendingCount > 0) return "#FF9500"; // Orange for pending
    return "#00a550"; // Green for synced
  };

  const getStatusIcon = () => {
    if (!isOnline) return "cloud-offline";
    if (isSyncing) return "sync";
    if (pendingCount > 0) return "cloud-upload";
    return "cloud-done";
  };

  const getStatusText = () => {
    if (!isOnline) return "Offline";
    if (isSyncing) return "Syncing...";
    if (pendingCount > 0) return `${pendingCount} pending`;
    return "Synced";
  };

  const formatLastSync = () => {
    if (!lastSync) return "Never";

    const now = new Date();
    const diff = now.getTime() - lastSync.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <TouchableOpacity
      style={[styles.container, { borderColor: getStatusColor() }]}
      onPress={handlePress}
      disabled={isSyncing || !isOnline}
    >
      <View
        style={[styles.iconContainer, { backgroundColor: getStatusColor() }]}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Ionicons
            name={getStatusIcon() as any}
            size={16}
            color={COLORS.white}
          />
        )}
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.statusText}>{getStatusText()}</Text>
        {lastSync && !isSyncing && (
          <Text style={styles.lastSyncText}>Last sync: {formatLastSync()}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: 8,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  lastSyncText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
