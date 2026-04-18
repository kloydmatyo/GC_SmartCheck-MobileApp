import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Toast from "react-native-toast-message";
import { WebView } from "react-native-webview";

// ── Types ────────────────────────────────────────────────────────────────────

interface ReportPdfViewerProps {
  visible: boolean;
  onClose: () => void;
  /** Pre-built HTML string to display and export as PDF. */
  html: string;
  /** Title shown in the modal header bar. */
  title: string;
  /** Base stem for the saved PDF filename (no extension, no timestamp). */
  fileName?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ReportPdfViewer({
  visible,
  onClose,
  html,
  title,
  fileName = "GC_Report",
}: ReportPdfViewerProps) {
  const [generating, setGenerating] = useState(false);

  const handleShare = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      // Convert HTML to PDF at letter size (612 × 792 pt ≈ 72 DPI)
      const { uri } = await Print.printToFileAsync({
        html,
        width: 612,
        height: 792,
      });

      // Write to a stamped filename in the cache directory
      const destName = `${fileName}_${Date.now()}.pdf`;
      const dest = `${FileSystem.cacheDirectory ?? ""}${destName}`;
      await FileSystem.copyAsync({ from: uri, to: dest });

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Toast.show({
          type: "error",
          text1: "Sharing Not Available",
          text2: "This device does not support file sharing.",
        });
        return;
      }

      await Sharing.shareAsync(dest, {
        mimeType: "application/pdf",
        dialogTitle: title,
        UTI: "com.adobe.pdf",
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to Generate PDF",
        text2: err.message ?? "Please try again.",
        visibilityTime: 4000,
      });
    } finally {
      setGenerating(false);
    }
  }, [html, fileName, title, generating]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={24} color="#24362f" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>

          {/* Quick-share icon in the header for one-tap access */}
          <TouchableOpacity
            onPress={handleShare}
            style={styles.iconBtn}
            disabled={generating}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#00a550" />
            ) : (
              <Ionicons name="share-outline" size={24} color="#00a550" />
            )}
          </TouchableOpacity>
        </View>

        {/* ── HTML Preview ───────────────────────────────────────────────── */}
        <WebView
          source={{ html }}
          style={styles.webview}
          scalesPageToFit={Platform.OS === "android"}
          showsVerticalScrollIndicator={false}
          originWhitelist={["*"]}
          // Disable navigation — this is a static report preview
          onShouldStartLoadWithRequest={(req) =>
            req.url === "about:blank" || req.url.startsWith("data:")
          }
        />

        {/* ── Bottom action bar ──────────────────────────────────────────── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.shareBtn, generating && styles.shareBtnDisabled]}
            onPress={handleShare}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.shareBtnText}>Generating PDF…</Text>
              </>
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.shareBtnText}>Download / Share PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#24362f",
    marginHorizontal: 8,
  },
  webview: {
    flex: 1,
  },
  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  shareBtn: {
    backgroundColor: "#00a550",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  shareBtnDisabled: {
    backgroundColor: "#aaa",
  },
  shareBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
