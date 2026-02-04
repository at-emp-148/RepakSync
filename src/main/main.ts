import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import fs from "node:fs";
import { loadSettings, saveSettings } from "./settings.js";
import { runSync } from "./sync.js";
import { getSteamPath, isSteamRunning, launchSteam } from "./steam.js";
import { Settings, SyncStatus } from "../shared/types.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let lastStatus: SyncStatus = { state: "idle", message: "Ready." };
let syncing = false;
let steamLaunchHandledAt: number | null = null;

const ICON_PATH = path.join(app.getAppPath(), "assets", "tray.png");

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0e1016",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "main", "preload.js"),
      contextIsolation: true
    }
  });

  win.loadFile(path.join(app.getAppPath(), "src", "renderer", "index.html"));
  return win;
}

function createTray(): void {
  if (!fs.existsSync(ICON_PATH)) return;
  tray = new Tray(nativeImage.createFromPath(ICON_PATH));
  const menu = Menu.buildFromTemplate([
    { label: "Open Steam Syncer", click: () => mainWindow?.show() },
    { label: "Run Sync", click: () => triggerSync() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]);
  tray.setToolTip("Steam Syncer");
  tray.setContextMenu(menu);
  tray.on("click", () => mainWindow?.show());
}

function updateStatus(status: SyncStatus): void {
  lastStatus = status;
  mainWindow?.webContents.send("status", status);
}

async function triggerSync(): Promise<void> {
  if (syncing) return;
  syncing = true;
  const settings = loadSettings();
  const result = await runSync(
    settings.scanFolders,
    settings.includeKnownStores,
    settings.steamGridDbApiKey,
    updateStatus
  );
  updateStatus(result.status);
  syncing = false;
}

function setupIpc(): void {
  ipcMain.handle("get-settings", () => loadSettings());
  ipcMain.handle("save-settings", (_, settings: Settings) => {
    saveSettings(settings);
    return settings;
  });
  ipcMain.handle("choose-folder", async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });
  ipcMain.handle("sync", async () => {
    await triggerSync();
    return lastStatus;
  });
  ipcMain.handle("launch-steam", async () => {
    if (syncing) return { ok: false, message: "Sync in progress" };
    const settings = loadSettings();
    await runSync(
      settings.scanFolders,
      settings.includeKnownStores,
      settings.steamGridDbApiKey,
      updateStatus
    );
    const steamPath = await getSteamPath();
    if (steamPath) await launchSteam(steamPath);
    return { ok: true };
  });
}

app.on("ready", () => {
  if (process.platform === "win32") {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  mainWindow = createWindow();
  createTray();
  setupIpc();
  triggerSync();
  startSteamWatch();
});

function startSteamWatch(): void {
  setInterval(async () => {
    if (syncing) return;
    const running = await isSteamRunning();
    if (!running) return;
    const now = Date.now();
    if (steamLaunchHandledAt && now - steamLaunchHandledAt < 5 * 60 * 1000) return;
    steamLaunchHandledAt = now;
    await triggerSync();
  }, 15000);
}

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("activate", () => {
  if (mainWindow === null) mainWindow = createWindow();
  mainWindow.show();
});
