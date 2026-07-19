const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("steamSyncer", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  chooseExe: () => ipcRenderer.invoke("choose-exe"),
  getDetectedGames: () => ipcRenderer.invoke("get-detected-games"),
  getLibraryGames: () => ipcRenderer.invoke("get-library-games"),
  sync: () => ipcRenderer.invoke("sync"),
  launchSteam: () => ipcRenderer.invoke("launch-steam"),
  launchSteamBigPicture: () => ipcRenderer.invoke("launch-steam-big-picture"),
  openLogs: () => ipcRenderer.invoke("open-logs"),
  getAchievements: () => ipcRenderer.invoke("get-achievements"),
  addAchievement: (achievement) => ipcRenderer.invoke("add-achievement", achievement),
  updateAchievement: (achievement) => ipcRenderer.invoke("update-achievement", achievement),
  deleteAchievement: (id) => ipcRenderer.invoke("delete-achievement", id),
  unlockAchievement: (id) => ipcRenderer.invoke("unlock-achievement", id),
  lockAchievement: (id) => ipcRenderer.invoke("lock-achievement", id),
  onStatus: (handler) => {
    ipcRenderer.on("status", (_, status) => handler(status));
  }
});
