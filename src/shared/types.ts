export type SyncState = "idle" | "scanning" | "syncing" | "synced" | "error";

export type GameCandidate = {
  name: string;
  exePath: string;
  startDir: string;
  launchOptions?: string;
  source: "custom" | "epic" | "gog" | "other";
};

export type SyncStatus = {
  state: SyncState;
  message: string;
  lastSyncAt?: string;
  found?: number;
  added?: number;
  pendingArtwork?: number;
};

export type Settings = {
  scanFolders: string[];
  includeKnownStores: boolean;
  steamGridDbApiKey?: string;
  artworkRepairDone?: boolean;
  launchOverrides?: Record<string, LaunchOverride>;
};

export type LaunchOverride = {
  key: string;
  displayName: string;
  exePath: string;
  startDir: string;
  launchOptions?: string;
};

export type LibraryGame = {
  name: string;
  source: "custom" | "epic" | "gog" | "other";
  appId: number;
  exePath: string;
  startDir: string;
  launchOptions: string;
  lastPlayed?: number;
  iconPath?: string;
  gridPath?: string;
  heroPath?: string;
};
