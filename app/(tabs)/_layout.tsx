import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Tabs, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { DeviceEventEmitter, StyleSheet, Text, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";

function ScannerTabButton(props: BottomTabBarButtonProps) {
  const { accessibilityState, onPress, onLongPress } = props;
  const focused = Boolean(accessibilityState?.selected);

  return (
    <View style={styles.scannerTabWrap}>
      <HapticTab
        {...props}
        onPress={onPress}
        onLongPress={onLongPress}
        style={styles.scannerPressable}
      >
        <View
          style={[
            styles.scannerButton,
            focused && styles.scannerButtonFocused,
          ]}
        >
          <Ionicons name="scan-outline" size={26} color="#FFFFFF" />
        </View>
        <Text
          style={[
            styles.scannerLabel,
            focused && styles.scannerLabelFocused,
          ]}
        >
          Scanner
        </Text>
      </HapticTab>
    </View>
  );
}

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
        active: "#20BE7B",
        inactive: "#A7B0BE",
        bg: "#FFFFFF",
        border: "#ECEEF2",
        shadow: "#0F172A",
      }
    : {
        active: "#20BE7B",
        inactive: "#A7B0BE",
        bg: "#FFFFFF",
        border: "#ECEEF2",
        shadow: "#0F172A",
      };

  return (
    <Tabs
      screenOptions={{
        sceneStyle: {
          backgroundColor: "#F7F7F8",
        },
        tabBarActiveTintColor: tabColors.active,
        tabBarInactiveTintColor: tabColors.inactive,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: tabColors.bg }} />
        ),
        tabBarStyle: {
          backgroundColor: tabColors.bg,
          borderTopWidth: 1,
          borderTopColor: tabColors.border,
          height: 96,
          paddingBottom: 12,
          paddingTop: 12,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          shadowColor: tabColors.shadow,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 14,
          overflow: "visible",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
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
              name={focused ? "book" : "book-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Scanner",
          tabBarButton: (props) => <ScannerTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="quizzes"
        options={{
          title: "Results",
          unmountOnBlur: true,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "clipboard" : "clipboard-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="batch-history"
        options={{
          title: "Archived",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "archive" : "archive-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* Hidden tabs - accessible via navigation but not shown in tab bar */}
      <Tabs.Screen
        name="students"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="generator"
        options={{
          href: null,
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
          unmountOnBlur: true,
          tabBarStyle: { display: "none" },
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
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="sync"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="edit-exam"
        options={{
          href: null,
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

const styles = StyleSheet.create({
  scannerTabWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: -22,
  },
  scannerPressable: {
    alignItems: "center",
    justifyContent: "flex-start",
    minWidth: 72,
  },
  scannerButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#20BE7B",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#20BE7B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 8,
  },
  scannerButtonFocused: {
    transform: [{ scale: 1.03 }],
  },
  scannerLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: "#A7B0BE",
    paddingBottom: 2,
  },
  scannerLabelFocused: {
    color: "#20BE7B",
  },
});
