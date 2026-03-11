import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { generateTemplatePDF } from "@/services/templatePdfGenerator";

export default function TemplatePreviewScreen() {
  const router = useRouter();
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [generating, setGenerating] = useState<number | null>(null);
  const topInset = Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0;

  React.useEffect(() => {
    (async () => {
      try {
        const savedDarkMode = await AsyncStorage.getItem(DARK_MODE_STORAGE_KEY);
        setDarkModeEnabled(savedDarkMode === "true");
      } catch (error) {
        console.warn("Failed to load dark mode preference:", error);
      }
    })();
  }, []);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/index");
  };

  const handleGenerateTemplate = async (numQuestions: 20 | 50 | 100) => {
    try {
      setGenerating(numQuestions);
      Toast.show({
        type: "info",
        text1: "Generating PDF...",
        text2: `Creating ${numQuestions}-question template`,
      });

      await generateTemplatePDF({
        name: `Sample_${numQuestions}Q_Template`,
        description: `Sample ${numQuestions}-question answer sheet`,
        numQuestions: numQuestions,
        choicesPerQuestion: 5,
        examCode: "SAMPLE-001",
        examName: `Sample ${numQuestions} Question Exam`,
        className: "Demo Class",
      });

      Toast.show({
        type: "success",
        text1: "Success!",
        text2: `${numQuestions}-question template generated`,
      });
    } catch (error) {
      console.error("Error generating template:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to generate template",
      });
    } finally {
      setGenerating(null);
    }
  };

  const colors = darkModeEnabled
    ? {
        screenBg: "#111815",
        cardBg: "#1f2b26",
        cardBorder: "#34483f",
        title: "#e7f1eb",
        subtitle: "#9db1a6",
        primary: "#1f3a2f",
        iconBg: "#2a3a33",
        icon: "#8fd1ad",
      }
    : {
        screenBg: "#eef1ef",
        cardBg: "#f0ead6",
        cardBorder: "#8cb09a",
        title: "#24362f",
        subtitle: "#4e6057",
        primary: "#3d5a3d",
        iconBg: "#dbe7df",
        icon: "#3d5a3d",
      };

  const styles = getStyles(darkModeEnabled, colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.screenBg }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { paddingTop: 8 + topInset }]}>
          <View />
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: colors.iconBg, borderColor: colors.cardBorder }]}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={colors.title} />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Ionicons name="document-text" size={50} color={colors.icon} />
          <Text style={[styles.title, { color: colors.title }]}>Template Preview</Text>
          <Text style={[styles.subtitle, { color: colors.subtitle }]}>
            Generate sample templates to see the layouts
          </Text>
        </View>

        {/* 20 Questions Template */}
        <View style={[styles.templateCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={styles.templateHeader}>
            <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
              <Ionicons name="grid" size={32} color={colors.icon} />
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>4 Sheets</Text>
            </View>
          </View>

          <Text style={[styles.templateTitle, { color: colors.title }]}>20 Questions</Text>
          <Text style={[styles.templateDescription, { color: colors.subtitle }]}>
            Four mini sheets in a 2×2 grid layout. Perfect for short quizzes.
          </Text>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>4 identical mini sheets per page</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>2 columns of 10 questions each</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>Student ID bubble grid</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.primary }]}
            onPress={() => handleGenerateTemplate(20)}
            disabled={generating !== null}
          >
            {generating === 20 ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color="#fff" />
                <Text style={styles.generateButtonText}>Generate 20Q Template</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 50 Questions Template */}
        <View style={[styles.templateCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={styles.templateHeader}>
            <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
              <Ionicons name="albums" size={32} color={colors.icon} />
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>2 Sheets</Text>
            </View>
          </View>

          <Text style={[styles.templateTitle, { color: colors.title }]}>50 Questions</Text>
          <Text style={[styles.templateDescription, { color: colors.subtitle }]}>
            Two sheets side by side. Good for medium-length exams.
          </Text>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>2 identical sheets per page</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>5 blocks of 10 questions</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>Optimized layout</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.primary }]}
            onPress={() => handleGenerateTemplate(50)}
            disabled={generating !== null}
          >
            {generating === 50 ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color="#fff" />
                <Text style={styles.generateButtonText}>Generate 50Q Template</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 100 Questions Template */}
        <View style={[styles.templateCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={styles.templateHeader}>
            <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
              <Ionicons name="document" size={32} color={colors.icon} />
            </View>
            <View style={[styles.badge, styles.badgeFeatured]}>
              <Text style={styles.badgeText}>Full Page</Text>
            </View>
          </View>

          <Text style={[styles.templateTitle, { color: colors.title }]}>100 Questions</Text>
          <Text style={[styles.templateDescription, { color: colors.subtitle }]}>
            Full page single sheet. For comprehensive exams with ZipGrade-compatible layout.
          </Text>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>Full A4 page layout</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>8 blocks of 10 questions</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.icon} />
              <Text style={[styles.featureText, { color: colors.subtitle }]}>ZipGrade compatible</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.primary }]}
            onPress={() => handleGenerateTemplate(100)}
            disabled={generating !== null}
          >
            {generating === 100 ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color="#fff" />
                <Text style={styles.generateButtonText}>Generate 100Q Template</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={24} color={colors.icon} />
            <Text style={[styles.infoTitle, { color: colors.title }]}>What's Included</Text>
          </View>
          <View style={styles.infoList}>
            <Text style={[styles.infoItem, { color: colors.subtitle }]}>• Gordon College logo and branding</Text>
            <Text style={[styles.infoItem, { color: colors.subtitle }]}>• Student ID bubble grid (10 digits)</Text>
            <Text style={[styles.infoItem, { color: colors.subtitle }]}>• Answer bubbles (A-E)</Text>
            <Text style={[styles.infoItem, { color: colors.subtitle }]}>• Corner alignment markers</Text>
            <Text style={[styles.infoItem, { color: colors.subtitle }]}>• Name and date fields</Text>
            <Text style={[styles.infoItem, { color: colors.subtitle }]}>• Print-ready PDF format</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (darkMode: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 28,
    },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginTop: 12,
      marginBottom: 8,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
    templateCard: {
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
    },
    templateHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 16,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    badge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: "#2563eb",
    },
    badgeFeatured: {
      backgroundColor: "#16a34a",
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#fff",
    },
    templateTitle: {
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 8,
    },
    templateDescription: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 16,
    },
    features: {
      marginBottom: 16,
    },
    featureItem: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
      gap: 8,
    },
    featureText: {
      fontSize: 13,
      flex: 1,
    },
    generateButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 8,
      gap: 8,
    },
    generateButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
    infoCard: {
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
    },
    infoHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: "600",
    },
    infoList: {
      gap: 6,
    },
    infoItem: {
      fontSize: 14,
      lineHeight: 20,
    },
  });
