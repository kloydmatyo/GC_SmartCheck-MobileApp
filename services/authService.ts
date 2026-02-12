// Dummy accounts for testing until database is ready
const DUMMY_ACCOUNTS = [
  {
    email: "faculty@gordoncollege.edu.ph",
    password: "password123",
    name: "Faculty User",
  },
  {
    email: "admin@gordoncollege.edu.ph",
    password: "admin123",
    name: "Admin User",
  },
  {
    email: "teacher@gordoncollege.edu.ph",
    password: "teacher123",
    name: "Teacher User",
  },
];

export interface AuthResult {
  success: boolean;
  message?: string;
  user?: {
    email: string;
    name: string;
  };
}

export const authService = {
  /**
   * Validates email format for Gordon College
   */
  isValidGordonEmail(email: string): boolean {
    return email.endsWith("@gordoncollege.edu.ph");
  },

  /**
   * Authenticates user with dummy accounts
   * TODO: Replace with actual API call when database is ready
   */
  signIn(email: string, password: string): AuthResult {
    // Validate email format
    if (!this.isValidGordonEmail(email)) {
      return {
        success: false,
        message: "Please use your Gordon College email (@gordoncollege.edu.ph)",
      };
    }

    // Check against dummy accounts
    const account = DUMMY_ACCOUNTS.find(
      (acc) => acc.email === email && acc.password === password,
    );

    if (account) {
      return {
        success: true,
        user: {
          email: account.email,
          name: account.name,
        },
      };
    }

    return {
      success: false,
      message: "Invalid email or password",
    };
  },

  /**
   * Gets list of dummy accounts for development reference
   */
  getDummyAccounts() {
    return DUMMY_ACCOUNTS.map((acc) => ({
      email: acc.email,
      password: acc.password,
    }));
  },
};
