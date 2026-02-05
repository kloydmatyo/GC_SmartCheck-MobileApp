import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import ZipgradeDemo from "../../components/demo/ZipgradeDemo";

export default function DemoTab() {
  const [showDemo, setShowDemo] = useState(false);

  if (showDemo) {
    return <ZipgradeDemo onClose={() => setShowDemo(false)} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="play-circle" size={64} color="#007AFF" />
          <Text style={styles.title}>Zipgrade Demo</Text>
          <Text style={styles.subtitle}>
            Test the complete workflow from generation to scanning
          </Text>
        </View>

        <View style={styles.workflow}>
          <Text style={styles.workflowTitle}>Demo Workflow:</Text>

          <View style={styles.workflowStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Generate Test Sheet</Text>
              <Text style={styles.stepDescription}>
                Create a Zipgrade answer sheet with random student ID and
                answers
              </Text>
            </View>
          </View>

          <View style={styles.workflowStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Simulate Scanning</Text>
              <Text style={styles.stepDescription}>
                Process the generated sheet using the Zipgrade scanner
              </Text>
            </View>
          </View>

          <View style={styles.workflowStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>View Results</Text>
              <Text style={styles.stepDescription}>
                See the graded results with student ID, score, and breakdown
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.demoButton}
          onPress={() => setShowDemo(true)}
        >
          <Ionicons name="play" size={24} color="white" />
          <Text style={styles.demoButtonText}>Start Demo</Text>
        </TouchableOpacity>

        <View style={styles.features}>
          <Text style={styles.featuresTitle}>What you'll see:</Text>

          <View style={styles.feature}>
            <Ionicons name="document-text" size={20} color="#4CAF50" />
            <Text style={styles.featureText}>Live answer sheet generation</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="scan" size={20} color="#4CAF50" />
            <Text style={styles.featureText}>Bubble detection simulation</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="person" size={20} color="#4CAF50" />
            <Text style={styles.featureText}>Student ID recognition</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="calculator" size={20} color="#4CAF50" />
            <Text style={styles.featureText}>Automatic grading process</Text>
          </View>
        </View>

        <View style={styles.note}>
          <Ionicons name="information-circle" size={20} color="#007AFF" />
          <Text style={styles.noteText}>
            This demo uses simulated data to show the complete scanning
            workflow. In production, the scanner would process real camera
            images.
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
  workflow: {
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
  workflowTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 20,
  },
  workflowStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  stepNumberText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
  },
  stepDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  demoButton: {
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
  demoButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  features: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 12,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#e3f2fd",
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  noteText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 10,
    flex: 1,
    lineHeight: 20,
  },
});
