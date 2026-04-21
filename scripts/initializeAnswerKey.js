/**
 * Initialize Answer Key for 150-Question Exam in Firebase
 * Run this script to set up the answer key in Firestore
 * Usage: node scripts/initializeAnswerKey.js
 */

const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase Admin (uses default credentials if GOOGLE_APPLICATION_CREDENTIALS is set)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();
const EXAM_ID = "iXOm5XyQ5QnhPQAnnbuR"; // Your 150-question exam

// Default answer key pattern: A, B, C, D, E repeating
const generateAnswerKey = (numQuestions) => {
  const answers = ["A", "B", "C", "D", "E"];
  const answerArray = [];
  
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
    await db.collection("answerKeys").doc(EXAM_ID).set(answerKeyPayload);

    console.log("✅ Answer key initialized successfully!");
    console.log(`📝 Stored ${answers.length} answers for exam ${EXAM_ID}`);
    console.log(`📊 Answer pattern: ${answers.slice(0, 10).join(", ")}...`);
    console.log("\n🎯 Your answer key is now in Firebase!");
    console.log("📱 Try scanning again on your device - it should now detect answers and grade correctly.");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error initializing answer key:", error);
    process.exit(1);
  }
};

// Run
initializeAnswerKey();
