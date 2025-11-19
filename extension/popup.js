// popup.js
const $ = id => document.getElementById(id);

// --- Utilities ---
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Default config
const defaultConfig = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakAfter: 4,
  blockedDomains: []
};

// --- UI Elements ---
const newTaskInput = $("new-task");
const addTaskBtn = $("add-task-btn");
const tasksList = $("tasks-list");

const timerDisplay = $("timer-display");
const startBtn = $("start-btn");
const pauseBtn = $("pause-btn");
const resetBtn = $("reset-btn");
const modeLabel = $("mode-label");
const pomodoroCountLabel = $("pomodoro-count");

const newDomainInput = $("new-domain");
const addDomainBtn = $("add-domain-btn");
const blockedList = $("blocked-list");

const statTasks = $("stat-tasks");
const statPomos = $("stat-pomos");
const openOptions = $("open-options");

// --- State (popup copies storage) ---
let tasks = [];
let config = {...defaultConfig};
let timerState = {
  running: false,
  mode: "work", // work | shortBreak | longBreak
  remainingSeconds: config.workMinutes * 60,
  pomodorosCompleted: 0,
  alarmId: null
};
let stats = { tasksCompletedToday: 0, pomodorosToday: 0 };

// --- Persistence helpers ---
function saveToStorage(obj) {
  return new Promise(resolve => chrome.storage.sync.set(obj, resolve));
}
function getFromStorage(keys) {
  return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
}

// --- Render ---
function renderTasks() {
  tasksList.innerHTML = "";
  tasks.forEach((t, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span style="flex:1; ${t.done ? 'text-decoration:line-through;color:#777' : ''}">${t.title}</span>
      <span>
        <button data-i="${i}" class="toggle-btn">${t.done ? 'Undo' : 'Done'}</button>
        <button data-i="${i}" class="del-btn">Del</button>
      </span>`;
    tasksList.appendChild(li);
  });
}
function renderBlocked() {
  blockedList.innerHTML = "";
  (config.blockedDomains || []).forEach((d, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${d}</span><span><button data-i="${i}" class="unblock-btn">Unblock</button></span>`;
    blockedList.appendChild(li);
  });
}
function renderTimer() {
  timerDisplay.textContent = formatTime(timerState.remainingSeconds);
  modeLabel.textContent = `Mode: ${timerState.mode === "work" ? "Work" : (timerState.mode === "shortBreak" ? "Short break" : "Long break")}`;
  pomodoroCountLabel.textContent = `Pomodoros: ${timerState.pomodorosCompleted}`;
}
function renderStats() {
  statTasks.textContent = stats.tasksCompletedToday || 0;
  statPomos.textContent = stats.pomodorosToday || 0;
}

// --- Task logic ---
addTaskBtn.addEventListener("click", async () => {
  const title = newTaskInput.value.trim();
  if (!title) return;
  tasks.push({ title, done: false, createdAt: Date.now() });
  newTaskInput.value = "";
  await saveToStorage({ tasks });
  renderTasks();
  await updateStorageTasks(tasks);
});
tasksList.addEventListener("click", async (e) => {
  const idx = e.target.dataset.i;
  if (e.target.classList.contains("toggle-btn")) {
    tasks[idx].done = !tasks[idx].done;
    if (tasks[idx].done) {
      stats.tasksCompletedToday = (stats.tasksCompletedToday || 0) + 1;
      await saveToStorage({ stats });
      chrome.runtime.sendMessage({ type: "statsUpdated", stats });
    }
    await saveToStorage({ tasks });
    renderTasks();
  } else if (e.target.classList.contains("del-btn")) {
    tasks.splice(idx,1);
    await saveToStorage({ tasks });
    renderTasks();
  }
});

// --- Blocker logic ---
addDomainBtn.addEventListener("click", async () => {
  const d = newDomainInput.value.trim().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if (!d) return;
  if (!config.blockedDomains.includes(d)) {
    config.blockedDomains.push(d);
    await saveToStorage({ config });
    chrome.runtime.sendMessage({ type: "updateBlockRules", blockedDomains: config.blockedDomains });
    renderBlocked();
    newDomainInput.value = "";
  }
});
blockedList.addEventListener("click", async (e) => {
  const idx = e.target.dataset.i;
  if (e.target.classList.contains("unblock-btn")) {
    config.blockedDomains.splice(idx,1);
    await saveToStorage({ config });
    chrome.runtime.sendMessage({ type: "updateBlockRules", blockedDomains: config.blockedDomains });
    renderBlocked();
  }
});
openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open("options.html");
});

// --- Timer logic (uses chrome.alarms via background) ---
startBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "timerStart" });
});
pauseBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "timerPause" });
});
resetBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "timerReset" });
});

// --- Sync with storage and runtime messages ---
async function init() {
  const data = await getFromStorage({ tasks: [], config: defaultConfig, timerState: null, stats: { tasksCompletedToday:0, pomodorosToday:0 } });
  tasks = data.tasks || [];
  config = Object.assign({}, defaultConfig, data.config || {});
  stats = data.stats || stats;
  // request current timer state from background
  chrome.runtime.sendMessage({ type: "getTimerState" }, (response) => {
    if (response && response.timerState) {
      timerState = Object.assign(timerState, response.timerState);
    } else {
      // initialize timerState values if absent
      timerState.mode = timerState.mode || "work";
      timerState.remainingSeconds = timerState.remainingSeconds || config.workMinutes * 60;
    }
    renderTimer();
  });
  renderTasks();
  renderBlocked();
  renderStats();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "timerTick") {
    timerState.remainingSeconds = msg.remainingSeconds;
    timerState.mode = msg.mode;
    timerState.pomodorosCompleted = msg.pomodorosCompleted || timerState.pomodorosCompleted;
    renderTimer();
  } else if (msg.type === "statsUpdated") {
    stats = msg.stats;
    renderStats();
  } else if (msg.type === "blockRulesUpdated") {
    // maybe show a quick flash or update UI — we'll just re-render
    config.blockedDomains = msg.blockedDomains || config.blockedDomains;
    renderBlocked();
  }
});

// helper to update storage tasks in background (for sync)
async function updateStorageTasks(tasks) {
  await chrome.storage.sync.set({ tasks });
  chrome.runtime.sendMessage({ type: "tasksUpdated", tasks });
}

// startup
init();
