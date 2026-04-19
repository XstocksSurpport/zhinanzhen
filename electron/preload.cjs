"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getRepoRoot: () => ipcRenderer.invoke("get-repo-root"),
  startTokenScreen: () => ipcRenderer.invoke("start-token-screen"),
  startVerifyEtherscan: () => ipcRenderer.invoke("start-verify-etherscan"),
  openOutputJson: () => ipcRenderer.invoke("open-output-json"),
  openRepoFolder: () => ipcRenderer.invoke("open-repo-folder"),
  stopChild: () => ipcRenderer.invoke("stop-child"),
  onScriptLog: (fn) => {
    ipcRenderer.on("script-log", (_e, text) => {
      try {
        fn(text);
      } catch (_) {}
    });
  },
});
