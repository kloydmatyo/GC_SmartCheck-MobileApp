import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

type NetworkListener = (isConnected: boolean) => void;

export class NetworkService {
  private static listeners: NetworkListener[] = [];
  private static isConnected: boolean = true;
  private static unsubscribe: (() => void) | null = null;

  /**
   * Initialize network monitoring
   */
  static initialize(): void {
    if (this.unsubscribe) {
      return; // Already initialized
    }

    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false;

      if (connected !== this.isConnected) {
        this.isConnected = connected;
        console.log(
          `📡 Network status changed: ${connected ? "ONLINE" : "OFFLINE"}`,
        );

        // Notify all listeners
        this.listeners.forEach((listener) => listener(connected));
      }
    });

    // Get initial state
    NetInfo.fetch().then((state) => {
      this.isConnected = state.isConnected ?? false;
      console.log(
        `📡 Initial network status: ${this.isConnected ? "ONLINE" : "OFFLINE"}`,
      );
    });
  }

  /**
   * Check if device is currently online
   */
  static async isOnline(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected ?? false;
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
