import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithCredential,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
  const [email, setEmail] = useState("user1@gordoncollege.edu.ph");
  const [password, setPassword] = useState("ccs123");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [useFirebase, setUseFirebase] = useState(true);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    });
  }, []);

  const GC_DOMAIN = "gordoncollege.edu.ph";

  const isGCDomain = (email: string | null) =>
    !!email?.toLowerCase().endsWith(`@${GC_DOMAIN}`);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      const googleEmail = userInfo.data?.user?.email ?? null;

      if (!idToken) throw new Error("No ID token returned from Google.");

      // Domain validation — block non-GC accounts before touching Firebase
      if (!isGCDomain(googleEmail)) {
        await GoogleSignin.signOut();
        Alert.alert(
          "Access Restricted",
          `Only @${GC_DOMAIN} accounts are allowed.\n\nPlease sign in with your Gordon College email.`,
        );
        setIsLoading(false);
        return;
      }

      await handleGoogleCredential(idToken, googleEmail!);
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled, do nothing
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // sign-in already in progress
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert(
          "Error",
          "Google Play Services is not available on this device.",
        );
      } else {
        console.error("Google sign-in error:", error);
        Alert.alert(
          "Google Sign-In Failed",
          error.message ?? "Please try again.",
        );
      }
      setIsLoading(false);
    }
  };

  const handleGoogleCredential = async (
    idToken: string,
    googleEmail: string,
  ) => {
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const { user } = userCredential;

      // Double-check domain on the Firebase user email (token could differ)
      if (!isGCDomain(user.email)) {
        await user.delete();
        await GoogleSignin.signOut();
        Alert.alert(
          "Access Restricted",
          `Only @${GC_DOMAIN} accounts are allowed.`,
        );
        setIsLoading(false);
        return;
      }

      // Check if user is registered in Firestore
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        // Not registered — delete the auth user so it doesn't linger
        await user.delete();
        await GoogleSignin.signOut();
        Alert.alert(
          "Account Not Found",
          `No account exists for ${user.email}.\n\nPlease sign up first using your GC email, then verify it before signing in.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Sign Up", onPress: () => router.push("/sign-up") },
          ],
        );
        setIsLoading(false);
        return;
      }

      // Preload offline data
      const netState = await NetInfo.fetch();
      if (netState.isConnected && netState.isInternetReachable) {
        try {
          const { SyncService } = await import("@/services/syncService");
          await SyncService.syncPendingUpdates();
        } catch (syncError) {
          console.warn("[GoogleSignIn] Sync failed:", syncError);
        }
      }

      router.replace("/(tabs)");
    } catch (error: any) {
      console.error("Google credential error:", error);
      let message = "Please try again.";
      if (error.code === "auth/network-request-failed") {
        message = "Network error. Please check your internet connection.";
      } else if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/invalid-id-token"
      ) {
        message = "Your session has expired. Please sign in again.";
      } else if (error.message) {
        message = error.message;
      }
      Alert.alert("Google Sign-In Failed", message);
    } finally {
      setIsLoading(false);
    }
  };

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

        // 1. Get user data from Firestore
        const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;

        // 2. Block unverified accounts
        if (!userCredential.user.emailVerified) {
          await auth.signOut();
          Alert.alert(
            "Email Not Verified",
            "Please verify your email before signing in. Check your inbox for the verification link.",
            [
              { text: "OK" },
              {
                text: "Resend Email",
                onPress: async () => {
                  try {
                    await sendEmailVerification(userCredential.user);
                    Alert.alert(
                      "Sent",
                      "Verification email resent. Please check your inbox and spam/junk folder.",
                    );
                  } catch {
                    Alert.alert(
                      "Error",
                      "Could not resend verification email. Please try again.",
                    );
                  }
                },
              },
            ],
          );
          return;
        }

        // 3. Trigger data preload to Realm (Primary Cache)
        const netState = await NetInfo.fetch();
        if (netState.isConnected && netState.isInternetReachable) {
          setIsLoading(true); // Ensure loading state is still active
          try {
            const { SyncService } = await import("@/services/syncService");
            console.log("[SignIn] Preloading data for offline use...");
            await SyncService.syncPendingUpdates();
          } catch (syncError) {
            console.warn(
              "[SignIn] Initial sync failed, proceeding to dashboard:",
              syncError,
            );
          }
        }

        // 3. Navigate to Dashboard
        router.replace("/(tabs)");
        if (userData?.fullName) {
          Alert.alert("Success", `Welcome back, ${userData.fullName}!`);
        }
      } else {
        // Fallback to dummy accounts for testing
        const result = authService.signIn(email, password);

        if (result.success) {
          router.replace("/(tabs)");
          Alert.alert("Success", `Welcome ${result.user?.name}!`);
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
        if (isGCDomain(email)) {
          Alert.alert(
            "No Account Found",
            `No account exists for ${email}.\n\nWould you like to sign up with your GC email?`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Sign Up", onPress: () => router.push("/sign-up") },
            ],
          );
          return;
        }
        errorMessage = "No account found with this email.";
      } else if (error.code === "auth/wrong-password") {
        errorMessage = "Incorrect password.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/user-disabled") {
        errorMessage = "This account has been disabled.";
      } else if (error.code === "auth/invalid-credential") {
        if (isGCDomain(email)) {
          Alert.alert(
            "Sign In Failed",
            "Invalid credentials. If you don't have an account yet, would you like to sign up?",
            [
              { text: "Try Again", style: "cancel" },
              { text: "Sign Up", onPress: () => router.push("/sign-up") },
            ],
          );
          return;
        }
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
                    placeholder="enter password"
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

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Sign-In Button */}
              <TouchableOpacity
                style={[
                  styles.googleButton,
                  isLoading && styles.signInButtonDisabled,
                ]}
                onPress={handleGoogleSignIn}
                disabled={isLoading}
              >
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleButtonText}>
                  Continue with Google
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
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dividerText: {
    color: "#d0d0d0",
    fontSize: 13,
    marginHorizontal: 10,
  },
  googleButton: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 8,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  googleG: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4285F4",
    marginRight: 10,
  },
  googleButtonText: {
    color: "#333",
    fontSize: 15,
    fontWeight: "600",
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
