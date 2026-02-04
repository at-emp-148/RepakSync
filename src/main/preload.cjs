const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("steamSyncer", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  sync: () => ipcRenderer.invoke("sync"),
  launchSteam: () => ipcRenderer.invoke("launch-steam"),
  onStatus: (handler) => {
    ipcRenderer.on("status", (_, status) => handler(status));
  }
});
