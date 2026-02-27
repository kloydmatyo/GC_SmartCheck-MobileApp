import NetInfo from "@react-native-community/netinfo";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
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

  // Offline sync on app resume 
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const wasBackground =
        appState.current === "background" || appState.current === "inactive";
      const isNowActive = nextAppState === "active";

      if (wasBackground && isNowActive) {
        // Check connectivity before attempting to sync
        const netState = await NetInfo.fetch();
        if (netState.isConnected && netState.isInternetReachable) {
          GradeStorageService.syncOfflineQueue();
        }
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
    </ThemeProvider>
  );
}
