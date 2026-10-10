const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("anistudyDesktop", {
  hide: () => ipcRenderer.invoke("notes:hide"),
});
