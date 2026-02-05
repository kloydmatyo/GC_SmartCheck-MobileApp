import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { BaseToast, ErrorToast, ToastConfig } from "react-native-toast-message";

export const toastConfig: ToastConfig = {
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
};

const styles = StyleSheet.create({
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
});
