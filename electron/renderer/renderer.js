"use strict";

const logEl = document.getElementById("log");
const btnScreen = document.getElementById("btn-screen");
const btnVerify = document.getElementById("btn-verify");
const btnStop = document.getElementById("btn-stop");
const btnOpenJson = document.getElementById("btn-open-json");
const btnOpenFolder = document.getElementById("btn-open-folder");
const repoEl = document.getElementById("repo");

function appendLog(text) {
  logEl.value += text;
  logEl.scrollTop = logEl.scrollHeight;
}

function setBusy(busy) {
  btnScreen.disabled = busy;
  btnVerify.disabled = busy;
}

(async function init() {
  const root = await window.desktop.getRepoRoot();
  repoEl.textContent = "项目根目录: " + root;

  window.desktop.onScriptLog((chunk) => {
    appendLog(chunk);
  });

  btnScreen.addEventListener("click", async () => {
    setBusy(true);
    appendLog("");
    try {
      const r = await window.desktop.startTokenScreen();
      appendLog("\n—— 结束，退出码: " + (r.code != null ? r.code : "?") + " ——\n");
      if (r.error) appendLog("错误: " + r.error + "\n");
    } finally {
      setBusy(false);
    }
  });

  btnVerify.addEventListener("click", async () => {
    setBusy(true);
    appendLog("");
    try {
      const r = await window.desktop.startVerifyEtherscan();
      appendLog("\n—— 结束，退出码: " + (r.code != null ? r.code : "?") + " ——\n");
      if (r.error) appendLog("错误: " + r.error + "\n");
    } finally {
      setBusy(false);
    }
  });

  btnStop.addEventListener("click", async () => {
    await window.desktop.stopChild();
    appendLog("\n—— 已请求停止 ——\n");
  });

  btnOpenJson.addEventListener("click", async () => {
    const r = await window.desktop.openOutputJson();
    if (!r.ok && r.error) appendLog("打开 JSON: " + r.error + "\n");
  });

  btnOpenFolder.addEventListener("click", async () => {
    await window.desktop.openRepoFolder();
  });
})();
