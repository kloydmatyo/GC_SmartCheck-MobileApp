import { ZipgradeScanner } from "@/services/zipgradeScanner";
import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScanResult } from "../../types/scanning";

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

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to show the camera
        </Text>
        <TouchableOpacity onPress={requestPermission} style={styles.button}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
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
          y: 0.28,
          yEnd: 0.5,
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
      // 100-item: 10 blocks in complex grid layout
      // Based on actual bubble density analysis from scanner logs:
      // Q1-10 at: x5-45%, y78-98% (BOTTOM-LEFT block, lowest on page)
      // Q11-20 at: x5-45%, y58-78% (MIDDLE-LEFT block, above Q1-10)
      return [
        {
          x: 0.05,
          xEnd: 0.45,
          y: 0.58,
          yEnd: 0.78,
          label: "Q1-10",
          color: "rgba(255,0,0,0.3)",
        },
        {
          x: 0.05,
          xEnd: 0.45,
          y: 0.78,
          yEnd: 0.98,
          label: "Q11-20",
          color: "rgba(0,255,0,0.3)",
        },
      ];
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

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlButton} onPress={onCancel}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => setTorch(!torch)}
          >
            <Ionicons
              name={torch ? "flash" : "flash-off"}
              size={24}
              color="white"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.captureButton,
              isProcessing && styles.captureButtonDisabled,
            ]}
            onPress={takePicture}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Text style={styles.captureButtonText}>Processing...</Text>
            ) : (
              <Ionicons name="camera" size={32} color="white" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={toggleCameraFacing}
          >
            <Ionicons name="camera-reverse" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  message: {
    textAlign: "center",
    paddingBottom: 10,
    fontSize: 16,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
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
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 5,
  },
  tipText: {
    color: "white",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 8,
    borderRadius: 5,
  },
  controls: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ff4444",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonDisabled: {
    backgroundColor: "#666",
  },
  captureButtonText: {
    color: "white",
    fontSize: 12,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    margin: 20,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
  },
});
