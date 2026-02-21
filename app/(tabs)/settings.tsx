import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import StatusModal from "@/components/common/StatusModal";
import {
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

  const handleLogout = () => {
    setLogoutConfirmVisible(true);
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
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingLeft}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon as any} size={22} color="#00a550" />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={20} color="#999" />}
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
    <View style={styles.settingItem}>
      <View style={styles.settingLeft}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon as any} size={22} color="#00a550" />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#ccc", true: "#00a550" }}
        thumbColor="#fff"
      />
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.profileCard}>
          <Image
            source={require("@/assets/images/gordon-college-logo.png")}
            style={styles.profileImage}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Faculty User</Text>
            <Text style={styles.profileEmail}>
              faculty@gordoncollege.edu.ph
            </Text>
          </View>
          <TouchableOpacity>
            <Ionicons name="create-outline" size={24} color="#00a550" />
          </TouchableOpacity>
        </View>
      </View>

      {/* General Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>
        <View style={styles.settingsGroup}>
          <SettingToggle
            icon="notifications"
            title="Notifications"
            subtitle="Enable push notifications"
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
          <SettingToggle
            icon="moon"
            title="Dark Mode"
            subtitle="Switch to dark theme"
            value={darkModeEnabled}
            onValueChange={setDarkModeEnabled}
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
        <Text style={styles.sectionTitle}>Scanner</Text>
        <View style={styles.settingsGroup}>
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
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.settingsGroup}>
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
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.settingsGroup}>
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
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
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
        onConfirm={() => {
          setLogoutConfirmVisible(false);
          router.replace("/sign-in");
        }}
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
    marginLeft: 20,
    marginBottom: 8,
  },
  settingsGroup: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
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

