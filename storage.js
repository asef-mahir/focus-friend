// These are the settings Focus Friend uses when someone installs it for the first time.
const DEFAULT_SETTINGS = {
  sites: [
    "instagram.com",
    "facebook.com",
    "tiktok.com",
    "x.com",
    "reddit.com",
    "discord.com"
  ],
  enabled_sites: [
    "instagram.com",
    "facebook.com",
    "tiktok.com",
    "x.com",
    "reddit.com",
    "discord.com"
  ],
  language: "bn",
  enabled: true,
  debounce_minutes: 20,
  continue_checkin_enabled: true,
  time_checkin_enabled: false,
  time_checkin_minutes: 20
};

// Read saved choices. If this is the first run, save the defaults so they persist.
async function getSettings() {
  const saved = await chrome.storage.sync.get(null);
  // copying deafult and saved object to combine them. deafult is copied first cz the updated stuffs will get replaced by saved preference.
  const settings = { ...DEFAULT_SETTINGS, ...saved };

  if (!Array.isArray(saved.sites)) settings.sites = [...DEFAULT_SETTINGS.sites];
  if (!Array.isArray(saved.enabled_sites)) {
    settings.enabled_sites = [...settings.sites];
  }
  if (settings.language !== "bn" && settings.language !== "en") {
    settings.language = DEFAULT_SETTINGS.language;
  }
  if (typeof settings.continue_checkin_enabled !== "boolean") {
    settings.continue_checkin_enabled = DEFAULT_SETTINGS.continue_checkin_enabled;
  }
  if (typeof settings.time_checkin_enabled !== "boolean") {
    settings.time_checkin_enabled = DEFAULT_SETTINGS.time_checkin_enabled;
  }
  if (typeof settings.time_checkin_minutes !== "number") {
    settings.time_checkin_minutes = DEFAULT_SETTINGS.time_checkin_minutes;
  }

  if (!Array.isArray(saved.sites)) {
    await chrome.storage.sync.set({
      sites: settings.sites,
      enabled_sites: settings.enabled_sites,
      language: settings.language,
      enabled: settings.enabled,
      debounce_minutes: settings.debounce_minutes,
      continue_checkin_enabled: settings.continue_checkin_enabled,
      time_checkin_enabled: settings.time_checkin_enabled,
      time_checkin_minutes: settings.time_checkin_minutes
    });
  } else if (typeof saved.continue_checkin_enabled !== "boolean" || typeof saved.time_checkin_enabled !== "boolean") {
    await chrome.storage.sync.set({
      continue_checkin_enabled: settings.continue_checkin_enabled,
      time_checkin_enabled: settings.time_checkin_enabled,
      time_checkin_minutes: settings.time_checkin_minutes
    });
  }

  return settings;
}

// Save only the settings this version of Focus Friend understands
async function saveSettings(settings) {
  await chrome.storage.sync.set({
    sites: settings.sites,
    enabled_sites: settings.enabled_sites,
    language: settings.language,
    enabled: settings.enabled,
    debounce_minutes: settings.debounce_minutes,
    continue_checkin_enabled: settings.continue_checkin_enabled,
    time_checkin_enabled: settings.time_checkin_enabled,
    time_checkin_minutes: settings.time_checkin_minutes
  });
}

// Turn entries like "https://www.reddit.com/some-page" into "reddit.com".
function normalizeDomain(input) {
  const value = input.trim();
  if (!value) return null;

  let url;
  try {
    // Prepends https:// if a protocol is missing, then validates the URL
    url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const domain = url.hostname.toLowerCase().replace(/^www\./, "");
  const validDomain = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  return validDomain.test(domain) ? domain : null;
}

window.FocusStorage = { getSettings, saveSettings, normalizeDomain };
