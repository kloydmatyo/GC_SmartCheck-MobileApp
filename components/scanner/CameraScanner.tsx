import { ZipgradeScanner } from "@/services/zipgradeScanner";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { ScanResult } from "../../types/scanning";
import { useAutoFramer } from "../../hooks/useAutoFramer";
import FrameOverlay from "./FrameOverlay";

interface CameraScannerProps {
  questionCount?: number; // Number of questions in the exam
  stage?: 1 | 2;
  onScanComplete: (result: ScanResult, imageUri: string) => void;
  onCancel: () => void;
}

export default function CameraScanner({
  questionCount = 20,
  stage = 1,
  onScanComplete,
  onCancel,
}: CameraScannerProps) {
  type FlashMode = "off" | "auto" | "on";
  type ValidationResult = Awaited<
    ReturnType<typeof ZipgradeScanner.validateZipgradeSheet>
  >;

  // Speed-optimized timings for 150Q: faster polling, single stability check
  // (validation already verifies alignment, no need for double-check)
  const AUTO_CAPTURE_INTERVAL_MS = questionCount >= 150 ? 1200 : questionCount >= 100 ? 1800 : 1200;
  const AUTO_ATTEMPT_COOLDOWN_MS = questionCount >= 150 ? 1500 : questionCount >= 100 ? 2200 : 1400;
  const AUTO_CENTERED_MAX_OFFSET = questionCount >= 150 ? 0.15 : 0.14;
  const AUTO_STABLE_REQUIRED = questionCount >= 150 ? 1 : questionCount >= 100 ? 2 : 1;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(
    questionCount >= 100,
  );
  const [autoStatusText, setAutoStatusText] = useState(
    questionCount >= 100
      ? "Hold phone ~1.5 feet above paper. Align corners."
      : "Align all 4 paper corners to the target boxes",
  );
  const [autoReady, setAutoReady] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>("off");
  const [torch, setTorch] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoInFlightRef = useRef(false);
  const lastAutoAttemptAtRef = useRef(0);
  const stablePassesRef = useRef(0);
  const lowQualityStreakRef = useRef(0);

  const is150 = questionCount >= 150;

  const shouldEscalateFlash = useCallback((issues?: string[]) => {
    const text = (issues ?? []).join(" ").toLowerCase();
    return /dark|lighting|blurr|small|tilted|far|center|angle/.test(text);
  }, []);

  const clearAutoTimer = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  const processCapturedPhoto = useCallback(
    async (
      photoUri: string,
      preValidation?: ValidationResult,
    ): Promise<{ success: boolean; issues?: string[] }> => {
      const qualityCheck =
        preValidation ??
        (await ZipgradeScanner.validateZipgradeSheet(photoUri, questionCount));

      if (!qualityCheck.isValid) {
        return { success: false, issues: qualityCheck.issues };
      }

      const templateName = qualityCheck.detectedTemplate || "standard20";
      console.log(`[CameraScanner] Processing with ${questionCount} questions`);

      const scanResult = await ZipgradeScanner.processZipgradeSheet(
        photoUri,
        questionCount,
        templateName,
      );


      if (!scanResult.answers || (scanResult as any).error) {
        return { success: false, issues: [(scanResult as any).message || 'Scan failed — try again'] };
      }
      const blankCount = scanResult.answers.filter(
        (a) => !a.selectedAnswer || a.selectedAnswer === ""
      ).length;
      const blankPercent = questionCount >= 150 ? 0.25 : 0.10;
      const maxAllowedBlanks = Math.max(3, Math.ceil(questionCount * blankPercent));
      if (blankCount > maxAllowedBlanks) {
        return { success: false, issues: [`Too many blank answers: ${blankCount}/${questionCount}`] };
      }

      console.log("[CameraScanner] Scan complete, calling onScanComplete");
      onScanComplete(scanResult, photoUri);

      return { success: true };
    },
    [onScanComplete, questionCount],
  );

  const safeDeletePhoto = useCallback(async (photoUri: string) => {
    try {
      await FileSystem.deleteAsync(photoUri, { idempotent: true });
    } catch {
      // Best effort cleanup for probe captures.
    }
  }, []);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      setAutoStatusText("Capturing and scanning...");

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        orientation: "portrait",
      });

      if (!photo) {
        Alert.alert("Error", "Failed to capture image");
        return;
      }



      const result = await processCapturedPhoto(photo.uri);
      if (!result.success) {
        const issues = result.issues ?? ["Unknown quality issue"];

        if (questionCount >= 100) {
          if (shouldEscalateFlash(issues)) {
            lowQualityStreakRef.current += 1;
          } else {
            lowQualityStreakRef.current = 0;
          }

          if (
            lowQualityStreakRef.current >= 2 &&
            flashMode !== "on" &&
            !torch
          ) {
            setFlashMode("on");
            setAutoStatusText("Adaptive flash enabled for low-light scan");
          }
        }

        Alert.alert(
          "Zipgrade Sheet Quality Issues",
          `Please retake the photo:\n${issues.join("\n")}`,
          [{ text: "OK" }],
        );
      } else {
        lowQualityStreakRef.current = 0;
        if (questionCount >= 100 && flashMode === "on") {
          setFlashMode("auto");
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error taking picture:", errorMessage);
      Alert.alert(
        "Scanning Error",
        `Failed to process Zipgrade answer sheet:\n${errorMessage}\n\nPlease try again.`,
      );
    } finally {
      setIsProcessing(false);
      setAutoReady(false);
      stablePassesRef.current = 0;
      setAutoStatusText("Align all 4 paper corners to the target boxes");
    }
  }, [
    flashMode,
    isProcessing,
    processCapturedPhoto,
    questionCount,
    shouldEscalateFlash,
    torch,
  ]);

  const runAutoCaptureAttempt = useCallback(async () => {
    if (
      !autoCaptureEnabled ||
      !cameraRef.current ||
      isProcessing ||
      autoInFlightRef.current
    ) {
      return;
    }

    autoInFlightRef.current = true;
    const now = Date.now();
    if (now - lastAutoAttemptAtRef.current < AUTO_ATTEMPT_COOLDOWN_MS) {
      autoInFlightRef.current = false;
      return;
    }
    lastAutoAttemptAtRef.current = now;

    try {
      setAutoStatusText("Checking sheet alignment...");

      const probe = await cameraRef.current.takePictureAsync({
        // Lower quality for probes saves ~300ms per attempt on image encoding.
        // Validation only needs edge density and coverage, not full resolution.
        quality: questionCount >= 150 ? 0.35 : 0.5,
        base64: false,
        skipProcessing: true,
        orientation: "portrait",
      });

      if (!probe) {
        return;
      }

      if (probe.width > probe.height) {
        console.warn('[CameraScanner] Landscape probe detected, skipping');
        return;
      }

      const qualityCheck = await ZipgradeScanner.validateZipgradeSheet(
        probe.uri,
        questionCount,
      );

      // 150Q uses the useCornerBoxDetector hook instead of this timer-based loop.
      // For 100Q, still enforce center-offset gating.
      if (questionCount >= 100 && questionCount < 150) {
        const centerOffset = qualityCheck.diagnostics?.centerOffset ?? 1;
        if (centerOffset > AUTO_CENTERED_MAX_OFFSET) {
          stablePassesRef.current = 0;
          setAutoReady(false);
          setAutoStatusText(
            `Center A4 sheet before auto-scan (${centerOffset.toFixed(2)}/${AUTO_CENTERED_MAX_OFFSET.toFixed(2)})`,
          );
          await safeDeletePhoto(probe.uri);
          return;
        }
      }

      if (!qualityCheck.isValid) {
        if (questionCount >= 100) {
          if (shouldEscalateFlash(qualityCheck.issues)) {
            lowQualityStreakRef.current += 1;
          } else {
            lowQualityStreakRef.current = 0;
          }

          if (
            lowQualityStreakRef.current >= 2 &&
            flashMode !== "on" &&
            !torch
          ) {
            setFlashMode("on");
            setAutoStatusText("Low light detected. Adaptive flash ON");
          }
        }

        stablePassesRef.current = 0;
        setAutoReady(false);
        setAutoStatusText(
          qualityCheck.issues[0] ||
            "Adjust sheet until all 4 corners match the target boxes",
        );
        await safeDeletePhoto(probe.uri);
        return;
      }

      stablePassesRef.current += 1;
      const passes = stablePassesRef.current;

      if (passes < AUTO_STABLE_REQUIRED) {
        setAutoReady(true);
        setAutoStatusText(`Hold steady... ${passes}/${AUTO_STABLE_REQUIRED}`);
        await safeDeletePhoto(probe.uri);
        return;
      }

      setAutoReady(true);
      setAutoStatusText("Auto-capturing now...");
      setIsProcessing(true);

      const result = await processCapturedPhoto(probe.uri, qualityCheck);
      if (!result.success) {
        if (questionCount >= 100) {
          if (shouldEscalateFlash(result.issues)) {
            lowQualityStreakRef.current += 1;
          } else {
            lowQualityStreakRef.current = 0;
          }

          if (
            lowQualityStreakRef.current >= 2 &&
            flashMode !== "on" &&
            !torch
          ) {
            setFlashMode("on");
            setAutoStatusText("Low light detected. Adaptive flash ON");
          }
        }

        stablePassesRef.current = 0;
        setAutoReady(false);
        setAutoStatusText(
          result.issues?.[0] || "Re-align sheet and hold device steady",
        );
        setIsProcessing(false);
      } else {
        lowQualityStreakRef.current = 0;
        if (questionCount >= 100 && flashMode === "on") {
          setFlashMode("auto");
        }
      }
    } catch (error) {
      stablePassesRef.current = 0;
      setAutoReady(false);
      setAutoStatusText("Auto-capture paused: keep camera steady and centered");
      setIsProcessing(false);
      console.warn("[CameraScanner] Auto-capture attempt failed", error);
    } finally {
      autoInFlightRef.current = false;
    }
  }, [
    AUTO_ATTEMPT_COOLDOWN_MS,
    AUTO_CENTERED_MAX_OFFSET,
    AUTO_STABLE_REQUIRED,
    autoCaptureEnabled,
    flashMode,
    isProcessing,
    processCapturedPhoto,
    questionCount,
    safeDeletePhoto,
    shouldEscalateFlash,
    torch,
  ]);

  useEffect(() => {
    if (!permission?.granted || !autoCaptureEnabled || isProcessing || is150) {
      // For 150Q, the useCornerBoxDetector hook handles polling instead
      clearAutoTimer();
      return;
    }

    let cancelled = false;
    const schedule = () => {
      clearAutoTimer();
      autoTimerRef.current = setTimeout(async () => {
        if (cancelled) return;
        await runAutoCaptureAttempt();
        if (!cancelled && !isProcessing && autoCaptureEnabled) {
          schedule();
        }
      }, AUTO_CAPTURE_INTERVAL_MS);
    };

    schedule();

    return () => {
      cancelled = true;
      clearAutoTimer();
    };
  }, [
    AUTO_CAPTURE_INTERVAL_MS,
    autoCaptureEnabled,
    clearAutoTimer,
    is150,
    isProcessing,
    permission?.granted,
    runAutoCaptureAttempt,
  ]);

  useEffect(() => {
    return () => {
      clearAutoTimer();
    };
  }, [clearAutoTimer]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 150Q AUTO-FRAMING — Guide frame + auto-capture trigger
  // The actual OMR processing uses the existing proven pipeline:
  //   processCapturedPhoto → ZipgradeScanner → brightnessScannerFor100Item
  // ═══════════════════════════════════════════════════════════════════════════
  const framerRef = useRef<{ reset: () => void; frameResult: any }>({
    reset: () => {},
    frameResult: { corners: null },
  });

  const handleAutoFrameCapture = useCallback(async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      setAutoStatusText("Capturing and scanning...");
      console.log("[CameraScanner] 150Q auto-frame capture triggered");

      // High-res capture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        orientation: "portrait",
      });
      if (!photo) {
        setIsProcessing(false);
        framerRef.current.reset();
        return;
      }



      // Use the EXISTING proven pipeline (same as manual capture)
      const result = await processCapturedPhoto(photo.uri);

      if (!result.success) {
        const issues = result.issues ?? ["Scan failed"];

        // Flash escalation for low-light
        if (shouldEscalateFlash(issues)) {
          lowQualityStreakRef.current += 1;
        } else {
          lowQualityStreakRef.current = 0;
        }
        if (lowQualityStreakRef.current >= 2 && flashMode !== "on" && !torch) {
          setFlashMode("on");
          setAutoStatusText("Adaptive flash enabled for low-light scan");
        }

        Alert.alert("Scan Issues", `${issues.join("\n")}\n\nRe-scanning...`, [{ text: "OK" }]);
        framerRef.current.reset();
      } else {
        lowQualityStreakRef.current = 0;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[CameraScanner] 150Q capture error:", msg);
    } finally {
      setIsProcessing(false);
      setAutoReady(false);
      stablePassesRef.current = 0;
    }
  }, [cameraRef, flashMode, isProcessing, processCapturedPhoto, shouldEscalateFlash, torch]);

  const autoFramer = useAutoFramer({
    cameraRef,
    enabled: is150 && autoCaptureEnabled && permission?.granted === true && !isProcessing,
    onReadyToCapture: handleAutoFrameCapture,
  });

  // Keep ref in sync
  framerRef.current = autoFramer;

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
    const a4Aspect = 210 / 297;

    if (questionCount <= 20) {
      // 20-item: 105mm × 148.5mm (aspect ~0.707)
      const maxW = screenWidth * 0.82;
      const maxH = screenHeight * 0.46;
      const width = Math.min(maxW, maxH * a4Aspect);
      return { width: Math.round(width), height: Math.round(width / a4Aspect) };
    } else if (questionCount <= 50) {
      // 50-item: 105mm × 297mm (aspect ~0.354, very tall/narrow)
      const aspect50 = 105 / 297;
      const maxW = screenWidth * 0.62;
      const maxH = screenHeight * 0.62;
      const width = Math.min(maxW, maxH * aspect50);
      return { width: Math.round(width), height: Math.round(width / aspect50) };
    } else {
      // 100/150-item: 210mm × 297mm (aspect ~0.707, A4 paper)
      // Frame sized for scanning at 1.5 feet (45cm) above the paper.
      // At this distance, the A4 paper appears smaller in the camera view,
      // so we use a smaller guide frame (72% × 50%) to match.
      const maxW = screenWidth * 0.72;
      const maxH = screenHeight * 0.50;
      const width = Math.min(maxW, maxH * a4Aspect);
      return { width: Math.round(width), height: Math.round(width / a4Aspect) };
    }
  };

  const frameDimensions = getFrameDimensions();

  // Guide color for non-150Q templates only (150Q uses FrameOverlay)
  const guideColor = autoCaptureEnabled
    ? autoReady ? "#39FF9C" : "#F6C945"
    : "#00FF7F";

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        flash={torch ? "off" : flashMode}
        orientation="portrait"
      />



      {is150 ? (
        <>
          {/* 150Q: Auto-framing overlay (QR-scanner-like document detection) */}
          <FrameOverlay
            frameResult={autoFramer.frameResult}
            previewWidth={screenWidth}
            previewHeight={screenHeight}
          />

          {/* 150Q: Page indicator + processing overlay */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={styles.pageIndicator150}>
              <Text style={styles.pageIndicatorText}>Page {stage}</Text>
              {isProcessing && (
                <View style={styles.processingBadge}>
                  <ActivityIndicator size="small" color="#39FF9C" />
                  <Text style={styles.processingText}>Scanning...</Text>
                </View>
              )}
            </View>
          </View>
        </>
      ) : (
        <>
          {/* Non-150Q: Original dimming mask overlay */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Top Mask */}
            <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)" }} />
            <View style={{ flexDirection: "row", height: frameDimensions.height }}>
              {/* Left Side Mask */}
              <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)" }} />
              {/* Transparent Center Area */}
              <View style={{ width: frameDimensions.width, backgroundColor: "transparent" }} />
              {/* Right Side Mask */}
              <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)" }} />
            </View>
            {/* Bottom Mask */}
            <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)" }} />
          </View>

          {/* Non-150Q: UI Overlay Layer (Frame and Controls) */}
          <View style={StyleSheet.absoluteFill}>
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
                    borderColor: guideColor,
                  },
                ]}
              >
                <View style={styles.frameContent}>
                  <Ionicons name="camera-outline" size={54} color={guideColor} />
                  {questionCount >= 100 && (
                    <>
                      <Text style={styles.stageIndicator}>Page {stage}</Text>
                      <Text style={styles.fitHint}>{autoStatusText}</Text>
                      <Text style={styles.flashHint}>
                        Flash: {torch ? "Torch" : flashMode === "on" ? "On" : flashMode === "auto" ? "Auto" : "Off"}
                      </Text>
                      {isProcessing && (
                        <ActivityIndicator
                          size="small"
                          color={guideColor}
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </>
                  )}
                </View>
                {/* Corner Markers */}
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                {/* Corner Target Boxes */}
                <View style={[styles.cornerTarget, styles.targetTopLeft, { borderColor: guideColor }]} />
                <View style={[styles.cornerTarget, styles.targetTopRight, { borderColor: guideColor }]} />
                <View style={[styles.cornerTarget, styles.targetBottomLeft, { borderColor: guideColor }]} />
                <View style={[styles.cornerTarget, styles.targetBottomRight, { borderColor: guideColor }]} />
              </View>
            </View>
            <View style={{ flex: 1 }} />
          </View>
        </>
      )}

      {/* Controls Panel — shared between all modes */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={styles.shutterContainer}>
          <TouchableOpacity
            style={styles.autoToggle}
            onPress={() => {
              setAutoCaptureEnabled((prev) => !prev);
              setAutoReady(false);
              stablePassesRef.current = 0;
              if (is150) autoFramer.reset();
              setAutoStatusText(
                autoCaptureEnabled
                  ? "Auto-capture off. Tap shutter to scan."
                  : questionCount >= 100
                    ? "Hold ~1 foot above paper. Align all 4 corners."
                    : "Align all 4 paper corners to the target boxes",
              );
            }}
          >
            <Ionicons
              name={autoCaptureEnabled ? "scan-circle" : "scan-outline"}
              size={16}
              color={autoCaptureEnabled ? "#39FF9C" : "#cfd8dc"}
            />
            <Text
              style={[
                styles.autoToggleText,
                autoCaptureEnabled && { color: "#39FF9C" },
              ]}
            >
              {autoCaptureEnabled ? (is150 ? "Auto Frame On" : "Auto Scan On") : "Auto Scan Off"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shutterButton, isProcessing && styles.disabledButton]}
            onPress={takePicture}
            disabled={isProcessing}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      </View>
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
  stageIndicator: {
    color: "#00FF7F",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
    letterSpacing: 1,
  },
  fitHint: {
    color: "#7BFFC8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    letterSpacing: 0.3,
  },
  flashHint: {
    color: "#d7fbe8",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.2,
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
  autoToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  autoToggleText: {
    color: "#cfd8dc",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cornerTarget: {
    position: "absolute",
    width: 22,
    height: 22,
    borderWidth: 2,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  targetTopLeft: {
    top: 12,
    left: 12,
  },
  targetTopRight: {
    top: 12,
    right: 12,
  },
  targetBottomLeft: {
    bottom: 12,
    left: 12,
  },
  targetBottomRight: {
    bottom: 12,
    right: 12,
  },
  footerText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  trackingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0, 191, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(0, 191, 255, 0.5)",
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00BFFF",
  },
  trackingText: {
    color: "#00BFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  // 150Q auto-framing specific styles
  pageIndicator150: {
    position: "absolute",
    top: 55,
    left: 16,
    alignItems: "flex-start",
    gap: 8,
  },
  pageIndicatorText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  processingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(57, 255, 156, 0.4)",
  },
  processingText: {
    color: "#39FF9C",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});

