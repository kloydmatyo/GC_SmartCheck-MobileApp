/**
 * Email Preview Screen
 * Renders the score email template with mock data — no email is sent.
 * Navigate to this screen during development to preview the layout.
 */

import { buildEmailHtml } from "@/services/scoreEmailService";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import WebView from "react-native-webview";

const MOCK_PARAMS = {
  to_name: "DELA CRUZ, JUAN",
  student_id: "202310001",
  exam_title: "Midterm Examination",
  class_name: "BSIT 3A",
  score: "42",
  total: "50",
  percentage: "84",
  grade: "B+",
  status: "PASSED",
  passing_threshold: "75",
  date: "April 26, 2026",
  instructor_name: "Azel Oquendo",
};

export default function EmailPreviewScreen() {
  const router = useRouter();
  const html = buildEmailHtml(MOCK_PARAMS);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>Email Preview</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Mock Data</Text>
        </View>
      </View>
      <WebView
        source={{ html }}
        style={styles.webview}
        originWhitelist={["*"]}
        scrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEEF2",
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
  },
  badge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D97706",
  },
  webview: { flex: 1 },
});
