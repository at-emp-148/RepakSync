import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import path from "node:path";
import fs from "node:fs";
import { loadSettings, saveSettings } from "./settings.js";
import { runSync } from "./sync.js";
import {
  buildShortcutKey,
  computeAppId,
  computeShortcutAppId,
  findPrimarySteamUserId,
  getShortcutAppId,
  getSteamPath,
  getUserdataPath,
  isSteamRunning,
  launchSteam,
  launchSteamBigPicture,
  readShortcuts
} from "./steam.js";
import { LibraryGame, Settings, SyncStatus } from "../shared/types.js";
import { getLogPath, log } from "./logger.js";
import { getKnownStoreFolders, scanFolders } from "./scanner.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let lastStatus: SyncStatus = { state: "idle", message: "Ready." };
let syncing = false;
let steamLaunchHandledAt: number | null = null;

const ICON_PATH = path.join(app.getAppPath(), "assets", "tray.png");

function createWindow(): BrowserWindow {
  const preloadPath = resolvePreloadPath();
  const win = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0e1016",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(app.getAppPath(), "src", "renderer", "index.html"));
  return win;
}

function resolvePreloadPath(): string {
  const candidateCjs = path.join(app.getAppPath(), "src", "main", "preload.cjs");
  if (fs.existsSync(candidateCjs)) return candidateCjs;
  return path.join(app.getAppPath(), "dist", "main", "preload.js");
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
  log("info", "Triggering sync");
  const settings = loadSettings();
  const result = await runSync(settings, updateStatus);
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
    log("info", "Choose folder requested");
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });
  ipcMain.handle("choose-exe", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Executable", extensions: ["exe"] }]
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });
  ipcMain.handle("get-detected-games", async () => {
    const settings = loadSettings();
    const folders = settings.includeKnownStores
      ? [...settings.scanFolders, ...getKnownStoreFolders()]
      : [...settings.scanFolders];
    return scanFolders(folders);
  });
  ipcMain.handle("get-library-games", async () => {
    const settings = loadSettings();
    return buildLibraryGames(settings);
  });
  ipcMain.handle("sync", async () => {
    log("info", "Sync requested via UI");
    await triggerSync();
    return lastStatus;
  });
  ipcMain.handle("open-logs", async () => {
    const logPath = getLogPath();
    await shell.openPath(path.dirname(logPath));
    return logPath;
  });
  ipcMain.handle("launch-steam", async () => {
    if (syncing) return { ok: false, message: "Sync in progress" };
    log("info", "Launch Steam requested");
    const steamPath = await getSteamPath();
    if (steamPath) await launchSteam(steamPath);
    return { ok: true };
  });
  ipcMain.handle("launch-steam-big-picture", async () => {
    if (syncing) return { ok: false, message: "Sync in progress" };
    log("info", "Launch Steam Big Picture requested");
    const steamPath = await getSteamPath();
    if (steamPath) await launchSteamBigPicture(steamPath);
    return { ok: true };
  });
}

app.on("ready", () => {
  if (process.platform === "win32") {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  log("info", "App ready", { logPath: getLogPath() });
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

app.on("window-all-closed", (e: Electron.Event) => {
  e.preventDefault();
});

app.on("activate", () => {
  if (mainWindow === null) mainWindow = createWindow();
  mainWindow.show();
});

async function buildLibraryGames(settings: Settings): Promise<LibraryGame[]> {
  const folders = settings.includeKnownStores
    ? [...settings.scanFolders, ...getKnownStoreFolders()]
    : [...settings.scanFolders];
  const games = scanFolders(folders);
  const steamPath = await getSteamPath();
  if (!steamPath) return [];
  const userdataPath = getUserdataPath(steamPath);
  const userId = findPrimarySteamUserId(steamPath, userdataPath);
  if (!userId) return [];
  const shortcutsPath = path.join(userdataPath, userId, "config", "shortcuts.vdf");
  const gridPath = path.join(userdataPath, userId, "config", "grid");
  const root = readShortcuts(shortcutsPath);
  const shortcutIndex = new Map<string, Record<string, unknown>>();
  for (const key of Object.keys(root.shortcuts || {})) {
    const entry = root.shortcuts[key];
    const appname = String(entry.appname ?? "");
    const exe = String(entry.exe ?? "");
    shortcutIndex.set(buildShortcutKey(appname, exe), entry);
  }
  const overrides = settings.launchOverrides ?? {};
  return games.map((game) => {
    const key = buildShortcutKey(game.name, game.exePath);
    const entry = shortcutIndex.get(key);
    const override = overrides[key];
    const effective = override
      ? {
          ...game,
          name: override.displayName || game.name,
          exePath: override.exePath,
          startDir: override.startDir,
          launchOptions: override.launchOptions ?? ""
        }
      : game;
    const appId = entry
      ? getShortcutAppId(entry) ?? computeShortcutAppId(entry)
      : computeAppId(effective.name, `\"${effective.exePath}\"`);
    const lastPlayed = parseLastPlayed(entry?.LastPlayTime);
    return {
      name: effective.name,
      source: effective.source,
      appId,
      exePath: effective.exePath,
      startDir: effective.startDir,
      launchOptions: effective.launchOptions ?? "",
      lastPlayed,
      iconPath: pickArtwork(gridPath, `${appId}_icon`),
      gridPath: pickArtwork(gridPath, `${appId}_p`),
      heroPath: pickArtwork(gridPath, `${appId}_hero`)
    };
  });
}

function parseLastPlayed(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickArtwork(dir: string, base: string): string | undefined {
  const exts = [".png", ".jpg", ".jpeg"];
  for (const ext of exts) {
    const filePath = path.join(dir, `${base}${ext}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return undefined;
}
