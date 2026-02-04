import { contextBridge, ipcRenderer } from "electron";
import { Settings, SyncStatus } from "../shared/types.js";

contextBridge.exposeInMainWorld("steamSyncer", {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings: Settings): Promise<Settings> =>
    ipcRenderer.invoke("save-settings", settings),
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke("choose-folder"),
  sync: (): Promise<SyncStatus> => ipcRenderer.invoke("sync"),
  launchSteam: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke("launch-steam"),
  onStatus: (handler: (status: SyncStatus) => void): void => {
    ipcRenderer.on("status", (_, status: SyncStatus) => handler(status));
  }
});
