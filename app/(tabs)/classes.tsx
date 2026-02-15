import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface ClassItem {
  id: string;
  code: string;
  name: string;
  section: string;
  students: number;
  schedule: string;
}

export default function ClassesScreen() {
  const [searchQuery, setSearchQuery] = useState("");

  // Mock data
  const classes: ClassItem[] = [
    {
      id: "1",
      code: "BS1T3B",
      name: "Systems Integration and Architecture 1",
      section: "LEC",
      students: 45,
      schedule: "MWF 10:00-11:30 AM",
    },
    {
      id: "2",
      code: "BS2T1A",
      name: "Database Management Systems",
      section: "LAB",
      students: 38,
      schedule: "TTH 1:00-4:00 PM",
    },
    {
      id: "3",
      code: "BS3T2C",
      name: "Web Development",
      section: "LEC",
      students: 42,
      schedule: "MWF 2:00-3:30 PM",
    },
  ];

  const filteredClasses = classes.filter(
    (cls) =>
      cls.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderClassCard = ({ item }: { item: ClassItem }) => (
    <TouchableOpacity style={styles.classCard}>
      <View style={styles.classHeader}>
        <View>
          <Text style={styles.classCode}>{item.code}</Text>
          <Text style={styles.className}>{item.name}</Text>
          <Text style={styles.classSection}>{item.section}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#666" />
      </View>
      <View style={styles.classFooter}>
        <View style={styles.classInfo}>
          <Ionicons name="people" size={16} color="#666" />
          <Text style={styles.classInfoText}>{item.students} Students</Text>
        </View>
        <View style={styles.classInfo}>
          <Ionicons name="time" size={16} color="#666" />
          <Text style={styles.classInfoText}>{item.schedule}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Classes</Text>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add-circle" size={28} color="#00a550" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#666"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search classes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
      </View>

      {/* Classes List */}
      <FlatList
        data={filteredClasses}
        renderItem={renderClassCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="school-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No classes found</Text>
          </View>
        }
      />
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  addButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: "#333",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  classCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  classHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  classCode: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00a550",
    marginBottom: 4,
  },
  className: {
    fontSize: 16,
    color: "#333",
    marginBottom: 4,
  },
  classSection: {
    fontSize: 14,
    color: "#666",
  },
  classFooter: {
    gap: 8,
  },
  classInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  classInfoText: {
    fontSize: 14,
    color: "#666",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
  },
});
