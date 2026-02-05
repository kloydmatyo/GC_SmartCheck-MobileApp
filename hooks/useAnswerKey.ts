import { useEffect, useState } from "react";
import { GradingService } from "../services/gradingService";
import { AnswerKey } from "../types/scanning";

export function useAnswerKey() {
  const [answerKey, setAnswerKey] = useState<AnswerKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnswerKey();
  }, []);

  const loadAnswerKey = async () => {
    try {
      setIsLoading(true);
      // In production, this would load from storage or API
      const defaultKey = GradingService.getDefaultAnswerKey();
      setAnswerKey(defaultKey);
    } catch (error) {
      console.error("Error loading answer key:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateAnswerKey = (newAnswerKey: AnswerKey[]) => {
    setAnswerKey(newAnswerKey);
    // In production, save to storage or API
  };

  const resetToDefault = () => {
    const defaultKey = GradingService.getDefaultAnswerKey();
    setAnswerKey(defaultKey);
  };

  return {
    answerKey,
    isLoading,
    updateAnswerKey,
    resetToDefault,
    reload: loadAnswerKey,
  };
}
