import { auth } from "@/config/firebase";
import { ResultsService } from "@/services/resultsService";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

type ResultRow = {
  id: string;
  studentName: string;
  classLabel: string;
  examLabel: string;
  percentage: number;
  dateLabel: string;
  correctLabel: string;
};

function scoreTone(value: number) {
  if (value >= 85) return { badge: "#D8F3E7", text: "#20A86B" };
  if (value >= 70) return { badge: "#F5E8B8", text: "#D68B11" };
  return { badge: "#F9D7D9", text: "#E24E5C" };
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

export default function ResultsScreen() {
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState("All Classes");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [classFilters, setClassFilters] = useState<string[]>(["All Classes"]);
  const listRef = useRef<FlatList<ResultRow>>(null);

  const loadResults = useCallback(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        const currentUser = auth.currentUser;
        if (!currentUser) {
          if (active) {
            setResults([]);
            setClassFilters(["All Classes"]);
          }
          return;
        }

        const payload = await ResultsService.getUnifiedResults();
        const mappedResults = payload.rows.map((item) => ({
          id: item.id,
          studentName: item.studentName,
          classLabel: item.classLabel,
          examLabel: item.examLabel,
          percentage: item.percentage,
          dateLabel: formatDateLabel(item.dateValue),
          correctLabel: item.correctLabel,
          sortValue: item.sortValue,
        }));

        if (!active) return;
        setResults(mappedResults);
        setClassFilters(payload.classFilters);
      } catch (error) {
        console.error("Error loading results:", error);
        if (active) {
          setResults([]);
          setClassFilters(["All Classes"]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      return loadResults();
    }, [loadResults]),
  );

  const filteredResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return results.filter((item) => {
      const matchesClass =
        selectedClass === "All Classes" || item.classLabel === selectedClass;
      const matchesSearch =
        !q ||
        item.studentName.toLowerCase().includes(q) ||
        item.classLabel.toLowerCase().includes(q) ||
        item.examLabel.toLowerCase().includes(q);

      return matchesClass && matchesSearch;
    });
  }, [results, searchQuery, selectedClass]);

  const displayResults = filteredResults;
  const displayClassFilters = classFilters;

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searchQuery, selectedClass]);

  const handleExport = useCallback(async () => {
    if (!filteredResults.length) {
      Toast.show({
        type: "info",
        text1: "No Results",
        text2: "There are no results to export.",
      });
      return;
    }

    const header = [
      "Student Name",
      "Class",
      "Exam",
      "Percentage",
      "Date",
      "Correct",
    ];
    const escapeCsv = (value: string | number) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = filteredResults.map((item) => [
      item.studentName,
      item.classLabel,
      item.examLabel,
      `${item.percentage}%`,
      item.dateLabel,
      item.correctLabel,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    try {
      await Share.share({
        title: "Results Export",
        message: csv,
      });
    } catch (error) {
      console.error("Error exporting results:", error);
      Toast.show({
        type: "error",
        text1: "Export Failed",
        text2: "Unable to export results right now.",
      });
    }
  }, [filteredResults]);

  const renderResultCard = useCallback(({ item }: { item: ResultRow }) => {
    const tone = scoreTone(item.percentage);

    return (
      <TouchableOpacity style={styles.resultCard} activeOpacity={0.88}>
        <View style={[styles.scoreCircle, { backgroundColor: tone.badge }]}>
          <Text style={[styles.scoreCircleText, { color: tone.text }]}>
            {item.percentage}%
          </Text>
        </View>
        <View style={styles.resultBody}>
          <Text style={styles.resultName}>{item.studentName}</Text>
          <Text style={styles.resultMeta}>
            {item.classLabel} • {item.examLabel}
          </Text>
          <View style={styles.resultFooter}>
            <Text style={styles.resultDate}>{item.dateLabel}</Text>
            <Text style={styles.resultCorrect}>{item.correctLabel}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>All Results</Text>
        <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
          <Ionicons name="download-outline" size={18} color="#19B97C" />
          <Text style={styles.exportText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={22} color="#C4CAD5" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by student, class, or exam..."
          placeholderTextColor="#C4CAD5"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}
        alwaysBounceVertical={false}
      >
        {displayClassFilters.map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.chip, selectedClass === filter && styles.chipActive]}
            onPress={() => setSelectedClass(filter)}
          >
            <Text
              style={[
                styles.chipText,
                selectedClass === filter && styles.chipTextActive,
              ]}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ✅ FIX: Render spinner outside FlatList to prevent the large empty gap */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#20BE7B" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={displayResults}
          keyExtractor={(item) => item.id}
          renderItem={renderResultCard}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={44} color="#C5CBD6" />
              <Text style={styles.emptyTitle}>No results yet</Text>
              <Text style={styles.emptySubtitle}>
                Try scanning an answer sheet to see results here.
              </Text>
            </View>
          }
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F8",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
  },
  exportButton: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#EBFBF3",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  exportText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#19B97C",
  },
  searchWrap: {
    marginHorizontal: 20,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  chipsScroll: {
    height: 52,
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 8,
  },
  chipsRow: {
    paddingHorizontal: 20,
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E6EC",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "#20BE7B",
    borderColor: "#20BE7B",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  list: {
    flex: 1,
    flexGrow: 1,
  },
  listContent: {
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 120,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 32,
  },
  resultCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  scoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  scoreCircleText: {
    fontSize: 15,
    fontWeight: "800",
  },
  resultBody: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 3,
  },
  resultMeta: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 8,
  },
  resultFooter: {
    flexDirection: "row",
    gap: 14,
  },
  resultDate: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  resultCorrect: {
    fontSize: 11,
    color: "#19B97C",
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
