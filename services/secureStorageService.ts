import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

/**
 * Secure Storage Service with encryption
 * Uses expo-crypto for encryption/decryption
 */
export class SecureStorageService {
  private static ENCRYPTION_KEY = "@secure_storage_key";
  private static encryptionKey: string | null = null;

  /**
   * Initialize encryption key
   */
  static async initialize(): Promise<void> {
    try {
      // Try to get existing key
      let key = await AsyncStorage.getItem(this.ENCRYPTION_KEY);

      if (!key) {
        // Generate new key
        key = await this.generateEncryptionKey();
        await AsyncStorage.setItem(this.ENCRYPTION_KEY, key);
      }

      this.encryptionKey = key;
      console.log("✅ Secure storage initialized");
    } catch (error) {
      console.error("Error initializing secure storage:", error);
      throw error;
    }
  }

  /**
   * Generate encryption key
   */
  private static async generateEncryptionKey(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Encrypt data
   */
  private static async encrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      await this.initialize();
    }

    try {
      // Simple XOR encryption (for demo - use proper encryption in production)
      const key = this.encryptionKey!;
      let encrypted = "";

      for (let i = 0; i < data.length; i++) {
        const charCode = data.charCodeAt(i);
        const keyChar = key.charCodeAt(i % key.length);
        encrypted += String.fromCharCode(charCode ^ keyChar);
      }

      // Base64 encode
      return Buffer.from(encrypted, "binary").toString("base64");
    } catch (error) {
      console.error("Encryption error:", error);
      throw error;
    }
  }

  /**
   * Decrypt data
   */
  private static async decrypt(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) {
      await this.initialize();
    }

    try {
      // Base64 decode
      const encrypted = Buffer.from(encryptedData, "base64").toString("binary");

      // Simple XOR decryption
      const key = this.encryptionKey!;
      let decrypted = "";

      for (let i = 0; i < encrypted.length; i++) {
        const charCode = encrypted.charCodeAt(i);
        const keyChar = key.charCodeAt(i % key.length);
        decrypted += String.fromCharCode(charCode ^ keyChar);
      }

      return decrypted;
    } catch (error) {
      console.error("Decryption error:", error);
      throw error;
    }
  }

  /**
   * Store encrypted data
   */
  static async setItem(key: string, value: string): Promise<void> {
    try {
      const encrypted = await this.encrypt(value);
      await AsyncStorage.setItem(`@secure_${key}`, encrypted);
    } catch (error) {
      console.error("Error storing encrypted data:", error);
      throw error;
    }
  }

  /**
   * Get and decrypt data
   */
  static async getItem(key: string): Promise<string | null> {
    try {
      const encrypted = await AsyncStorage.getItem(`@secure_${key}`);
      if (!encrypted) return null;

      return await this.decrypt(encrypted);
    } catch (error) {
      console.error("Error getting encrypted data:", error);
      return null;
    }
  }

  /**
   * Store encrypted object
   */
  static async setObject(key: string, value: any): Promise<void> {
    try {
      const json = JSON.stringify(value);
      await this.setItem(key, json);
    } catch (error) {
      console.error("Error storing encrypted object:", error);
      throw error;
    }
  }

  /**
   * Get and decrypt object
   */
  static async getObject<T>(key: string): Promise<T | null> {
    try {
      const json = await this.getItem(key);
      if (!json) return null;

      return JSON.parse(json) as T;
    } catch (error) {
      console.error("Error getting encrypted object:", error);
      return null;
    }
  }

  /**
   * Remove encrypted data
   */
  static async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`@secure_${key}`);
    } catch (error) {
      console.error("Error removing encrypted data:", error);
      throw error;
    }
  }

  /**
   * Clear all encrypted data
   */
  static async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const secureKeys = keys.filter((k) => k.startsWith("@secure_"));
      await AsyncStorage.multiRemove(secureKeys);
      console.log("✅ All encrypted data cleared");
    } catch (error) {
      console.error("Error clearing encrypted data:", error);
      throw error;
    }
  }

  /**
   * Check if encryption is available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await this.initialize();
      return this.encryptionKey !== null;
    } catch (error) {
      return false;
    }
  }
}
