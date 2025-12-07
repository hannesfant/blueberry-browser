import { randomUUID } from "crypto";
import type ElectronStore from "electron-store";

interface AuthStore {
  userId: string;
}

class Auth {
  private store: ElectronStore<AuthStore> | null = null;
  private _userId: string = "";
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    const Store = (await import("electron-store")).default;
    this.store = new Store<AuthStore>({
      name: "auth",
    });

    // Get or generate user ID
    const existingUserId = this.store.get("userId");
    if (existingUserId) {
      this._userId = existingUserId;
      console.log("Using existing user ID:", this._userId);
    } else {
      this._userId = randomUUID();
      this.store.set("userId", this._userId);
      console.log("Generated new user ID:", this._userId);
    }
  }

  async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  get userId(): string {
    return this._userId;
  }
}

// Export singleton instance
export const auth = new Auth();
