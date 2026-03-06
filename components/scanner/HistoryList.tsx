import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { StorageService } from "../../services/storageService";
import { GradingResult } from "../../types/scanning";
import ScanResults from "./ScanResults";

interface HistoryListProps {
    onClose: () => void;
}

export default function HistoryList({ onClose }: HistoryListProps) {
    const [history, setHistory] = useState<GradingResult[]>([]);
    const [selectedResult, setSelectedResult] = useState<GradingResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            setLoading(true);
            const data = await StorageService.getHistory();
            setHistory(data);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not load history");
        } finally {
            setLoading(false);
        }
    };

    const confirmClearAll = () => {
        Alert.alert(
            "Clear History",
            "Are you sure you want to delete all saved scan results? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete All",
                    style: "destructive",
                    onPress: async () => {
                        await StorageService.clearHistory();
                        setHistory([]);
                    },
                },
            ]
        );
    };

    if (selectedResult) {
        return (
            <ScanResults
                result={selectedResult}
                imageUri={selectedResult.metadata?.imageUri}
                questionCount={selectedResult.totalQuestions}
                onClose={() => {
                    setSelectedResult(null);
                    loadHistory();
                }}
                onScanAnother={() => {
                    setSelectedResult(null);
                    loadHistory();
                }}
            />
        );
    }

    const renderItem = ({ item }: { item: GradingResult }) => {
        const date = item.metadata?.timestamp
            ? new Date(item.metadata.timestamp).toLocaleString()
            : "Unknown Date";

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => setSelectedResult(item)}
            >
                <View style={styles.thumbnailPlaceholderInline}>
                    <Ionicons name="document-text-outline" size={20} color="#666" />
                </View>

                <View style={styles.cardContent}>
                    <View style={styles.titleRow}>
                        <Text style={styles.cardTitle}>
                            Student ID: {item.studentId === "00000000" ? "Unknown" : item.studentId}
                        </Text>
                        {item.metadata?.isValidId ? (
                            <Ionicons name="checkmark-circle" size={16} color="#00a550" style={{ marginLeft: 6 }} />
                        ) : (
                            <Ionicons name="alert-circle" size={16} color="#e74c3c" style={{ marginLeft: 6 }} />
                        )}
                    </View>
                    <Text style={styles.cardSubtitle}>{date}</Text>

                    <View style={styles.scoreRow}>
                        <View style={styles.scoreBadge}>
                            <Text style={styles.scoreText}>
                                {item.score}/{item.totalPoints}
                            </Text>
                        </View>
                        <Text style={styles.percentageText}>{item.percentage}%</Text>
                        <Text style={styles.itemsText}>{item.totalQuestions} Items</Text>
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#ccc" />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={onClose}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Scan History</Text>
                {history.length > 0 ? (
                    <TouchableOpacity onPress={confirmClearAll}>
                        <Ionicons name="trash-outline" size={24} color="white" />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>

            {/* List */}
            <View style={styles.listContainer}>
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#3B5943" />
                        <Text style={styles.loadingText}>Loading history...</Text>
                    </View>
                ) : history.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="folder-open-outline" size={64} color="#ccc" />
                        <Text style={styles.emptyText}>No scan history found</Text>
                    </View>
                ) : (
                    <FlatList
                        data={history}
                        keyExtractor={(item, index) =>
                            item.metadata?.timestamp?.toString() || index.toString()
                        }
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                    />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F2F4F7" },
    header: {
        backgroundColor: "#3B5943",
        padding: 20,
        paddingTop: 40,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerTitle: {
        color: "white",
        fontSize: 20,
        fontWeight: "bold",
    },
    backButton: { padding: 4 },
    listContainer: { flex: 1 },
    listContent: { padding: 15 },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    loadingText: {
        color: "#3B5943",
        fontSize: 16,
        fontWeight: "600",
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    emptyText: {
        marginTop: 10,
        color: "#666",
        fontSize: 16,
    },
    card: {
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    thumbnail: {
        width: 60,
        height: 80,
        borderRadius: 6,
        marginRight: 15,
        backgroundColor: "#eee",
    },
    thumbnailPlaceholder: {
        width: 60,
        height: 80,
        borderRadius: 6,
        marginRight: 15,
        backgroundColor: "#eee",
        justifyContent: "center",
        alignItems: "center",
    },
    thumbnailPlaceholderInline: {
        width: 44,
        height: 44,
        borderRadius: 8,
        marginRight: 12,
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#e6e6e6",
    },
    cardContent: {
        flex: 1,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 4,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#333",
    },
    cardSubtitle: {
        fontSize: 12,
        color: "#888",
        marginBottom: 8,
    },
    scoreRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    scoreBadge: {
        backgroundColor: "#E8F5E9",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    scoreText: {
        color: "#2E7D32",
        fontWeight: "bold",
        fontSize: 12,
    },
    percentageText: {
        color: "#2E7D32",
        fontWeight: "bold",
        fontSize: 12,
    },
    itemsText: {
        color: "#666",
        fontSize: 12,
    },
});
