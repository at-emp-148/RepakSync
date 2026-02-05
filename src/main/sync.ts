import fs from "node:fs";
import path from "node:path";
import { GameCandidate, Settings, SyncStatus } from "../shared/types.js";
import { fetchArtworkSet } from "./artwork.js";
import { getKnownStoreFolders, scanFolders } from "./scanner.js";
import {
  addGamesToShortcuts,
  buildShortcutKey,
  closeSteam,
  computeAppId,
  computeShortcutAppId,
  detectRunningSteamMode,
  findPrimarySteamUserId,
  getShortcutAppId,
  getSteamPath,
  getUserdataPath,
  isSteamRunning,
  readShortcuts,
  SteamLaunchMode,
  writeShortcuts
} from "./steam.js";
import { log } from "./logger.js";
import { saveSettings } from "./settings.js";

export type SyncResult = {
  status: SyncStatus;
  addedAppIds: number[];
};

export async function runSync(
  settings: Settings,
  onStatus?: (status: SyncStatus) => void
): Promise<SyncResult> {
  const status: SyncStatus = { state: "scanning", message: "Scanning folders..." };
  onStatus?.(status);
  log("info", "Sync started", {
    scanFolders: settings.scanFolders,
    includeKnownStores: settings.includeKnownStores
  });

  const steamPath = await getSteamPath();
  if (!steamPath) {
    log("error", "Steam path not found");
    return {
      status: { state: "error", message: "Steam not found." },
      addedAppIds: []
    };
  }
  log("info", "Steam path resolved", { steamPath });

  const running = await isSteamRunning();
  const launchMode: SteamLaunchMode = running ? await detectRunningSteamMode() : "normal";
  if (running) {
    status.message = "Closing Steam for sync...";
    onStatus?.(status);
    log("info", "Closing Steam for sync");
    await closeSteam();
  }

  const folders = settings.includeKnownStores
    ? [...settings.scanFolders, ...getKnownStoreFolders()]
    : [...settings.scanFolders];

  const games = scanFoldersForGames(folders);
  const effectiveGames = applyLaunchOverrides(games, settings.launchOverrides ?? {});
  status.state = "syncing";
  status.message = `Syncing ${effectiveGames.length} detected games...`;
  status.found = effectiveGames.length;
  onStatus?.(status);
  log("info", "Scan complete", { found: effectiveGames.length });

  const userdataPath = getUserdataPath(steamPath);
  const userId = findPrimarySteamUserId(steamPath, userdataPath);
  if (!userId) {
    log("error", "Steam user not found", { userdataPath });
    return {
      status: { state: "error", message: "Steam user not found." },
      addedAppIds: []
    };
  }
  log("info", "Steam user resolved", { userId });

  const shortcutsPath = path.join(userdataPath, userId, "config", "shortcuts.vdf");
  const root = readShortcuts(shortcutsPath);
  const { dedupeShortcuts } = await import("./steam.js");
  const dedupeResult = dedupeShortcuts(root);
  if (dedupeResult.removed > 0) {
    log("info", "Removed duplicate shortcuts", { removed: dedupeResult.removed });
  }
  const gridPath = path.join(userdataPath, userId, "config", "grid");

  const didRepair = await repairShortcuts(
    root,
    gridPath,
    settings.launchOverrides ?? {},
    settings.artworkRepairDone !== true
  );
  if (didRepair && settings.artworkRepairDone !== true) {
    settings.artworkRepairDone = true;
    saveSettings(settings);
  }

  const { added, addedIds } = addGamesToShortcuts(root, effectiveGames);

  const shortcutIndex = new Map<string, Record<string, unknown>>();
  for (const key of Object.keys(root.shortcuts || {})) {
    const entry = root.shortcuts[key];
    const appname = String(entry.appname ?? "");
    const exe = String(entry.exe ?? "");
    shortcutIndex.set(buildShortcutKey(appname, exe), entry);
  }

  status.message = `Added ${added} new games. Fetching artwork...`;
  status.added = added;
  status.pendingArtwork = addedIds.length;
  onStatus?.(status);

  if (settings.steamGridDbApiKey) {
    const targets = effectiveGames.map((game) => {
      const key = buildShortcutKey(game.name, game.exePath);
      const entry = shortcutIndex.get(key);
      let appId = entry
        ? getShortcutAppId(entry) ?? computeShortcutAppId(entry)
        : computeAppId(game.name, game.exePath);
      if (entry) {
        const expected = computeShortcutAppId(entry);
        if (getShortcutAppId(entry) !== expected) {
          entry.appid = expected;
          appId = expected;
          log("info", "Updated shortcut appid to match Steam algorithm", {
            game: game.name,
            appId: expected
          });
        } else if (entry.appid == null) {
          entry.appid = appId;
        }
      }
      return { game, entry, appId };
    });

    let remaining = targets.length;
    for (const target of targets) {
      const art = await fetchArtworkSet(
        settings.steamGridDbApiKey,
        target.game.name,
        gridPath,
        target.appId
      );
      if (art.downloaded > 0) remaining--;
      if (target.entry && art.files.icon) {
        target.entry.icon = art.files.icon;
      }
      status.pendingArtwork = remaining;
      status.message = `Artwork remaining: ${remaining}`;
      onStatus?.(status);
      log("info", "Artwork fetch", { game: target.game.name, appId: target.appId, ...art });
    }
  }

  writeShortcuts(shortcutsPath, root);
  log("info", "Shortcuts updated", { added });

  const doneStatus: SyncStatus = {
    state: "synced",
    message: "Sync complete.",
    lastSyncAt: new Date().toISOString(),
    found: effectiveGames.length,
    added
  };
  onStatus?.(doneStatus);

  if (running) {
    const relaunching: SyncStatus = { ...doneStatus, message: "Sync complete. Relaunching Steam..." };
    onStatus?.(relaunching);
    const { launchSteam, launchSteamBigPicture } = await import("./steam.js");
    if (launchMode === "bigpicture") await launchSteamBigPicture(steamPath);
    else await launchSteam(steamPath);
    log("info", "Steam relaunched", { launchMode });
    const relaunched: SyncStatus = { ...doneStatus, message: "Sync complete. Steam relaunched." };
    onStatus?.(relaunched);
  }

  return { status: doneStatus, addedAppIds: addedIds };
}

