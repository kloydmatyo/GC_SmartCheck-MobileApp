import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Alert,
    Platform,
    SafeAreaView,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { ZipgradeGenerator } from "../../services/zipgradeGenerator";
import SvgPreview from "../ui/SvgPreview";

interface AnswerSheetGeneratorProps {
  onClose: () => void;
  darkModeEnabled?: boolean;
}

export default function AnswerSheetGenerator({
  onClose,
  darkModeEnabled = false,
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
  const previewTopPadding =
    Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 8;
  const generatorTopPadding =
    Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 8;

  const templates = ZipgradeGenerator.getTemplates();
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
        primaryAlt: "#2f8a74",
        textOnPrimary: "#e8f6ee",
      }
    : {
        bg: "#eef1ef",
        headerBg: "#f8faf9",
        headerBorder: "#d8dfda",
        title: "#24362f",
        subtitle: "#4e6057",
        cardBg: "#f0ead6",
        cardBorder: "#8cb09a",
        inputBg: "#f8faf9",
        primary: "#3d5a3d",
        primaryAlt: "#2f8a74",
        textOnPrimary: "#ffffff",
      };

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

  const handleClose = () => {
    setShowPreview(false);
    onClose();
  };

  if (showPreview && generatedSVG) {
    return (
      <SafeAreaView style={[styles.previewContainer, { backgroundColor: colors.bg }]}>
        <View
          style={[
            styles.previewHeader,
            {
              paddingTop: previewTopPadding,
              backgroundColor: colors.headerBg,
              borderBottomColor: colors.headerBorder,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => setShowPreview(false)}
            style={styles.backButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.title} />
            <Text style={[styles.backText, { color: colors.title }]}>Back</Text>
          </TouchableOpacity>

          <Text style={[styles.previewTitle, { color: colors.title }]}>Answer Sheet Preview</Text>

          <View style={styles.previewActions}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.shareButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="home-outline" size={24} color={colors.title} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={shareSheet}
              style={styles.shareButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="share" size={24} color={colors.title} />
            </TouchableOpacity>
          </View>
        </View>

        <SvgPreview
          svgContent={generatedSVG}
          title="Answer Sheet Preview"
          studentId={sheetData.studentId}
          filledAnswers={sheetData.answers}
          darkModeEnabled={darkModeEnabled}
          templateInfo={{
            totalQuestions: templates[selectedTemplate].totalQuestions,
            columns: templates[selectedTemplate].columns,
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: generatorTopPadding,
            backgroundColor: colors.headerBg,
            borderBottomColor: colors.headerBorder,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleClose}
          style={[
            styles.closeButton,
            {
              backgroundColor: darkModeEnabled ? "#2a3a33" : "#dbe7df",
              borderColor: darkModeEnabled ? "#4b6358" : "#b9cabe",
            },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={24} color={colors.title} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.title }]}>Answer Sheet Generator</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Template Selection */}
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Template</Text>
          {Object.entries(templates).map(([key, template]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.templateOption,
                {
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.inputBg,
                },
                selectedTemplate === key && styles.selectedTemplate,
                selectedTemplate === key && {
                  borderColor: colors.primary,
                  backgroundColor: darkModeEnabled ? "#2a3a33" : "#dbe7df",
                },
              ]}
              onPress={() => setSelectedTemplate(key as keyof typeof templates)}
            >
              <View style={styles.templateInfo}>
                <Text style={[styles.templateName, { color: colors.title }]}>{template.name}</Text>
                <Text style={[styles.templateDetails, { color: colors.subtitle }]}>
                  {template.totalQuestions} questions • {template.columns}{" "}
                  column{template.columns > 1 ? "s" : ""}
                </Text>
              </View>
              {selectedTemplate === key && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Exam Configuration */}
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Exam Configuration</Text>

          <View style={styles.configRow}>
            <Text style={[styles.configLabel, { color: colors.title }]}>Exam ID:</Text>
            <View style={styles.examIdContainer}>
              {["EXAM001", "EXAM002", "QUIZ001", "TEST001"].map((id) => (
                <TouchableOpacity
                  key={id}
                  style={[
                    styles.examIdOption,
                    {
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.inputBg,
                    },
                    examId === id && styles.selectedExamId,
                    examId === id && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary,
                    },
                  ]}
                  onPress={() => setExamId(id)}
                >
                  <Text
                    style={[
                      styles.examIdText,
                      { color: colors.subtitle },
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
            <Text style={[styles.configLabel, { color: colors.title }]}>Version:</Text>
            <View style={styles.versionContainer}>
              {(["A", "B", "C", "D"] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.versionOption,
                    {
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.inputBg,
                    },
                    version === v && styles.selectedVersion,
                    version === v && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary,
                    },
                  ]}
                  onPress={() => setVersion(v)}
                >
                  <Text
                    style={[
                      styles.versionText,
                      { color: colors.subtitle },
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
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Generate</Text>

          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.primary }]}
            onPress={generateBlankSheet}
          >
            <Ionicons name="document-outline" size={24} color="white" />
            <Text style={styles.generateButtonText}>Blank Answer Sheet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.generateButton, styles.testButton, { backgroundColor: colors.primaryAlt }]}
            onPress={generateFilledSheet}
          >
            <Ionicons name="flask" size={24} color="white" />
            <Text style={styles.generateButtonText}>
              Test Sheet (Pre-filled)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Features */}
        <View style={[styles.section, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Features</Text>
          <View style={styles.featuresList}>
            <View style={styles.feature}>
              <Ionicons name="scan" size={20} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>Zipgrade compatible format</Text>
            </View>
            <View style={styles.feature}>
              <Ionicons name="person" size={20} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>8-digit student ID bubbles</Text>
            </View>
            <View style={styles.feature}>
              <Ionicons name="grid" size={20} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>
                Multiple choice A-D options
              </Text>
            </View>
            <View style={styles.feature}>
              <Ionicons name="print" size={20} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>Print-ready PDF format</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#f8faf9",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
    zIndex: 10,
    elevation: 4,
  },
  closeButton: {
    padding: 6,
    minWidth: 36,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
    borderWidth: 1,
    borderColor: "#8cb09a",
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#f8faf9",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
    zIndex: 10,
    elevation: 4,
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
    flex: 1,
    textAlign: "center",
  },
  previewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shareButton: {
    padding: 5,
  },
});
