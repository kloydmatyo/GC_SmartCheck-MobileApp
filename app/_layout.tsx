import NetInfo from "@react-native-community/netinfo";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import * as NavigationBar from "expo-navigation-bar";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, AppStateStatus, Platform, StyleSheet, Text, View } from "react-native";
import "react-native-get-random-values";
import "react-native-reanimated";
import Toast from "react-native-toast-message";

import { toastConfig } from "@/components/ui/ToastConfig";
import { auth } from "@/config/firebase";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { SyncService } from "@/services/syncService";

export const unstable_settings = {
  initialRouteName: "sign-in",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  // Hide Android navigation bar
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync("hidden");
      NavigationBar.setBehaviorAsync("overlay-swipe");
    }
  }, []);

  const performSync = async () => {
    if (isSyncingRef.current) return;

    try {
      isSyncingRef.current = true;
      const netState = await NetInfo.fetch();

      if (netState.isConnected && netState.isInternetReachable && auth.currentUser) {
        setIsSyncing(true);
        console.log("[RootLayout] Triggering background sync...");
        await SyncService.syncPendingUpdates();
        console.log("[RootLayout] Background sync complete");
      }
    } catch (err) {
      console.warn("Background sync error:", err);
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
            <ActivityIndicator color="#6B7280" size="small" />
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ECEEF2',
    gap: 10,
    shadowColor: '#0E1628',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  syncText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  }
});
