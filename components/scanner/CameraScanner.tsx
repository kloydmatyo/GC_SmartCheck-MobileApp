import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import { Alert, ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ZipgradeScanner } from "../../services/zipgradeScanner";
import { ScanResult } from "../../types/scanning";

interface CameraScannerProps {
  questionCount?: number;
  onScanComplete: (result: ScanResult, imageUri: string) => void;
  onCancel: () => void;
}

export default function CameraScanner({
  questionCount = 20,
  onScanComplete,
  onCancel,
}: CameraScannerProps) {
  const [facing, setFacing] = useState<CameraType>("back");
  const [torch, setTorch] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const getFrameDimensions = () => {
    if (questionCount <= 20) {
      return { width: 300, height: 400 };
    }
    if (questionCount <= 50) {
      return { width: 215, height: 500 };
    }
    return { width: 320, height: 450 };
  };

  const frameDimensions = getFrameDimensions();

  const getDebugRegions = () => {
    if (questionCount <= 20) {
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
    }

    if (questionCount <= 50) {
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
    }

    return [];
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

      if (!photo?.uri) {
        Alert.alert("Error", "Failed to capture image.");
        return;
      }

      const qualityCheck = await ZipgradeScanner.validateZipgradeSheet(photo.uri);
      if (!qualityCheck.isValid) {
        Alert.alert(
          "Zipgrade Sheet Quality Issues",
          `Please retake the photo:\n${qualityCheck.issues.join("\n")}`,
        );
        return;
      }

      const templateName = qualityCheck.detectedTemplate || "standard20";
      const scanResult = await ZipgradeScanner.processZipgradeSheet(
        photo.uri,
        questionCount,
        templateName,
      );

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

  if (!permission) {
    return (
      <View style={styles.permissionScreen}>
        <ActivityIndicator size="large" color="#00a550" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <Ionicons name="camera-outline" size={44} color="#3d5a3d" />
        <Text style={styles.permissionTitle}>Camera access required</Text>
        <Text style={styles.permissionText}>
          Allow camera permission to scan Zipgrade answer sheets.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        enableTorch={torch}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topButton} onPress={onCancel}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.topButton}
              onPress={() => setTorch((current) => !current)}
            >
              <Ionicons
                name={torch ? "flash" : "flash-off"}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topButton} onPress={toggleCameraFacing}>
              <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

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
            {debugRegions.map((region) => (
              <View
                key={region.label}
                style={[
                  styles.debugRegion,
                  {
                    left: region.x * frameDimensions.width,
                    top: region.y * frameDimensions.height,
                    width: (region.xEnd - region.x) * frameDimensions.width,
                    height: (region.yEnd - region.y) * frameDimensions.height,
                    backgroundColor: region.color,
                    borderColor: region.color.replace("0.3", "0.8"),
                  },
                ]}
              >
                <Text style={styles.debugRegionLabel}>{region.label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.overlayTitle}>
            Align the answer sheet inside the frame
          </Text>
          <Text style={styles.overlayText}>
            Make sure all corners are visible and lighting is even.
          </Text>
        </View>

        <View style={styles.bottomPanel}>
          <Text style={styles.bottomHint}>
            Template: {questionCount} questions
          </Text>

          <TouchableOpacity
            style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
            onPress={takePicture}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="camera" size={20} color="#fff" />
                <Text style={styles.captureButtonText}>Capture Sheet</Text>
              </>
            )}
          </TouchableOpacity>
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
    justifyContent: "space-between",
  },
  permissionScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#eef1ef",
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#24362f",
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 15,
    color: "#5f6f67",
    textAlign: "center",
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: "#3d5a3d",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#3d5a3d",
    fontSize: 15,
    fontWeight: "700",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  topActions: {
    flexDirection: "row",
    gap: 10,
  },
  topButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  scanFrame: {
    borderWidth: 2,
    borderColor: "#00ff88",
    borderRadius: 14,
    backgroundColor: "transparent",
  },
  debugRegion: {
    position: "absolute",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  debugRegionLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  overlayTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 8,
  },
  overlayText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  bottomPanel: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    alignItems: "center",
  },
  bottomHint: {
    color: "#fff",
    fontSize: 14,
    marginBottom: 14,
  },
  captureButton: {
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#00a550",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
  },
  captureButtonDisabled: {
    opacity: 0.7,
  },
  captureButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
