import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface SvgPreviewProps {
  svgContent: string;
  title?: string;
  studentId?: string;
  filledAnswers?: { [questionNumber: number]: "A" | "B" | "C" | "D" };
  darkModeEnabled?: boolean;
  templateInfo?: {
    totalQuestions: number;
    columns: number;
  };
}

export default function SvgPreview({
  svgContent,
  title = "Answer Sheet Preview",
  studentId,
  filledAnswers = {},
  darkModeEnabled = false,
  templateInfo,
}: SvgPreviewProps) {
  const colors = darkModeEnabled
    ? {
        bg: "#111815",
        surface: "#1f2b26",
        border: "#34483f",
        soft: "#2a3a33",
        title: "#e7f1eb",
        text: "#b9c9c0",
        accent: "#8fd1ad",
      }
    : {
        bg: "#f5f5f5",
        surface: "#ffffff",
        border: "#e0e0e0",
        soft: "#f8f9fa",
        title: "#333333",
        text: "#666666",
        accent: "#007AFF",
      };

  // Parse SVG content for basic info
  const parseSvgContent = (svg: string) => {
    const widthMatch = svg.match(/width="(\d+)"/);
    const heightMatch = svg.match(/height="(\d+)"/);

    // Use template info if provided, otherwise try to detect from SVG
    let questionCount = templateInfo?.totalQuestions || 20;
    let columns = templateInfo?.columns || 1;

    // If no template info, try to detect from SVG structure
    if (!templateInfo) {
      // Look for question numbers in text elements with class="question-text"
      // The SVG generates: <text x="..." y="..." class="question-text">1</text>
      const questionTextMatches =
        svg.match(/<text[^>]*class="question-text"[^>]*>(\d+)<\/text>/g) || [];
      if (questionTextMatches.length > 0) {
        // Extract the highest question number
        const questionNumbers = questionTextMatches
          .map((match) => {
            const numMatch = match.match(/>(\d+)</);
            return numMatch ? parseInt(numMatch[1]) : 0;
          })
          .filter((num) => num > 0);

        if (questionNumbers.length > 0) {
          questionCount = Math.max(...questionNumbers);
        }
      }
    }

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
    const filledBubblesCount = answerBubbles.length + studentIdDigits.length;

    return {
      width: widthMatch ? parseInt(widthMatch[1]) : 612,
      height: heightMatch ? parseInt(heightMatch[1]) : 792,
      questionCount,
      columns,
      filledBubblesCount,
      studentIdBubbles: studentIdDigits,
      answerBubbles,
      hasFilledBubbles: filledBubblesCount > 0,
    };
  };

  const svgInfo = parseSvgContent(svgContent);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Ionicons name="document-text" size={24} color={colors.accent} />
        <Text style={[styles.title, { color: colors.title }]}>{title}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* SVG Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.title }]}>Sheet Information</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Format:</Text>
            <Text style={[styles.infoValue, { color: colors.title }]}>Zipgrade Compatible</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Dimensions:</Text>
            <Text style={[styles.infoValue, { color: colors.title }]}>
              {svgInfo.width} × {svgInfo.height} px
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Questions:</Text>
            <Text style={[styles.infoValue, { color: colors.title }]}>
              {svgInfo.questionCount} detected
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Layout:</Text>
            <Text style={[styles.infoValue, { color: colors.title }]}>
              {svgInfo.columns} column{svgInfo.columns > 1 ? "s" : ""}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Filled Bubbles:</Text>
            <Text style={[styles.infoValue, { color: colors.title }]}>
              {svgInfo.filledBubblesCount} bubbles
            </Text>
          </View>
          {svgInfo.answerBubbles.length > 0 && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.text }]}>Answers:</Text>
              <Text style={[styles.infoValue, { color: colors.title }]}>
                {svgInfo.answerBubbles.length} questions answered
              </Text>
            </View>
          )}
          {filledAnswers && Object.keys(filledAnswers).length > 0 && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.text }]}>Sample Answers:</Text>
              <Text style={[styles.infoValue, { color: colors.title }]}>
                {Object.entries(filledAnswers)
                  .slice(0, 3)
                  .map(([q, a]) => `Q${q}:${a}`)
                  .join(", ")}
              </Text>
            </View>
          )}
        </View>

        {/* Visual Representation */}
        <View style={[styles.visualCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.visualTitle, { color: colors.title }]}>Visual Layout</Text>

          {/* Header Section */}
          <View style={styles.sheetSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle" size={16} color={colors.text} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Header & Instructions</Text>
            </View>
            <View style={[styles.mockHeader, { backgroundColor: colors.soft, borderLeftColor: colors.accent }]}>
              <Text style={[styles.mockText, { color: colors.title }]}>ZIPGRADE ANSWER SHEET</Text>
              <Text style={[styles.mockSubtext, { color: colors.text }]}>
                • Use #2 pencil • Fill completely • Erase cleanly
              </Text>
            </View>
          </View>

          {/* Student ID Section */}
          <View style={styles.sheetSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person" size={16} color={colors.text} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Student ID (8 digits)</Text>
            </View>
            <View style={[styles.studentIdGrid, { backgroundColor: colors.soft }]}>
              {Array.from({ length: 8 }, (_, i) => {
                // Find filled bubble for this position
                const filledDigit = svgInfo.studentIdBubbles.find(
                  (b) => b.position === i,
                );

                return (
                  <View key={i} style={styles.digitColumn}>
                    <Text style={[styles.digitLabel, { color: colors.title }]}>{i + 1}</Text>
                    {Array.from({ length: 10 }, (_, j) => {
                      const isFilled = filledDigit?.digit === j;
                      return (
                        <View
                          key={j}
                          style={[
                            styles.bubble,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                            isFilled && styles.filledBubble,
                            darkModeEnabled &&
                              isFilled && {
                                backgroundColor: "#8fd1ad",
                                borderColor: "#8fd1ad",
                              },
                          ]}
                        >
                          <Text
                            style={[
                              styles.bubbleLabel,
                              { color: colors.text },
                              isFilled && styles.filledBubbleLabel,
                              darkModeEnabled && isFilled && { color: "#102119" },
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
              <Text style={[styles.studentIdDisplay, { backgroundColor: colors.soft, color: colors.accent }]}>
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
              <Ionicons name="list" size={16} color={colors.text} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Answer Bubbles</Text>
            </View>
            <View style={[styles.answersGrid, { backgroundColor: colors.soft }]}>
              <View style={styles.answerColumns}>
                {Array.from({ length: svgInfo.columns }, (_, colIndex) => {
                  const questionsPerColumn = Math.ceil(
                    svgInfo.questionCount / svgInfo.columns,
                  );
                  const start = colIndex * questionsPerColumn + 1;
                  const end = Math.min(
                    (colIndex + 1) * questionsPerColumn,
                    svgInfo.questionCount,
                  );
                  const questions = Array.from(
                    { length: Math.max(0, end - start + 1) },
                    (_, i) => start + i,
                  );

                  return (
                    <View key={colIndex} style={styles.answerColumn}>
                      {questions.map((questionNum) => {
                        const filledAnswer = svgInfo.answerBubbles.find(
                          (a) => a.question === questionNum,
                        );

                        return (
                          <View key={questionNum} style={styles.questionRow}>
                            <Text style={[styles.questionNumber, { color: colors.title }]}>
                              {questionNum}
                            </Text>
                            {["A", "B", "C", "D"].map((option) => {
                              const isFilled = filledAnswer?.answer === option;
                              return (
                                <View
                                  key={option}
                                  style={[
                                    styles.answerBubble,
                                    { backgroundColor: colors.surface, borderColor: colors.border },
                                    isFilled && styles.filledAnswerBubble,
                                    darkModeEnabled &&
                                      isFilled && {
                                        backgroundColor: "#8fd1ad",
                                        borderColor: "#8fd1ad",
                                      },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.answerLabel,
                                      { color: colors.text },
                                      isFilled && styles.filledAnswerLabel,
                                      darkModeEnabled && isFilled && { color: "#102119" },
                                    ]}
                                  >
                                    {option}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
              {svgInfo.answerBubbles.length === 0 &&
                svgInfo.questionCount > 0 && (
                  <Text style={[styles.emptyAnswers, { color: colors.text }]}>
                    No answers filled (blank answer sheet)
                  </Text>
                )}
            </View>
          </View>
        </View>

        {/* Technical Details */}
        <View style={[styles.techCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.techTitle, { color: colors.title }]}>Technical Details</Text>
          <View style={styles.techDetail}>
            <Ionicons name="code" size={16} color={colors.text} />
            <Text style={[styles.techText, { color: colors.text }]}>
              SVG format for print compatibility
            </Text>
          </View>
          <View style={styles.techDetail}>
            <Ionicons name="scan" size={16} color={colors.text} />
            <Text style={[styles.techText, { color: colors.text }]}>Optimized for mobile scanning</Text>
          </View>
          <View style={styles.techDetail}>
            <Ionicons name="checkmark-circle" size={16} color={colors.text} />
            <Text style={[styles.techText, { color: colors.text }]}>Alignment markers included</Text>
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
    borderWidth: 1,
    borderColor: "#e0e0e0",
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
    borderWidth: 1,
    borderColor: "#e0e0e0",
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
  answerColumns: {
    flexDirection: "row",
    gap: 16,
  },
  answerColumn: {
    flex: 1,
    paddingRight: 2,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#333",
    width: 28,
  },
  answerBubble: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
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
  techCard: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e0e0e0",
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
