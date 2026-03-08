import NetInfo from "@react-native-community/netinfo";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, AppStateStatus, StyleSheet, Text, View } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import "react-native-reanimated";
import Toast from "react-native-toast-message";

import { toastConfig } from "@/components/ui/ToastConfig";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { GradeStorageService } from "@/services/gradeStorageService";

export const unstable_settings = {
  initialRouteName: "sign-in",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const performSync = async () => {
    if (isSyncingRef.current) return;

    try {
      isSyncingRef.current = true;
      const netState = await NetInfo.fetch();
      if (netState.isConnected && netState.isInternetReachable) {
        const count = await GradeStorageService.getOfflineItemCount();
        if (count > 0) {
          setIsSyncing(true);
          await GradeStorageService.syncOfflineQueue();
        }
      }
    } catch (err) {
      console.warn("Sync error:", err);
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  };

  // Initial sync on mount
  useEffect(() => {
    const performInitialSync = async () => {
      // Small delay to ensure all services are ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      await performSync();
    };
    performInitialSync();
  }, []);

  // Offline sync on app resume 
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const wasBackground =
        appState.current === "background" || appState.current === "inactive";
      const isNowActive = nextAppState === "active";

      if (wasBackground && isNowActive) {
        await performSync();
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="auto" />
      <Toast config={toastConfig} />
      {isSyncing && (
        <View style={styles.syncOverlay} pointerEvents="none">
          <View style={styles.syncContainer}>
            <ActivityIndicator color="white" size="small" />
            <Text style={styles.syncText}>Syncing Data...</Text>
          </View>
        </View>
      )}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  syncOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    paddingTop: 60, // Place it nicely below standard top safe area
  },
  syncContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  syncText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  }
});
