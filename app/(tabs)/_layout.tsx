import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Tabs, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { DeviceEventEmitter, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";

export default function TabLayout() {
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  const loadDarkModePreference = useCallback(async () => {
    try {
      const savedDarkMode = await AsyncStorage.getItem(DARK_MODE_STORAGE_KEY);
      setDarkModeEnabled(savedDarkMode === "true");
    } catch (error) {
      console.warn("Failed to load dark mode preference:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await loadDarkModePreference();
        if (!active) return;
      })();
      return () => {
        active = false;
      };
    }, [loadDarkModePreference]),
  );

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "darkModeChanged",
      (value: boolean) => {
        setDarkModeEnabled(Boolean(value));
      },
    );
    return () => subscription.remove();
  }, []);

  const tabColors = darkModeEnabled
    ? {
        active: "#8fd1ad",
        inactive: "#9db1a6",
        bg: "#1a2520",
        border: "#2b3b34",
        shadow: "#000000",
      }
    : {
        active: "#00a550",
        inactive: "#666",
        bg: "#f5f5f5",
        border: "#e0e0e0",
        shadow: "#000000",
      };

  return (
    <Tabs
      screenOptions={{
        sceneStyle: {
          backgroundColor: darkModeEnabled ? "#111815" : "#f5f5f5",
        },
        tabBarActiveTintColor: tabColors.active,
        tabBarInactiveTintColor: tabColors.inactive,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: () => <View style={{ flex: 1, backgroundColor: tabColors.bg }} />,
        tabBarStyle: {
          backgroundColor: tabColors.bg,
          borderTopWidth: 1,
          borderTopColor: tabColors.border,
          height: 66,
          paddingBottom: 9,
          paddingTop: 8,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          shadowColor: tabColors.shadow,
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: darkModeEnabled ? 0.35 : 0.08,
          shadowRadius: 8,
          elevation: 12,
          overflow: "hidden",
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: "Classes",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "school" : "school-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="quizzes"
        options={{
          title: "Quizzes",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "book" : "book-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          title: "Students",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "settings" : "settings-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* Hidden tabs - accessible via navigation but not shown in tab bar */}
      <Tabs.Screen
        name="scanner"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="generator"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="demo"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="create-quiz"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
          unmountOnBlur: true,
        }}
      />
      <Tabs.Screen
        name="edit-answer-key"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="exam-preview"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="class-details"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="print-answer-sheet"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="batch-history"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="sync"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="edit-exam"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="exam-stats"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
