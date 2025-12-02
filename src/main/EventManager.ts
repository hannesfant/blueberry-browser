import { ipcMain, WebContents, net } from "electron";
import type { Window } from "./Window";

const SYNC_SERVER_URL = process.env.SYNC_SERVER_URL || "http://localhost:3000";

export class EventManager {
  private mainWindow: Window;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Tab management events
    this.handleTabEvents();

    // Sidebar events
    this.handleSidebarEvents();

    // Page content events
    this.handlePageContentEvents();

    // Dark mode events
    this.handleDarkModeEvents();

    // Debug events
    this.handleDebugEvents();

    // Session events
    this.handleSessionEvents();
  }

  private handleTabEvents(): void {
    // Create new tab
    ipcMain.handle("create-tab", (_, url?: string) => {
      const newTab = this.mainWindow.createTab(url);
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    // Close tab
    ipcMain.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    // Switch tab
    ipcMain.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    // Get tabs
    ipcMain.handle("get-tabs", () => {
      const activeTabId = this.mainWindow.activeTab?.id;
      return this.mainWindow.allTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: activeTabId === tab.id,
      }));
    });

    // Navigation (for compatibility with existing code)
    ipcMain.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.loadURL(url);
      }
    });

    ipcMain.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

    ipcMain.handle("go-back", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goBack();
      }
    });

    ipcMain.handle("go-forward", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goForward();
      }
    });

    ipcMain.handle("reload", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.reload();
      }
    });

    // Tab-specific navigation handlers
    ipcMain.handle("tab-go-back", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goBack();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-go-forward", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goForward();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-reload", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.reload();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-screenshot", async (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        const image = await tab.screenshot();
        return image.toDataURL();
      }
      return null;
    });

    ipcMain.handle("tab-run-js", async (_, tabId: string, code: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        return await tab.runJs(code);
      }
      return null;
    });

    // Tab info
    ipcMain.handle("get-active-tab-info", () => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        return {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          canGoBack: activeTab.webContents.canGoBack(),
          canGoForward: activeTab.webContents.canGoForward(),
        };
      }
      return null;
    });
  }

  private handleSidebarEvents(): void {
    // Toggle sidebar
    ipcMain.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    // Chat message
    ipcMain.handle("sidebar-chat-message", async (_, request) => {
      // The LLMClient now handles getting the screenshot and context directly
      await this.mainWindow.sidebar.client.sendChatMessage(request);
    });

    // Clear chat
    ipcMain.handle("sidebar-clear-chat", () => {
      this.mainWindow.sidebar.client.clearMessages();
      return true;
    });

    // Get messages
    ipcMain.handle("sidebar-get-messages", () => {
      return this.mainWindow.sidebar.client.getMessages();
    });
  }

  private handlePageContentEvents(): void {
    // Get page content
    ipcMain.handle("get-page-content", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabHtml();
        } catch (error) {
          console.error("Error getting page content:", error);
          return null;
        }
      }
      return null;
    });

    // Get page text
    ipcMain.handle("get-page-text", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabText();
        } catch (error) {
          console.error("Error getting page text:", error);
          return null;
        }
      }
      return null;
    });

    // Get current URL
    ipcMain.handle("get-current-url", () => {
      if (this.mainWindow.activeTab) {
        return this.mainWindow.activeTab.url;
      }
      return null;
    });
  }

  private handleDarkModeEvents(): void {
    // Dark mode broadcasting
    ipcMain.on("dark-mode-changed", (event, isDarkMode) => {
      this.broadcastDarkMode(event.sender, isDarkMode);
    });
  }

  private handleDebugEvents(): void {
    // Ping test
    ipcMain.on("ping", () => console.log("pong"));
  }

  private handleSessionEvents(): void {
    ipcMain.handle("dump-session-data", async () => {
      const tabs = this.mainWindow.allTabs;
      if (tabs.length === 0) return { success: false, error: "No tabs open" };

      try {
        // Use the session from the first tab (all tabs share the same session)
        const session = tabs[0].webContents.session;

        // Get ALL cookies from the session (this includes all persistent cookies)
        const cookies = await session.cookies.get({});

        // Get sessionStorage from each open tab (sessionStorage is tab-specific)
        const tabsSessionStorage = await Promise.all(
          tabs.map(async (tab) => {
            try {
              const sessionStorage = await tab.runJs(`
                (() => {
                  const data = {};
                  for (let i = 0; i < window.sessionStorage.length; i++) {
                    const key = window.sessionStorage.key(i);
                    data[key] = window.sessionStorage.getItem(key);
                  }
                  return data;
                })()
              `);
              return {
                url: tab.url,
                sessionStorage,
              };
            } catch (err) {
              return {
                url: tab.url,
                error: String(err),
              };
            }
          }),
        );

        const sessionData = {
          timestamp: new Date().toISOString(),
          cookies,
          tabsSessionStorage,
        };

        // POST to sync server
        const response = await net.fetch(`${SYNC_SERVER_URL}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: sessionData }),
        });

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }

        console.log("Session data synced to server");
        return { success: true };
      } catch (error) {
        console.error("Error dumping session data:", error);
        return { success: false, error: String(error) };
      }
    });

    ipcMain.handle("restore-session-data", async () => {
      const tabs = this.mainWindow.allTabs;
      if (tabs.length === 0) return { success: false, error: "No tabs open" };

      try {
        // GET from sync server
        const response = await net.fetch(`${SYNC_SERVER_URL}/sync`);
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }
        const sessionData = await response.json();

        // Use the session from the first tab
        const session = tabs[0].webContents.session;

        // Restore cookies
        for (const cookie of sessionData.cookies) {
          try {
            // Build the cookie URL
            const protocol = cookie.secure ? "https" : "http";
            const domain = cookie.domain.startsWith(".")
              ? cookie.domain.slice(1)
              : cookie.domain;
            const url = `${protocol}://${domain}${cookie.path || "/"}`;

            await session.cookies.set({
              url,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              sameSite: cookie.sameSite,
              expirationDate: cookie.expirationDate,
            });
          } catch (err) {
            console.warn("Failed to restore cookie:", cookie.name, err);
          }
        }

        // Restore sessionStorage for matching tabs
        if (sessionData.tabsSessionStorage) {
          for (const tabData of sessionData.tabsSessionStorage) {
            if (tabData.sessionStorage && !tabData.error) {
              // Find a tab with matching URL
              const matchingTab = tabs.find((t) => t.url === tabData.url);
              if (matchingTab) {
                const storageEntries = JSON.stringify(tabData.sessionStorage);
                await matchingTab.runJs(`
                  (() => {
                    const data = ${storageEntries};
                    for (const [key, value] of Object.entries(data)) {
                      window.sessionStorage.setItem(key, value);
                    }
                  })()
                `);
              }
            }
          }
        }

        console.log("Session data restored from server");
        return { success: true };
      } catch (error) {
        console.error("Error restoring session data:", error);
        return { success: false, error: String(error) };
      }
    });
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    // Send to topbar
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode,
      );
    }

    // Send to sidebar
    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode,
      );
    }

    // Send to all tabs
    this.mainWindow.allTabs.forEach((tab) => {
      if (tab.webContents !== sender) {
        tab.webContents.send("dark-mode-updated", isDarkMode);
      }
    });
  }

  // Clean up event listeners
  public cleanup(): void {
    ipcMain.removeAllListeners();
  }
}
