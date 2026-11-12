let settings;
let copy;

function render() {
  const text = copy.popup;
  document.documentElement.lang = settings.language;
  document.querySelector("#status").textContent = settings.enabled ? text.on : text.off;
  document.querySelector("#toggle-button").textContent = settings.enabled ? text.turnOff : text.turnOn;
  document.querySelector("#language-button").textContent = text.language;
  document.querySelector("#settings-button").textContent = text.settings;
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
