/**
 * components/ui/ToastConfig.tsx
 *
 * Toast type registry for the entire app.
 * Mounted at root level in _layout.tsx - applies to every screen.
 *
 * Types:
 *   success        - generic success
 *   error          - generic error
 *   info           - generic info / warning
 *   save_result    - Firestore save succeeded (shows score summary)
 *   save_offline   - Firestore unavailable; queued offline
 *   save_retry     - Save failed; shows a Retry button with pulse animation
 *   delete_result  - Class or exam permanently deleted (red tint)
 *   archive_result - Class or exam moved to archived (amber tint)
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

// ── Re-usable retry button with pulse animation ───────────────────────────

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
  // ── Generic types ─────────────────────────────────────────────────────

  success: (props) => (
    <BaseToast
      {...props}
      style={styles.successToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      renderLeadingIcon={() => (
        <View style={[styles.iconContainer, styles.iconSuccess]}>
          <Ionicons name="checkmark" size={16} color="#1F2937" />
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
        <View style={[styles.iconContainer, styles.iconError]}>
          <Ionicons name="close" size={16} color="#1F2937" />
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
        <View style={[styles.iconContainer, styles.iconInfo]}>
          <Ionicons name="information-circle" size={16} color="#1F2937" />
        </View>
      )}
    />
  ),

  // ── Firestore save succeeded ──────────────────────────────────────────

  save_result: ({ text1, text2 }) => (
    <View style={[styles.toastBase, styles.saveResultToast]}>
      <View style={[styles.iconContainer, styles.iconSuccess]}>
        <Ionicons name="checkmark" size={16} color="#1F2937" />
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

  // ── Queued offline  Ewill sync when online ────────────────────────────

  save_offline: ({ text1, text2 }) => (
    <View style={[styles.toastBase, styles.saveOfflineToast]}>
      <View style={[styles.iconContainer, styles.iconWarn]}>
        <Ionicons name="cloud-offline-outline" size={16} color="#1F2937" />
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

  // ── Save failed  Eretry button with pulse animation ───────────────────

  save_retry: ({ text1, text2, props }) => (
    <View style={[styles.toastBase, styles.saveRetryToast]}>
      <View style={[styles.iconContainer, styles.iconError]}>
        <Ionicons name="close" size={16} color="#1F2937" />
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

  delete_result: ({ text1, text2 }) => (
    <View style={[styles.toastBase, styles.deleteResultToast]}>
      <View style={[styles.iconContainer, styles.iconDelete]}>
        <Ionicons name="trash-outline" size={16} color="#1F2937" />
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

  archive_result: ({ text1, text2 }) => (
    <View style={[styles.toastBase, styles.archiveResultToast]}>
      <View style={[styles.iconContainer, styles.iconWarn]}>
        <Ionicons name="archive-outline" size={16} color="#1F2937" />
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
};

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── BaseToast overrides ──────────────────────────────────────────────
  successToast: {
    borderLeftColor: "#22C55E",
    backgroundColor: "#F1FBF5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFE7CC",
    marginHorizontal: 20,
  },
  errorToast: {
    borderLeftColor: "#EF4444",
    backgroundColor: "#FFF1F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F5C2C7",
    marginHorizontal: 20,
  },
  infoToast: {
    borderLeftColor: "#3B82F6",
    backgroundColor: "#EEF5FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C7DAFF",
    marginHorizontal: 20,
  },
  contentContainer: {
    paddingHorizontal: 10,
  },

  // ── Icon badge ───────────────────────────────────────────────────────
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: 12,
  },
  iconSuccess: {
    backgroundColor: "#A7F3D0",
  },
  iconError: {
    backgroundColor: "#FECACA",
  },
  iconInfo: {
    backgroundColor: "#BFDBFE",
  },
  iconWarn: {
    backgroundColor: "#FDE68A",
  },
  iconDelete: {
    backgroundColor: "#FECACA",
  },

  // ── Typography ───────────────────────────────────────────────────────
  text1: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  text2: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 3,
  },

  // ── Shared custom toast base ─────────────────────────────────────────
  toastBase: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    borderRadius: 12,
    paddingVertical: 10,
    paddingRight: 14,
    minHeight: 56,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  textBlock: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: "center",
  },

  // ── save_result: soft green ──────────────────────────────────────────
  saveResultToast: {
    backgroundColor: "#F1FBF5",
    borderLeftWidth: 4,
    borderLeftColor: "#22C55E",
    borderColor: "#BFE7CC",
  },

  // ── save_offline: amber ──────────────────────────────────────────────
  saveOfflineToast: {
    backgroundColor: "#FFFAEB",
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
    borderColor: "#F6D8A8",
  },

  // ── save_retry: red ──────────────────────────────────────────────────
  saveRetryToast: {
    backgroundColor: "#FFF1F2",
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
    borderColor: "#F5C2C7",
  },

  deleteResultToast: {
    backgroundColor: "#FFF1F2",
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
    borderColor: "#F5C2C7",
  },

  archiveResultToast: {
    backgroundColor: "#FFFAEB",
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
    borderColor: "#F6D8A8",
  },

  // ── Pulse retry button ───────────────────────────────────────────────
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginLeft: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});








