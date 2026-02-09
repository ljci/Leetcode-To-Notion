if (globalThis.__LEETCODE_NOTION_CONTENT_LOADED__) {
  console.debug(
    "LeetCode content script already initialized; skipping reinjection.",
  );
} else {
  globalThis.__LEETCODE_NOTION_CONTENT_LOADED__ = true;
  // content.js - Extract LeetCode problem information

  class LeetCodeExtractor {
    constructor() {
      this.isChinese = window.location.hostname === "leetcode.cn";
    }

    async extractProblemData(options = {}) {
      try {
        // Check if we're actually on a problem page
        const isProblemPage = window.location.pathname.includes("/problems/");
        if (!isProblemPage) {
          throw new Error("Not on a LeetCode problem page");
        }

        // Wait for page to load with shorter timeout
        await this.waitForElement('[data-cy="question-title"]', 3000).catch(
          () => {
            // If specific element not found, still try to continue
            console.log(
              "Question title element not found, trying alternatives",
            );
          },
        );

        const includeCode = options.includeCode === true;
        const language = options.language || "python";
        const cached = this.getCachedProblemData();
        if (cached && cached.url === window.location.href) {
          return {
            ...cached,
            code: includeCode ? await this.extractCode(language) : null,
            codeLanguage: includeCode ? language : null,
          };
        }

        const data = {
          url: window.location.href,
          title: this.extractTitle(),
          number: this.extractProblemNumber(),
          difficulty: await this.extractDifficulty(),
          tags: await this.extractTags(),
          description: null,
          companies: await this.extractCompanies(),
          acceptance: this.extractAcceptance(),
          timestamp: new Date().toISOString(),
          domain: this.isChinese ? "leetcode.cn" : "leetcode.com",
          code: includeCode ? await this.extractCode(language) : null,
          codeLanguage: includeCode ? language : null,
        };

        this.cacheProblemData(data);
        return data;
      } catch (error) {
        console.error("Error extracting problem data:", error);
        throw error;
      }
    }

    extractTitle() {
      // Try multiple selectors
      const selectors = [
        '[data-cy="question-title"]',
        ".css-v3d350",
        'div[class*="text-title"]',
        ".question-title h3",
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.textContent.trim();
        }
      }

      // Fallback to URL
      const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
      if (match) {
        return match[1]
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }

      return "Unknown Problem";
    }

    extractProblemNumber() {
      const title = this.extractTitle();
      const match = title.match(/^(\d+)\./);
      if (match) {
        return parseInt(match[1]);
      }

      // Try to extract from page content
      const numberElement = document.querySelector(".text-label-1");
      if (numberElement) {
        const numMatch = numberElement.textContent.match(/\d+/);
        if (numMatch) return parseInt(numMatch[0]);
      }

      return null;
    }

    async extractDifficulty() {
      // Try to find difficulty in the DOM
      const selectors = [
        "[diff]",
        ".text-difficulty-easy",
        ".text-difficulty-medium",
        ".text-difficulty-hard",
        'div[class*="difficulty"]',
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent.toLowerCase();
          if (text.includes("easy") || text.includes("简单")) return "Easy";
          if (text.includes("medium") || text.includes("中等"))
            return "Medium";
          if (text.includes("hard") || text.includes("困难")) return "Hard";
        }
      }

      // Try to extract from GraphQL data in page
      try {
        const scripts = document.querySelectorAll("script");
        for (const script of scripts) {
          if (script.textContent.includes("difficulty")) {
            const match = script.textContent.match(/"difficulty":"(\w+)"/);
            if (match) {
              return (
                match[1].charAt(0).toUpperCase() +
                match[1].slice(1).toLowerCase()
              );
            }
          }
        }
      } catch (e) {
        console.warn("Could not extract difficulty from scripts:", e);
      }

      return "Unknown";
    }

    async extractTags() {
      const tags = [];

      // Try multiple tag selectors
      const selectors = [
        'a[class*="topic-tag"]',
        ".topic-tag",
        '[data-cy="topic-tag"]',
        'div[class*="TopicTags"] a',
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach((el) => {
            const tag = el.textContent.trim();
            if (tag && !tags.includes(tag)) {
              tags.push(tag);
            }
          });
          if (tags.length > 0) break;
        }
      }

      // Try to extract from page data
      if (tags.length === 0) {
        try {
          const scripts = document.querySelectorAll("script");
          for (const script of scripts) {
            if (script.textContent.includes("topicTags")) {
              const match = script.textContent.match(/"topicTags":\[(.*?)\]/);
              if (match) {
                const tagMatches = match[1].matchAll(/"name":"([^"]+)"/g);
                for (const tagMatch of tagMatches) {
                  tags.push(tagMatch[1]);
                }
                break;
              }
            }
          }
        } catch (e) {
          console.warn("Could not extract tags from scripts:", e);
        }
      }

      return tags;
    }

    extractDescription() {
      const selectors = [
        '[data-track-load="description_content"]',
        ".content__u3I1",
        ".question-content",
        'div[class*="Content"] div[class*="content"]',
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          // Get clean text without code blocks initially
          const text = element.textContent.trim().substring(0, 500);
          return text + (element.textContent.length > 500 ? "..." : "");
        }
      }

      return "";
    }

    async extractCompanies() {
      // Companies might require expansion or additional API calls
      const companies = [];
      const companyElements = document.querySelectorAll(
        '[data-cy="company-tag"], .company-tag',
      );

      companyElements.forEach((el) => {
        const company = el.textContent.trim();
        if (company && !companies.includes(company)) {
          companies.push(company);
        }
      });

      return companies;
    }

    extractAcceptance() {
      const selectors = ['div:contains("Acceptance")', ".text-green-s"];

      // Look for acceptance rate in text
      const allText = document.body.innerText;
      const match =
        allText.match(/Acceptance[:\s]*(\d+\.?\d*%)/i) ||
        allText.match(/通过率[:\s]*(\d+\.?\d*%)/);

      if (match) {
        return match[1];
      }

      return null;
    }

    getCachedProblemData() {
      try {
        const raw = sessionStorage.getItem("leetcode_problem_data");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const ageMs = Date.now() - new Date(parsed.timestamp || 0).getTime();
        if (Number.isFinite(ageMs) && ageMs < 10 * 60 * 1000) {
          return parsed;
        }
        return null;
      } catch (error) {
        return null;
      }
    }

    cacheProblemData(data) {
      try {
        sessionStorage.setItem("leetcode_problem_data", JSON.stringify(data));
      } catch (error) {
        // Ignore cache failures.
      }
    }

    extractProblemSlug() {
      const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
      return match ? match[1] : null;
    }

    async extractCode(language) {
      const codeFromDom = this.extractCodeFromDom();
      if (codeFromDom) return codeFromDom;

      const slug = this.extractProblemSlug();
      const codeFromStorage = this.extractCodeFromStorage(language, slug);
      if (codeFromStorage) return codeFromStorage;

      return null;
    }

    extractCodeFromDom() {
      const editorRoot = document.querySelector(".monaco-editor .view-lines");
      if (!editorRoot) return null;

      const lines = Array.from(editorRoot.querySelectorAll(".view-line"))
        .map((line, index) => ({
          index,
          top: this.parsePx(line.style.top),
          left: this.parsePx(line.style.left),
          text: line.innerText.replace(/\u00a0/g, " "),
        }))
        .sort((a, b) => {
          if (a.top !== b.top) return a.top - b.top;
          if (a.left !== b.left) return a.left - b.left;
          return a.index - b.index;
        })
        .map((line) => line.text);
      const code = lines.join("\n").trim();
      return code || null;
    }

    parsePx(value) {
      const parsed = Number.parseFloat(value || "0");
      return Number.isFinite(parsed) ? parsed : 0;
    }

    extractCodeFromStorage(language, slug) {
      const storages = [window.localStorage, window.sessionStorage];
      const lang = (language || "").toLowerCase();
      const slugLower = (slug || "").toLowerCase();

      for (const storage of storages) {
        if (!storage) continue;
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (!key) continue;
          const keyLower = key.toLowerCase();

          if (
            slugLower &&
            !keyLower.includes(slugLower) &&
            !keyLower.includes("code") &&
            !keyLower.includes("editor")
          ) {
            continue;
          }

          const raw = storage.getItem(key);
          if (!raw) continue;

          const parsed = this.tryParseJson(raw);
          if (parsed) {
            const found = this.findCodeInObject(parsed, lang);
            if (found) return found;
          }
        }
      }

      return null;
    }

    tryParseJson(value) {
      if (!value) return null;
      const trimmed = value.trim();
      if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        return null;
      }
    }

    findCodeInObject(obj, language) {
      const queue = [obj];
      const visited = new Set();

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== "object") continue;
        if (visited.has(current)) continue;
        visited.add(current);

        if (
          typeof current.code === "string" &&
          this.isMatchingLanguage(current, language)
        ) {
          if (this.looksLikeCode(current.code)) return current.code;
        }

        for (const value of Object.values(current)) {
          if (typeof value === "string") {
            if (this.looksLikeCode(value)) return value;
          } else if (value && typeof value === "object") {
            queue.push(value);
          }
        }
      }

      return null;
    }

    isMatchingLanguage(obj, language) {
      if (!language) return true;
      const lang = language.toLowerCase();
      const candidate = String(
        obj.language || obj.lang || obj.langSlug || obj.langSlugName || "",
      )
        .toLowerCase()
        .trim();
      return candidate ? candidate.includes(lang) : true;
    }

    looksLikeCode(text) {
      if (!text) return false;
      const trimmed = text.trim();
      if (trimmed.length < 10) return false;
      return (
        trimmed.includes("\n") ||
        trimmed.includes("def ") ||
        trimmed.includes("class ") ||
        trimmed.includes("import ")
      );
    }

    waitForElement(selector, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        const observer = new MutationObserver(() => {
          const element = document.querySelector(selector);
          if (element) {
            observer.disconnect();
            resolve(element);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        setTimeout(() => {
          observer.disconnect();
          reject(
            new Error(`Element ${selector} not found within ${timeout}ms`),
          );
        }, timeout);
      });
    }
  }

  // Listen for extraction requests from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractProblemData") {
      const extractor = new LeetCodeExtractor();
      extractor
        .extractProblemData({
          includeCode: request.includeCode === true,
          language: request.language || "python",
        })
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true; // Will respond asynchronously
    }
  });

  // Auto-extract and cache on page load
  window.addEventListener("load", async () => {
    try {
      const extractor = new LeetCodeExtractor();
      const data = await extractor.extractProblemData({ includeCode: false });

      // Cache in session storage for quick access
      sessionStorage.setItem("leetcode_problem_data", JSON.stringify(data));
    } catch (error) {
      console.error("Failed to auto-extract problem data:", error);
    }
  });
}
