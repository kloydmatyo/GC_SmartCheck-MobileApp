import { ZipgradeScanner } from "@/services/zipgradeScanner";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScanResult } from "../../types/scanning";

interface CameraScannerProps {
  questionCount?: number; // Number of questions in the exam
  choicesPerQuestion?: 4 | 5; // Expected answer choices for this exam
  scanStage?: { current: 1 | 2; total: 2 }; // For 2-stage 200-item scanning
  onScanComplete: (result: ScanResult, imageUri: string) => void;
  onCancel: () => void;
}

export default function CameraScanner({
  questionCount = 20, // Default to 20 if not provided
  choicesPerQuestion = 4,
  scanStage,
  onScanComplete,
  onCancel,
}: CameraScannerProps) {
  const [torch, setTorch] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    // Camera permissions are still loading
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center", padding: 20 },
        ]}
      >
        <Ionicons
          name="camera-outline"
          size={64}
          color="white"
          style={{ marginBottom: 20 }}
        />
        <Text
          style={{
            color: "white",
            fontSize: 20,
            fontWeight: "bold",
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          We need your permission
        </Text>
        <Text
          style={{
            color: "#aaa",
            fontSize: 16,
            marginBottom: 30,
            textAlign: "center",
          }}
        >
          GCSC needs access to your camera to scan Zipgrade answer sheets.
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: "#22c55e",
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
            width: "100%",
            alignItems: "center",
          }}
          onPress={requestPermission}
        >
          <Text style={{ color: "white", fontSize: 16, fontWeight: "bold" }}>
            Grant Camera Access
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginTop: 20, padding: 10 }}
          onPress={onCancel}
        >
          <Text style={{ color: "#ff4444", fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Calculate frame dimensions based on template aspect ratio
  const getFrameDimensions = () => {
    // Custom dimensions for each template to fit phone screen
    // These dimensions create the green guide frame overlay
    if (questionCount <= 20) {
      // 20-item: 105mm x 148.5mm (aspect ~0.707)
      return { width: 300, height: 400 };
    } else if (questionCount <= 50) {
      // 50-item: 105mm x 297mm (aspect ~0.354, very tall/narrow)
      return { width: 215, height: 500 };
    } else if (questionCount <= 200) {
      // 100-item / 200-item: 210mm x 297mm (aspect ~0.707, A4 paper)
      // Both pages use the same physical layout
      return { width: 320, height: 450 };
    } else {
      // Fallback for any other count
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

      // Enforce portrait-only captures for 200-item sheets.
      // The 2-page 200-item template mapping expects portrait orientation.
      if (
        questionCount === 200 &&
        typeof photo.width === "number" &&
        typeof photo.height === "number" &&
        photo.width > photo.height
      ) {
        Alert.alert(
          "Portrait Mode Required",
          "Please hold your phone in portrait orientation when scanning 200-item exams, then retake the photo.",
        );
        return;
      }

      // 200-item pages use a dedicated fast path that validates all corner boxes.
      // Running the generic OpenCV blur check here adds avoidable latency.
      const qualityCheck =
        questionCount === 200
          ? {
              isValid: true,
              issues: [],
              confidence: 0.95,
              detectedTemplate: undefined,
            }
          : await ZipgradeScanner.validateZipgradeSheet(photo.uri);

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
      console.log(
        `[CameraScanner] Processing with ${questionCount} questions, choices=${choicesPerQuestion} (${choicesPerQuestion === 5 ? "A-E" : "A-D"})`,
      );

      const scanResult = await ZipgradeScanner.processZipgradeSheet(
        photo.uri,
        questionCount,
        templateName,
        scanStage?.current as 1 | 2 | undefined,
        choicesPerQuestion,
      );

      console.log("[CameraScanner] Scan complete, calling onScanComplete");
      onScanComplete(scanResult, scanResult.processedImageUri || photo.uri);
    } catch (error) {
      console.error("Error taking picture:", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to process Zipgrade answer sheet. Please try again.";
      Alert.alert(
        "Error",
        message,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        flash={torch ? "on" : "off"}
      >
        <TouchableOpacity
          style={styles.torchButton}
          onPress={() => setTorch(!torch)}
        >
          {/* Precise Mask (Dims everything outside the border tightly) */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Top Mask - flex: 1 for perfect vertical centering */}
            <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)" }} />

            <View
              style={{ flexDirection: "row", height: frameDimensions.height }}
            >
              {/* Left Side Mask */}
              <View
                style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              />

              {/* Transparent Center Area (Width matches frame) */}
              <View
                style={{
                  width: frameDimensions.width,
                  backgroundColor: "transparent",
                }}
              />

              {/* Right Side Mask */}
              <View
                style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              />
            </View>

            {/* Bottom Mask - flex: 1 for perfect vertical centering */}
            <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)" }} />
          </View>
        </TouchableOpacity>

        {/* UI Overlay Layer (Frame and Controls) */}
        <View style={StyleSheet.absoluteFill}>
          {/* Centered Frame Area (Matches Mask Flex above) */}
          <View style={{ flex: 1 }} />
          <View
            style={{
              height: frameDimensions.height,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
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
                <Ionicons name="camera-outline" size={54} color="#00FF7F" />
              </View>

              {/* Corner Markers */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>
          <View style={{ flex: 1 }} />

          {/* Stage Indicator Banner (200-item 2-stage mode) */}
          {scanStage && (
            <View style={styles.stageBanner}>
              <View style={styles.stageIndicatorRow}>
                <View style={[
                  styles.stageDot,
                  scanStage.current >= 1 && styles.stageDotActive,
                ]} />
                <View style={[
                  styles.stageDot,
                  scanStage.current >= 2 && styles.stageDotActive,
                ]} />
              </View>
              <Text style={styles.stageText}>
                Page {scanStage.current} of {scanStage.total}
              </Text>
              <Text style={styles.stageSubtext}>
                {scanStage.current === 1
                  ? "Scan Page 1 (Q1-100)"
                  : "Scan Page 2 (Q101-200)"}
              </Text>
              <View style={styles.checklistCard}>
                <Text style={styles.checklistTitle}>200-item checklist</Text>
                <Text style={styles.checklistItem}>- Use portrait orientation only</Text>
                <Text style={styles.checklistItem}>- Keep all 4 corner boxes visible</Text>
                <Text style={styles.checklistItem}>- Fill frame with sheet inside green guide</Text>
                <Text style={styles.checklistItem}>- Avoid glare/shadows on bubbles</Text>
              </View>
            </View>
          )}

          {/* Controls Panel (Absolute bottom) */}
          <View style={styles.shutterContainer}>
            <TouchableOpacity
              style={[
                styles.shutterButton,
                isProcessing && styles.disabledButton,
              ]}
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
    position: "absolute",
    bottom: 25,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  torchButton: {
    flex: 1,
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
    width: "100%",
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
  stageBanner: {
    position: "absolute",
    top: 140,
    left: 0,
    right: 0,
    alignItems: "center" as const,
    zIndex: 200,
  },
  stageIndicatorRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 8,
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  stageDotActive: {
    backgroundColor: "#00FF7F",
    borderColor: "#00FF7F",
  },
  stageText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
    textAlign: "center" as const,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  stageSubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500" as const,
    textAlign: "center" as const,
    marginTop: 4,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  checklistCard: {
    marginTop: 10,
    backgroundColor: "rgba(10, 20, 16, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 127, 0.5)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: 280,
  },
  checklistTitle: {
    color: "#C8FFE4",
    fontSize: 12,
    fontWeight: "700" as const,
    marginBottom: 4,
    textAlign: "left" as const,
  },
  checklistItem: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "left" as const,
  },
});
