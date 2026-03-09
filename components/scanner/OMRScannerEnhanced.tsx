import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { GradingService } from "../../services/gradingService";
import { StorageService } from "../../services/storageService";
import { GradingResult, ScanResult } from "../../types/scanning";
import CameraScanner from "./CameraScanner";

interface OMRScannerEnhancedProps {
  examId: string;
  onClose: () => void;
}

type ScanMode = "camera" | "processing" | "review" | "results";

export default function OMRScannerEnhanced({
  examId,
  onClose,
}: OMRScannerEnhancedProps) {
  // State
  const [mode, setMode] = useState<ScanMode>("camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(
    null,
  );
  const [detectedAnswers, setDetectedAnswers] = useState<string[]>([]);
  const [detectedStudentId, setDetectedStudentId] = useState<string>("");
  const [confidence, setConfidence] = useState<number>(0);
  const [recentScans, setRecentScans] = useState<GradingResult[]>([]);

  // Load recent scans
  useEffect(() => {
    loadRecentScans();
  }, []);

  const loadRecentScans = async () => {
    try {
      const scans = await StorageService.getRecentScans(5);
      setRecentScans(scans);
    } catch (error) {
      console.error("Error loading recent scans:", error);
    }
  };

  const handleScanComplete = async (result: ScanResult, imageUri: string) => {
    try {
      setMode("processing");
      setCapturedImage(imageUri);
      setScanResult(result);
      setDetectedStudentId(result.studentId);
      setDetectedAnswers(result.answers.map((a) => a.selectedAnswer));
      setConfidence(result.confidence);

      // Auto-grade
      await handleGradeAnswers(result, imageUri);
    } catch (error) {
      console.error("Error processing scan:", error);
      Alert.alert("Error", "Failed to process scan");
      setMode("camera");
    }
  };

  const handleGradeAnswers = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    try {
      setProcessing(true);

      // Get answer key (in production, fetch from exam)
      const answerKey = GradingService.getDefaultAnswerKey(
        scanResult.answers.length,
      );

      // Grade the answers
      const result = GradingService.gradeAnswers(scanResult, answerKey);

      // Save result
      const savedResult = await StorageService.saveScanResult(result, imageUri);

      setGradingResult(savedResult);
      setMode("results");

      // Reload recent scans
      await loadRecentScans();

      Toast.show({
        type: "success",
        text1: "Scan Complete",
        text2: `Score: ${result.score}/${result.totalPoints}`,
        visibilityTime: 3000,
      });
    } catch (error) {
      console.error("Error grading answers:", error);
      Alert.alert("Error", "Failed to grade answers");
    } finally {
      setProcessing(false);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setScanResult(null);
    setGradingResult(null);
    setDetectedAnswers([]);
    setDetectedStudentId("");
    setMode("camera");
  };

  const handleScanAnother = () => {
    handleRetake();
  };

  const handleEditAnswer = (questionIndex: number, newAnswer: string) => {
    if (!scanResult) return;

    const updatedAnswers = [...scanResult.answers];
    updatedAnswers[questionIndex] = {
      ...updatedAnswers[questionIndex],
      selectedAnswer: newAnswer,
    };

    const updatedScanResult = {
      ...scanResult,
      answers: updatedAnswers,
    };

    setScanResult(updatedScanResult);
    setDetectedAnswers(updatedAnswers.map((a) => a.selectedAnswer));

    // Re-grade with updated answers
    if (capturedImage) {
      handleGradeAnswers(updatedScanResult, capturedImage);
    }
  };

  // Render different modes
  if (mode === "camera") {
    return (
      <CameraScanner onScanComplete={handleScanComplete} onCancel={onClose} />
    );
  }

  if (mode === "processing") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.processingText}>Processing answer sheet...</Text>
          <Text style={styles.processingSubtext}>
            Detecting bubbles and grading answers
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === "review" && scanResult) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.reviewContainer}>
          {/* Header */}
          <View style={styles.reviewHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            <Text style={styles.reviewTitle}>Review Scan</Text>
          </View>

          {/* Captured Image */}
          {capturedImage && (
            <View style={styles.imagePreview}>
              <Image
                source={{ uri: capturedImage }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Student ID */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Student ID</Text>
            <Text style={styles.infoValue}>{detectedStudentId}</Text>
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>
                {Math.round(confidence * 100)}% confidence
              </Text>
            </View>
          </View>

          {/* Answers Grid */}
          <View style={styles.answersCard}>
            <Text style={styles.answersTitle}>Detected Answers</Text>
            <View style={styles.answersGrid}>
              {detectedAnswers.map((answer, index) => (
                <View key={index} style={styles.answerItem}>
                  <Text style={styles.answerNumber}>{index + 1}</Text>
                  <View style={styles.answerBubbles}>
                    {["A", "B", "C", "D", "E"].map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.answerBubble,
                          answer === option && styles.answerBubbleSelected,
                        ]}
                        onPress={() => handleEditAnswer(index, option)}
                      >
                        <Text
                          style={[
                            styles.answerBubbleText,
                            answer === option &&
                              styles.answerBubbleTextSelected,
                          ]}
                        >
                          {option}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.reviewActions}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={handleRetake}
            >
              <Ionicons name="camera" size={20} color="#007AFF" />
              <Text style={styles.retakeButtonText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => {
                if (capturedImage) {
                  handleGradeAnswers(scanResult, capturedImage);
                }
              }}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="white" />
                  <Text style={styles.confirmButtonText}>Confirm & Grade</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === "results" && gradingResult) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.resultsContainer}>
          {/* Header */}
          <View style={styles.resultsHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            <Text style={styles.resultsTitle}>Scan Results</Text>
          </View>

          {/* Score Card */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreCircle}>
              <Text style={styles.scorePercentage}>
                {Math.round(gradingResult.percentage)}%
              </Text>
              <Text style={styles.scoreGrade}>{gradingResult.letterGrade}</Text>
            </View>
            <View style={styles.scoreDetails}>
              <Text style={styles.scoreLabel}>Student ID</Text>
              <Text style={styles.scoreValue}>{gradingResult.studentId}</Text>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={styles.scoreValue}>
                {gradingResult.score} / {gradingResult.totalPoints}
              </Text>
            </View>
          </View>

          {/* Answer Review */}
          <View style={styles.answerReviewCard}>
            <Text style={styles.answerReviewTitle}>Answer Review</Text>
            {gradingResult.answers.map((answer, index) => {
              const isCorrect = answer.isCorrect;
              return (
                <View key={index} style={styles.answerReviewItem}>
                  <View style={styles.answerReviewLeft}>
                    <Text style={styles.answerReviewNumber}>{index + 1}</Text>
                    <Text style={styles.answerReviewAnswer}>
                      {answer.selectedAnswer || "—"}
                    </Text>
                  </View>
                  <View style={styles.answerReviewRight}>
                    {isCorrect ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color="#4CAF50"
                      />
                    ) : (
                      <Ionicons name="close-circle" size={24} color="#f44336" />
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Actions */}
          <View style={styles.resultsActions}>
            <TouchableOpacity
              style={styles.scanAnotherButton}
              onPress={handleScanAnother}
            >
              <Ionicons name="camera" size={20} color="white" />
              <Text style={styles.scanAnotherButtonText}>Scan Another</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Recent Scans */}
          {recentScans.length > 0 && (
            <View style={styles.recentScansCard}>
              <Text style={styles.recentScansTitle}>Recent Scans</Text>
              {recentScans.map((scan, index) => (
                <View key={index} style={styles.recentScanItem}>
                  <Text style={styles.recentScanId}>{scan.studentId}</Text>
                  <Text style={styles.recentScanScore}>
                    {scan.score}/{scan.totalPoints}
                  </Text>
                  <Text style={styles.recentScanGrade}>{scan.letterGrade}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  // Processing
  processingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  processingText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
  },
  processingSubtext: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
  },
  // Review
  reviewContainer: {
    flex: 1,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  closeButton: {
    padding: 8,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginLeft: 16,
  },
  imagePreview: {
    backgroundColor: "white",
    padding: 16,
    marginBottom: 16,
  },
  previewImage: {
    width: "100%",
    height: 300,
    borderRadius: 8,
  },
  infoCard: {
    backgroundColor: "white",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  confidenceBadge: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  confidenceText: {
    fontSize: 12,
    color: "#1976d2",
    fontWeight: "600",
  },
  answersCard: {
    backgroundColor: "white",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  answersTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  answersGrid: {
    gap: 12,
  },
  answerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  answerNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    width: 30,
  },
  answerBubbles: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
  },
  answerBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },
  answerBubbleSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  answerBubbleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  answerBubbleTextSelected: {
    color: "white",
  },
  reviewActions: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#007AFF",
    backgroundColor: "white",
    gap: 8,
  },
  retakeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  confirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  // Results
  resultsContainer: {
    flex: 1,
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginLeft: 16,
  },
  scoreCard: {
    backgroundColor: "white",
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 24,
  },
  scorePercentage: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
  },
  scoreGrade: {
    fontSize: 24,
    fontWeight: "600",
    color: "white",
    marginTop: 4,
  },
  scoreDetails: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  answerReviewCard: {
    backgroundColor: "white",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  answerReviewTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  answerReviewItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  answerReviewLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  answerReviewNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    width: 30,
  },
  answerReviewAnswer: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  answerReviewRight: {},
  resultsActions: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  scanAnotherButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    gap: 8,
  },
  scanAnotherButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  doneButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#007AFF",
    backgroundColor: "white",
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  recentScansCard: {
    backgroundColor: "white",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 32,
    borderRadius: 12,
  },
  recentScansTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  recentScanItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  recentScanId: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  recentScanScore: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginRight: 16,
  },
  recentScanGrade: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#007AFF",
  },
});
