import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
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

export default function SignUpScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = (email: string) => {
    return email.endsWith("@gordoncollege.edu.ph");
  };

  const handleSignUp = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }

    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert(
        "Invalid Email",
        "Please use your Gordon College email (@gordoncollege.edu.ph)",
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      // Create user document in Firestore
      await setDoc(doc(db, "users", userCredential.user.uid), {
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        role: "instructor",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      Alert.alert("Success", "Account created successfully! Please sign in.", [
        {
          text: "OK",
          onPress: () => router.replace("/sign-in"),
        },
      ]);
    } catch (error: any) {
      console.error("Sign up error:", error);

      let errorMessage = "Failed to create account. Please try again.";

      if (error.code === "auth/email-already-in-use") {
        errorMessage = "This email is already registered. Please sign in.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Password is too weak. Please use a stronger password.";
      }

      Alert.alert("Sign Up Failed", errorMessage);
    } finally {
      setIsLoading(false);
    }
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
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.contentContainer}>
              {/* Back Button */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>

              {/* Logo */}
              <Image
                source={require("../assets/images/gordon-college-logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />

              {/* Welcome Text */}
              <Text style={styles.welcomeText}>Create Account</Text>
              <Text style={styles.subtitleText}>Join GC Zip Grade System</Text>

              {/* Full Name Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Full Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="person"
                    size={20}
                    color="#666"
                    style={styles.icon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your full name"
                    placeholderTextColor="#999"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email Address</Text>
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

              {/* Confirm Password Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed"
                    size={20}
                    color="#666"
                    style={styles.icon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm your password"
                    placeholderTextColor="#999"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={showConfirmPassword ? "eye" : "eye-off"}
                      size={20}
                      color="#666"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign Up Button */}
              <TouchableOpacity
                style={[
                  styles.signUpButton,
                  isLoading && styles.signUpButtonDisabled,
                ]}
                onPress={handleSignUp}
                disabled={isLoading}
              >
                <Text style={styles.signUpButtonText}>
                  {isLoading ? "Creating Account..." : "Sign Up"}
                </Text>
              </TouchableOpacity>

              {/* Sign In Link */}
              <View style={styles.signInContainer}>
                <Text style={styles.signInText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.push("/sign-in")}>
                  <Text style={styles.signInLink}>Sign In</Text>
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
  backButton: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: "center",
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 14,
    color: "#d0d0d0",
    textAlign: "center",
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 16,
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
  signUpButton: {
    backgroundColor: "#00a550",
    borderRadius: 8,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  signUpButtonDisabled: {
    backgroundColor: "#006030",
    opacity: 0.7,
  },
  signUpButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  signInContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 32,
  },
  signInText: {
    color: "#d0d0d0",
    fontSize: 14,
  },
  signInLink: {
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
