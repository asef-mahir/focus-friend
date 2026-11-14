let settings;
let copy;

function render() {
  const text = copy.popup;
  document.documentElement.lang = settings.language;
  document.querySelector("#status").textContent = settings.enabled ? text.on : text.off;

  const toggleBtn = document.querySelector("#toggle-button");
  toggleBtn.textContent = settings.enabled ? text.turnOff : text.turnOn;
  toggleBtn.className = settings.enabled ? "main-button" : "main-button paused";

  const indicator = document.querySelector("#status-indicator");
  if (indicator) {
    indicator.className = settings.enabled ? "status-indicator" : "status-indicator paused";
  }
  document.body.classList.toggle("paused", !settings.enabled);

  document.querySelector("#language-button").textContent = text.language;
  document.querySelector("#language-button").setAttribute("aria-label", text.language);
  document.querySelector("#settings-title").textContent = text.settingsTitle;
  document.querySelector("#settings-desc").textContent = text.settingsDesc;
}

async function refresh() {
  settings = await FocusStorage.getSettings();
  const response = await fetch(chrome.runtime.getURL(`content/${settings.language}.json`));
  copy = await response.json();
  render();
}

document.querySelector("#toggle-button").addEventListener("click", async () => {
  settings.enabled = !settings.enabled;
  await FocusStorage.saveSettings(settings);
  await refresh();
});

document.querySelector("#language-button").addEventListener("click", async () => {
  settings.language = settings.language === "bn" ? "en" : "bn";
  await FocusStorage.saveSettings(settings);
  await refresh();
});

document.querySelector("#settings-button").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "sync" && Object.keys(changes).length) {
    await refresh();
  }
});

refresh();
