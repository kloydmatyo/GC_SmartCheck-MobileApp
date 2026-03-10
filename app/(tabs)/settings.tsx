import ConfirmationModal from "@/components/common/ConfirmationModal";
import StatusModal from "@/components/common/StatusModal";
import { auth } from "@/config/firebase";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import React from "react";
import {
  DeviceEventEmitter,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function SettingsScreen() {
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = React.useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = React.useState(false);
  const [statusModal, setStatusModal] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: "",
    message: "",
  });

  const loadDarkModePreference = React.useCallback(async () => {
    try {
      const savedDarkMode = await AsyncStorage.getItem(DARK_MODE_STORAGE_KEY);
      setDarkModeEnabled(savedDarkMode === "true");
    } catch (error) {
      console.warn("Could not load dark mode preference:", error);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
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

  const handleDarkModeToggle = async (value: boolean) => {
    setDarkModeEnabled(value);
    try {
      await AsyncStorage.setItem(DARK_MODE_STORAGE_KEY, String(value));
      DeviceEventEmitter.emit("darkModeChanged", value);
    } catch (error) {
      console.warn("Could not save dark mode preference:", error);
    }
  };

  const colors = darkModeEnabled
    ? {
      background: "#111815",
      header: "#1a2520",
      headerText: "#e7f1eb",
      card: "#1f2b26",
      itemBg: "#22302a",
      border: "#34483f",
      itemBorder: "#2b3b34",
      text: "#e7f1eb",
      itemText: "#e7f1eb",
      textSecondary: "#d0ddd7",
      itemMuted: "#c8d6d0",
      muted: "#c1d0c9",
      accent: "#8fd1ad",
      iconBg: "#2a3a33",
      switchOff: "#4b6358",
      destructiveBg: "#2a1d1d",
      sectionChipBg: "#22302a",
      sectionChipBorder: "#34483f",
      sectionChipText: "#d0ddd7",
    }
    : {
      background: "#eef1ef",
      header: "#fff",
      headerText: "#24362f",
      card: "#3d5a3d",
      itemBg: "#3d5a3d",
      border: "#8cb09a",
      itemBorder: "#2f4a38",
      text: "#e8f5e9",
      itemText: "#e8f5e9",
      textSecondary: "#b8d4b8",
      itemMuted: "#b8d4b8",
      muted: "#b8d4b8",
      accent: "#3d5a3d",
      iconBg: "#dbe7df",
      switchOff: "#95bba6",
      destructiveBg: "#f8efe3",
      sectionChipBg: "#dbe7df",
      sectionChipBorder: "#8cb09a",
      sectionChipText: "#5e7268",
    };

  const handleLogout = () => {
    setLogoutConfirmVisible(true);
  };

  const confirmLogout = async () => {
    try {
      const { RealmService } = await import("@/services/realmService");
      const { OfflineStorageService } = await import("@/services/offlineStorageService");

      // Clear all local data on logout
      await RealmService.clearCache();
      await OfflineStorageService.clearAllData();

      await signOut(auth);
      setLogoutConfirmVisible(false);
      router.replace("/sign-in");
    } catch (error) {
      console.error("Logout error:", error);
      setStatusModal({
        visible: true,
        title: "Error",
        message: "Failed to logout. Please try again.",
      });
    }
  };

  const SettingItem = ({
    icon,
    title,
    subtitle,
    onPress,
    showArrow = true,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    showArrow?: boolean;
  }) => (
    <TouchableOpacity
      style={[
        styles.settingItem,
        { borderColor: colors.itemBorder, backgroundColor: colors.itemBg },
      ]}
      onPress={onPress}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
          <Ionicons name={icon as any} size={22} color={colors.accent} />
        </View>
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, { color: colors.itemText }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.settingSubtitle, { color: colors.itemMuted }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {showArrow && (
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      )}
    </TouchableOpacity>
  );

  const SettingToggle = ({
    icon,
    title,
    subtitle,
    value,
    onValueChange,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <View
      style={[
        styles.settingItem,
        { borderColor: colors.itemBorder, backgroundColor: colors.itemBg },
      ]}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
          <Ionicons name={icon as any} size={22} color={colors.accent} />
        </View>
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, { color: colors.itemText }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.settingSubtitle, { color: colors.itemMuted }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: darkModeEnabled ? "#5f7268" : "#c6d3cc",
          true: darkModeEnabled ? "#8fd1ad" : "#8fd1ad",
        }}
        ios_backgroundColor={darkModeEnabled ? "#5f7268" : "#c6d3cc"}
        thumbColor={value ? (darkModeEnabled ? "#f3fff8" : "#2f4a38") : "#ffffff"}
      />
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.header, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.headerText }]}>Settings</Text>
      </View>

      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View
          style={[
            styles.profileCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Image
            source={require("@/assets/images/gordon-college-logo.png")}
            style={styles.profileImage}
          />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>
              Faculty User
            </Text>
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
              faculty@gordoncollege.edu.ph
            </Text>
          </View>
          <TouchableOpacity>
            <Ionicons name="create-outline" size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* General Settings */}
      <View style={styles.section}>
        <View
          style={[
            styles.sectionTitleChip,
            {
              backgroundColor: colors.sectionChipBg,
              borderColor: colors.sectionChipBorder,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.sectionChipText }]}>
            General
          </Text>
        </View>
        <View
          style={[
            styles.settingsGroup,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowOpacity: darkModeEnabled ? 0 : 0.08,
            },
          ]}
        >
          <SettingToggle
            icon="notifications"
            title="Notifications"
            subtitle="Enable push notifications"
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
          <SettingToggle
            icon={darkModeEnabled ? "sunny" : "moon"}
            title="Dark Mode"
            subtitle={darkModeEnabled ? "Switch to light mode" : "Switch to dark mode"}
            value={darkModeEnabled}
            onValueChange={handleDarkModeToggle}
          />
          <SettingItem
            icon="language"
            title="Language"
            subtitle="English"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "Language",
                message: "Language settings",
              })
            }
          />
        </View>
      </View>

      {/* Scanner Settings */}
      <View style={styles.section}>
        <View
          style={[
            styles.sectionTitleChip,
            {
              backgroundColor: colors.sectionChipBg,
              borderColor: colors.sectionChipBorder,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.sectionChipText }]}>
            Scanner
          </Text>
        </View>
        <View
          style={[
            styles.settingsGroup,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowOpacity: darkModeEnabled ? 0 : 0.08,
            },
          ]}
        >
          <SettingItem
            icon="camera"
            title="Camera Settings"
            subtitle="Adjust camera quality"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "Camera",
                message: "Camera settings",
              })
            }
          />
          <SettingItem
            icon="document-text"
            title="Answer Key Management"
            subtitle="Manage answer keys"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "Answer Keys",
                message: "Answer key management",
              })
            }
          />
          <SettingItem
            icon="download"
            title="Export Data"
            subtitle="Export scanned results"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "Export",
                message: "Export data",
              })
            }
          />
        </View>
      </View>

      {/* Account Settings */}
      <View style={styles.section}>
        <View
          style={[
            styles.sectionTitleChip,
            {
              backgroundColor: colors.sectionChipBg,
              borderColor: colors.sectionChipBorder,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.sectionChipText }]}>
            Account
          </Text>
        </View>
        <View
          style={[
            styles.settingsGroup,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowOpacity: darkModeEnabled ? 0 : 0.08,
            },
          ]}
        >
          <SettingItem
            icon="lock-closed"
            title="Change Password"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "Password",
                message: "Change password",
              })
            }
          />
          <SettingItem
            icon="shield-checkmark"
            title="Privacy & Security"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "Privacy",
                message: "Privacy settings",
              })
            }
          />
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <View
          style={[
            styles.sectionTitleChip,
            {
              backgroundColor: colors.sectionChipBg,
              borderColor: colors.sectionChipBorder,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.sectionChipText }]}>
            About
          </Text>
        </View>
        <View
          style={[
            styles.settingsGroup,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowOpacity: darkModeEnabled ? 0 : 0.08,
            },
          ]}
        >
          <SettingItem
            icon="information-circle"
            title="About App"
            subtitle="Version 1.0.0"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "About",
                message: "GC SmartCheck v1.0.0",
              })
            }
          />
          <SettingItem
            icon="help-circle"
            title="Help & Support"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "Help",
                message: "Help & Support",
              })
            }
          />
          <SettingItem
            icon="document"
            title="Terms & Conditions"
            onPress={() =>
              setStatusModal({
                visible: true,
                title: "Terms",
                message: "Terms & Conditions",
              })
            }
          />
        </View>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={[
          styles.logoutButton,
          { backgroundColor: colors.destructiveBg, borderColor: "#e74c3c" },
        ]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out" size={20} color="#e74c3c" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      <ConfirmationModal
        visible={logoutConfirmVisible}
        title="Logout"
        message="Are you sure you want to logout?"
        cancelText="Cancel"
        confirmText="Logout"
        destructive
        onCancel={() => setLogoutConfirmVisible(false)}
        onConfirm={confirmLogout}
      />

      <StatusModal
        visible={statusModal.visible}
        type="info"
        title={statusModal.title}
        message={statusModal.message}
        onClose={() =>
          setStatusModal({
            visible: false,
            title: "",
            message: "",
          })
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  profileSection: {
    padding: 20,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: "#666",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginBottom: 0,
  },
  sectionTitleChip: {
    alignSelf: "flex-start",
    marginLeft: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#d4c5a0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  settingsGroup: {
    backgroundColor: "transparent",
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: "visible",
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 6,
    elevation: 0,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f0f9f4",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: "#333",
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
    color: "#999",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e74c3c",
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e74c3c",
  },
});
