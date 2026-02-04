let settings = null;
let detectedGames = [];
let libraryGames = [];
let selectedKey = null;
let activity = [];
let libraryFilter = "";
let selectedAppId = null;
let showAllGrid = false;
let historyStack = [{ view: "dashboard", payload: null }];
let historyIndex = 0;
let currentGame = null;

const pageTitles = {
  dashboard: "Dashboard",
  library: "Library",
  overrides: "Overrides",
  settings: "Settings"
};

const pageSubtitles = {
  dashboard: "Local games sync status and activity.",
  library: "Browse detected games and metadata.",
  overrides: "Configure launchers and alternate executables.",
  settings: "Sync options, SteamGridDB, and launch controls."
};

function fileUrl(filePath) {
  if (!filePath) return null;
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

function requireSettings(actionLabel) {
  if (!settings) {
    updateStatusMessage(`${actionLabel} failed: settings not loaded.`);
    return false;
  }
  if (!window.steamSyncer) {
    updateStatusMessage(`${actionLabel} failed: bridge not available.`);
    return false;
  }
  return true;
}

function updateStatusMessage(message) {
  const statusText = document.getElementById("statusText");
  if (statusText) statusText.textContent = message;
}

function setIndicator(state) {
  const statusIndicator = document.getElementById("statusIndicator");
  if (!statusIndicator) return;
  const colors = {
    idle: "#66c0f4",
    scanning: "#f0b429",
    syncing: "#66c0f4",
    synced: "#66c0f4",
    error: "#ff6b6b"
  };
  statusIndicator.style.background = colors[state] || "#66c0f4";
}

function applyStatus(status) {
  const lastSync = document.getElementById("lastSync");
  const found = document.getElementById("found");
  const added = document.getElementById("added");
  const pendingArtwork = document.getElementById("pendingArtwork");
  if (lastSync) {
    lastSync.textContent = status.lastSyncAt
      ? new Date(status.lastSyncAt).toLocaleString()
      : "Never";
  }
  if (found) found.textContent = status.found ?? 0;
  if (added) added.textContent = status.added ?? 0;
  if (pendingArtwork) pendingArtwork.textContent = status.pendingArtwork ?? 0;
  setIndicator(status.state);
  updateStatusMessage(status.message || "");
  activity.unshift(`[${new Date().toLocaleTimeString()}] ${status.message}`);
  activity = activity.slice(0, 6);
  renderActivity();
}

function renderActivity() {
  const activityLog = document.getElementById("activityLog");
  if (!activityLog) return;
  activityLog.innerHTML = "";
  activity.forEach((entry) => {
    const row = document.createElement("div");
    row.textContent = entry;
    activityLog.appendChild(row);
  });
}

function renderSettings() {
  const folderList = document.getElementById("folderList");
  const knownStores = document.getElementById("knownStores");
  const apiKey = document.getElementById("apiKey");
  const overrideCount = document.getElementById("overrideCount");
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
  if (overrideCount) overrideCount.textContent = Object.keys(settings.launchOverrides || {}).length;
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
      closeOverrideEditor();
      renderOverrides();
      renderSettings();
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

function closeOverrideEditor() {
  const overrideEditor = document.getElementById("overrideEditor");
  if (overrideEditor) overrideEditor.classList.add("hidden");
}

function setView(view) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.dataset.view === view);
  });
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  if (pageTitle) pageTitle.textContent = pageTitles[view] || "";
  if (pageSubtitle) pageSubtitle.textContent = pageSubtitles[view] || "";
}

function navigate(view, payload = null, replace = false) {
  if (replace) {
    historyStack[historyIndex] = { view, payload };
  } else {
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push({ view, payload });
    historyIndex = historyStack.length - 1;
  }
  setView(view);
  updateNavButtons();
}

