import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { db } from "@/config/firebase";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";

type NetworkListener = (isConnected: boolean) => void;

export class NetworkService {
  private static listeners: NetworkListener[] = [];
  private static isConnected: boolean = true;
  private static unsubscribe: (() => void) | null = null;
  private static lastPingTime: number = 0;
  private static lastPingResult: boolean = true;

  /**
   * Measure Firestore latency to determine if connection is fast enough (ping < 200ms).
   * Result is cached for 5 seconds to avoid spamming the server.
   */
  static async isFirestoreResponsive(): Promise<boolean> {
    const now = Date.now();
    // Cache result for 5 seconds
    if (now - this.lastPingTime < 5000) {
      return this.lastPingResult;
    }

    try {
      const pingDoc = doc(db, "system", "ping");
      const startTime = Date.now();
      
      // Force server fetch to bypass local cache
      await getDocFromServer(pingDoc);
      
      const latency = Date.now() - startTime;
      this.lastPingResult = latency < 200;
      this.lastPingTime = now;
      
      if (!this.lastPingResult) {
         console.warn(`[NetworkService] Firestore latency too high: ${latency}ms`);
      }
      return this.lastPingResult;
    } catch (err: any) {
       const latency = Date.now() - now;
       // If permission denied, the server successfully responded!
       if (err?.code === "permission-denied") {
          this.lastPingResult = latency < 200;
          this.lastPingTime = now;
          if (!this.lastPingResult) {
            console.warn(`[NetworkService] Firestore latency too high: ${latency}ms`);
          }
          return this.lastPingResult;
       }
       
       // Other errors (timeout, unavailable) mean not responsive
       console.warn(`[NetworkService] Firestore ping failed or timed out.`, err?.message);
       this.lastPingResult = false;
       this.lastPingTime = now;
       return false;
    }
  }

  private static resolveConnectionState(state: NetInfoState): boolean {
    if (!state.isConnected) return false;
    if (state.isInternetReachable === null || state.isInternetReachable === undefined) {
      return state.isConnected ?? false;
    }
    return Boolean(state.isConnected && state.isInternetReachable);
  }

  /**
   * Initialize network monitoring
   */
  static initialize(): void {
    if (this.unsubscribe) {
      return; // Already initialized
    }

    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = this.resolveConnectionState(state);

      if (connected !== this.isConnected) {
        this.isConnected = connected;
        console.log(
          `Network status changed: ${connected ? "ONLINE" : "OFFLINE"}`,
        );

        // Notify all listeners
        this.listeners.forEach((listener) => listener(connected));
      }
    });

    // Get initial state
    NetInfo.fetch().then((state) => {
      this.isConnected = this.resolveConnectionState(state);
      console.log(
        `Initial network status: ${this.isConnected ? "ONLINE" : "OFFLINE"}`,
      );
    });
  }

  /**
   * Check if device is currently online
   */
  static async isOnline(): Promise<boolean> {
    try {
      // If we already have a status from the listener, use it for speed
      if (this.unsubscribe) {
        return this.isConnected;
      }

      const state = await NetInfo.fetch();
      this.isConnected = this.resolveConnectionState(state);
      return this.isConnected;
    } catch (error) {
      console.error("Error checking network status:", error);
      return false;
    }
  }

  /**
   * Get current connection status (synchronous)
   */
  static getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Add a listener for network status changes
   */
  static addListener(listener: NetworkListener): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Remove all listeners
   */
  static removeAllListeners(): void {
    this.listeners = [];
  }

  /**
   * Cleanup network monitoring
   */
  static cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.removeAllListeners();
  }

  /**
   * Wait for network connection
   */
  static async waitForConnection(timeoutMs: number = 30000): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);

      const unsubscribe = this.addListener((isConnected) => {
        if (isConnected) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });

      // Check if already connected
      if (this.isConnected) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(true);
      }
    });
  }
}
