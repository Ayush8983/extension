// content_script.js
let lastVisible = document.visibilityState;
document.addEventListener("visibilitychange", () => {
  chrome.runtime.sendMessage({ type: "visibilityChange", visible: document.visibilityState === "visible", url: location.href, title: document.title });
});