function updateNavButtons() {
  const backBtn = document.getElementById("navBack");
  const forwardBtn = document.getElementById("navForward");
  if (backBtn) backBtn.disabled = historyIndex <= 0;
  if (forwardBtn) forwardBtn.disabled = historyIndex >= historyStack.length - 1;
}

function goBack() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  const state = historyStack[historyIndex];
  setView(state.view);
  if (state.view === "game" && state.payload) {
    openGamePage(state.payload, true);
  }
  updateNavButtons();
}

function goForward() {
  if (historyIndex >= historyStack.length - 1) return;
  historyIndex += 1;
  const state = historyStack[historyIndex];
  setView(state.view);
  if (state.view === "game" && state.payload) {
    openGamePage(state.payload, true);
  }
  updateNavButtons();
}

function renderLibrary() {
  const libraryGrid = document.getElementById("libraryGrid");
  const libraryCarousel = document.getElementById("libraryCarousel");
  const libraryGridWrap = document.getElementById("libraryGridWrap");
  const heroTitle = document.getElementById("heroTitle");
  const heroMeta = document.getElementById("heroMeta");
  const heroIcon = document.getElementById("heroIcon");
  const libraryHero = document.getElementById("libraryHero");
  if (!libraryGrid) return;
  libraryGrid.innerHTML = "";
  if (libraryCarousel) libraryCarousel.innerHTML = "";
  const totalDetected = document.getElementById("totalDetected");
  if (totalDetected) totalDetected.textContent = libraryGames.length;
  const filtered = libraryGames.filter((game) =>
    game.name.toLowerCase().includes(libraryFilter) ||
    game.source.toLowerCase().includes(libraryFilter)
  );

  const featured = pickFeaturedGame(filtered);
  if (heroTitle) heroTitle.textContent = featured ? featured.name : "No recent game";
  if (heroMeta) {
    heroMeta.textContent = featured
      ? `${featured.source.toUpperCase()} · Last played ${formatLastPlayed(featured.lastPlayed)}`
      : "Select a game to view details.";
  }
  if (heroIcon) {
    heroIcon.innerHTML = "";
    if (featured?.iconPath) {
      const icon = document.createElement("img");
      icon.src = fileUrl(featured.iconPath);
      icon.style.width = "100%";
      icon.style.height = "100%";
      icon.style.objectFit = "cover";
      icon.style.borderRadius = "12px";
      heroIcon.appendChild(icon);
    } else {
      heroIcon.textContent = featured ? featured.name.slice(0, 1).toUpperCase() : "★";
    }
  }
  if (libraryHero) {
    const heroImage = featured?.heroPath || featured?.gridPath;
    libraryHero.style.backgroundImage = heroImage ? `url(${fileUrl(heroImage)})` : "none";
    libraryHero.style.backgroundSize = "cover";
    libraryHero.style.backgroundPosition = "center";
  }

  if (libraryCarousel) {
    filtered.forEach((game) => {
      const card = createGameCard(game, "carousel");
      libraryCarousel.appendChild(card);
    });
  }

  if (libraryGridWrap) {
    const shouldShow = showAllGrid || libraryFilter.length > 0;
    libraryGridWrap.classList.toggle("hidden", !shouldShow);
  }
  filtered.forEach((game) => {
    const card = createGameCard(game, "grid");
    libraryGrid.appendChild(card);
  });
}

function showDetails(game) {
  openGamePage(game, false);
}

