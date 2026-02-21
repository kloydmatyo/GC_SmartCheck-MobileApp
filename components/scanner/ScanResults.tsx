import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GradingResult } from "../../types/scanning";

interface ScanResultsProps {
  result: GradingResult;
  onClose: () => void;
  onScanAnother: () => void;
}

export default function ScanResults({ result, onClose, onScanAnother }: ScanResultsProps) {
  const details = result?.details || [];
  
  return (
    <View style={styles.container}>
      {/* Institution Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.institution}>GORDON COLLEGE</Text>
          <Text style={styles.location}>OLONGAPO CITY</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{result.score}/{result.totalPoints}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Scanned Items Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scanned 20-Question Sheet</Text>
          
          {details.map((item) => (
            <View key={item.questionNumber} style={styles.row}>
              {/* Question Label */}
              <View style={styles.qBox}>
                <Text style={styles.qLabel}>{item.questionNumber}</Text>
              </View>

              {/* Scanned Bubble vs Key */}
              <View style={styles.comparisonContainer}>
                <View style={styles.scanGroup}>
                  <Text style={styles.miniLabel}>SCANNED</Text>
                  <Text style={[
                    styles.bubbleValue, 
                    item.isCorrect ? styles.correctColor : styles.errorColor
                  ]}>
                    {item.studentAnswer || "EMPTY"}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={14} color="#DDD" />

                <View style={styles.scanGroup}>
                  <Text style={styles.miniLabel}>KEY</Text>
                  <Text style={styles.bubbleValue}>{item.correctAnswer}</Text>
                </View>
              </View>

              {/* Status Icon */}
              <Ionicons 
                name={item.isCorrect ? "checkmark-circle" : "close-circle"} 
                size={22} 
                color={item.isCorrect ? "#4CAF50" : "#F44336"} 
              />
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
          <Text style={styles.btnTextSecondary}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={onScanAnother}>
          <Text style={styles.btnTextPrimary}>Next Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F4F7" },
  header: { 
    padding: 20, 
    backgroundColor: "#1A237E", // Gordon College Primary Blue
    flexDirection: "row", 
    justifyContent: "space-between",
    alignItems: "center" 
  },
  institution: { color: "white", fontSize: 18, fontWeight: "800" },
  location: { color: "#BBDEFB", fontSize: 12 },
  scoreBadge: { backgroundColor: "white", padding: 8, borderRadius: 8 },
  scoreText: { fontWeight: "bold", fontSize: 18, color: "#1A237E" },
  content: { flex: 1, padding: 15 },
  section: { backgroundColor: "white", borderRadius: 15, padding: 15, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#666", marginBottom: 15 },
  row: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: "#F0F0F0" 
  },
  qBox: { width: 35 },
  qLabel: { fontWeight: "bold", color: "#333" },
  comparisonContainer: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly" },
  scanGroup: { alignItems: "center" },
  miniLabel: { fontSize: 8, color: "#AAA", fontWeight: "bold" },
  bubbleValue: { fontSize: 18, fontWeight: "700" },
  correctColor: { color: "#4CAF50" },
  errorColor: { color: "#F44336" },
  footer: { padding: 20, flexDirection: "row", gap: 10, backgroundColor: "white" },
  btnPrimary: { flex: 2, backgroundColor: "#1A237E", padding: 16, borderRadius: 10, alignItems: "center" },
  btnSecondary: { flex: 1, backgroundColor: "#EEE", padding: 16, borderRadius: 10, alignItems: "center" },
  btnTextPrimary: { color: "white", fontWeight: "bold" },
  btnTextSecondary: { color: "#666" }
});