const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("assetOrganizer", {
  selectFolder: (options) => ipcRenderer.invoke("asset-organizer:select-folder", options),
  selectOutputFolder: () => ipcRenderer.invoke("asset-organizer:select-output-folder"),
  scanFolder: (options) => ipcRenderer.invoke("asset-organizer:scan-folder", options),
  runPlan: (payload) => ipcRenderer.invoke("asset-organizer:run-plan", payload),
  undo: (payload) => ipcRenderer.invoke("asset-organizer:undo", payload),
  deleteBackups: (payload) => ipcRenderer.invoke("asset-organizer:delete-backups", payload),
  platform: process.platform
});
