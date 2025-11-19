// service_worker.js (Manifest V3)

const SYNC_INTERVAL_MIN = 1;      // minutes - how often we attempt to sync batched events
const FLUSH_BATCH_SIZE = 50;      // when to immediately upload
const RULE_ID_START = 1000;

let state = {
  trackingEnabled: true,
  lastActiveInfo: null,   // {tabId, url, title, startTs}
  batch: []               // array of {url, domain, startTs, endTs, title}
};

const apiBase = "http://localhost:5000/api"; // replace with deployed

// helper
function domainFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./,'');
  } catch(e){ return null; }
}

// persist small state
async function saveLocal() {
  await chrome.storage.local.set({ ft_state: state });
}
async function loadLocal() {
  const res = await chrome.storage.local.get({ ft_state: null });
  if (res.ft_state) state = res.ft_state;
}
loadLocal();

// Broadcast to popup
function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(()=>{});
}

// Start periodic alarm to flush
chrome.alarms.create("ft_sync", { periodInMinutes: SYNC_INTERVAL_MIN });

// event: tab activated
chrome.tabs.onActivated.addListener(async (info) => {
  if (!state.trackingEnabled) return;
  try {
    const tab = await chrome.tabs.get(info.tabId);
    handleTabChange(tab);
  } catch(e){}
});

// event: tab updated (e.g., URL changed in same tab or SPA title changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!state.trackingEnabled) return;
  if (changeInfo.status === "complete" || changeInfo.url) {
    handleTabChange(tab);
  }
});

// window focus changed
chrome.windows.onFocusChanged.addListener((winId) => {
  if (!state.trackingEnabled) return;
  if (winId === chrome.windows.WINDOW_ID_NONE) {
    // blurred
    recordActiveEnd();
  } else {
    // get active tab in this window
    chrome.tabs.query({active:true, windowId: winId}, tabs => {
      if (tabs && tabs[0]) handleTabChange(tabs[0]);
    });
  }
});

// idle state changes (system idle)
chrome.idle.onStateChanged.addListener((newState) => {
  if (newState !== "active") {
    recordActiveEnd();
  } else {
    // active again -> get current active tab
    chrome.tabs.query({active:true, currentWindow:true}, tabs=>{
      if (tabs && tabs[0]) handleTabChange(tabs[0]);
    });
  }
});

// handle tab change: close previous active and start new
function handleTabChange(tab) {
  // ignore chrome://, extensions, etc
  if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) return;
  const now = Date.now();
  // if lastActive exists, end it
  if (state.lastActiveInfo && state.lastActiveInfo.tabId !== tab.id) {
    recordActiveEnd(now);
  }
  // set new active if not same
  if (!state.lastActiveInfo || state.lastActiveInfo.tabId !== tab.id || state.lastActiveInfo.url !== tab.url) {
    state.lastActiveInfo = {
      tabId: tab.id,
      url: tab.url,
      title: tab.title || "",
      startTs: now
    };
    saveLocal();
    broadcast({ type: "activeChanged", data: state.lastActiveInfo });
  }
}

// End the active interval and push to batch
function recordActiveEnd(endTs = Date.now()) {
  if (!state.lastActiveInfo) return;
  const rec = {
    url: state.lastActiveInfo.url,
    domain: domainFromUrl(state.lastActiveInfo.url),
    title: state.lastActiveInfo.title,
    startTs: state.lastActiveInfo.startTs,
    endTs
  };
  // filter extremely short interactions (<2s)
  if ((rec.endTs - rec.startTs) > 2000) {
    state.batch.push(rec);
  }
  state.lastActiveInfo = null;
  saveLocal();
  if (state.batch.length >= FLUSH_BATCH_SIZE) uploadBatch();
  broadcast({ type: "batchUpdated", size: state.batch.length });
}

// periodic alarm handler - flush batch
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ft_sync") {
    if (state.batch.length > 0) uploadBatch();
  }
});

// attempt upload to server
async function uploadBatch() {
  if (!state.batch.length) return;
  // get token
  const storage = await chrome.storage.sync.get({ token: null });
  const token = storage.token;
  const send = state.batch.splice(0, 200); // limit per upload
  saveLocal();

  try {
    await fetch(`${apiBase}/activity/batch`, {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization": token ? `Bearer ${token}` : ""
      },
      body: JSON.stringify({ activities: send })
    });
    broadcast({ type: "batchUploaded", count: send.length });
  } catch (err) {
    // on failure, requeue at front
    state.batch = send.concat(state.batch);
    saveLocal();
    console.error("Upload failed:", err);
  }
}

// BLOCKING RULES: update with domain list
async function updateBlockRules(domains) {
  // remove previous rules starting at RULE_ID_START
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const ourIds = existing.filter(r => r.id >= RULE_ID_START).map(r=>r.id);
    if (ourIds.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ourIds, addRules: [] });
  } catch(e) { console.warn(e); }

  const rules = domains.map((d,i) => ({
    id: RULE_ID_START + i,
    priority: 1,
    action: { type: "block" },
    condition: { urlFilter: `||${d}^`, resourceTypes: ["main_frame"] }
  }));
  if (rules.length) {
    try { await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules, removeRuleIds: [] }); }
    catch(e) { console.error("Failed to add rules:", e); }
  }
  chrome.storage.sync.set({ blockedDomains: domains });
  broadcast({ type: "blockRulesUpdated", blockedDomains: domains });
}

// listen messages from popup for toggles, set blocked list, manual flush, auth token updates
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "setTracking") {
    state.trackingEnabled = !!msg.enabled;
    if (!state.trackingEnabled) recordActiveEnd();
    saveLocal();
  } else if (msg.type === "setBlocked") {
    updateBlockRules(msg.domains || []);
  } else if (msg.type === "flush") {
    uploadBatch();
  } else if (msg.type === "getState") {
    sendResponse({ state });
  }
  // indicate sync handled
  return true;
});
