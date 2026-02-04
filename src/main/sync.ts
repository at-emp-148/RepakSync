import path from "node:path";
import { GameCandidate, SyncStatus } from "../shared/types.js";
import { fetchArtwork } from "./artwork.js";
import { getKnownStoreFolders, scanFolders } from "./scanner.js";
import {
  addGamesToShortcuts,
  closeSteam,
  findPrimarySteamUserId,
  getSteamPath,
  getUserdataPath,
  isSteamRunning,
  readShortcuts,
  writeShortcuts
} from "./steam.js";

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

  const steamPath = await getSteamPath();
  if (!steamPath) {
    return {
      status: { state: "error", message: "Steam not found." },
      addedAppIds: []
    };
  }

  const running = await isSteamRunning();
  if (running) {
    status.message = "Closing Steam for sync...";
    onStatus?.(status);
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

  const userdataPath = getUserdataPath(steamPath);
  const userId = findPrimarySteamUserId(steamPath, userdataPath);
  if (!userId) {
    return {
      status: { state: "error", message: "Steam user not found." },
      addedAppIds: []
    };
  }

  const shortcutsPath = path.join(userdataPath, userId, "config", "shortcuts.vdf");
  const root = readShortcuts(shortcutsPath);
  const { added, addedIds, addedGames } = addGamesToShortcuts(root, games);
  writeShortcuts(shortcutsPath, root);

  status.message = `Added ${added} new games. Fetching artwork...`;
  status.added = added;
  status.pendingArtwork = addedIds.length;
  onStatus?.(status);

  if (steamGridDbApiKey) {
    const gridPath = path.join(userdataPath, userId, "config", "grid");
    let remaining = addedIds.length;
    for (let i = 0; i < addedIds.length; i++) {
      const appId = addedIds[i];
      const game = addedGames[i];
      if (!game) continue;
      const ok = await fetchArtwork(steamGridDbApiKey, game.name, gridPath, appId);
      if (ok) remaining--;
      status.pendingArtwork = remaining;
      status.message = `Artwork remaining: ${remaining}`;
      onStatus?.(status);
    }
  }

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
  }

  return { status: doneStatus, addedAppIds: addedIds };
}

function scanFoldersForGames(folders: string[]): GameCandidate[] {
  const uniq = Array.from(new Set(folders));
  return scanFolders(uniq);
}