function scanFoldersForGames(folders: string[]): GameCandidate[] {
  const uniq = Array.from(new Set(folders));
  return scanFolders(uniq);
}

function applyLaunchOverrides(
  games: GameCandidate[],
  overrides: Settings["launchOverrides"]
): GameCandidate[] {
  if (!overrides) return games;
  return games.map((game) => {
    const key = buildShortcutKey(game.name, game.exePath);
    const override = overrides[key];
    if (!override) return game;
    return {
      ...game,
      name: override.displayName || game.name,
      exePath: override.exePath,
      startDir: override.startDir,
      launchOptions: override.launchOptions
    };
  });
}

async function repairShortcuts(
  root: { shortcuts?: Record<string, Record<string, unknown>> },
  gridPath: string,
  overrides: Settings["launchOverrides"],
  runRepair: boolean
): Promise<boolean> {
  if (!root.shortcuts) return false;
  let repaired = false;
  const entries = Object.keys(root.shortcuts).map((key) => root.shortcuts?.[key]);
  for (const entry of entries) {
    if (!entry) continue;
    const appname = String(entry.appname ?? "");
    const exe = String(entry.exe ?? "");
    const key = buildShortcutKey(appname, exe);
    const override = overrides?.[key];
    const oldAppId = getShortcutAppId(entry) ?? computeShortcutAppId(entry);
    let overrideApplied = false;

    if (override) {
      entry.appname = override.displayName || appname;
      entry.exe = `\"${override.exePath}\"`;
      entry.StartDir = `\"${override.startDir}\"`;
      entry.LaunchOptions = override.launchOptions ?? "";
      overrideApplied = true;
    }

    const expected = computeShortcutAppId(entry);
    if ((runRepair || overrideApplied) && oldAppId !== expected) {
      entry.appid = expected;
      renameArtworkFiles(gridPath, oldAppId, expected);
      log("info", "Repaired shortcut appid", { appname: entry.appname, oldAppId, expected });
      repaired = true;
    } else if (entry.appid == null) {
      entry.appid = expected;
    }
  }
  return repaired;
}

function renameArtworkFiles(gridPath: string, oldAppId: number, newAppId: number): void {
  if (oldAppId === newAppId) return;
  const suffixes = ["", "_p", "_hero", "_logo", "_icon"];
  const exts = [".png", ".jpg", ".jpeg"];
  for (const suffix of suffixes) {
    for (const ext of exts) {
      const from = path.join(gridPath, `${oldAppId}${suffix}${ext}`);
      const to = path.join(gridPath, `${newAppId}${suffix}${ext}`);
      if (!fs.existsSync(from)) continue;
      if (fs.existsSync(to)) continue;
      try {
        fs.renameSync(from, to);
      } catch (error) {
        log("warn", "Failed to rename artwork", { from, to, error: String(error) });
      }
    }
  }
}
