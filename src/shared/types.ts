export type SyncState = "idle" | "scanning" | "syncing" | "synced" | "error";

export type GameCandidate = {
  name: string;
  exePath: string;
  startDir: string;
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
};
