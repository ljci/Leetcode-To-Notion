// background.js - Minimal service worker

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs
      .create({
        url: "https://www.notion.so/my-integrations",
      })
      .catch(() => {});
  }
});

// Keep alive
chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => {
  chrome.storage.local.get("timerState", () => {});
});
