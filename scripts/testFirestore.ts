import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import * as dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function test() {
  const q = query(collection(db, "students"));
  const snapshot = await getDocs(q);
  console.log("Students count:", snapshot.docs.length);
  if(snapshot.docs.length > 0) {
      console.log(snapshot.docs[0].data());
  }

  const q2 = query(collection(db, "users"));
  const snapshot2 = await getDocs(q2);
  console.log("Users count:", snapshot2.docs.length);
  if(snapshot2.docs.length > 0) {
      console.log(snapshot2.docs[0].data());
  }
}
test().catch(console.error);
