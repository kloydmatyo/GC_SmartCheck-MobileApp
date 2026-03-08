import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";

export default function GeneratorTab() {
  const router = useRouter();
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const topInset =
    Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0;
  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/index");
  };

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const savedDarkMode = await AsyncStorage.getItem(
            DARK_MODE_STORAGE_KEY,
          );
          setDarkModeEnabled(savedDarkMode === "true");
        } catch (error) {
          console.warn("Failed to load dark mode preference:", error);
        }
      })();
    }, []),
  );

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
            style={[
              styles.closeButton,
              {
                backgroundColor: darkModeEnabled ? "#2a3a33" : "#dbe7df",
                borderColor: darkModeEnabled ? "#4b6358" : "#b9cabe",
              },
            ]}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={colors.title} />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Ionicons name="document-text" size={50} color={colors.icon} />
          <Text style={[styles.title, { color: colors.title }]}>Answer Sheet Templates</Text>
          <Text style={[styles.subtitle, { color: colors.subtitle }]}>
            Manage and download Zipgrade-compatible answer sheets
          </Text>
        </View>

        <View
          style={[
            styles.features,
            { backgroundColor: colors.cardBg, borderColor: colors.cardBorder, borderWidth: 1 },
          ]}
        >
          <View style={styles.feature}>
            <Ionicons name="document-outline" size={24} color={colors.icon} />
            <Text style={[styles.featureText, { color: colors.title }]}>Download blank answer sheets</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="archive" size={24} color={colors.icon} />
            <Text style={[styles.featureText, { color: colors.title }]}>
              Archive and restore templates
            </Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="search" size={24} color={colors.icon} />
            <Text style={[styles.featureText, { color: colors.title }]}>Search and filter templates</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="scan" size={24} color={colors.icon} />
            <Text style={[styles.featureText, { color: colors.title }]}>Scanner-compatible format</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.generateButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
          onPress={() => router.push("/(tabs)/template-preview")}
        >
          <Ionicons name="eye" size={24} color="white" />
          <Text style={styles.generateButtonText}>Preview Templates</Text>
        </TouchableOpacity>

        <View
          style={[
            styles.templates,
            { backgroundColor: colors.cardBg, borderColor: colors.cardBorder, borderWidth: 1 },
          ]}
        >
          <Text style={[styles.templatesTitle, { color: colors.title }]}>Available Templates:</Text>

          <View style={[styles.templateCard, { backgroundColor: colors.iconBg }]}>
            <Text style={[styles.templateName, { color: colors.title }]}>Standard 20 Questions</Text>
            <Text style={[styles.templateDesc, { color: colors.subtitle }]}>Single column, 20 questions</Text>
          </View>

          <View style={[styles.templateCard, { backgroundColor: colors.iconBg }]}>
            <Text style={[styles.templateName, { color: colors.title }]}>Standard 50 Questions</Text>
            <Text style={[styles.templateDesc, { color: colors.subtitle }]}>
              Two columns, 25 questions each
            </Text>
          </View>

          <View style={[styles.templateCard, { backgroundColor: colors.iconBg }]}>
            <Text style={[styles.templateName, { color: colors.title }]}>Standard 100 Questions</Text>
            <Text style={[styles.templateDesc, { color: colors.subtitle }]}>
              Two columns, 50 questions each
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.instructions,
            { backgroundColor: colors.cardBg, borderColor: colors.cardBorder, borderWidth: 1 },
          ]}
        >
          <Text style={[styles.instructionsTitle, { color: colors.title }]}>How to use:</Text>
          <Text style={[styles.instructionText, { color: colors.subtitle }]}>
            1. Templates are automatically created when you create an exam
          </Text>
          <Text style={[styles.instructionText, { color: colors.subtitle }]}>
            2. Browse and search your templates
          </Text>
          <Text style={[styles.instructionText, { color: colors.subtitle }]}>
            3. Download PDFs for printing
          </Text>
          <Text style={[styles.instructionText, { color: colors.subtitle }]}>
            4. Print and use with the scanner
          </Text>
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
    backgroundColor: "#dbe7df",
    borderWidth: 1,
    borderColor: "#b9cabe",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1a2e1a",
    marginTop: 12,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#4e6057",
    textAlign: "center",
    lineHeight: 20,
  },
  features: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 20,
    marginBottom: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  featureText: {
    fontSize: 16,
    color: "#24362f",
    marginLeft: 15,
    fontWeight: "500",
  },
  generateButton: {
    backgroundColor: "#3d5a3d",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: 12,
    marginBottom: 25,
    shadowColor: "#3d5a3d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  generateButtonText: {
    color: "#E8F5E9",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  templates: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 20,
    marginBottom: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  templatesTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#24362f",
    marginBottom: 15,
  },
  templateCard: {
    backgroundColor: "#dbe7df",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#2f8a74",
  },
  templateName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#24362f",
    marginBottom: 4,
  },
  templateDesc: {
    fontSize: 14,
    color: "#4e6057",
  },
  instructions: {
    backgroundColor: "#f0ead6",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#24362f",
    marginBottom: 15,
  },
  instructionText: {
    fontSize: 14,
    color: "#4e6057",
    marginBottom: 8,
    lineHeight: 20,
  },
});
