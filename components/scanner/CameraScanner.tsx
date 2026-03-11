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
        {/* Precise Mask (Dims everything outside the border tightly) */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Top Mask - flex: 1 for perfect vertical centering */}
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)' }} />

          <View style={{ flexDirection: 'row', height: frameDimensions.height }}>
            {/* Left Side Mask */}
            <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)' }} />

            {/* Transparent Center Area (Width matches frame) */}
            <View style={{ width: frameDimensions.width, backgroundColor: 'transparent' }} />

            {/* Right Side Mask */}
            <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)' }} />
          </View>

          {/* Bottom Mask - flex: 1 for perfect vertical centering */}
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)' }} />
        </View>

        {/* UI Overlay Layer (Frame and Controls) */}
        <View style={StyleSheet.absoluteFill}>
          {/* Centered Frame Area (Matches Mask Flex above) */}
          <View style={{ flex: 1 }} />
          <View style={{ height: frameDimensions.height, alignItems: 'center', justifyContent: 'center' }}>
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
          <View style={{ flex: 1 }} />

          {/* Controls Panel (Absolute bottom) */}
          <View style={styles.shutterContainer}>
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
  centerFrameContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  shutterContainer: {
    position: 'absolute',
    bottom: 25,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  scanFrame: {
    borderWidth: 2,
    borderColor: "#00FF7F",
    borderStyle: "dashed",
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
  },
  topRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  bottomControls: {
    width: '100%',
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 20,
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
