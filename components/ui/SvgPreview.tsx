import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface SvgPreviewProps {
  svgContent: string;
  title?: string;
  studentId?: string;
  filledAnswers?: { [questionNumber: number]: "A" | "B" | "C" | "D" };
}

export default function SvgPreview({
  svgContent,
  title = "Answer Sheet Preview",
  studentId,
  filledAnswers = {},
}: SvgPreviewProps) {
  // Parse SVG content for basic info
  const parseSvgContent = (svg: string) => {
    const widthMatch = svg.match(/width="(\d+)"/);
    const heightMatch = svg.match(/height="(\d+)"/);

    // Find filled bubbles (circles with fill="black")
    const filledBubbles = svg.match(/<circle[^>]*fill="black"[^>]*>/g) || [];

    // Extract question count from the SVG structure or default to 20
    const questionMatches = svg.match(/Q(\d+)/g) || [];
    const questionCount = questionMatches.length || 20;

    // Parse student ID from provided prop
    const studentIdDigits: { position: number; digit: number }[] = [];
    if (studentId) {
      const idString = studentId.padStart(8, "0");
      for (let i = 0; i < 8; i++) {
        const digit = parseInt(idString[i]);
        if (!isNaN(digit)) {
          studentIdDigits.push({ position: i, digit });
        }
      }
    }

    // Convert filledAnswers to array format
    const answerBubbles = Object.entries(filledAnswers).map(
      ([questionNum, answer]) => ({
        question: parseInt(questionNum),
        answer,
      }),
    );

    return {
      width: widthMatch ? parseInt(widthMatch[1]) : 612,
      height: heightMatch ? parseInt(heightMatch[1]) : 792,
      questionCount,
      filledBubblesCount:
        filledBubbles.length + answerBubbles.length + studentIdDigits.length,
      studentIdBubbles: studentIdDigits,
      answerBubbles,
      hasFilledBubbles:
        filledBubbles.length > 0 ||
        answerBubbles.length > 0 ||
        studentId !== undefined,
    };
  };

  const svgInfo = parseSvgContent(svgContent);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="document-text" size={24} color="#007AFF" />
        <Text style={styles.title}>{title}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* SVG Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Sheet Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Format:</Text>
            <Text style={styles.infoValue}>Zipgrade Compatible</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Dimensions:</Text>
            <Text style={styles.infoValue}>
              {svgInfo.width} × {svgInfo.height} px
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Questions:</Text>
            <Text style={styles.infoValue}>
              {svgInfo.questionCount} detected
            </Text>
          </View>
          {svgInfo.hasFilledBubbles && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Filled Bubbles:</Text>
              <Text style={styles.infoValue}>
                {svgInfo.filledBubblesCount} bubbles
              </Text>
            </View>
          )}
          {svgInfo.answerBubbles.length > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Answers:</Text>
              <Text style={styles.infoValue}>
                {svgInfo.answerBubbles.length} questions answered
              </Text>
            </View>
          )}
          {filledAnswers && Object.keys(filledAnswers).length > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Sample Answers:</Text>
              <Text style={styles.infoValue}>
                {Object.entries(filledAnswers)
                  .slice(0, 3)
                  .map(([q, a]) => `Q${q}:${a}`)
                  .join(", ")}
              </Text>
            </View>
          )}
        </View>

        {/* Visual Representation */}
        <View style={styles.visualCard}>
          <Text style={styles.visualTitle}>Visual Layout</Text>

          {/* Header Section */}
          <View style={styles.sheetSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle" size={16} color="#666" />
              <Text style={styles.sectionTitle}>Header & Instructions</Text>
            </View>
            <View style={styles.mockHeader}>
              <Text style={styles.mockText}>ZIPGRADE ANSWER SHEET</Text>
              <Text style={styles.mockSubtext}>
                • Use #2 pencil • Fill completely • Erase cleanly
              </Text>
            </View>
          </View>

          {/* Student ID Section */}
          <View style={styles.sheetSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person" size={16} color="#666" />
              <Text style={styles.sectionTitle}>Student ID (8 digits)</Text>
            </View>
            <View style={styles.studentIdGrid}>
              {Array.from({ length: 8 }, (_, i) => {
                // Find filled bubble for this position
                const filledDigit = svgInfo.studentIdBubbles.find(
                  (b) => b.position === i,
                );

                return (
                  <View key={i} style={styles.digitColumn}>
                    <Text style={styles.digitLabel}>{i + 1}</Text>
                    {Array.from({ length: 10 }, (_, j) => {
                      const isFilled = filledDigit?.digit === j;
                      return (
                        <View
                          key={j}
                          style={[
                            styles.bubble,
                            isFilled && styles.filledBubble,
                          ]}
                        >
                          <Text
                            style={[
                              styles.bubbleLabel,
                              isFilled && styles.filledBubbleLabel,
                            ]}
                          >
                            {j}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
            {svgInfo.studentIdBubbles.length > 0 && (
              <Text style={styles.studentIdDisplay}>
                Student ID:{" "}
                {Array.from({ length: 8 }, (_, i) => {
                  const bubble = svgInfo.studentIdBubbles.find(
                    (b) => b.position === i,
                  );
                  return bubble ? bubble.digit.toString() : "_";
                }).join("")}
              </Text>
            )}
          </View>

          {/* Answers Section */}
          <View style={styles.sheetSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="list" size={16} color="#666" />
              <Text style={styles.sectionTitle}>Answer Bubbles</Text>
            </View>
            <View style={styles.answersGrid}>
              {Array.from(
                { length: Math.min(svgInfo.questionCount || 20, 20) },
                (_, i) => {
                  const questionNum = i + 1;
                  const filledAnswer = svgInfo.answerBubbles.find(
                    (a) => a.question === questionNum,
                  );

                  return (
                    <View key={i} style={styles.questionRow}>
                      <Text style={styles.questionNumber}>{questionNum}</Text>
                      {["A", "B", "C", "D"].map((option) => {
                        const isFilled = filledAnswer?.answer === option;
                        return (
                          <View
                            key={option}
                            style={[
                              styles.answerBubble,
                              isFilled && styles.filledAnswerBubble,
                            ]}
                          >
                            <Text
                              style={[
                                styles.answerLabel,
                                isFilled && styles.filledAnswerLabel,
                              ]}
                            >
                              {option}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                },
              )}
              {(svgInfo.questionCount || 0) > 20 && (
                <Text style={styles.moreQuestions}>
                  ... and {(svgInfo.questionCount || 0) - 20} more questions
                </Text>
              )}
              {svgInfo.answerBubbles.length === 0 &&
                svgInfo.questionCount > 0 && (
                  <Text style={styles.emptyAnswers}>
                    No answers filled (blank answer sheet)
                  </Text>
                )}
            </View>
          </View>
        </View>

        {/* Technical Details */}
        <View style={styles.techCard}>
          <Text style={styles.techTitle}>Technical Details</Text>
          <View style={styles.techDetail}>
            <Ionicons name="code" size={16} color="#666" />
            <Text style={styles.techText}>
              SVG format for print compatibility
            </Text>
          </View>
          <View style={styles.techDetail}>
            <Ionicons name="scan" size={16} color="#666" />
            <Text style={styles.techText}>Optimized for mobile scanning</Text>
          </View>
          <View style={styles.techDetail}>
            <Ionicons name="checkmark-circle" size={16} color="#666" />
            <Text style={styles.techText}>Alignment markers included</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  content: {
    flex: 1,
    padding: 15,
  },
  infoCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  visualCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  visualTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  sheetSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  mockHeader: {
    backgroundColor: "#f8f9fa",
    padding: 10,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  mockText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  mockSubtext: {
    fontSize: 10,
    color: "#666",
  },
  studentIdGrid: {
    flexDirection: "row",
    backgroundColor: "#f8f9fa",
    padding: 10,
    borderRadius: 4,
    justifyContent: "space-around",
  },
  digitColumn: {
    alignItems: "center",
  },
  digitLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  bubble: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    backgroundColor: "white",
  },
  filledBubble: {
    backgroundColor: "#333",
    borderColor: "#333",
  },
  bubbleLabel: {
    fontSize: 8,
    color: "#666",
  },
  filledBubbleLabel: {
    color: "white",
  },
  studentIdDisplay: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#007AFF",
    textAlign: "center",
    marginTop: 10,
    padding: 8,
    backgroundColor: "#e3f2fd",
    borderRadius: 4,
  },
  answersGrid: {
    backgroundColor: "#f8f9fa",
    padding: 10,
    borderRadius: 4,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 10,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#333",
    width: 20,
  },
  answerBubble: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: "white",
  },
  filledAnswerBubble: {
    backgroundColor: "#333",
    borderColor: "#333",
  },
  answerLabel: {
    fontSize: 10,
    color: "#666",
    fontWeight: "bold",
  },
  filledAnswerLabel: {
    color: "white",
  },
  emptyAnswers: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 10,
  },
  moreQuestions: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 10,
  },
  techCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  techTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  techDetail: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  techText: {
    fontSize: 14,
    color: "#666",
  },
});
