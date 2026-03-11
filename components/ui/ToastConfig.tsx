/**
 * components/ui/ToastConfig.tsx
 *
 * Toast type registry for the entire app.
 * Mounted at root level in _layout.tsx — applies to every screen.
 *
 * Types:
 *   success       — generic success
 *   error         — generic error
 *   info          — generic info / warning
 *   save_result   — Firestore save succeeded (shows score summary)
 *   save_offline  — Firestore unavailable; queued offline
 *   save_retry    — Save failed; shows a Retry button with pulse animation
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BaseToast, ErrorToast, ToastConfig } from "react-native-toast-message";

// ── Re-usable retry button with pulse animation (#4, #5) ──────────────────

function RetryButton({ onPress }: { onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <TouchableOpacity style={styles.retryBtn} onPress={onPress}>
        <Ionicons name="refresh" size={12} color="#fff" />
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Toast Config ──────────────────────────────────────────────────────────

export const toastConfig: ToastConfig = {
  // ── Existing generic types ────────────────────────────────────────────

  success: (props) => (
    <BaseToast
      {...props}
      style={styles.successToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
        </View>
      )}
    />
  ),

  error: (props) => (
    <ErrorToast
      {...props}
      style={styles.errorToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="close-circle" size={24} color="#F44336" />
        </View>
      )}
    />
  ),

  info: (props) => (
    <BaseToast
      {...props}
      style={styles.infoToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="information-circle" size={24} color="#2196F3" />
        </View>
      )}
    />
  ),

  // ── New: Firestore save succeeded (#1, #2, #3) ────────────────────────

  save_result: ({ text1, text2 }) => (
    <View style={[styles.toastBase, styles.saveResultToast]}>
      <View style={styles.iconContainer}>
        <Ionicons name="cloud-done" size={26} color="#00a550" />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.text1} numberOfLines={1}>
          {text1}
        </Text>
        {text2 ? (
          <Text style={styles.text2} numberOfLines={2}>
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  ),

  // ── New: Queued offline — will sync when online (#3) ─────────────────

  save_offline: ({ text1, text2 }) => (
    <View style={[styles.toastBase, styles.saveOfflineToast]}>
      <View style={styles.iconContainer}>
        <Ionicons name="cloud-offline" size={26} color="#F5A623" />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.text1} numberOfLines={1}>
          {text1}
        </Text>
        {text2 ? (
          <Text style={styles.text2} numberOfLines={2}>
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  ),

  // ── New: Save failed — retry button with pulse animation (#3, #4, #5) ─

  save_retry: ({ text1, text2, props }) => (
    <View style={[styles.toastBase, styles.saveRetryToast]}>
      <View style={styles.iconContainer}>
        <Ionicons name="cloud-offline" size={26} color="#F44336" />
      </View>
      <View style={[styles.textBlock, { flex: 1 }]}>
        <Text style={styles.text1} numberOfLines={1}>
          {text1}
        </Text>
        {text2 ? (
          <Text style={styles.text2} numberOfLines={2}>
            {text2}
          </Text>
        ) : null}
      </View>
      {props?.onRetry ? (
        <RetryButton onPress={props.onRetry} />
      ) : null}
    </View>
  ),
};

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Existing BaseToast overrides ────────────────────────────────────
  successToast: {
    borderLeftColor: "#4CAF50",
    backgroundColor: "white",
    borderRadius: 8,
    marginHorizontal: 20,
  },
  errorToast: {
    borderLeftColor: "#F44336",
    backgroundColor: "white",
    borderRadius: 8,
    marginHorizontal: 20,
  },
  infoToast: {
    borderLeftColor: "#2196F3",
    backgroundColor: "white",
    borderRadius: 8,
    marginHorizontal: 20,
  },
  contentContainer: {
    paddingHorizontal: 15,
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 15,
  },
  text1: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  text2: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },

  // ── Shared custom toast base ────────────────────────────────────────
  toastBase: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    borderRadius: 10,
    paddingVertical: 12,
    paddingRight: 14,
    minHeight: 60,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  textBlock: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: "center",
  },

  // ── save_result: soft green — GC brand ─────────────────────────────
  saveResultToast: {
    backgroundColor: "#f0f9f4",
    borderLeftWidth: 5,
    borderLeftColor: "#00a550",
  },

  // ── save_offline: amber ─────────────────────────────────────────────
  saveOfflineToast: {
    backgroundColor: "#fefae8",
    borderLeftWidth: 5,
    borderLeftColor: "#F5A623",
  },

  // ── save_retry: red — save failed ───────────────────────────────────
  saveRetryToast: {
    backgroundColor: "#fff4f4",
    borderLeftWidth: 5,
    borderLeftColor: "#F44336",
  },

  // ── Pulse retry button ──────────────────────────────────────────────
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F44336",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
