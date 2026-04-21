/**
 * Initialize Answer Key for 150-Question Exam
 * Call this once from your app to set up the answer key in Firebase
 */

import { db } from "@/config/firebase";
import { doc, setDoc } from "firebase/firestore";

export const initializeAnswerKeyFor150Q = async (examId: string) => {
  try {
    console.log(`[InitAnswerKey] Initializing answer key for exam: ${examId}`);
    
    // Generate default answer key: A, B, C, D, E repeating
    const answers: string[] = [];
    for (let i = 0; i < 150; i++) {
      answers.push(["A", "B", "C", "D", "E"][i % 5]);
    }
    
    const questionSettings = answers.map((ans, idx) => ({
      questionNumber: idx + 1,
      correctAnswer: ans,
      points: 1,
      choiceLabels: {
        A: "A",
        B: "B",
        C: "C",
        D: "D",
        E: "E",
      },
    }));

    const answerKeyPayload = {
      answers,
      questionSettings,
      numItems: 150,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to Firestore
    const docRef = doc(db, "answerKeys", examId);
    await setDoc(docRef, answerKeyPayload, { merge: true });

    console.log("✅ [InitAnswerKey] Answer key initialized successfully!");
    console.log(`📝 Stored ${answers.length} answers`);
    
    return answerKeyPayload;
  } catch (error) {
    console.warn("[InitAnswerKey] Warning - could not initialize answer key:", error);
    // Don't throw - just warn. The exam may already have an answer key,
    // or the user can set it up manually in Firebase Console
    return null;
  }
};

/**
 * Update specific answers in an existing answer key
 */
export const updateAnswers = async (
  examId: string,
  answersMap: Record<number, string>
) => {
  try {
    const docRef = doc(db, "answerKeys", examId);
    const docSnap = await import("firebase/firestore").then(
      (m) => m.getDoc(docRef)
    );
    
    if (!docSnap.exists()) {
      throw new Error("Answer key not found. Initialize first.");
    }

    const current = docSnap.data();
    const updatedAnswers = [...current.answers];
    const updatedSettings = [...current.questionSettings];

    for (const [qNum, answer] of Object.entries(answersMap)) {
      const idx = parseInt(qNum) - 1;
      if (idx >= 0 && idx < updatedAnswers.length) {
        updatedAnswers[idx] = answer;
        updatedSettings[idx].correctAnswer = answer;
      }
    }

    await setDoc(
      docRef,
      {
        answers: updatedAnswers,
        questionSettings: updatedSettings,
        version: (current.version || 1) + 1,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log("✅ [UpdateAnswers] Successfully updated answers");
    return true;
  } catch (error) {
    console.error("❌ [UpdateAnswers] Error:", error);
    throw error;
  }
};
