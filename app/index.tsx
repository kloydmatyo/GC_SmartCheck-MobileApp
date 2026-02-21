import { Redirect } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { auth } from "@/config/firebase";

export default function Index() {
  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState(user ? "authenticated" : "unauthenticated");
    });
    return unsubscribe;
  }, []);

  if (authState === "loading") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#005028",
        }}
      >
        <ActivityIndicator size="large" color="#00a550" />
      </View>
    );
  }

  if (authState === "authenticated") {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/sign-in" />;
}
