import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { Platform } from "react-native";

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Custom AsyncStorage persistence for Firebase Auth (compatible with Firebase v12)
const asyncStoragePersistence = {
  type: "LOCAL" as const,
  async _isAvailable() {
    try {
      await AsyncStorage.setItem("__test__", "1");
      await AsyncStorage.removeItem("__test__");
      return true;
    } catch {
      return false;
    }
  },
  async _set(key: string, value: string) {
    await AsyncStorage.setItem(key, value);
  },
  async _get(key: string) {
    return AsyncStorage.getItem(key);
  },
  async _remove(key: string) {
    await AsyncStorage.removeItem(key);
  },
  _addListener(_key: string, _listener: unknown) {},
  _removeListener(_key: string, _listener: unknown) {},
};

// Initialize Firebase Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence:
    Platform.OS === "web" ? inMemoryPersistence : asyncStoragePersistence,
});

// Initialize Firestore
export const db = getFirestore(app);

export default app;
