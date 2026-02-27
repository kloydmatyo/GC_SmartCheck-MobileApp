import { auth, db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  instructorId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserService {
  /**
   * Get user profile data including instructorId
   */
  static async getUserProfile(userId?: string): Promise<UserProfile | null> {
    try {
      const currentUser = auth.currentUser;
      const targetUserId = userId || currentUser?.uid;

      if (!targetUserId) {
        console.log("No user ID provided");
        return null;
      }

      // Try to get user profile from users collection
      const userRef = doc(db, "users", targetUserId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        return {
          uid: userSnap.id,
          email: userData.email || currentUser?.email || "",
          fullName:
            userData.fullName || currentUser?.displayName || "Unknown User",
          instructorId: userData.instructorId || "INSTRUCTOR-000",
          role: userData.role || "instructor",
          createdAt: userData.createdAt?.toDate() || new Date(),
          updatedAt: userData.updatedAt?.toDate() || new Date(),
        };
      }

      // If no profile found, return basic info from auth
      return {
        uid: targetUserId,
        email: currentUser?.email || "",
        fullName: currentUser?.displayName || "Unknown User",
        instructorId: "INSTRUCTOR-000", // Default fallback
        role: "instructor",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
  }

  /**
   * Get instructor ID for current user
   */
  static async getCurrentUserInstructorId(): Promise<string> {
    try {
      const profile = await this.getUserProfile();
      return profile?.instructorId || "INSTRUCTOR-000";
    } catch (error) {
      console.error("Error getting instructor ID:", error);
      return "INSTRUCTOR-000";
    }
  }

  /**
   * Check if user profile exists in Firestore
   */
  static async userProfileExists(userId?: string): Promise<boolean> {
    try {
      const currentUser = auth.currentUser;
      const targetUserId = userId || currentUser?.uid;

      if (!targetUserId) return false;

      const userRef = doc(db, "users", targetUserId);
      const userSnap = await getDoc(userRef);

      return userSnap.exists();
    } catch (error) {
      console.error("Error checking user profile:", error);
      return false;
    }
  }

  /**
   * Get user display name
   */
  static async getUserDisplayName(userId?: string): Promise<string> {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.fullName || "Unknown User";
    } catch (error) {
      console.error("Error getting user display name:", error);
      return "Unknown User";
    }
  }

  /**
   * Format instructor ID for display
   */
  static formatInstructorId(instructorId: string): string {
    if (!instructorId || instructorId === "INSTRUCTOR-000") {
      return "Not Assigned";
    }
    return instructorId;
  }
}
