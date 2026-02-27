/**
 * Cache Sync Indicator Component
 * Displays offline cache status and sync information
 * Requirements: 49 (Display cache status indicator)
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CacheMetadata } from '@/types/student';

interface CacheSyncIndicatorProps {
  compact?: boolean;
  onRefresh?: () => void;
}

export function CacheSyncIndicator({ compact = false, onRefresh }: CacheSyncIndicatorProps) {
  const [metadata, setMetadata] = useState<CacheMetadata | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadCacheMetadata();
  }, []);

  const loadCacheMetadata = async () => {
    try {
      const { StudentDatabaseService } = await import('../../services/studentDatabaseService');
      const meta = await StudentDatabaseService.getCacheMetadata();
      setMetadata(meta);
    } catch (error) {
      console.error('[CacheSync] Failed to load metadata:', error);
    }
  };

  const handleRefresh = async () => {
    if (isSyncing) return;
    
    try {
      setIsSyncing(true);
      const { StudentDatabaseService } = await import('../../services/studentDatabaseService');
      await StudentDatabaseService.refreshCache();
      await loadCacheMetadata();
      onRefresh?.();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!metadata) {
    return null;
  }

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (compact) {
    const statusColor = metadata.isExpired ? '#ff9800' : '#00a550';
    const statusIcon = metadata.isExpired ? 'warning' : 'cloud-done';

    return (
      <TouchableOpacity 
        style={[styles.compactContainer, { borderColor: statusColor }]}
        onPress={handleRefresh}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={statusColor} />
        ) : (
          <Ionicons name={statusIcon} size={16} color={statusColor} />
        )}
        <Text style={[styles.compactText, { color: statusColor }]}>
          {metadata.studentCount} students • {formatTimestamp(metadata.lastSyncAt)}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons 
            name={metadata.isExpired ? 'cloud-offline' : 'cloud-done'} 
            size={24} 
            color={metadata.isExpired ? '#ff9800' : '#00a550'} 
          />
          <Text style={styles.title}>Offline Cache</Text>
        </View>
        
        <TouchableOpacity 
          onPress={handleRefresh}
          disabled={isSyncing}
          style={styles.refreshButton}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#00a550" />
          ) : (
            <Ionicons name="refresh" size={20} color="#00a550" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Students Cached</Text>
          <Text style={styles.infoValue}>{metadata.studentCount}</Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Last Sync</Text>
          <Text style={styles.infoValue}>
            {formatTimestamp(metadata.lastSyncAt)}
          </Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Storage Used</Text>
          <Text style={styles.infoValue}>{formatSize(metadata.sizeInBytes)}</Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Status</Text>
          <View style={styles.statusBadge}>
            <Text style={[
              styles.statusText,
              { color: metadata.isExpired ? '#ff9800' : '#00a550' }
            ]}>
              {metadata.isExpired ? 'Expired' : 'Active'}
            </Text>
          </View>
        </View>
      </View>

      {metadata.isExpired && (
        <View style={styles.warningBanner}>
          <Ionicons name="alert-circle" size={16} color="#ff9800" />
          <Text style={styles.warningText}>
            Cache expired. Tap refresh to update.
          </Text>
        </View>
      )}

      {metadata.encryptionEnabled && (
        <View style={styles.securityBadge}>
          <Ionicons name="lock-closed" size={12} color="#666" />
          <Text style={styles.securityText}>Encrypted</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  refreshButton: {
    padding: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 6,
    marginTop: 12,
  },
  warningText: {
    fontSize: 13,
    color: '#ff9800',
    marginLeft: 8,
    flex: 1,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  securityText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#f9f9f9',
  },
  compactText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
});
