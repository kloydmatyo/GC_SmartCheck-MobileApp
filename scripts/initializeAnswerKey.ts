/**
 * Initialize Answer Key for 150-Question Exam in Firebase
 * Run this script to set up the answer key in Firestore
 * Usage: npx ts-node scripts/initializeAnswerKey.ts
 */

import { db } from "../config/firebase";
import { doc, setDoc } from "firebase/firestore";

const EXAM_ID = "iXOm5XyQ5QnhPQAnnbuR"; // Your 150-question exam

// Default answer key pattern: A, B, C, D, E repeating
const generateAnswerKey = (numQuestions: number) => {
  const answers = ["A", "B", "C", "D", "E"];
  const answerArray: string[] = [];
  
  for (let i = 0; i < numQuestions; i++) {
    answerArray.push(answers[i % 5]);
  }
  
  return answerArray;
};

const initializeAnswerKey = async () => {
  try {
    console.log(`🔧 Initializing answer key for exam: ${EXAM_ID}`);
    
    const answers = generateAnswerKey(150);
    
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
    const docRef = doc(db, "answerKeys", EXAM_ID);
    await setDoc(docRef, answerKeyPayload);

    console.log("✅ Answer key initialized successfully!");
    console.log(`📝 Stored ${answers.length} answers for exam ${EXAM_ID}`);
    console.log(`📊 Answer pattern: ${answers.slice(0, 10).join(", ")}... (repeating)`);
    
    return answerKeyPayload;
  } catch (error) {
    console.error("❌ Error initializing answer key:", error);
    throw error;
  }
};

// Run if called directly
if (require.main === module) {
  initializeAnswerKey().then(() => {
    console.log("\n✅ Done! You can now scan the exam and it will use this answer key.");
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { initializeAnswerKey };
