import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ZipgradeGenerator } from "../../services/zipgradeGenerator";
import SvgPreview from "../ui/SvgPreview";

export default function PreviewTest() {
  // Generate a test sheet with known data
  const testStudentId = "12345678";
  const testAnswers = {
    1: "A" as const,
    2: "B" as const,
    3: "C" as const,
    4: "D" as const,
    5: "A" as const,
    6: "B" as const,
    7: "C" as const,
    8: "D" as const,
    9: "A" as const,
    10: "B" as const,
  };

  const blankSvg = ZipgradeGenerator.generateAnswerSheetSVG(
    "standard20",
    "TEST001",
    "A",
  );
  const filledSvg = ZipgradeGenerator.generateFilledAnswerSheet(
    "standard20",
    testStudentId,
    testAnswers,
    "TEST001",
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Preview Test</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Blank Answer Sheet</Text>
        <View style={styles.previewContainer}>
          <SvgPreview svgContent={blankSvg} title="Blank Sheet Preview" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Filled Answer Sheet</Text>
        <View style={styles.previewContainer}>
          <SvgPreview
            svgContent={filledSvg}
            title="Filled Sheet Preview"
            studentId={testStudentId}
            filledAnswers={testAnswers}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  previewContainer: {
    height: 400,
    backgroundColor: "white",
    borderRadius: 8,
    overflow: "hidden",
  },
});
