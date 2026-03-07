import { ZipgradeScanner } from "@/services/zipgradeScanner";
import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScanResult } from "../../types/scanning";
import HistoryList from "./HistoryList";

interface CameraScannerProps {
  questionCount?: number; // Number of questions in the exam
  onScanComplete: (result: ScanResult, imageUri: string) => void;
  onCancel: () => void;
}

export default function CameraScanner({
  questionCount = 20, // Default to 20 if not provided
  onScanComplete,
  onCancel,
}: CameraScannerProps) {
  const [facing, setFacing] = useState<CameraType>("back");
  const [torch, setTorch] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View />;
  }

  if (showHistory) {
    return <HistoryList onClose={() => setShowHistory(false)} />;
  }

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  // Calculate frame dimensions based on template aspect ratio
  const getFrameDimensions = () => {
    // Custom dimensions for each template to fit phone screen
    // These dimensions create the green guide frame overlay
    if (questionCount <= 20) {
      // 20-item: 105mm × 148.5mm (aspect ~0.707)
      return { width: 300, height: 400 };
    } else if (questionCount <= 50) {
      // 50-item: 105mm × 297mm (aspect ~0.354, very tall/narrow)
      return { width: 215, height: 500 };
    } else {
      // 100-item: 210mm × 297mm (aspect ~0.707, A4 paper)
      // The paper is A4 size, nearly same aspect as 20-item but larger
      // Use 85% of screen width to allow some margin
      return { width: 320, height: 450 };
    }
  };

  const frameDimensions = getFrameDimensions();

  // Get scanning regions for visual debugging
  const getDebugRegions = () => {
    const { width, height } = frameDimensions;

    if (questionCount <= 20) {
      // 20q: 2 columns side-by-side
      return [
        {
          x: 0.08,
          xEnd: 0.48,
          y: 0.48,
          yEnd: 0.75,
          label: "Q1-10",
          color: "rgba(255,0,0,0.3)",
        },
        {
          x: 0.52,
          xEnd: 0.92,
          y: 0.48,
          yEnd: 0.75,
          label: "Q11-20",
          color: "rgba(0,255,0,0.3)",
        },
      ];
    } else if (questionCount <= 50) {
      // 50q: LEFT and RIGHT columns
      return [
        {
          x: 0.25,
          xEnd: 0.52,
          y: 0.25,
          yEnd: 0.49,
          label: "Q1-10",
          color: "rgba(255,0,0,0.3)",
        },
        {
          x: 0.25,
          xEnd: 0.52,
          y: 0.45,
          yEnd: 0.65,
          label: "Q11-20",
          color: "rgba(0,255,0,0.3)",
        },
        {
          x: 0.25,
          xEnd: 0.52,
          y: 0.6,
          yEnd: 0.8,
          label: "Q21-30",
          color: "rgba(255,200,0,0.3)",
        },
        {
          x: 0.48,
          xEnd: 0.72,
          y: 0.28,
          yEnd: 0.5,
          label: "Q31-40",
          color: "rgba(0,200,255,0.3)",
        },
        {
          x: 0.48,
          xEnd: 0.72,
          y: 0.45,
          yEnd: 0.65,
          label: "Q41-50",
          color: "rgba(200,0,255,0.3)",
        },
      ];
    } else {
      // 100-item: No debug regions shown
      return [];
    }
  };

  const debugRegions = getDebugRegions();

  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!photo) {
        Alert.alert("Error", "Failed to capture image");
        return;
      }

      // Validate Zipgrade sheet quality first
      const qualityCheck = await ZipgradeScanner.validateZipgradeSheet(
        photo.uri,
      );

      if (!qualityCheck.isValid) {
        Alert.alert(
          "Zipgrade Sheet Quality Issues",
          `Please retake the photo:\n${qualityCheck.issues.join("\n")}`,
          [{ text: "OK" }],
        );
        return;
      }

      // Process the Zipgrade answer sheet
      const templateName = qualityCheck.detectedTemplate || "standard20";
      console.log(`[CameraScanner] Processing with ${questionCount} questions`);

      const scanResult = await ZipgradeScanner.processZipgradeSheet(
        photo.uri,
        questionCount,
        templateName,
      );

      console.log("[CameraScanner] Scan complete, calling onScanComplete");
      onScanComplete(scanResult, scanResult.processedImageUri || photo.uri);
    } catch (error) {
      console.error("Error taking picture:", error);
      Alert.alert(
        "Error",
        "Failed to process Zipgrade answer sheet. Please try again.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        enableTorch={torch}
      >
        {/* Overlay for Zipgrade answer sheet alignment */}
        <View style={styles.overlay}>
          <View
            style={[
              styles.scanFrame,
              {
                width: frameDimensions.width,
                height: frameDimensions.height,
              },
            ]}
          >
            {/* Debug regions overlay - shows where scanner looks for bubbles */}
            {debugRegions.map((region, idx) => (
              <View
                key={idx}
                style={{
                  position: "absolute",
                  left: region.x * frameDimensions.width,
                  top: region.y * frameDimensions.height,
                  width: (region.xEnd - region.x) * frameDimensions.width,
                  height: (region.yEnd - region.y) * frameDimensions.height,
                  backgroundColor: region.color,
                  borderWidth: 1,
                  borderColor: region.color.replace("0.3", "0.8"),
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontSize: 10,
                    fontWeight: "bold",
                    backgroundColor: "rgba(0,0,0,0.7)",
                    paddingHorizontal: 4,
                    paddingVertical: 2,
                    borderRadius: 3,
                  }}
                >
                  {region.label}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.instructionText}>
            Align Zipgrade answer sheet within the frame
          </Text>
          <Text style={styles.tipText}>
            Colored boxes show scanning regions for {questionCount} questions
          </Text>
        </View>

        <View style={styles.features}>
          <View style={styles.feature}>
            <Ionicons name="camera" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Capture answer sheets</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="person" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Read student IDs</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Auto-grade answers</Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="document-text" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Zipgrade format compatible</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => setShowScanner(true)}
        >
          <Ionicons name="camera" size={24} color="white" />
          <Text style={styles.scanButtonText}>Start Scanning</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => setShowHistory(true)}
        >
          <Ionicons name="time-outline" size={24} color="#007AFF" />
          <Text style={styles.historyButtonText}>View History</Text>
        </TouchableOpacity>

        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>Instructions:</Text>
          <Text style={styles.instructionText}>
            1. Generate answer sheet using Generator tab
          </Text>
          <Text style={styles.instructionText}>
            2. Ensure good lighting conditions
          </Text>
          <Text style={styles.instructionText}>
            3. Align Zipgrade sheet within camera frame
          </Text>
          <Text style={styles.instructionText}>
            4. Tap capture when all bubbles are visible
          </Text>
        </View>
      </CameraView>
    </View>
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
    marginBottom: 40,
  },
  scanFrame: {
    // Base dimensions - will be overridden by inline styles
    borderWidth: 2,
    borderColor: "#00ff00",
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  instructionText: {
    color: "white",
    fontSize: 16,
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
    marginBottom: 30,
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
  scanButton: {
    backgroundColor: "#007AFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: 12,
    marginBottom: 30,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  scanButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  historyButton: {
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  historyButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
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
