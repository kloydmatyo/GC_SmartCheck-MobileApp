import React, { useState, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import ScannerScreen from "../../components/scanner/ScannerScreen";

export default function ScannerTab() {
  const router = useRouter();
  const { quick, classId, examId } = useLocalSearchParams<{ 
    quick?: string; 
    classId?: string; 
    examId?: string; 
  }>();
  const [scannerKey, setScannerKey] = useState(() => Date.now());

  useEffect(() => {
    if (quick || classId || examId) {
      setScannerKey(Date.now());
    }
  }, [quick, classId, examId]);

  return (
    <ScannerScreen
      key={scannerKey}
      onClose={() => {
        if (router.canGoBack()) {
          router.back();
          return;
        }
        if (classId) {
          router.replace(`/(tabs)/class-details?classId=${classId}&tab=scan`);
          return;
        }
        router.replace("/(tabs)/index");
      }}
      resetFlag={quick}
      initialClassId={classId}
      initialExamId={examId}
    />
  );
}

