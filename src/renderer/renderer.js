let settings = null;
let detectedGames = [];
let selectedKey = null;
let initError = null;
let initialized = false;

function requireSettings(actionLabel) {
  if (!settings) {
    if (statusText) statusText.textContent = `${actionLabel} failed: settings not loaded.`;
    return false;
  }
  if (!window.steamSyncer) {
    if (statusText) statusText.textContent = `${actionLabel} failed: bridge not available.`;
    return false;
  }
  return true;
}

function setIndicator(state) {
  const colors = {
    idle: "#4de0c6",
    scanning: "#ffb347",
    syncing: "#4d7cff",
    synced: "#4de0c6",
    error: "#ff6b6b"
  };
  statusIndicator.style.background = colors[state] || "#4de0c6";
  statusIndicator.style.boxShadow = `0 0 12px ${colors[state] || "#4de0c6"}`;
}

function renderSettings() {
  const folderList = document.getElementById("folderList");
  const knownStores = document.getElementById("knownStores");
  const apiKey = document.getElementById("apiKey");
  if (!folderList) return;
  folderList.innerHTML = "";
  settings.scanFolders.forEach((folder) => {
    const row = document.createElement("div");
    row.className = "folder-item";
    const label = document.createElement("span");
    label.textContent = folder;
    const remove = document.createElement("button");
    remove.className = "btn small ghost";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      settings.scanFolders = settings.scanFolders.filter((f) => f !== folder);
      settings = await window.steamSyncer.saveSettings(settings);
      renderSettings();
    });
    row.append(label, remove);
    folderList.appendChild(row);
  });
  if (knownStores) knownStores.checked = settings.includeKnownStores;
  if (apiKey) apiKey.value = settings.steamGridDbApiKey || "";
}

function buildKey(name, exePath) {
  return `${name.trim().toLowerCase()}::${exePath.replace(/^\"|\"$/g, "").trim().toLowerCase()}`;
}

function renderOverrides() {
  const overrideList = document.getElementById("overrideList");
  if (!overrideList) return;
  overrideList.innerHTML = "";
  const overrides = settings.launchOverrides || {};
  detectedGames.forEach((game) => {
    const key = buildKey(game.name, game.exePath);
    const override = overrides[key];
    const row = document.createElement("div");
    row.className = "override-item";

    const details = document.createElement("div");
    details.className = "override-details";
    const title = document.createElement("div");
    title.className = "override-title";
    title.textContent = game.name;
    const detected = document.createElement("div");
    detected.className = "override-meta";
    detected.textContent = `Detected: ${game.exePath}`;
    const current = document.createElement("div");
    current.className = "override-meta";
    current.textContent = override ? `Override: ${override.exePath}` : "Override: None";
    details.append(title, detected, current);

    const actions = document.createElement("div");
    actions.className = "override-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn small";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openOverrideEditor(game, key));
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn small ghost";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", async () => {
      delete overrides[key];
      settings.launchOverrides = overrides;
      settings = await window.steamSyncer.saveSettings(settings);
      renderOverrides();
    });
    actions.append(editBtn, clearBtn);

    row.append(details, actions);
    overrideList.appendChild(row);
  });
}

function openOverrideEditor(game, key) {
  const overrideEditor = document.getElementById("overrideEditor");
  const overrideTitle = document.getElementById("overrideTitle");
  const overrideName = document.getElementById("overrideName");
  const overrideExe = document.getElementById("overrideExe");
  const overrideDir = document.getElementById("overrideDir");
  const overrideArgs = document.getElementById("overrideArgs");
  if (!overrideEditor || !overrideTitle || !overrideName || !overrideExe || !overrideDir || !overrideArgs) return;
  selectedKey = key;
  const override = (settings.launchOverrides || {})[key];
  overrideTitle.textContent = `Edit Override: ${game.name}`;
  overrideName.value = override?.displayName || game.name;
  overrideExe.value = override?.exePath || game.exePath;
  overrideDir.value = override?.startDir || game.startDir;
  overrideArgs.value = override?.launchOptions || "";
  overrideEditor.classList.remove("hidden");
}

function applyStatus(status) {
  const statusText = document.getElementById("statusText");
  const lastSync = document.getElementById("lastSync");
  const found = document.getElementById("found");
  const added = document.getElementById("added");
  if (statusText) statusText.textContent = status.message || "";
  if (lastSync) lastSync.textContent = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString()
    : "Never";
  if (found) found.textContent = status.found ?? 0;
  if (added) added.textContent = status.added ?? 0;
  setIndicator(status.state);
}

