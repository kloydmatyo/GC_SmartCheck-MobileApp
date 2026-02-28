import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS, RADIUS } from "@/constants/theme";

type StatusType = "success" | "error" | "info";

interface StatusModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: StatusType;
  buttonText?: string;
  onClose: () => void;
}

const statusTheme: Record<StatusType, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { color: COLORS.success, icon: "checkmark-circle-outline" },
  error: { color: COLORS.error, icon: "alert-circle-outline" },
  info: { color: COLORS.secondary, icon: "information-circle-outline" },
};

export default function StatusModal({
  visible,
  title,
  message,
  type = "info",
  buttonText = "OK",
  onClose,
}: StatusModalProps) {
  const theme = statusTheme[type];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={[styles.iconWrap, { backgroundColor: "#f0f9f4" }]}>
            <Ionicons name={theme.icon} size={24} color={theme.color} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.okButton, { backgroundColor: theme.color }]}
              onPress={onClose}
            >
              <Text style={styles.okText}>{buttonText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.large,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  okButton: {
    minWidth: 110,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.small,
    alignItems: "center",
  },
  okText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.white,
  },
});