function openGamePage(game, replace) {
  const detailHero = document.getElementById("detailHero");
  const detailName = document.getElementById("detailName");
  const detailSource = document.getElementById("detailSource");
  const detailAppId = document.getElementById("detailAppId");
  const detailExe = document.getElementById("detailExe");
  const detailStartDir = document.getElementById("detailStartDir");
  const detailArgs = document.getElementById("detailArgs");
  const detailLastPlayed = document.getElementById("detailLastPlayed");
  const detailArtwork = document.getElementById("detailArtwork");
  currentGame = game;
  selectedKey = buildKey(game.name, game.exePath);
  selectedAppId = game.appId;
  renderLibrary();
  if (detailHero) {
    const hero = game.heroPath || game.gridPath;
    detailHero.style.backgroundImage = hero ? `url(${fileUrl(hero)})` : "none";
    detailHero.style.backgroundSize = "cover";
    detailHero.style.backgroundPosition = "center";
  }
  if (detailName) detailName.textContent = game.name;
  if (detailSource) detailSource.textContent = game.source.toUpperCase();
  if (detailAppId) detailAppId.textContent = String(game.appId);
  if (detailExe) detailExe.textContent = game.exePath;
  if (detailStartDir) detailStartDir.textContent = game.startDir;
  if (detailArgs) detailArgs.textContent = game.launchOptions || "-";
  if (detailLastPlayed) {
    detailLastPlayed.textContent = game.lastPlayed && game.lastPlayed > 1000000000
      ? new Date(game.lastPlayed * 1000).toLocaleString()
      : "Not available";
  }
  if (detailArtwork) {
    const status = [
      game.gridPath ? "Cover" : "Cover missing",
      game.heroPath ? "Hero" : "Hero missing",
      game.iconPath ? "Icon" : "Icon missing"
    ];
    detailArtwork.textContent = status.join(" · ");
  }
  navigate("game", game, replace);
}

function pickFeaturedGame(games) {
  if (!games.length) return null;
  const sorted = [...games].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  return sorted[0];
}

function formatLastPlayed(lastPlayed) {
  if (!lastPlayed || lastPlayed < 1000000000) return "Not available";
  return new Date(lastPlayed * 1000).toLocaleString();
}

