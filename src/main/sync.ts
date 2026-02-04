import path from "node:path";
import { GameCandidate, SyncStatus } from "../shared/types.js";
import { fetchArtworkSet } from "./artwork.js";
import { getKnownStoreFolders, scanFolders } from "./scanner.js";
import {
  addGamesToShortcuts,
  buildShortcutKey,
  closeSteam,
  computeAppId,
  findPrimarySteamUserId,
  getShortcutAppId,
  getSteamPath,
  getUserdataPath,
  isSteamRunning,
  readShortcuts,
  writeShortcuts
} from "./steam.js";
import { log } from "./logger.js";

export type SyncResult = {
  status: SyncStatus;
  addedAppIds: number[];
};

export async function runSync(
  scanFolders: string[],
  includeKnownStores: boolean,
  steamGridDbApiKey?: string,
  onStatus?: (status: SyncStatus) => void
): Promise<SyncResult> {
  const status: SyncStatus = { state: "scanning", message: "Scanning folders..." };
  onStatus?.(status);
  log("info", "Sync started", { scanFolders, includeKnownStores });

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
  if (running) {
    status.message = "Closing Steam for sync...";
    onStatus?.(status);
    log("info", "Closing Steam for sync");
    await closeSteam();
  }

  const folders = includeKnownStores
    ? [...scanFolders, ...getKnownStoreFolders()]
    : [...scanFolders];

  const games = scanFoldersForGames(folders);
  status.state = "syncing";
  status.message = `Syncing ${games.length} detected games...`;
  status.found = games.length;
  onStatus?.(status);
  log("info", "Scan complete", { found: games.length });

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
  const { added, addedIds } = addGamesToShortcuts(root, games);
  const gridPath = path.join(userdataPath, userId, "config", "grid");

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

  if (steamGridDbApiKey) {
    const targets = games.map((game) => {
      const key = buildShortcutKey(game.name, game.exePath);
      const entry = shortcutIndex.get(key);
      const appId = entry
        ? getShortcutAppId(entry) ?? computeAppId(game.name, game.exePath)
        : computeAppId(game.name, game.exePath);
      if (entry && entry.appid == null) entry.appid = appId;
      return { game, entry, appId };
    });

    let remaining = targets.length;
    for (const target of targets) {
      const art = await fetchArtworkSet(steamGridDbApiKey, target.game.name, gridPath, target.appId);
      if (art.downloaded > 0) remaining--;
      if (target.entry && art.files.icon) {
        target.entry.icon = art.files.icon;
      }
      status.pendingArtwork = remaining;
      status.message = `Artwork remaining: ${remaining}`;
      onStatus?.(status);
      log("info", "Artwork fetch", { game: target.game.name, ...art });
    }
  }

  writeShortcuts(shortcutsPath, root);
  log("info", "Shortcuts updated", { added });

  const doneStatus: SyncStatus = {
    state: "synced",
    message: "Sync complete.",
    lastSyncAt: new Date().toISOString(),
    found: games.length,
    added
  };
  onStatus?.(doneStatus);

  if (running) {
    const { launchSteam } = await import("./steam.js");
    await launchSteam(steamPath);
    log("info", "Steam relaunched");
  }

  return { status: doneStatus, addedAppIds: addedIds };
}

function scanFoldersForGames(folders: string[]): GameCandidate[] {
  const uniq = Array.from(new Set(folders));
  return scanFolders(uniq);
}
