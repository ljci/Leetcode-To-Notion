// popup.js - Redesigned for speed and accuracy

/**
 * ARCHITECTURE OVERVIEW
 *
 * Duplicate Detection Strategy:
 * 1. Extract problem number from page (most reliable identifier)
 * 2. Check cache by problem number (instant if hit)
 * 3. If miss/stale -> Query Notion by number (1 API call)
 * 4. Cache result with timestamp
 *
 * Cache Structure:
 * - Key: `problem_${number}` (not slug - avoids collisions)
 * - Value: { pageId, url, timestamp }
 * - TTL: 1 hour (prevents stale data)
 *
 * Benefits:
 * - Fast: Cache hit = 0ms, Cache miss = 300ms
 * - Accurate: Problem number never changes
 * - Simple: No complex validation needed
 * - Reliable: Short TTL prevents stale data
 */

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

class LeetCodeNotionApp {
  constructor() {
    this.timer = {
      startTime: null,
      elapsedTime: 0,
      interval: null,
      isRunning: false,
    };
    this.isEditingManualTime = false;

    this.problemData = null;
    this.notionPageId = null;
    this.notionPageUrl = null;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.checkLeetCodePage();
    await this.loadSettings();
    this.loadTimerState();
  }

  setupEventListeners() {
    // Timer controls
    document
      .getElementById("startTimer")
      .addEventListener("click", () => this.startTimer());
    document
      .getElementById("pauseTimer")
      .addEventListener("click", () => this.pauseTimer());
    document
      .getElementById("resetTimer")
      .addEventListener("click", () => this.resetTimer());
    const manualTimeInput = document.getElementById("manualTimeInput");
    manualTimeInput.addEventListener("focus", () => {
      this.isEditingManualTime = true;
    });
    manualTimeInput.addEventListener("blur", () => {
      this.isEditingManualTime = false;
      this.applyManualTimeInput();
    });
    manualTimeInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      manualTimeInput.blur();
    });

    // Save problem
    document
      .getElementById("saveProblem")
      .addEventListener("click", () => this.saveProblem());

    // Notion links
    document
      .getElementById("openInNotion")
      .addEventListener("click", () => this.openInNotion());
    document
      .getElementById("openDatabase")
      .addEventListener("click", () => this.openDatabase());
  }

  // ============================================================================
  // TIMER FUNCTIONS
  // ============================================================================

  startTimer() {
    if (this.timer.isRunning) return;
    this.timer.isRunning = true;
    this.timer.startTime = Date.now() - this.timer.elapsedTime;
    this.timer.interval = setInterval(() => this.updateTimer(), 100);
    this.saveTimerState();
    this.updateTimerButtons();
  }

  pauseTimer() {
    if (!this.timer.isRunning) return;
    this.timer.isRunning = false;
    this.timer.elapsedTime = Date.now() - this.timer.startTime;
    clearInterval(this.timer.interval);
    this.saveTimerState();
    this.updateTimerButtons();
  }

  resetTimer() {
    this.timer.isRunning = false;
    this.timer.elapsedTime = 0;
    this.timer.startTime = null;
    clearInterval(this.timer.interval);
    this.updateTimerDisplay();
    this.saveTimerState();
    this.updateTimerButtons();
  }

  updateTimer() {
    this.timer.elapsedTime = Date.now() - this.timer.startTime;
    this.updateTimerDisplay();
  }

  updateTimerDisplay() {
    const display = this.formatClock(this.timer.elapsedTime);
    document.getElementById("timerDisplay").textContent = display;
    if (!this.isEditingManualTime) {
      document.getElementById("manualTimeInput").value = display;
    }
  }

  updateTimerButtons() {
    const startBtn = document.getElementById("startTimer");
    const pauseBtn = document.getElementById("pauseTimer");
    const resetBtn = document.getElementById("resetTimer");

    if (this.timer.isRunning) {
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      resetBtn.disabled = false;
      startBtn.textContent = "Running...";
    } else {
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      resetBtn.disabled = this.timer.elapsedTime === 0;
      startBtn.textContent =
        this.timer.elapsedTime > 0 ? "Resume Timer" : "Start Timer";
    }
  }

  pad(num) {
    return num.toString().padStart(2, "0");
  }

  formatClock(elapsedMs) {
    const totalSeconds = Math.floor(Math.max(elapsedMs, 0) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)}`;
  }

  parseTimeToMs(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const parts = raw.split(":").map((part) => part.trim());
    if (parts.length < 1 || parts.length > 3) return null;
    if (parts.some((part) => !/^\d+$/.test(part))) return null;

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (parts.length === 3) {
      hours = Number(parts[0]);
      minutes = Number(parts[1]);
      seconds = Number(parts[2]);
    } else if (parts.length === 2) {
      minutes = Number(parts[0]);
      seconds = Number(parts[1]);
    } else {
      seconds = Number(parts[0]);
    }

    if (parts.length === 3 && minutes > 59) return null;
    if (seconds > 59 && parts.length > 1) return null;
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  applyManualTimeInput() {
    const input = document.getElementById("manualTimeInput");
    const manualMs = this.parseTimeToMs(input.value);
    if (manualMs === null) {
      input.value = this.formatClock(this.timer.elapsedTime);
      this.showError("Invalid time format. Use HH:MM:SS or MM:SS.");
      return;
    }

    this.timer.elapsedTime = manualMs;
    if (this.timer.isRunning) {
      this.timer.startTime = Date.now() - this.timer.elapsedTime;
    }

    this.updateTimerDisplay();
    this.updateTimerButtons();
    this.saveTimerState();
  }

  getFormattedTime() {
    const totalSeconds = Math.floor(this.timer.elapsedTime / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  async saveTimerState() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const activeTabUrl = tabs[0]?.url || null;
      await chrome.storage.local.set({
        timerState: {
          elapsedTime: this.timer.elapsedTime,
          isRunning: this.timer.isRunning,
          startTime: this.timer.startTime,
          url: activeTabUrl,
        },
      });
    } catch (error) {
      console.warn("Failed to save timer state:", error);
    }
  }

  async loadTimerState() {
    const result = await chrome.storage.local.get("timerState");
    if (result.timerState) {
      const state = result.timerState;
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tabs[0] && state.url === tabs[0].url) {
        this.timer.elapsedTime = state.elapsedTime || 0;
        if (state.isRunning) {
          this.startTimer();
        } else {
          this.updateTimerDisplay();
        }
      }
    }
    this.updateTimerButtons();
  }

  // ============================================================================
  // LEETCODE PAGE EXTRACTION
  // ============================================================================

  async checkLeetCodePage() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs[0];

      if (!tab) {
        this.showError("Unable to detect current tab");
        return;
      }

      const isLeetCodeProblem =
        tab.url &&
        (tab.url.match(/leetcode\.com\/problems\/[^\/]+\/?/) ||
          tab.url.match(/leetcode\.cn\/problems\/[^\/]+\/?/));

      if (!isLeetCodeProblem) {
        this.showError(
          "Please open a LeetCode problem page first.\n\n" +
            "Examples:\n• leetcode.com/problems/two-sum/\n" +
            "• leetcode.cn/problems/two-sum/",
        );
        return;
      }

      const response = await this.extractProblemDataFromTab(tab.id);

      if (response?.success) {
        this.problemData = response.data;
        this.displayProblemData();
        this.showProblemSection();

        // Check for duplicates
        await this.checkForDuplicate();
      } else {
        throw new Error(response?.error || "Failed to extract problem data");
      }
    } catch (error) {
      console.error("Error checking LeetCode page:", error);
      this.showError(
        "Unable to extract problem data.\n\n" +
          "Troubleshooting:\n• Refresh the page\n• Wait for full load\n" +
          "• Try the main problem page (without /description/)",
      );
    }
  }

  async extractProblemDataFromTab(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        action: "extractProblemData",
        includeCode: true,
        language: "python",
      });
      return response;
    } catch (error) {
      // Content script not loaded, inject it
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });

      const response = await chrome.tabs.sendMessage(tabId, {
        action: "extractProblemData",
        includeCode: true,
        language: "python",
      });
      return response;
    }
  }

  displayProblemData() {
    if (!this.problemData) return;

    // Title and difficulty
    const titleEl = document.getElementById("problemTitle");
    titleEl.textContent = this.problemData.title;
    titleEl.classList.remove("muted");

    const difficultyBadge = document.getElementById("problemDifficulty");
    difficultyBadge.textContent = this.problemData.difficulty;
    difficultyBadge.className = `diff ${this.problemData.difficulty.toLowerCase()}`;
    difficultyBadge.classList.remove("muted");

    // Tags
    const tagsContainer = document.getElementById("tagsContainer");
    tagsContainer.innerHTML = "";
    if (this.problemData.tags && this.problemData.tags.length > 0) {
      this.problemData.tags.forEach((tag) => {
        const tagEl = document.createElement("span");
        tagEl.className = "tag";
        tagEl.textContent = tag;
        tagsContainer.appendChild(tagEl);
      });
    }
  }

  // ============================================================================
  // DUPLICATE DETECTION (NEW SIMPLIFIED ARCHITECTURE)
  // ============================================================================

  /**
   * Check if this problem already exists in Notion
   * Strategy: Problem number first, fallback to slug
   */
  async checkForDuplicate() {
    if (!this.problemData.number) {
      console.warn("No problem number found - skipping duplicate check");
      this.showAlreadySavedBadge(false);
      return;
    }

    const settings = await this.loadSettings();
    if (!settings?.notionToken || !settings?.databaseId) {
      return; // Settings not configured yet
    }

    try {
      // Step 1: Check cache (fast path)
      const cached = await this.getCachedPage(this.problemData.number);
      if (cached) {
        console.log(`Cache hit for problem #${this.problemData.number}`);
        this.notionPageId = cached.pageId;
        this.notionPageUrl = cached.url;
        this.showAlreadySavedBadge(true);
        this.showNotionLinks();

        // Validate cache in background (non-blocking)
        this.validateCacheInBackground(
          this.problemData.number,
          cached.pageId,
          settings,
        );
        return;
      }

      // Step 2: Query Notion (slow path but still fast - 300ms)
      console.log(
        `Cache miss for problem #${this.problemData.number} - querying Notion`,
      );
      const page = await this.findPageInNotion(
        this.problemData.number,
        settings,
      );

      if (page) {
        console.log(`Found in Notion: problem #${this.problemData.number}`);
        this.notionPageId = page.id;
        this.notionPageUrl = page.url;
        this.showAlreadySavedBadge(true);
        this.showNotionLinks();

        // Cache the result
        await this.cachePage(this.problemData.number, page.id, page.url);
      } else {
        console.log(`Not found in Notion: problem #${this.problemData.number}`);
        this.showAlreadySavedBadge(false);
      }
    } catch (error) {
      console.error("Error checking for duplicate:", error);
      // Fail silently - don't block user from saving
      this.showAlreadySavedBadge(false);
    }
  }

  /**
   * Get cached page by problem number
   * Returns null if not found or expired
   */
  async getCachedPage(problemNumber) {
    const key = `problem_${problemNumber}`;
    const result = await chrome.storage.local.get(key);
    const cached = result[key];

    if (!cached) return null;

    // Check if expired
    const age = Date.now() - (cached.timestamp || 0);
    if (age > CACHE_TTL) {
      console.log(`Cache expired for problem #${problemNumber}`);
      await chrome.storage.local.remove(key);
      return null;
    }

    return cached;
  }

  /**
   * Cache a page by problem number
   */
  async cachePage(problemNumber, pageId, url) {
    const key = `problem_${problemNumber}`;
    await chrome.storage.local.set({
      [key]: {
        pageId,
        url,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Validate cache in background (non-blocking)
   * If page no longer exists, clear cache and update UI
   */
  async validateCacheInBackground(problemNumber, pageId, settings) {
    try {
      const exists = await this.checkPageExists(pageId, settings);
      if (!exists) {
        await chrome.storage.local.remove(`problem_${problemNumber}`);

        // Update UI
        this.notionPageId = null;
        this.notionPageUrl = null;
        this.showAlreadySavedBadge(false);
        document.getElementById("notionLinks")?.classList.add("hidden");
      }
    } catch (error) {
      // Fail silently - cache will expire naturally
    }
  }

  /**
   * Check if a Notion page exists
   */
  async checkPageExists(pageId, settings) {
    try {
      const response = await fetch(
        `https://api.notion.com/v1/pages/${pageId}`,
        {
          headers: {
            Authorization: `Bearer ${settings.notionToken}`,
            "Notion-Version": "2022-06-28",
          },
        },
      );

      if (response.status === 404) return false;
      if (!response.ok) return false;

      const page = await response.json();
      return !page.archived && !page.in_trash;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find page in Notion by problem number
   * This is THE primary duplicate detection method
   */
  async findPageInNotion(problemNumber, settings) {
    try {
      // Get database schema
      const dbResponse = await fetch(
        `https://api.notion.com/v1/databases/${settings.databaseId}`,
        {
          headers: {
            Authorization: `Bearer ${settings.notionToken}`,
            "Notion-Version": "2022-06-28",
          },
        },
      );

      if (!dbResponse.ok) return null;

      const db = await dbResponse.json();
      const dbProperties = db.properties || {};

      // Find the Number property
      const numberProp = this.findProperty(
        dbProperties,
        ["Number", "Problem Number", "ID", "#", "编号"],
        ["number"],
      );

      if (!numberProp) {
        console.warn(
          "No Number property found - cannot detect duplicates reliably",
        );
        return null;
      }

      // Query by problem number (SINGLE API CALL)
      const queryResponse = await fetch(
        `https://api.notion.com/v1/databases/${settings.databaseId}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.notionToken}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filter: {
              property: numberProp.name,
              number: { equals: problemNumber },
            },
            page_size: 1,
          }),
        },
      );

      if (!queryResponse.ok) return null;

      const data = await queryResponse.json();
      const page = data.results?.[0];

      if (page && !page.archived && !page.in_trash) {
        return page;
      }

      return null;
    } catch (error) {
      console.error("Error finding page in Notion:", error);
      return null;
    }
  }

  /**
   * Helper: Find a property by aliases
   */
  findProperty(properties, aliases, allowedTypes = []) {
    for (const [name, config] of Object.entries(properties)) {
      const isMatch = aliases.some(
        (alias) =>
          name.toLowerCase() === alias.toLowerCase() ||
          name.toLowerCase().includes(alias.toLowerCase()),
      );
      if (
        isMatch &&
        (allowedTypes.length === 0 || allowedTypes.includes(config.type))
      ) {
        return { name, type: config.type };
      }
    }
    return null;
  }

  // ============================================================================
  // SAVE TO NOTION
  // ============================================================================

  async saveProblem() {
    if (!this.problemData) {
      this.showError("Please open a LeetCode problem page first.");
      return;
    }

    const settings = await this.loadSettings();
    if (!settings.notionToken || !settings.databaseId) {
      this.showError(
        "Notion not configured.\n\nTo configure:\n" +
          '1. Right-click extension icon\n2. Select "Options"\n' +
          "3. Enter your Notion credentials",
      );
      return;
    }

    // If page already exists, update editable fields instead of blocking save
    if (this.notionPageId) {
      this.showLoading(true);
      try {
        const data = this.prepareNotionData();
        await this.updateExistingPage(this.notionPageId, data, settings);
        this.showSuccess("Updated existing problem (Hint/Redo)");
        this.showAlreadySavedBadge(true);
        this.showNotionLinks();
      } catch (error) {
        console.error("Error updating existing Notion page:", error);
        this.showError(error.message || "Failed to update existing problem");
      } finally {
        this.showLoading(false);
      }
      return;
    }

    this.showLoading(true);

    try {
      const data = this.prepareNotionData();
      const notionPage = await this.sendToNotion(data, settings);

      // Cache the result
      if (this.problemData.number) {
        await this.cachePage(
          this.problemData.number,
          notionPage.id,
          notionPage.url,
        );
      }

      this.notionPageId = notionPage.id;
      this.notionPageUrl = notionPage.url;

      this.showSuccess("Successfully saved to Notion!");
      this.showAlreadySavedBadge(true);
      this.showNotionLinks();

      // Reset timer after successful save
      setTimeout(() => this.resetTimer(), 1000);
    } catch (error) {
      console.error("Error saving to Notion:", error);
      this.showError(error.message || "Failed to save to Notion");
    } finally {
      this.showLoading(false);
    }
  }

  prepareNotionData() {
    const status = document.getElementById("status").value;
    const notes = document.getElementById("notes").value;
    const language = document.getElementById("language")?.value || "python";
    const neededHint = document.getElementById("neededHint").checked;
    const canRedo = document.getElementById("canRedo").checked;

    // Format problem name with number
    let problemName = this.problemData.title;
    if (this.problemData.number && !problemName.match(/^\d+\./)) {
      problemName = `${this.problemData.number}. ${problemName}`;
    }

    // Normalize URL to leetcode.cn
    let problemUrl = this.problemData.url
      .replace("/description/", "/")
      .replace("/description", "")
      .replace(/\/$/, "");

    if (problemUrl.includes("leetcode.com")) {
      problemUrl = problemUrl.replace("leetcode.com", "leetcode.cn");
    }

    return {
      ...this.problemData,
      problemName,
      url: problemUrl,
      status,
      notes,
      language,
      neededHint,
      canRedo,
      timeSpent: this.getFormattedTime(),
      timeSpentMinutes: Math.floor(this.timer.elapsedTime / 60000),
      dateCompleted: new Date().toISOString(),
    };
  }

  async sendToNotion(data, settings) {
    // Get database schema
    const dbResponse = await fetch(
      `https://api.notion.com/v1/databases/${settings.databaseId}`,
      {
        headers: {
          Authorization: `Bearer ${settings.notionToken}`,
          "Notion-Version": "2022-06-28",
        },
      },
    );

    if (!dbResponse.ok) {
      const error = await dbResponse.json();
      throw new Error(error.message || "Failed to fetch database schema");
    }

    const db = await dbResponse.json();
    const properties = this.buildNotionProperties(data, db.properties || {});
    const children = this.buildNotionChildren(data);

    // Create page
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.notionToken}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: settings.databaseId },
        properties,
        ...(children.length > 0 ? { children } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to create Notion page");
    }

    return await response.json();
  }

  async updateExistingPage(pageId, data, settings) {
    const dbResponse = await fetch(
      `https://api.notion.com/v1/databases/${settings.databaseId}`,
      {
        headers: {
          Authorization: `Bearer ${settings.notionToken}`,
          "Notion-Version": "2022-06-28",
        },
      },
    );

    if (!dbResponse.ok) {
      const error = await dbResponse.json();
      throw new Error(error.message || "Failed to fetch database schema");
    }

    const db = await dbResponse.json();
    const properties = this.buildCheckboxUpdateProperties(data, db.properties);

    if (Object.keys(properties).length === 0) {
      throw new Error('No "Needed Hint" / "Can Redo" checkbox properties found');
    }

    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${settings.notionToken}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to update Notion page");
    }

    return await response.json();
  }

  buildCheckboxUpdateProperties(data, dbProperties = {}) {
    const properties = {};
    const checkboxFields = [
      {
        aliases: ["Needed Hint", "需要提示", "Hint", "Did I need a hint?"],
        value: data.neededHint,
      },
      {
        aliases: ["Can Redo", "可以重做", "Redo", "Could I redo it in a week"],
        value: data.canRedo,
      },
    ];

    for (const field of checkboxFields) {
      const prop = this.findProperty(dbProperties, field.aliases, ["checkbox"]);
      if (prop) {
        properties[prop.name] = { checkbox: Boolean(field.value) };
      }
    }

    return properties;
  }

  buildNotionProperties(data, dbProperties) {
    const properties = {};

    // Title property (required)
    const titleProp =
      this.findProperty(
        dbProperties,
        ["Problem Name", "Name", "Title"],
        ["title"],
      ) ||
      Object.entries(dbProperties)
        .map(([name, config]) => ({ name, type: config.type }))
        .find((prop) => prop.type === "title");

    if (!titleProp) {
      throw new Error("No title property found in database");
    }

    properties[titleProp.name] = {
      title: [
        {
          text: {
            content: data.problemName,
            link: { url: data.url },
          },
        },
      ],
    };

    // Number property
    const numberProp = this.findProperty(
      dbProperties,
      ["Number", "Problem Number", "ID", "#", "编号"],
      ["number"],
    );
    if (numberProp && data.number) {
      properties[numberProp.name] = { number: data.number };
    }

    // Other properties
    const fieldConfigs = [
      {
        aliases: ["Difficulty", "难度"],
        types: ["select"],
        value: data.difficulty,
      },
      { aliases: ["Status", "状态"], types: ["select"], value: data.status },
      { aliases: ["URL", "Link", "链接"], types: ["url"], value: data.url },
      {
        aliases: ["Time Spent", "耗时"],
        types: ["rich_text"],
        value: data.timeSpent,
      },
      {
        aliases: ["Date Completed", "完成日期"],
        types: ["date"],
        value: data.dateCompleted,
      },
      { aliases: ["Notes", "备注"], types: ["rich_text"], value: data.notes },
      {
        aliases: ["Language", "语言"],
        types: ["select"],
        value: data.language,
      },
    ];

    // Add checkbox fields
    fieldConfigs.push(
      {
        aliases: ["Needed Hint", "需要提示", "Hint", "Did I need a hint?"],
        types: ["checkbox"],
        value: data.neededHint,
      },
      {
        aliases: ["Can Redo", "可以重做", "Redo", "Could I redo it in a week"],
        types: ["checkbox"],
        value: data.canRedo,
      },
    );

    for (const field of fieldConfigs) {
      const prop = this.findProperty(dbProperties, field.aliases, field.types);
      if (prop) {
        // For checkboxes, send even if false; for others, skip if empty
        if (prop.type === "checkbox" || field.value) {
          properties[prop.name] = this.buildPropertyValue(
            prop.type,
            field.value,
          );
        }
      }
    }

    // Tags
    const tagsProp = this.findProperty(
      dbProperties,
      ["Tags", "Topics", "æ ‡ç­¾"],
      ["multi_select"],
    );
    if (tagsProp && data.tags?.length > 0) {
      properties[tagsProp.name] = {
        multi_select: data.tags.map((tag) => ({ name: tag })),
      };
    }

    return properties;
  }

  buildPropertyValue(type, value) {
    if (type === "rich_text")
      return { rich_text: [{ text: { content: String(value) } }] };
    if (type === "url") return { url: String(value) };
    if (type === "number") return { number: Number(value) };
    if (type === "select") return { select: { name: String(value) } };
    if (type === "date") return { date: { start: String(value) } };
    if (type === "checkbox") return { checkbox: Boolean(value) };
    return null;
  }

  buildNotionChildren(data) {
    if (!data.code) return [];

    const chunks = [];
    const code = data.code;
    for (let i = 0; i < code.length; i += 2000) {
      chunks.push(code.slice(i, i + 2000));
    }

    return [
      {
        object: "block",
        type: "code",
        code: {
          rich_text: chunks.map((chunk) => ({ text: { content: chunk } })),
          language: data.codeLanguage || "python",
        },
      },
    ];
  }

  // ============================================================================
  // UI FUNCTIONS
  // ============================================================================

  showProblemSection() {
    document.getElementById("problemSection").classList.remove("hidden");
  }

  showAlreadySavedBadge(show) {
    const badge = document.getElementById("alreadySavedBadge");
    badge?.classList.toggle("hidden", !show);
  }

  showNotionLinks() {
    if (this.notionPageId || this.notionPageUrl) {
      document.getElementById("notionLinks")?.classList.remove("hidden");
    }
  }

  showLoading(show) {
    document
      .getElementById("loadingOverlay")
      ?.classList.toggle("hidden", !show);
  }

  showStatus(message, type) {
    const statusEl = document.getElementById("statusMessage");
    statusEl.textContent = message;
    statusEl.className = `msg ${type}`;
    statusEl.classList.remove("hidden");

    if (type === "success") {
      setTimeout(() => statusEl.classList.add("hidden"), 3000);
    }
  }

  showSuccess(message) {
    this.showStatus(message, "success");
  }

  showError(message) {
    this.showStatus(message, "error");
  }

  async openInNotion() {
    if (this.notionPageUrl) {
      chrome.tabs.create({ url: this.notionPageUrl });
    } else if (this.notionPageId) {
      const url = `https://notion.so/${this.notionPageId.replace(/-/g, "")}`;
      chrome.tabs.create({ url });
    } else {
      this.showError("No Notion page found for this problem");
    }
  }

  async openDatabase() {
    const settings = await this.loadSettings();
    if (!settings.databaseId) {
      this.showError("Please configure Notion database first");
      return;
    }
    const url = `https://notion.so/${settings.databaseId.replace(/-/g, "")}`;
    chrome.tabs.create({ url });
  }

  async loadSettings() {
    const result = await chrome.storage.local.get([
      "notionToken",
      "databaseId",
    ]);
    return result;
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  new LeetCodeNotionApp();
});
