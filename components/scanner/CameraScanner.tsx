import { ZipgradeScanner } from "@/services/zipgradeScanner";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import React, { useRef, useState } from "react";
import {
    Alert,
    Platform,
  StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { ScanResult } from "../../types/scanning";

interface CameraScannerProps {
  questionCount?: number; // Number of questions in the exam
  choicesPerQuestion?: 4 | 5;
  scanStage?: { current: 1 | 2; total: number };
  onScanComplete: (result: ScanResult, imageUri: string) => void;
  onScanError?: (message: string) => void;
  onCancel: () => void;
}

export default function CameraScanner({
  questionCount = 20, // Default to 20 if not provided
  choicesPerQuestion = 4,
  scanStage,
  onScanComplete,
  onScanError,
  onCancel,
}: CameraScannerProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [torch, setTorch] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // controls history overlay
  const cameraRef = useRef<CameraView>(null);
  const guideCropEnabledRef = useRef(true);

  const isImageManipulatorRuntimeMismatch = (error: unknown) => {
    const message =
      error instanceof Error ? error.message : String(error ?? "");

    return (
      message.includes("ExpoImageManipulator.manipulate") ||
      message.includes("getRuntimeContext") ||
      message.includes("NoSuchMethodError")
    );
  };

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
    // We want a very close-up capture to maximize image resolution for bubble detection.
    // Fit the guide frame inside the screen with a consistent margin
    const maxW = screenWidth * 0.88;
    const maxH = screenHeight * 0.72;

    if (questionCount <= 20) {
      // 20-item: 105mm × 148.5mm (aspect ~0.707)
      const targetWidth = screenWidth * 0.92;
      return { width: targetWidth, height: targetWidth / 0.707 };
      // 20-item: quarter-page portrait — 105mm × 148.5mm (aspect ~0.707)
      const aspect = 105 / 148.5;
      const h = Math.min(maxH, maxW / aspect);
      const w = h * aspect;
      return { width: Math.round(w), height: Math.round(h) };
    } else if (questionCount <= 50) {
      // 50-item: 105mm × 297mm (aspect ~0.354, very tall/narrow)
      const targetHeight = screenHeight * 0.82;
      return { width: targetHeight * 0.354, height: targetHeight };
      // 50-item: half-page LANDSCAPE — 210mm × 148.5mm (aspect ~1.414, wider than tall)
      const aspect = 210 / 148.5;
      const w = Math.min(maxW, maxH * aspect);
      const h = w / aspect;
      return { width: Math.round(w), height: Math.round(h) };
    } else {
      // 100-item: 210mm × 297mm (aspect ~0.707, A4 paper)
      const targetWidth = screenWidth * 0.92;
      return { width: targetWidth, height: targetWidth / 0.707 };
      // 100-item / 200-item: full A4 portrait — 210mm × 297mm (aspect ~0.707)
      const aspect = 210 / 297;
      const h = Math.min(maxH, maxW / aspect);
      const w = h * aspect;
      return { width: Math.round(w), height: Math.round(h) };
    }
  };

  const frameDimensions = getFrameDimensions();

  // Helper to draw expected bubble locations based on zipgradeScanner.ts grid models
  const renderGridDots = (
    cols: number,
    rows: number,
    startX: number,
    startY: number,
    spacingX: number,
    spacingY: number,
    color: string
  ) => {
    const dots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push(
          <View
            key={`dot-${startX}-${startY}-${r}-${c}`}
            style={{
              position: "absolute",
              left: `${startX + c * spacingX}%`,
              top: `${startY + r * spacingY}%`,
              width: 10,
              height: 10,
              borderRadius: 5,
              borderWidth: 1.5,
              borderColor: color,
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              transform: [{ translateX: -5 }, { translateY: -5 }],
            }}
          />
        );
      }
    }
    return dots;
  };

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const cropCapturedPhotoToGuide = async (photo: {
    uri: string;
    width: number;
    height: number;
  }) => {
    if (!photo.width || !photo.height) return null;

    let pWidth = photo.width;
    let pHeight = photo.height;

    // Vision Camera sometimes returns landscape dimensions (e.g. 4080x3060) even if the app and device are portrait.
    // If the image's aspect ratio orientation differs from the screen, swap them to map correctly.
    if (screenWidth < screenHeight && pWidth > pHeight) {
      pWidth = photo.height;
      pHeight = photo.width;
    }

    // Camera preview behaves like "cover"; map guide-rect from screen space to photo space.
    const previewScale = Math.max(
      screenWidth / pWidth,
      screenHeight / pHeight,
    );
    const displayedPhotoWidth = pWidth * previewScale;
    const displayedPhotoHeight = pHeight * previewScale;
    const overflowX = Math.max(0, (displayedPhotoWidth - screenWidth) / 2);
    const overflowY = Math.max(0, (displayedPhotoHeight - screenHeight) / 2);

    const guideLeft = (screenWidth - frameDimensions.width) / 2;
    const guideTop = (screenHeight - frameDimensions.height) / 2;

    const mappedX = (guideLeft + overflowX) / previewScale;
    const mappedY = (guideTop + overflowY) / previewScale;
    const mappedW = frameDimensions.width / previewScale;
    const mappedH = frameDimensions.height / previewScale;

    // Remove padding so the cropped image matches the guide frame exactly as seen by the user
    const padX = 0;
    const padY = 0;
    const originX = clamp(mappedX - padX, 0, pWidth - 2);
    const originY = clamp(mappedY - padY, 0, pHeight - 2);
    const width = clamp(mappedW + padX * 2, 2, pWidth - originX);
    const height = clamp(mappedH + padY * 2, 2, pHeight - originY);

    const cropped = await ImageManipulator.manipulateAsync(
      photo.uri,
      [
        {
          crop: {
            originX: Math.round(originX),
            originY: Math.round(originY),
            width: Math.round(width),
            height: Math.round(height),
          },
        },
      ],
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    return cropped.uri;
  };

  const getResultQualityScore = (
    result: ScanResult,
    expectedQuestions: number,
  ) => {
    const answeredCount = result.answers.filter(
      (a) => a.selectedAnswer && a.selectedAnswer.trim().length > 0,
    ).length;
    const answerCoverage = answeredCount / Math.max(expectedQuestions, 1);

    const cleanedId = String(result.studentId || "").replace(/\D/g, "");
    const idIsAllZero = cleanedId.length > 0 && /^0+$/.test(cleanedId);
    const idDigitCounts = cleanedId
      .split("")
      .reduce<Record<string, number>>((acc, digit) => {
        acc[digit] = (acc[digit] ?? 0) + 1;
        return acc;
      }, {});
    const dominantDigitRatio =
      cleanedId.length > 0
        ? Math.max(...Object.values(idDigitCounts)) / cleanedId.length
        : 1;
    const idIsRepeating =
      /^([0-9])\1{5,}$/.test(cleanedId) ||
      (cleanedId.length >= 6 && dominantDigitRatio >= 0.8);
    const idLengthScore = Math.min(cleanedId.length, 10);

    return (
      answerCoverage * 100 +
      answeredCount * 3 +
      (idIsAllZero ? 0 : 20) +
      (idIsRepeating ? -12 : 0) +
      idLengthScore
    );
  };

  const isReliableStudentId = (studentId: string | undefined | null) => {
    const cleanedId = String(studentId || "").replace(/\D/g, "");
    if (!cleanedId || /^0+$/.test(cleanedId) || cleanedId.length < 6)
      return false;

    const counts = cleanedId
      .split("")
      .reduce<Record<string, number>>((acc, digit) => {
        acc[digit] = (acc[digit] ?? 0) + 1;
        return acc;
      }, {});
    const dominantRatio = Math.max(...Object.values(counts)) / cleanedId.length;
    return dominantRatio < 0.8;
  };

  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.65,
        skipProcessing: true,
        base64: false,
      });

      if (!photo) {
        Alert.alert("Error", "Failed to capture image");
        return;
      }

      let scanImageUri = photo.uri;
      let usedGuideCrop = false;
      const preferFullImageFirst = questionCount <= 20;

      if (preferFullImageFirst) {
        console.log(
          "[CameraScanner] 20q template: using full image first for faster/stabler scan",
        );
      }

      try {
        if (
          !preferFullImageFirst &&
          guideCropEnabledRef.current &&
          typeof photo.width === "number" &&
          typeof photo.height === "number"
        ) {
          const croppedUri = await cropCapturedPhotoToGuide({
            uri: photo.uri,
            width: photo.width,
            height: photo.height,
          });
          if (croppedUri) {
            scanImageUri = croppedUri;
            usedGuideCrop = true;
          }
        }
      } catch (cropError) {
        if (
          Platform.OS === "android" &&
          isImageManipulatorRuntimeMismatch(cropError)
        ) {
          // Prevent repeated native calls when module/runtime versions are out of sync.
          guideCropEnabledRef.current = false;
          console.warn(
            "[CameraScanner] Disabled guide crop for this session due to ImageManipulator runtime mismatch. Rebuild app after dependency updates.",
          );
        }

        console.warn(
          "[CameraScanner] Guide crop failed, using full image",
          cropError,
        );
      }

      // For 20q, skip the extra validation pass to cut latency.
      // The scanner path already handles poor captures via confidence checks.
      let detectedTemplate: Awaited<
        ReturnType<typeof ZipgradeScanner.validateZipgradeSheet>
      >["detectedTemplate"];
      if (questionCount > 20) {
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
        let qualityCheck =
          questionCount === 200
            ? {
                isValid: true as boolean,
                issues: [] as string[],
                confidence: 0.95,
                detectedTemplate: undefined as undefined,
              }
            : await ZipgradeScanner.validateZipgradeSheet(scanImageUri);

        if (!qualityCheck.isValid && usedGuideCrop) {
          console.warn(
            "[CameraScanner] Cropped image failed validation, retrying full image",
          );
          scanImageUri = photo.uri;
          qualityCheck =
            await ZipgradeScanner.validateZipgradeSheet(scanImageUri);
        }

        if (!qualityCheck.isValid) {
          Alert.alert(
            "Zipgrade Sheet Quality Issues",
            `Please retake the photo:\n${qualityCheck.issues.join("\n")}`,
            [{ text: "OK" }],
          );
          return;
        }

        detectedTemplate = qualityCheck.detectedTemplate;
      } else {
        console.log("[CameraScanner] 20q fast path: skipping pre-validation");
      }

      // Process the Zipgrade answer sheet
      const templateName = detectedTemplate || "standard20";
      console.log(
        `[CameraScanner] Processing with ${questionCount} questions`,
      );

      let scanResult = await ZipgradeScanner.processZipgradeSheet(
        scanImageUri,
        questionCount,
        templateName,
      );

      const detectedAnswers = scanResult.answers.filter(
        (a) => a.selectedAnswer && a.selectedAnswer.trim().length > 0,
      ).length;
      const minExpectedAnswers = Math.max(3, Math.floor(questionCount * 0.45));
      const strongCoverageAnswers = Math.max(
        minExpectedAnswers,
        Math.floor(questionCount * 0.85),
      );
      const looksSuspiciousId =
        !scanResult.studentId ||
        /^0+$/.test(scanResult.studentId) ||
        !isReliableStudentId(scanResult.studentId);

      // Compare against full image only when the cropped pass looks weak.
      // This keeps accuracy fallback while avoiding a guaranteed 2nd full scan.
      const shouldCompareWithFullImage =
        usedGuideCrop &&
        (detectedAnswers < strongCoverageAnswers || looksSuspiciousId);

      if (shouldCompareWithFullImage) {
        const fullImageReason =
          detectedAnswers < strongCoverageAnswers
            ? `coverage check (${detectedAnswers}/${questionCount})`
            : looksSuspiciousId
              ? `suspicious student ID (${scanResult.studentId || "empty"})`
              : "accuracy check";

        console.warn(
          `[CameraScanner] Comparing with full image: ${fullImageReason}`,
        );

        const fullImageResult = await ZipgradeScanner.processZipgradeSheet(
          photo.uri,
          questionCount,
          templateName,
        );

        const croppedScore = getResultQualityScore(scanResult, questionCount);
        const fullScore = getResultQualityScore(fullImageResult, questionCount);

        const fullWins = fullScore > croppedScore;
        const primaryResult = fullWins ? fullImageResult : scanResult;
        const secondaryResult = fullWins ? scanResult : fullImageResult;
        const primaryLabel = fullWins ? "full image" : "cropped image";
        const secondaryLabel = fullWins ? "cropped image" : "full image";
        const primaryAnsweredCount = primaryResult.answers.filter(
          (a) => a.selectedAnswer && a.selectedAnswer.trim().length > 0,
        ).length;
        const secondaryAnsweredCount = secondaryResult.answers.filter(
          (a) => a.selectedAnswer && a.selectedAnswer.trim().length > 0,
        ).length;
        const minTrustworthyAnswers = Math.max(
          4,
          Math.floor(questionCount * 0.45),
        );
        const secondaryIdCanBeTrusted =
          secondaryAnsweredCount >= minTrustworthyAnswers;

        let mergedResult = primaryResult;
        if (
          !isReliableStudentId(primaryResult.studentId) &&
          isReliableStudentId(secondaryResult.studentId) &&
          secondaryIdCanBeTrusted
        ) {
          mergedResult = {
            ...primaryResult,
            studentId: secondaryResult.studentId,
          };
          console.log(
            `[CameraScanner] Using ${secondaryLabel} student ID (${secondaryResult.studentId}) with ${primaryLabel} answers`,
          );
        } else if (
          !isReliableStudentId(primaryResult.studentId) &&
          isReliableStudentId(secondaryResult.studentId) &&
          !secondaryIdCanBeTrusted
        ) {
          console.warn(
            `[CameraScanner] Skipping ${secondaryLabel} student ID due to low answer coverage (${secondaryAnsweredCount}/${questionCount}); keeping ${primaryLabel} ID (${primaryResult.studentId || "empty"})`,
          );
        }

        console.log(
          `[CameraScanner] Result coverage: ${primaryLabel}=${primaryAnsweredCount}/${questionCount}, ${secondaryLabel}=${secondaryAnsweredCount}/${questionCount}`,
        );

        if (fullWins) {
          console.log(
            `[CameraScanner] Full image chosen (score ${fullScore.toFixed(1)} > ${croppedScore.toFixed(1)})`,
          );
          scanResult = mergedResult;
          scanImageUri = photo.uri;
        } else {
          console.log(
            `[CameraScanner] Cropped image retained (score ${croppedScore.toFixed(1)} >= ${fullScore.toFixed(1)})`,
          );
          scanResult = mergedResult;
        }
      }

      console.log("[CameraScanner] Scan complete, calling onScanComplete");
      onScanComplete(scanResult, scanResult.processedImageUri || scanImageUri);
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
                  borderWidth: questionCount <= 20 ? 0 : 3, // Remove full border for 20q
                },
              ]}
            >
             
              {/* Corner Markers */}
              {questionCount <= 20 ? (
                // 4 Full Boxes for 20q to guide alignment of the black squares
                <>
                  <View style={[styles.cornerBox, { top: -5, left: -5 }]} />
                  <View style={[styles.cornerBox, { top: -5, right: -5 }]} />
                  <View style={[styles.cornerBox, { bottom: -5, left: -5 }]} />
                  <View style={[styles.cornerBox, { bottom: -5, right: -5 }]} />
                </>
              ) : (
                // Brackets for other templates
                <>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </>
              )}
            </View>
          </View>
          <View style={{ flex: 1 }} />

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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scanFrame: {
    borderWidth: 3,
    borderColor: "#00FF7F",
    backgroundColor: "transparent",
    position: "relative",
  },
  guideOverlay: {
    position: "absolute",
    borderRadius: 4,
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
  cornerBox: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#00FF7F",
    borderWidth: 3,
    backgroundColor: "rgba(0, 255, 127, 0.1)", // Slight green tint
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
});
