import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Alert,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { ZipgradeGenerator } from "../../services/zipgradeGenerator";
import SvgPreview from "../ui/SvgPreview";

interface AnswerSheetGeneratorProps {
  onClose: () => void;
}

export default function AnswerSheetGenerator({
  onClose,
}: AnswerSheetGeneratorProps) {
  const [selectedTemplate, setSelectedTemplate] =
    useState<keyof ReturnType<typeof ZipgradeGenerator.getTemplates>>(
      "standard20",
    );
  const [examId, setExamId] = useState("EXAM001");
  const [version, setVersion] = useState<"A" | "B" | "C" | "D">("A");
  const [generatedSVG, setGeneratedSVG] = useState<string>("");
  const [sheetData, setSheetData] = useState<{
    studentId?: string;
    answers?: { [questionNumber: number]: "A" | "B" | "C" | "D" };
  }>({});
  const [showPreview, setShowPreview] = useState(false);

  const templates = ZipgradeGenerator.getTemplates();

  const generateBlankSheet = () => {
    try {
      const svg = ZipgradeGenerator.generateAnswerSheetSVG(
        selectedTemplate,
        examId,
        version,
      );
      setGeneratedSVG(svg);
      setSheetData({}); // Clear any previous data for blank sheet
      setShowPreview(true);
    } catch {
      Alert.alert("Error", "Failed to generate answer sheet");
    }
  };

  const generateFilledSheet = () => {
    try {
      const { svg, studentId, answers } =
        ZipgradeGenerator.generateRandomFilledSheet(selectedTemplate, examId);
      setGeneratedSVG(svg);
      setSheetData({ studentId, answers }); // Store the filled data
      setShowPreview(true);

      Alert.alert(
        "Test Sheet Generated",
        `Student ID: ${studentId}\nAnswers: ${Object.keys(answers).length} questions filled`,
        [{ text: "OK" }],
      );
    } catch {
      Alert.alert("Error", "Failed to generate test sheet");
    }
  };

  const shareSheet = async () => {
    if (!generatedSVG) return;

    try {
      const dataUrl = ZipgradeGenerator.svgToDataUrl(generatedSVG);
      await Share.share({
        message: `Zipgrade Answer Sheet - ${examId} Version ${version}`,
        url: dataUrl,
        title: "Answer Sheet",
      });
    } catch {
      Alert.alert("Error", "Failed to share answer sheet");
    }
  };

  if (showPreview && generatedSVG) {
    return (
      <View style={styles.previewContainer}>
        <View style={styles.previewHeader}>
          <TouchableOpacity
            onPress={() => setShowPreview(false)}
            style={styles.backButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#3d5a3d" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.previewTitle}>Answer Sheet Preview</Text>

          <TouchableOpacity onPress={shareSheet} style={styles.shareButton}>
            <Ionicons name="share" size={24} color="#3d5a3d" />
          </TouchableOpacity>
        </View>

        <SvgPreview
          svgContent={generatedSVG}
          title="Answer Sheet Preview"
          studentId={sheetData.studentId}
          filledAnswers={sheetData.answers}
          templateInfo={{
            totalQuestions: templates[selectedTemplate].totalQuestions,
            columns: templates[selectedTemplate].columns,
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#666" />
        </TouchableOpacity>
        <Text style={styles.title}>Answer Sheet Generator</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Template Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Template</Text>
          {Object.entries(templates).map(([key, template]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.templateOption,
                selectedTemplate === key && styles.selectedTemplate,
              ]}
              onPress={() => setSelectedTemplate(key as keyof typeof templates)}
            >
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>{template.name}</Text>
                <Text style={styles.templateDetails}>
                  {template.totalQuestions} questions • {template.columns}{" "}
                  column{template.columns > 1 ? "s" : ""}
                </Text>
              </View>
              {selectedTemplate === key && (
                <Ionicons name="checkmark-circle" size={24} color="#3d5a3d" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Exam Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exam Configuration</Text>

          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Exam ID:</Text>
            <View style={styles.examIdContainer}>
              {["EXAM001", "EXAM002", "QUIZ001", "TEST001"].map((id) => (
                <TouchableOpacity
                  key={id}
                  style={[
                    styles.examIdOption,
                    examId === id && styles.selectedExamId,
                  ]}
                  onPress={() => setExamId(id)}
                >
                  <Text
                    style={[
                      styles.examIdText,
                      examId === id && styles.selectedExamIdText,
                    ]}
                  >
                    {id}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Version:</Text>
            <View style={styles.versionContainer}>
              {(["A", "B", "C", "D"] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.versionOption,
                    version === v && styles.selectedVersion,
                  ]}
                  onPress={() => setVersion(v)}
                >
                  <Text
                    style={[
                      styles.versionText,
                      version === v && styles.selectedVersionText,
                    ]}
                  >
                    {v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Generation Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Generate</Text>

          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateBlankSheet}
          >
            <Ionicons name="document-outline" size={24} color="white" />
            <Text style={styles.generateButtonText}>Blank Answer Sheet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.generateButton, styles.testButton]}
            onPress={generateFilledSheet}
          >
            <Ionicons name="flask" size={24} color="white" />
            <Text style={styles.generateButtonText}>
              Test Sheet (Pre-filled)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          <View style={styles.featuresList}>
            <View style={styles.feature}>
              <Ionicons name="scan" size={20} color="#3d5a3d" />
              <Text style={styles.featureText}>Zipgrade compatible format</Text>
            </View>
            <View style={styles.feature}>
              <Ionicons name="person" size={20} color="#3d5a3d" />
              <Text style={styles.featureText}>8-digit student ID bubbles</Text>
            </View>
            <View style={styles.feature}>
              <Ionicons name="grid" size={20} color="#3d5a3d" />
              <Text style={styles.featureText}>
                Multiple choice A-D options
              </Text>
            </View>
            <View style={styles.feature}>
              <Ionicons name="print" size={20} color="#3d5a3d" />
              <Text style={styles.featureText}>Print-ready PDF format</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef1ef",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    backgroundColor: "#f8faf9",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
  },
  closeButton: {
    padding: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#24362f",
  },
  placeholder: {
    width: 34,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#24362f",
    marginBottom: 15,
  },
  templateOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#8cb09a",
    marginBottom: 10,
    backgroundColor: "#f8faf9",
  },
  selectedTemplate: {
    borderColor: "#3d5a3d",
    backgroundColor: "#dbe7df",
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#24362f",
    marginBottom: 4,
  },
  templateDetails: {
    fontSize: 14,
    color: "#4e6057",
  },
  configRow: {
    marginBottom: 20,
  },
  configLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#24362f",
    marginBottom: 10,
  },
  examIdContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  examIdOption: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#8cb09a",
    backgroundColor: "#f8faf9",
  },
  selectedExamId: {
    borderColor: "#3d5a3d",
    backgroundColor: "#3d5a3d",
  },
  examIdText: {
    fontSize: 14,
    color: "#4e6057",
  },
  selectedExamIdText: {
    color: "white",
  },
  versionContainer: {
    flexDirection: "row",
    gap: 10,
  },
  versionOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#8cb09a",
    backgroundColor: "#f8faf9",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedVersion: {
    borderColor: "#3d5a3d",
    backgroundColor: "#3d5a3d",
  },
  versionText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#4e6057",
  },
  selectedVersionText: {
    color: "white",
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3d5a3d",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    gap: 10,
  },
  testButton: {
    backgroundColor: "#2f8a74",
  },
  generateButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  featuresList: {
    gap: 12,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    color: "#4e6057",
  },
  previewContainer: {
    flex: 1,
    backgroundColor: "#eef1ef",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    backgroundColor: "#f8faf9",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  backText: {
    fontSize: 16,
    color: "#3d5a3d",
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#24362f",
  },
  shareButton: {
    padding: 5,
  },
});
