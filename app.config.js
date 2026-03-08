const dotenv = require("dotenv");
const path = require("path");

// Load .env.local with absolute path
const result = dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// Debug: log if env loading failed
if (result.error) {
  console.error("Error loading .env.local:", result.error);
} else {
  console.log("Successfully loaded .env.local");
}

module.exports = {
  expo: {
    name: "GC_SmartCheck-MobileApp",
    slug: "gcsmartcheck-mobileapp",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/gordon-college-logo.png",
    scheme: "gcsmartcheckmobileapp",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.anonymous.GC-SmartCheckMobileApp",
      infoPlist: {
        NSCameraUsageDescription:
          "This app needs camera access to scan answer sheets and grade exams.",
        NSPhotoLibraryUsageDescription:
          "This app needs photo library access to select answer sheets for grading.",
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#00a550",
        foregroundImage: "./assets/images/gordon-college-logo.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.anonymous.gcsmartcheckmobileapp",
      navigationBar: {
        visible: "immersive",
        barStyle: "light-content",
        backgroundColor: "#00000000",
      },
      softwareKeyboardLayoutMode: "pan",
      userInterfaceStyle: "automatic",
    },
    web: {
      output: "static",
      favicon: "./assets/images/gordon-college-logo.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/gordon-college-logo.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "b7937d33-03a3-4010-b609-9a07e0f17386",
      },
      // Expose Firebase config to the app
      firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId:
        process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      firebaseMeasurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
    },
  },
};
