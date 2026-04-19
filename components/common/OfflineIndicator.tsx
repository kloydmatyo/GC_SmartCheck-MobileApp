import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { COLORS } from "../../constants/theme";
import { NetworkService } from "../../services/networkService";

const BANNER_HEIGHT = 52;
const HIDDEN_OFFSET = -(BANNER_HEIGHT + 24);

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [slideAnim] = useState(new Animated.Value(HIDDEN_OFFSET));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const showBanner = () => {
      setDismissed(false);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    };

    const hideBanner = () => {
      Animated.spring(slideAnim, {
        toValue: HIDDEN_OFFSET,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    };

    // Initialize network service
    NetworkService.initialize();

    // Add listener for network changes
    const unsubscribe = NetworkService.addListener((connected) => {
      setIsOnline(connected);

      if (!connected) {
        showBanner();
      } else {
        // Slide up after a delay
        setTimeout(() => {
          hideBanner();
        }, 2000);
      }
    });

    // Check initial status
    NetworkService.isOnline().then((online) => {
      setIsOnline(online);
      setDismissed(false);
      slideAnim.setValue(online ? HIDDEN_OFFSET : 0);
    });

    return () => {
      unsubscribe();
    };
  }, [slideAnim]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dy) > 6,
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy < 0) {
        slideAnim.setValue(Math.max(HIDDEN_OFFSET, gestureState.dy));
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy < -28) {
        setDismissed(true);
        Animated.spring(slideAnim, {
          toValue: HIDDEN_OFFSET,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }).start();
        return;
      }

      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    },
  });

  if (isOnline || dismissed) {
    return null;
  }

  const topOffset =
    Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 6 : 12;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        { top: topOffset },
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Ionicons name="cloud-offline" size={16} color={COLORS.white} />
      <Text style={styles.text}>You are offline</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Changes will sync when online</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#FF9500",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
    zIndex: 9999,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  text: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "500",
  },
});