function bindEvents() {
  if (initialized) return;
  initialized = true;
  const statusText = document.getElementById("statusText");
  const syncBtn = document.getElementById("syncBtn");
  const launchBtn = document.getElementById("launchBtn");
  const addFolder = document.getElementById("addFolder");
  const knownStores = document.getElementById("knownStores");
  const apiKey = document.getElementById("apiKey");
  const saveSettings = document.getElementById("saveSettings");
  const openLogs = document.getElementById("openLogs");
  const toggleApiKey = document.getElementById("toggleApiKey");
  const refreshGames = document.getElementById("refreshGames");
  const overrideExe = document.getElementById("overrideExe");
  const overrideDir = document.getElementById("overrideDir");
  const overrideName = document.getElementById("overrideName");
  const overrideArgs = document.getElementById("overrideArgs");
  const pickExe = document.getElementById("pickExe");
  const pickDir = document.getElementById("pickDir");
  const saveOverride = document.getElementById("saveOverride");
  const clearOverride = document.getElementById("clearOverride");

  syncBtn?.addEventListener("click", async () => {
    if (!requireSettings("Sync")) return;
    try {
      await window.steamSyncer.sync();
    } catch (error) {
      console.error("Sync failed", error);
      if (statusText) statusText.textContent = "Sync failed. Check logs/console.";
    }
  });
  launchBtn?.addEventListener("click", async () => {
    if (!requireSettings("Launch")) return;
    try {
      await window.steamSyncer.launchSteam();
    } catch (error) {
      console.error("Launch failed", error);
      if (statusText) statusText.textContent = "Launch failed. Check logs/console.";
    }
  });
  addFolder?.addEventListener("click", async () => {
    if (!requireSettings("Add Folder")) return;
    const selected = await window.steamSyncer.chooseFolder();
    if (!selected) return;
    if (!settings.scanFolders.includes(selected)) settings.scanFolders.push(selected);
    settings = await window.steamSyncer.saveSettings(settings);
    renderSettings();
  });
  knownStores?.addEventListener("change", async () => {
    if (!requireSettings("Update Settings")) return;
    settings.includeKnownStores = knownStores.checked;
    settings = await window.steamSyncer.saveSettings(settings);
  });
  saveSettings?.addEventListener("click", async () => {
    if (!requireSettings("Save Settings")) return;
    settings.steamGridDbApiKey = apiKey.value.trim();
    settings = await window.steamSyncer.saveSettings(settings);
  });
  openLogs?.addEventListener("click", async () => {
    if (!window.steamSyncer) return;
    await window.steamSyncer.openLogs();
  });
  toggleApiKey?.addEventListener("click", () => {
    if (!apiKey) return;
    const isHidden = apiKey.type === "password";
    apiKey.type = isHidden ? "text" : "password";
    toggleApiKey.textContent = isHidden ? "Hide" : "Show";
  });
  refreshGames?.addEventListener("click", async () => {
    if (!requireSettings("Refresh Games")) return;
    detectedGames = await window.steamSyncer.getDetectedGames();
    renderOverrides();
  });
  pickExe?.addEventListener("click", async () => {
    if (!requireSettings("Pick Executable")) return;
    const selected = await window.steamSyncer.chooseExe();
    if (selected && overrideExe) overrideExe.value = selected;
  });
  pickDir?.addEventListener("click", async () => {
    if (!requireSettings("Pick Folder")) return;
    const selected = await window.steamSyncer.chooseFolder();
    if (selected && overrideDir) overrideDir.value = selected;
  });
  saveOverride?.addEventListener("click", async () => {
    if (!requireSettings("Save Override")) return;
    if (!selectedKey) return;
    const overrides = settings.launchOverrides || {};
    overrides[selectedKey] = {
      key: selectedKey,
      displayName: overrideName?.value.trim() || "",
      exePath: overrideExe?.value.trim() || "",
      startDir: overrideDir?.value.trim() || "",
      launchOptions: overrideArgs?.value.trim() || ""
    };
    settings.launchOverrides = overrides;
    settings = await window.steamSyncer.saveSettings(settings);
    renderOverrides();
  });
  clearOverride?.addEventListener("click", async () => {
    if (!requireSettings("Clear Override")) return;
    if (!selectedKey) return;
    const overrides = settings.launchOverrides || {};
    delete overrides[selectedKey];
    settings.launchOverrides = overrides;
    settings = await window.steamSyncer.saveSettings(settings);
    renderOverrides();
  });

  window.steamSyncer.onStatus(applyStatus);
}

async function init() {
  if (!window.steamSyncer) return;
  bindEvents();
  try {
    settings = await window.steamSyncer.getSettings();
    renderSettings();
  } catch (error) {
    initError = error;
    console.error("Init failed", error);
    const statusText = document.getElementById("statusText");
    if (statusText) statusText.textContent = "Init failed. Check logs/console.";
    return;
  }
}

function waitForBridge() {
  if (window.steamSyncer) {
    init();
    return;
  }
  setTimeout(waitForBridge, 100);
}

window.addEventListener("DOMContentLoaded", () => {
  waitForBridge();
});
