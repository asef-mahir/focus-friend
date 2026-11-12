const copyByLanguage = {
  bn: "bn",
  en: "en"
};

let settings;
let copy;

async function loadCopy(language) {
  const response = await fetch(chrome.runtime.getURL(`content/${copyByLanguage[language]}.json`));
  return response.json();
}

async function render() {
  copy = await loadCopy(settings.language);
  const text = copy.settings;
  document.documentElement.lang = settings.language;
  document.title = text.pageTitle;

  document.querySelector("#onboarding").textContent = copy.onboarding;
  document.querySelector("#intro-copy").textContent = text.intro;
  document.querySelector("#sites-heading").textContent = text.sitesHeading;
  document.querySelector("#sites-description").textContent = text.sitesDescription;
  document.querySelector("#site-input-label").textContent = text.siteInputLabel;
  document.querySelector("#site-input").placeholder = text.sitePlaceholder;
  document.querySelector("#add-button").textContent = text.addButton;
  document.querySelector("#youtube-warning").textContent = text.youtubeWarning;
  document.querySelector("#cooldown-label").textContent = text.cooldownLabel;
  document.querySelector("#cooldown-description").textContent = text.cooldownDescription;
  document.querySelector("#minutes-label").textContent = text.minutes;
  document.querySelector("#footer-note").textContent = text.footerNote;
  document.querySelector("#debounce-input").value = settings.debounce_minutes;

  document.querySelectorAll("[data-language]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.language === settings.language));
  });

  renderSites(text);
}

function renderSites(text) {
  const list = document.querySelector("#site-list");
  list.replaceChildren();

  for (const domain of settings.sites) {
    const row = document.createElement("li");
    row.className = "site-row";

    const label = document.createElement("label");
    label.className = "site-name";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = settings.enabled_sites.includes(domain);
    toggle.setAttribute("aria-label", `${text.toggleSite} ${domain}`);
    toggle.addEventListener("change", async () => {
      settings.enabled_sites = toggle.checked
        ? [...new Set([...settings.enabled_sites, domain])]
        : settings.enabled_sites.filter((site) => site !== domain);
      await FocusStorage.saveSettings(settings);
    });

    const name = document.createElement("span");
    name.textContent = domain;
    label.append(toggle, name);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = text.removeButton;
    remove.addEventListener("click", async () => {
      settings.sites = settings.sites.filter((site) => site !== domain);
      settings.enabled_sites = settings.enabled_sites.filter((site) => site !== domain);
      await FocusStorage.saveSettings(settings);
      await render();
    });

    row.append(label, remove);
    list.append(row);
  }
}

document.querySelector("#add-site-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#site-input");
  const message = document.querySelector("#form-message");
  const domain = FocusStorage.normalizeDomain(input.value);

  if (!domain) {
    message.textContent = copy.settings.invalidDomain;
    return;
  }
  if (settings.sites.includes(domain)) {
    message.textContent = copy.settings.duplicateDomain;
    return;
  }

  settings.sites = [...settings.sites, domain];
  settings.enabled_sites = [...settings.enabled_sites, domain];
  await FocusStorage.saveSettings(settings);
  input.value = "";
  message.textContent = "";
  await render();
});

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", async () => {
    settings.language = button.dataset.language;
    await FocusStorage.saveSettings(settings);
    await render();
  });
});

document.querySelector("#debounce-input").addEventListener("change", async (event) => {
  const value = Number.parseInt(event.target.value, 10);
  settings.debounce_minutes = Math.min(240, Math.max(1, Number.isFinite(value) ? value : 20));
  await FocusStorage.saveSettings(settings);
  event.target.value = settings.debounce_minutes;
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync" || !settings) return;
  if (["sites", "enabled_sites", "language", "debounce_minutes"].some((key) => key in changes)) {
    settings = await FocusStorage.getSettings();
    await render();
  }
});

(async function start() {
  settings = await FocusStorage.getSettings();
  await render();
})();
