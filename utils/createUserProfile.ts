import { auth, db } from "@/config/firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

/**
 * Utility to create user profile in Firestore
 * This is for testing/setup purposes
 */
export const createUserProfile = async (
  userId: string,
  profileData: {
    email: string;
    fullName: string;
    instructorId: string;
    role?: string;
  },
) => {
  try {
    const userRef = doc(db, "users", userId);

    await setDoc(userRef, {
      email: profileData.email,
      fullName: profileData.fullName,
      instructorId: profileData.instructorId,
      role: profileData.role || "instructor",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log("User profile created successfully:", userId);
    return true;
  } catch (error) {
    console.error("Error creating user profile:", error);
    return false;
  }
};

/**
 * Create profile for current user
 */
export const createCurrentUserProfile = async (
  fullName: string,
  instructorId: string,
) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("No user logged in");
  }

  return createUserProfile(currentUser.uid, {
    email: currentUser.email || "",
    fullName,
    instructorId,
  });
};

/**
 * Example usage in console or for testing:
 *
 * import { createCurrentUserProfile } from "@/utils/createUserProfile";
 *
 * // Create profile for current user
 * await createCurrentUserProfile("Maverick Lance Coronel", "INSTRUCTOR-008");
 */
