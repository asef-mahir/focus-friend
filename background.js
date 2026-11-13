const INTERCEPTOR_SCRIPT_ID = "focus-friend-interceptor";
let refreshQueue = Promise.resolve();

function matchPatterns(domain) {
  return [`http://*.${domain}/*`, `https://*.${domain}/*`];
}

async function syncInterceptor() {
  const settings = await chrome.storage.sync.get({
    enabled: true,
    enabled_sites: []
  });

  const matches = [];
  const enabledSites = Array.isArray(settings.enabled_sites) ? settings.enabled_sites : [];
  if (settings.enabled) {
    for (const domain of enabledSites) {
      const patterns = matchPatterns(domain);
      const hasPermission = await chrome.permissions.contains({ origins: patterns });
      if (hasPermission) matches.push(...patterns);
    }
  }

  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [INTERCEPTOR_SCRIPT_ID]
  });
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [INTERCEPTOR_SCRIPT_ID] });
  }

  if (matches.length) {
    await chrome.scripting.registerContentScripts([{
      id: INTERCEPTOR_SCRIPT_ID,
      matches,
      css: ["interceptor.css"],
      js: ["interceptor.js"],
      runAt: "document_start",
      persistAcrossSessions: true
    }]);
  }
}

// Serialize refreshes so quick setting changes do not race each other.
function scheduleInterceptorSync() {
  refreshQueue = refreshQueue
    .then(syncInterceptor)
    .catch((error) => console.error("Could not update Focus Friend site access:", error));
  return refreshQueue;
}

// Show the welcome/settings page once, when Focus Friend is first installed.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
  void scheduleInterceptorSync();
});

chrome.runtime.onStartup.addListener(() => {
  void scheduleInterceptorSync();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.continue_checkin_enabled?.newValue === false) {
    void chrome.storage.local.remove("not_now_daily_counts");
  }

  if (areaName === "sync" && ["enabled", "enabled_sites"].some((key) => key in changes)) {
    void scheduleInterceptorSync();
  }
});

chrome.permissions.onAdded.addListener(() => {
  void scheduleInterceptorSync();
});

chrome.permissions.onRemoved.addListener(() => {
  void scheduleInterceptorSync();
});

// Content scripts ask the service worker for packaged language text.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "getCopy") return;
  if (message.language !== "bn" && message.language !== "en") return;

  fetch(chrome.runtime.getURL(`content/${message.language}.json`))
    .then((response) => response.json())
    .then(sendResponse)
    .catch((error) => {
      console.error("Could not load Focus Friend language copy:", error);
      sendResponse({ error: "Could not load language copy." });
    });
  return true;
});

void scheduleInterceptorSync();
