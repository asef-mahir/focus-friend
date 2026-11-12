// Show the welcome/settings page once, when Focus Friend is first installed.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});
