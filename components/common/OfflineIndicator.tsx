import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../constants/theme";
import { NetworkService } from "../../services/networkService";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [slideAnim] = useState(new Animated.Value(-50));

  useEffect(() => {
    // Initialize network service
    NetworkService.initialize();

    // Add listener for network changes
    const unsubscribe = NetworkService.addListener((connected) => {
      setIsOnline(connected);

      if (!connected) {
        // Slide down
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }).start();
      } else {
        // Slide up after a delay
        setTimeout(() => {
          Animated.spring(slideAnim, {
            toValue: -50,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }, 2000);
      }
    });

    // Check initial status
    NetworkService.isOnline().then(setIsOnline);

    return () => {
      unsubscribe();
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Ionicons name="cloud-offline" size={16} color={COLORS.white} />
      <Text style={styles.text}>You're offline</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Changes will sync when online</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FF9500",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
    zIndex: 9999,
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
