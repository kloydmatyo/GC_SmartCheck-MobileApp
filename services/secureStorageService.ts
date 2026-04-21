import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { RealmService, SystemKV } from "./realmService";

/**
 * Secure Storage Service with encryption
 * Uses expo-crypto for encryption/decryption
 */
export class SecureStorageService {
  private static ENCRYPTION_KEY_NAME = "@secure_storage_key";
  private static MIGRATION_KEY = "@secure_storage_migrated_to_realm";
  private static encryptionKey: string | null = null;

  /**
   * Initialize encryption key and migrate data if needed
   */
  static async initialize(): Promise<void> {
    try {
      const realm = await RealmService.getStagingRealm();

      // Try to get existing key from Realm
      const keyRecord = realm.objectForPrimaryKey<SystemKV>(
        "SystemKV",
        this.ENCRYPTION_KEY_NAME,
      );
      let key = keyRecord?.value;

      if (!key) {
        // Fallback to AsyncStorage for migration
        key = (await AsyncStorage.getItem(this.ENCRYPTION_KEY_NAME)) || undefined;

        if (!key) {
          // Generate new key
          key = await this.generateEncryptionKey();
        }

        // Save to Realm
        realm.write(() => {
          realm.create(
            "SystemKV",
            { key: this.ENCRYPTION_KEY_NAME, value: key! },
            Realm.UpdateMode.Modified,
          );
        });
      }

      this.encryptionKey = key ?? null;

      // Migrate existing secure items from AsyncStorage to Realm
      await this.ensureMigrated();

      console.log("Secure storage initialized via Realm");
    } catch (error) {
      console.error("Error initializing secure storage:", error);
      throw error;
    }
  }

  /**
   * Helper to ensure data is migrated from AsyncStorage to Realm
   */
  private static async ensureMigrated(): Promise<void> {
    try {
      const migrated = await AsyncStorage.getItem(this.MIGRATION_KEY);
      if (migrated === "true") return;

      console.log(
        "[SecureStorageService] Migrating secure data from AsyncStorage to Realm...",
      );
      const keys = await AsyncStorage.getAllKeys();
      const secureKeys = keys.filter((k) => k.startsWith("@secure_"));

      if (secureKeys.length > 0) {
        const realm = await RealmService.getStagingRealm();
        for (const fullKey of secureKeys) {
          const value = await AsyncStorage.getItem(fullKey);
          if (value) {
            const shortKey = fullKey.replace("@secure_", "");
            realm.write(() => {
              realm.create(
                "SystemKV",
                { key: `secure_${shortKey}`, value },
                Realm.UpdateMode.Modified,
              );
            });
          }
        }
      }

      await AsyncStorage.setItem(this.MIGRATION_KEY, "true");
      console.log("[SecureStorageService] Migration complete.");
    } catch (err) {
      console.error("[SecureStorageService] Migration failed:", err);
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
      const realm = await RealmService.getStagingRealm();
      realm.write(() => {
        realm.create(
          "SystemKV",
          { key: `secure_${key}`, value: encrypted },
          Realm.UpdateMode.Modified,
        );
      });
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
      const realm = await RealmService.getStagingRealm();
      const record = realm.objectForPrimaryKey<SystemKV>(
        "SystemKV",
        `secure_${key}`,
      );

      let encrypted = record?.value;

      // Fallback for non-migrated items
      if (!encrypted) {
        encrypted = (await AsyncStorage.getItem(`@secure_${key}`)) || undefined;
        if (!encrypted) return null;
      }

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
      const realm = await RealmService.getStagingRealm();
      const record = realm.objectForPrimaryKey<SystemKV>(
        "SystemKV",
        `secure_${key}`,
      );
      if (record) {
        realm.write(() => {
          realm.delete(record);
        });
      }

      // Also remove from legacy storage
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
      const realm = await RealmService.getStagingRealm();
      const secureItems = realm
        .objects<SystemKV>("SystemKV")
        .filtered("key BEGINSWITH 'secure_'");

      realm.write(() => {
        realm.delete(secureItems);
      });

      // Clear legacy storage
      const keys = await AsyncStorage.getAllKeys();
      const secureKeys = keys.filter((k) => k.startsWith("@secure_"));
      await AsyncStorage.multiRemove(secureKeys);

      console.log("All encrypted data cleared from Realm and AsyncStorage");
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
    } catch {
      return false;
    }
  }
}
