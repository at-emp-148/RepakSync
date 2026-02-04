const statusText = document.getElementById("statusText");
const lastSync = document.getElementById("lastSync");
const found = document.getElementById("found");
const added = document.getElementById("added");
const statusIndicator = document.getElementById("statusIndicator");
const syncBtn = document.getElementById("syncBtn");
const launchBtn = document.getElementById("launchBtn");
const folderList = document.getElementById("folderList");
const addFolder = document.getElementById("addFolder");
const knownStores = document.getElementById("knownStores");
const apiKey = document.getElementById("apiKey");
const saveSettings = document.getElementById("saveSettings");
const openLogs = document.getElementById("openLogs");

let settings = null;

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
  knownStores.checked = settings.includeKnownStores;
  apiKey.value = settings.steamGridDbApiKey || "";
}

function applyStatus(status) {
  statusText.textContent = status.message || "";
  lastSync.textContent = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString()
    : "Never";
  found.textContent = status.found ?? 0;
  added.textContent = status.added ?? 0;
  setIndicator(status.state);
}

syncBtn.addEventListener("click", () => window.steamSyncer.sync());
launchBtn.addEventListener("click", () => window.steamSyncer.launchSteam());
addFolder.addEventListener("click", async () => {
  const selected = await window.steamSyncer.chooseFolder();
  if (!selected) return;
  if (!settings.scanFolders.includes(selected)) settings.scanFolders.push(selected);
  settings = await window.steamSyncer.saveSettings(settings);
  renderSettings();
});
knownStores.addEventListener("change", async () => {
  settings.includeKnownStores = knownStores.checked;
  settings = await window.steamSyncer.saveSettings(settings);
});
saveSettings.addEventListener("click", async () => {
  settings.steamGridDbApiKey = apiKey.value.trim();
  settings = await window.steamSyncer.saveSettings(settings);
});
openLogs.addEventListener("click", async () => {
  await window.steamSyncer.openLogs();
});

window.steamSyncer.onStatus(applyStatus);

(async () => {
  settings = await window.steamSyncer.getSettings();
  renderSettings();
})();
