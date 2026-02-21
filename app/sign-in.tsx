import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { auth, db } from "@/config/firebase";
import { authService } from "@/services/authService";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [useFirebase, setUseFirebase] = useState(true);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    setIsLoading(true);

    try {
      if (useFirebase) {
        // Firebase Authentication
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );

        // Get user data from Firestore
        const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));

        if (userDoc.exists()) {
          const userData = userDoc.data();
          Alert.alert("Success", `Welcome back, ${userData.fullName}!`, [
            {
              text: "OK",
              onPress: () => router.replace("/(tabs)"),
            },
          ]);
        } else {
          router.replace("/(tabs)");
        }
      } else {
        // Fallback to dummy accounts for testing
        const result = authService.signIn(email, password);

        if (result.success) {
          Alert.alert("Success", `Welcome ${result.user?.name}!`, [
            {
              text: "OK",
              onPress: () => router.replace("/(tabs)"),
            },
          ]);
        } else {
          Alert.alert(
            "Sign In Failed",
            result.message || "Invalid credentials",
          );
        }
      }
    } catch (error: any) {
      console.error("Sign in error:", error);

      let errorMessage = "Failed to sign in. Please try again.";

      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email.";
      } else if (error.code === "auth/wrong-password") {
        errorMessage = "Incorrect password.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/user-disabled") {
        errorMessage = "This account has been disabled.";
      } else if (error.code === "auth/invalid-credential") {
        errorMessage = "Invalid email or password.";
      }

      Alert.alert("Sign In Failed", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const showDummyAccounts = () => {
    const accounts = authService.getDummyAccounts();
    const accountList = accounts
      .map((acc) => `Email: ${acc.email}\nPassword: ${acc.password}`)
      .join("\n\n");

    Alert.alert(
      "Test Accounts (Offline Mode)",
      `Use these accounts for testing:\n\n${accountList}\n\nNote: These are dummy accounts. Use Sign Up to create a real account.`,
      [{ text: "OK" }],
    );
  };

  // Debug function to go directly to camera test
  const goToCameraTest = () => {
    router.push("/camera-test");
  };

  return (
    <ImageBackground
      source={require("../assets/images/gordon-college-bg.png")}
      style={styles.background}
      blurRadius={2}
    >
      <LinearGradient
        colors={[
          "rgba(0, 80, 40, 0.5)",
          "rgba(0, 80, 40, 0.75)",
          "rgba(0, 80, 40, 0.9)",
        ]}
        locations={[0, 0.5, 1]}
        style={styles.gradientOverlay}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentContainer}>
              {/* Logo */}
              <Image
                source={require("../assets/images/gordon-college-logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />

              {/* Welcome Text */}
              <Text style={styles.welcomeText}>Welcome Faculty</Text>
              <Text style={styles.subtitleText}>
                Sign in to access your GC Zip Grade account
              </Text>

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Faculty Email</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons
                    name="email"
                    size={20}
                    color="#666"
                    style={styles.icon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="name@gordoncollege.edu.ph"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed"
                    size={20}
                    color="#666"
                    style={styles.icon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#999"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={showPassword ? "eye" : "eye-off"}
                      size={20}
                      color="#666"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Forgot Password */}
              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              {/* Sign In Button */}
              <TouchableOpacity
                style={[
                  styles.signInButton,
                  isLoading && styles.signInButtonDisabled,
                ]}
                onPress={handleSignIn}
                disabled={isLoading}
              >
                <Text style={styles.signInButtonText}>
                  {isLoading ? "Signing In..." : "Sign In →"}
                </Text>
              </TouchableOpacity>

              {/* Test Accounts Button */}
              <TouchableOpacity
                style={styles.testAccountsButton}
                onPress={showDummyAccounts}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="key"
                  size={18}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.testAccountsText}>View Test Accounts</Text>
              </TouchableOpacity>

              {/* DEBUG BUTTON - Camera Test (Always Visible) */}
              <TouchableOpacity
                style={styles.debugButton}
                onPress={goToCameraTest}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="camera"
                  size={18}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.debugButtonText}>Debug: Camera Test</Text>
              </TouchableOpacity>

              {/* Sign Up Link */}
              <View style={styles.signUpContainer}>
                <Text style={styles.signUpText}>Don`t have an account? </Text>
                <TouchableOpacity onPress={() => router.push("/sign-up")}>
                  <Text style={styles.signUpLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <Text style={styles.footer}>
                Exclusive for Gordon College Faculty and Staff.{"\n"}© 2026
                Gordon College Zip Grade System.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  gradientOverlay: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: "center",
  },
  logo: {
    width: 120,
    height: 120,
    alignSelf: "center",
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 14,
    color: "#d0d0d0",
    textAlign: "center",
    marginBottom: 40,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: "#fff",
    marginBottom: 8,
    fontWeight: "500",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 50,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  eyeIcon: {
    padding: 4,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: "#b0d0b0",
    fontSize: 14,
  },
  signInButton: {
    backgroundColor: "#00a550",
    borderRadius: 8,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  signInButtonDisabled: {
    backgroundColor: "#006030",
    opacity: 0.7,
  },
  signInButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  testAccountsButton: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  testAccountsText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  // New debug button style
  debugButton: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 193, 7, 0.2)",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ffc107",
  },
  debugButtonText: {
    color: "#ffc107",
    fontSize: 14,
    fontWeight: "500",
  },
  signUpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 40,
  },
  signUpText: {
    color: "#d0d0d0",
    fontSize: 14,
  },
  signUpLink: {
    color: "#00ff80",
    fontSize: 14,
    fontWeight: "bold",
  },
  footer: {
    color: "#a0a0a0",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});