function createGameCard(game, variant) {
  const card = document.createElement("div");
  card.className = "game-card";
  if (selectedAppId === game.appId) card.classList.add("active");
  if (variant) card.classList.add(`${variant}-card`);
  const cover = document.createElement("div");
  cover.className = "game-cover";
  const coverFile = variant === "carousel" ? (game.heroPath || game.gridPath) : game.gridPath || game.heroPath;
  if (coverFile) cover.style.backgroundImage = `url(${fileUrl(coverFile)})`;
  cover.style.backgroundSize = "cover";
  cover.style.backgroundPosition = "center";

  if (game.iconPath) {
    const icon = document.createElement("img");
    icon.className = "game-cover__icon";
    icon.src = fileUrl(game.iconPath);
    cover.appendChild(icon);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "game-cover__placeholder";
    placeholder.textContent = game.name.slice(0, 1).toUpperCase();
    cover.appendChild(placeholder);
  }
  const info = document.createElement("div");
  info.className = "game-info";
  const title = document.createElement("div");
  title.className = "game-title";
  title.textContent = game.name;
  const sub = document.createElement("div");
  sub.className = "game-sub";
  sub.textContent = game.source.toUpperCase();
  info.append(title, sub);
  card.append(cover, info);
  card.addEventListener("click", () => showDetails(game));
  return card;
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => navigate(item.dataset.view));
  });

  const syncBtn = document.getElementById("syncBtn");
  const launchBtn = document.getElementById("launchBtn");
  const launchBigPictureBtn = document.getElementById("launchBigPictureBtn");
  const addFolder = document.getElementById("addFolder");
  const knownStores = document.getElementById("knownStores");
  const apiKey = document.getElementById("apiKey");
  const saveSettingsBtn = document.getElementById("saveSettings");
  const openLogs = document.getElementById("openLogs");
  const toggleApiKey = document.getElementById("toggleApiKey");
  const refreshGames = document.getElementById("refreshGames");
  const pickExe = document.getElementById("pickExe");
  const pickDir = document.getElementById("pickDir");
  const saveOverride = document.getElementById("saveOverride");
  const clearOverride = document.getElementById("clearOverride");
  const editOverrideFromDetail = document.getElementById("editOverrideFromDetail");
  const librarySearch = document.getElementById("librarySearch");
  const seeAllBtn = document.getElementById("seeAllBtn");
  const heroViewDetails = document.getElementById("heroViewDetails");
  const navBack = document.getElementById("navBack");
  const navForward = document.getElementById("navForward");

  syncBtn?.addEventListener("click", async () => {
    if (!requireSettings("Sync")) return;
    await window.steamSyncer.sync();
    await refreshLibrary();
  });
  launchBtn?.addEventListener("click", async () => {
    if (!requireSettings("Launch")) return;
    await window.steamSyncer.launchSteam();
  });
  launchBigPictureBtn?.addEventListener("click", async () => {
    if (!requireSettings("Launch Big Picture")) return;
    await window.steamSyncer.launchSteamBigPicture();
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
  saveSettingsBtn?.addEventListener("click", async () => {
    if (!requireSettings("Save Settings")) return;
    settings.steamGridDbApiKey = apiKey.value.trim();
    settings = await window.steamSyncer.saveSettings(settings);
  });
  openLogs?.addEventListener("click", async () => {
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
    const selected = await window.steamSyncer.chooseExe();
    const overrideExe = document.getElementById("overrideExe");
    if (selected && overrideExe) overrideExe.value = selected;
  });
  pickDir?.addEventListener("click", async () => {
    const selected = await window.steamSyncer.chooseFolder();
    const overrideDir = document.getElementById("overrideDir");
    if (selected && overrideDir) overrideDir.value = selected;
  });
  saveOverride?.addEventListener("click", async () => {
    if (!requireSettings("Save Override")) return;
    const overrideName = document.getElementById("overrideName");
    const overrideExe = document.getElementById("overrideExe");
    const overrideDir = document.getElementById("overrideDir");
    const overrideArgs = document.getElementById("overrideArgs");
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
    closeOverrideEditor();
    renderOverrides();
    renderSettings();
    await refreshLibrary();
  });
  clearOverride?.addEventListener("click", async () => {
    if (!requireSettings("Clear Override")) return;
    if (!selectedKey) return;
    const overrides = settings.launchOverrides || {};
    delete overrides[selectedKey];
    settings.launchOverrides = overrides;
    settings = await window.steamSyncer.saveSettings(settings);
    closeOverrideEditor();
    renderOverrides();
    renderSettings();
    await refreshLibrary();
  });
  editOverrideFromDetail?.addEventListener("click", () => {
    if (!selectedKey) return;
    const target = detectedGames.find((game) => buildKey(game.name, game.exePath) === selectedKey);
    if (target) openOverrideEditor(target, selectedKey);
    navigate("overrides");
  });
  librarySearch?.addEventListener("input", (event) => {
    const target = event.target;
    if (target && typeof target.value === "string") {
      libraryFilter = target.value.trim().toLowerCase();
      renderLibrary();
    }
  });
  seeAllBtn?.addEventListener("click", () => {
    showAllGrid = true;
    renderLibrary();
    const gridWrap = document.getElementById("libraryGridWrap");
    if (gridWrap) gridWrap.scrollIntoView({ behavior: "smooth" });
  });
  heroViewDetails?.addEventListener("click", () => {
    const featured = pickFeaturedGame(libraryGames);
    if (featured) showDetails(featured);
  });
  navBack?.addEventListener("click", goBack);
  navForward?.addEventListener("click", goForward);

  window.steamSyncer.onStatus(applyStatus);
}

async function refreshLibrary() {
  libraryGames = await window.steamSyncer.getLibraryGames();
  renderLibrary();
}

async function init() {
  if (!window.steamSyncer) return;
  bindEvents();
  settings = await window.steamSyncer.getSettings();
  renderSettings();
  detectedGames = await window.steamSyncer.getDetectedGames();
  renderOverrides();
  await refreshLibrary();
  navigate("dashboard", null, true);
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
