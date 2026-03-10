import React, { useState, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import ScannerScreen from "../../components/scanner/ScannerScreen";

export default function ScannerTab() {
  const router = useRouter();
  const { quick } = useLocalSearchParams<{ quick?: string }>();
  const [scannerKey, setScannerKey] = useState(() => Date.now());

  useEffect(() => {
    if (quick) {
      setScannerKey(Date.now());
    }
  }, [quick]);

  return (
    <ScannerScreen
      key={scannerKey}
      onClose={() => router.push("/")}
      resetFlag={quick}
    />
  );
}

