"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");

/** Repository root (parent of /electron). */
const REPO_ROOT = path.join(__dirname, "..");

/** Run as Node (Electron binary + ELECTRON_RUN_AS_NODE), works when `node` is not on PATH. */
function spawnAsNode(cwd, argv) {
  return spawn(process.execPath, argv, {
    cwd,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    windowsHide: true,
  });
}

let mainWindow = null;
let childProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "BabyAsteroid 工具台",
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (childProcess) {
      try {
        childProcess.kill("SIGTERM");
      } catch (_) {}
      childProcess = null;
    }
  });
}

function forwardChunk(chunk) {
  const s = chunk.toString();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("script-log", s);
  }
}

function attachChild(proc) {
  childProcess = proc;
  childProcess.stdout.on("data", forwardChunk);
  childProcess.stderr.on("data", forwardChunk);
  return new Promise((resolve) => {
    childProcess.on("error", (err) => {
      childProcess = null;
      resolve({ ok: false, error: String(err.message || err) });
    });
    childProcess.on("close", (code) => {
      childProcess = null;
      resolve({ ok: true, code });
    });
  });
}

function runNodeScript(relScript, extraArgs = []) {
  if (childProcess) {
    return Promise.resolve({ ok: false, error: "已有任务在运行，请先停止。" });
  }
  const scriptPath = path.join(REPO_ROOT, relScript);
  const proc = spawnAsNode(REPO_ROOT, [scriptPath, ...extraArgs]);
  return attachChild(proc);
}

function runHardhatScript(relScript) {
  if (childProcess) {
    return Promise.resolve({ ok: false, error: "已有任务在运行，请先停止。" });
  }
  const cli = path.join(REPO_ROOT, "node_modules", "hardhat", "internal", "cli", "cli.js");
  const proc = spawnAsNode(REPO_ROOT, [cli, "run", relScript]);
  return attachChild(proc);
}

app.whenReady().then(() => {
  ipcMain.handle("get-repo-root", () => REPO_ROOT);

  ipcMain.handle("open-output-json", async () => {
    const p = path.join(REPO_ROOT, "token-screen-output.json");
    const err = await shell.openPath(p);
    if (err) return { ok: false, error: err };
    return { ok: true };
  });

  ipcMain.handle("open-repo-folder", async () => {
    await shell.openPath(REPO_ROOT);
    return { ok: true };
  });

  ipcMain.handle("start-token-screen", async () => {
    mainWindow?.webContents.send("script-log", `\n—— 开始：代币筛选 (${new Date().toLocaleString()}) ——\n`);
    return runNodeScript("scripts/token-dead-screen.js");
  });

  ipcMain.handle("start-verify-etherscan", async () => {
    mainWindow?.webContents.send("script-log", `\n—— 开始：Etherscan API 验证 (${new Date().toLocaleString()}) ——\n`);
    return runHardhatScript("scripts/etherscan-verify-api.js");
  });

  ipcMain.handle("stop-child", async () => {
    if (!childProcess) return { ok: true, stopped: false };
    try {
      childProcess.kill("SIGTERM");
    } catch (_) {}
    childProcess = null;
    return { ok: true, stopped: true };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
