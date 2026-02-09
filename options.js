// options.js - Settings page logic

class SettingsManager {
  constructor() {
    this.init();
  }

  init() {
    this.loadSettings();
    this.setupEventListeners();
  }

  setupEventListeners() {
    document
      .getElementById("saveSettings")
      .addEventListener("click", () => this.saveSettings());
    document
      .getElementById("testConnection")
      .addEventListener("click", () => this.testConnection());
    document
      .getElementById("clearSettings")
      .addEventListener("click", () => this.clearSettings());
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        "notionToken",
        "databaseId",
      ]);

      if (result.notionToken) {
        document.getElementById("notionToken").value = result.notionToken;
      }

      if (result.databaseId) {
        document.getElementById("databaseId").value = result.databaseId;
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      this.showStatus("Failed to load settings", "error");
    }
  }

  async saveSettings() {
    const token = document.getElementById("notionToken").value.trim();
    const databaseId = document.getElementById("databaseId").value.trim();

    // Validation
    if (!token || !databaseId) {
      this.showStatus("Please fill in all required fields", "error");
      return;
    }

    // Notion token formats:
    // - legacy internal integrations: secret_
    // - newer integrations: ntn_
    const isSupportedToken =
      token.startsWith("secret_") || token.startsWith("ntn_");
    if (!isSupportedToken) {
      this.showStatus(
        'Integration token must start with "ntn_" or "secret_"',
        "error",
      );
      return;
    }

    if (
      databaseId.length !== 32 ||
      !/^[a-f0-9]+$/i.test(databaseId.replace(/-/g, ""))
    ) {
      this.showStatus(
        "Database ID must be 32 characters (letters and numbers)",
        "error",
      );
      return;
    }

    try {
      await chrome.storage.local.set({
        notionToken: token,
        databaseId: databaseId,
      });

      this.showStatus("✅ Settings saved successfully!", "success");

      // Briefly show success then fade out
      setTimeout(() => {
        const statusEl = document.getElementById("statusMessage");
        if (statusEl.classList.contains("success")) {
          statusEl.classList.add("hidden");
        }
      }, 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      this.showStatus("Failed to save settings: " + error.message, "error");
    }
  }

  async testConnection() {
    const token = document.getElementById("notionToken").value.trim();
    const databaseId = document.getElementById("databaseId").value.trim();

    if (!token || !databaseId) {
      this.showStatus("Please enter both token and database ID first", "error");
      return;
    }

    this.showStatus("Testing connection...", "info");

    try {
      const response = await fetch(
        `https://api.notion.com/v1/databases/${databaseId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": "2022-06-28",
          },
        },
      );

      if (response.ok) {
        const db = await response.json();
        const dbName = db.title?.[0]?.plain_text || "Unnamed Database";
        this.showStatus(
          `✅ Successfully connected to: "${dbName}"`,
          "success",
        );
      } else {
        const error = await response.json();
        throw new Error(
          error.message || `Connection failed (${response.status})`,
        );
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      this.showStatus(`❌ Connection failed: ${error.message}`, "error");
    }
  }

  async clearSettings() {
    if (
      !confirm(
        "Are you sure you want to clear all settings and data?\n\nThis will:\n• Remove Notion credentials\n• Clear problem mappings\n• Reset timer state\n\nThis cannot be undone!",
      )
    ) {
      return;
    }

    try {
      await chrome.storage.local.clear();

      document.getElementById("notionToken").value = "";
      document.getElementById("databaseId").value = "";

      this.showStatus("✅ All data cleared successfully", "success");
    } catch (error) {
      console.error("Error clearing settings:", error);
      this.showStatus("Failed to clear data: " + error.message, "error");
    }
  }

  showStatus(message, type) {
    const statusEl = document.getElementById("statusMessage");
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.classList.remove("hidden");
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new SettingsManager();
});
