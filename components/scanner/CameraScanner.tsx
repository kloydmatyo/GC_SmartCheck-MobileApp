import { ZipgradeScanner } from "@/services/zipgradeScanner";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Ionicons name="camera-outline" size={64} color="white" style={{ marginBottom: 20 }} />
        <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>
          We need your permission
        </Text>
        <Text style={{ color: '#aaa', fontSize: 16, marginBottom: 30, textAlign: 'center' }}>
          GCSC needs access to your camera to scan Zipgrade answer sheets.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#22c55e', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, width: '100%', alignItems: 'center' }}
          onPress={requestPermission}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginTop: 20, padding: 10 }}
          onPress={onCancel}
        >
          <Text style={{ color: '#ff4444', fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        flash={torch ? "on" : "off"}
      />

      <TouchableOpacity
        style={styles.torchButton}
        onPress={() => setTorch(!torch)}
      >
        <Ionicons
          name={torch ? "flash" : "flash-off"}
          size={24}
          color="white"
        />
      </TouchableOpacity>

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
          Align answer sheet within the frame
        </Text>
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
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
            <ActivityIndicator color="white" />
          ) : (
            <Ionicons name="camera" size={32} color="white" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  torchButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
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
    borderWidth: 2,
    borderColor: "#00ff00",
    backgroundColor: "transparent",
    borderStyle: "dashed",
  },
  instructionText: {
    color: "white",
    fontSize: 16,
    marginTop: 20,
    marginBottom: 10,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bottomControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingBottom: 40,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingTop: 20,
  },
  cancelButton: {
    padding: 12,
  },
  cancelButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#22c55e",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.4)",
  },
  captureButtonDisabled: {
    backgroundColor: "#888",
  },
});