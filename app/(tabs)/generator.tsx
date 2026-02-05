import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import AnswerSheetGenerator from "../../components/generator/AnswerSheetGenerator";

export default function GeneratorTab() {
  const [showGenerator, setShowGenerator] = useState(false);

  if (showGenerator) {
    return <AnswerSheetGenerator onClose={() => setShowGenerator(false)} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="document-text" size={64} color="#007AFF" />
          <Text style={styles.title}>Answer Sheet Generator</Text>
          <Text style={styles.subtitle}>
            Create Zipgrade-compatible answer sheets for testing
          </Text>
        </View>

        <View style={styles.features}>
          <View style={styles.feature}>
            <Ionicons name="document-outline" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Generate blank answer sheets</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="flask" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>
              Create pre-filled test sheets
            </Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="grid" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Multiple template options</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="scan" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Scanner-compatible format</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.generateButton}
          onPress={() => setShowGenerator(true)}
        >
          <Ionicons name="add-circle" size={24} color="white" />
          <Text style={styles.generateButtonText}>Create Answer Sheet</Text>
        </TouchableOpacity>

        <View style={styles.templates}>
          <Text style={styles.templatesTitle}>Available Templates:</Text>

          <View style={styles.templateCard}>
            <Text style={styles.templateName}>Standard 20 Questions</Text>
            <Text style={styles.templateDesc}>Single column, 20 questions</Text>
          </View>

          <View style={styles.templateCard}>
            <Text style={styles.templateName}>Standard 50 Questions</Text>
            <Text style={styles.templateDesc}>
              Two columns, 25 questions each
            </Text>
          </View>

          <View style={styles.templateCard}>
            <Text style={styles.templateName}>Standard 100 Questions</Text>
            <Text style={styles.templateDesc}>
              Two columns, 50 questions each
            </Text>
          </View>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>How to use:</Text>
          <Text style={styles.instructionText}>
            1. Select a template (20, 50, or 100 questions)
          </Text>
          <Text style={styles.instructionText}>
            2. Configure exam ID and version
          </Text>
          <Text style={styles.instructionText}>
            3. Generate blank or pre-filled test sheets
          </Text>
          <Text style={styles.instructionText}>
            4. Print and use with the scanner
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginTop: 20,
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  features: {
    backgroundColor: "white",
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
    color: "#333",
    marginLeft: 15,
    fontWeight: "500",
  },
  generateButton: {
    backgroundColor: "#007AFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: 12,
    marginBottom: 25,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  generateButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  templates: {
    backgroundColor: "white",
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
    color: "#333",
    marginBottom: 15,
  },
  templateCard: {
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  templateName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  templateDesc: {
    fontSize: 14,
    color: "#666",
  },
  instructions: {
    backgroundColor: "white",
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
    color: "#333",
    marginBottom: 15,
  },
  instructionText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    lineHeight: 20,
  },
});
