import { ZipgradeScanner } from "@/services/zipgradeScanner";
import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [torch, setTorch] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // controls history overlay
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

  // Calculate frame dimensions based on screen size and question count
  const getFrameDimensions = () => {
    const maxWidth = screenWidth * 0.93;
    const maxHeight = screenHeight * 0.5; // Slightly enlarged middle ground to avoid overlap

    if (questionCount <= 20) {
      // 20-item: aspect ~0.707
      const h = Math.min(maxHeight, maxWidth / 0.707);
      const w = h * 0.707;
      return { width: w, height: h };
    } else if (questionCount <= 50) {
      // 50-item: aspect ~0.354 (but we make it wider for mobile display)
      const h = Math.min(maxHeight, maxWidth / 0.45);
      const w = h * 0.45;
      return { width: w, height: h };
    } else {
      // 100-item: aspect ~0.707
      const h = Math.min(maxHeight, maxWidth / 0.707);
      const w = h * 0.707;
      return { width: w, height: h };
    }
  };

  const frameDimensions = getFrameDimensions();

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
        {/* Top Space for Selectors (matches ScannerScreen layout) */}
        <View style={styles.topSpace} />

        {/* Middle Area with Scan Frame */}
        <View style={styles.middleArea}>
          <View
            style={[
              styles.scanFrame,
              {
                width: frameDimensions.width,
                height: frameDimensions.height,
              },
            ]}
          >
            <View style={styles.frameContent}>
              <Ionicons
                name="camera-outline"
                size={54}
                color="#00FF7F"
                style={{ opacity: 0.8 }}
              />
              <Text style={styles.frameText}>
                Align the answer sheet within the{"\n"}frame
              </Text>
            </View>

            {/* Corner Markers */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        {/* Bottom Panel with Shutter */}
        <View style={styles.bottomPanel}>
          <TouchableOpacity
            style={[styles.shutterButton, isProcessing && styles.disabledButton]}
            onPress={takePicture}
            disabled={isProcessing}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <Text style={styles.footerText}>
            Supports ZipGrade-compatible sheets
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  topSpace: {
    height: Platform.OS === "android" ? 200 : 250, // Space for Header + Selectors
    backgroundColor: "transparent",
  },
  middleArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  scanFrame: {
    borderWidth: 1,
    borderColor: "rgba(0, 255, 127, 0.4)",
    borderStyle: "dashed",
    borderRadius: 20,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  frameContent: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  frameText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 15,
    opacity: 0.9,
    lineHeight: 22,
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#00FF7F",
    borderWidth: 5,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 15,
  },
  topRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 15,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 15,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 15,
  },
  bottomPanel: {
    height: 200, // Fixed height bottom area
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
    backgroundColor: "transparent",
    paddingBottom: 30,
  },
  shutterButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "transparent",
    borderWidth: 4,
    borderColor: "#00FF7F",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#00FF7F",
    opacity: 0.2, // Matches the translucent green fill in Figma
  },
  disabledButton: {
    opacity: 0.5,
  },
  footerText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
