/**
 * Etherscan API V2 提交源码验证。
 *
 * 本机：
 *   scripts/.env → ETHERSCAN_API_KEY
 *   scripts/.env → ETHERSCAN_HTTP_PROXY=http://127.0.0.1:7890（本地代理端口，与 Clash / v2ray 一致）
 *   或：npm run verify:a（PowerShell 里替你设好代理环境变量）
 *   直连仅在你网络能访问 api.etherscan.io 时可行；否则设 ALLOW_DIRECT_ETHERSCAN=1 跳过本脚本的代理检查。
 *
 * 文档：https://docs.etherscan.io/api-reference/endpoint/verifysourcecode.md
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env") });
const hre = require("hardhat");
const fs = require("fs");
const { request, ProxyAgent, Agent } = require("undici");

const CONTRACT = "0x320aB41D387267692F59f7F588718D6a46Fc9b0d";
const CHAIN_ID = "1";

const CONSTRUCTOR_TYPES = [
  "address",
  "address",
  "address",
  "address",
  "address",
  "uint256",
];
const CONSTRUCTOR_VALUES = [
  "0xf280B16EF293D8e534e370794ef26bF312694126",
  "0x58325B7B20F47daFAc135eA523a6619c9cEa5884",
  "0x000000000000000000000000000000000000dEaD",
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  // Must match creation tx 0xdedb74cb99a83692123188cd1af9f94d094e889bd0905b1779bd46f3729430b4 (3510e8, not 3500e8).
  351000000000n,
];

function getProxyUrl() {
  return String(
    process.env.ETHERSCAN_HTTP_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      ""
  ).trim();
}

function createDispatcher() {
  const p = getProxyUrl();
  if (p) {
    console.log("Proxy (undici):", p);
    return new ProxyAgent(p);
  }
  return new Agent({
    connectTimeout: 120_000,
    headersTimeout: 120_000,
    bodyTimeout: 120_000,
  });
}

async function postForm(dispatcher, urlString, body, timeoutMs) {
  const res = await request(urlString, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    dispatcher,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  const data = await res.body.text();
  return { status: res.statusCode, data };
}

async function httpGet(dispatcher, urlString, timeoutMs) {
  const res = await request(urlString, {
    method: "GET",
    dispatcher,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  return res.body.text();
}

function pickLatestBabyAsteroidBuildInfo(buildInfoDir) {
  const files = fs.readdirSync(buildInfoDir).filter((f) => f.endsWith(".json"));
  let best = null;
  let bestFile = null;
  let bestMtime = -1;
  for (const f of files) {
    const full = path.join(buildInfoDir, f);
    let j;
    try {
      j = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    if (!j.output?.contracts?.["contracts/BabyAsteroid.sol"]?.BabyAsteroid) continue;
    const mtime = fs.statSync(full).mtimeMs;
    if (mtime >= bestMtime) {
      bestMtime = mtime;
      best = j;
      bestFile = f;
    }
  }
  return { chosen: best, chosenFile: bestFile };
}

async function main() {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("在 scripts/.env 设置 ETHERSCAN_API_KEY");
  }
  if (!getProxyUrl() && process.env.ALLOW_DIRECT_ETHERSCAN !== "1") {
    console.error(
      "未配置 Etherscan 代理：访问 api.etherscan.io 会直连，国内常见 ETIMEDOUT。\n\n" +
        "任选其一：\n" +
        "  1) 在 scripts/.env 增加一行（端口改成你的本机代理）：\n" +
        "     ETHERSCAN_HTTP_PROXY=http://127.0.0.1:7890\n" +
        "  2) 或运行：npm run verify:a\n" +
        "  3) 若确定可直连，先执行：$env:ALLOW_DIRECT_ETHERSCAN=\"1\"（Linux: export ALLOW_DIRECT_ETHERSCAN=1）\n"
    );
    process.exit(1);
  }

  const buildInfoDir = path.join(hre.config.paths.artifacts, "build-info");
  if (!fs.existsSync(buildInfoDir)) {
    throw new Error("未找到 build-info，请先 npx hardhat compile");
  }
  const { chosen, chosenFile } = pickLatestBabyAsteroidBuildInfo(buildInfoDir);
  if (!chosen) {
    throw new Error("build-info 中未找到 contracts/BabyAsteroid.sol:BabyAsteroid，请先 compile");
  }

  const dispatcher = createDispatcher();
  const solcLong = chosen.solcLongVersion;
  const compilerversion = solcLong.startsWith("v") ? solcLong : `v${solcLong}`;
  const sourceCode = JSON.stringify(chosen.input);
  const contractname = "contracts/BabyAsteroid.sol:BabyAsteroid";

  const ir = chosen.input?.settings?.viaIR;
  console.log("Using build-info:", chosenFile, "(viaIR in standard-json:", ir, ")");

  const { AbiCoder } = require("ethers");
  const ctorHex = AbiCoder.defaultAbiCoder()
    .encode(CONSTRUCTOR_TYPES, CONSTRUCTOR_VALUES)
    .slice(2);

  const params = new URLSearchParams();
  params.append("chainid", CHAIN_ID);
  params.append("module", "contract");
  params.append("action", "verifysourcecode");
  params.append("apikey", apiKey);
  params.append("contractaddress", CONTRACT);
  params.append("sourceCode", sourceCode);
  params.append("codeformat", "solidity-standard-json-input");
  params.append("contractname", contractname);
  params.append("compilerversion", compilerversion);
  params.append("optimizationUsed", "1");
  params.append("runs", "200");
  params.append("constructorArguements", ctorHex);
  params.append("evmversion", "cancun");
  params.append("licenseType", "3");

  const body = params.toString();
  const url = "https://api.etherscan.io/v2/api";

  console.log("compilerversion:", compilerversion);
  console.log("POST", url, "...");

  const { status, data } = await postForm(dispatcher, url, body, 120_000);
  console.log("HTTP", status);
  console.log(data);

  let j;
  try {
    j = JSON.parse(data);
  } catch {
    process.exit(1);
  }
  if (j.status !== "1") {
    const msg = String(j.message || "");
    const res = String(j.result || "");
    const already =
      /already verified/i.test(res) ||
      /already verified/i.test(msg) ||
      /contract source code already verified/i.test(res);
    if (already) {
      console.log("Etherscan: contract is already verified (OK).");
      process.exit(0);
    }
    console.error("Etherscan:", j.message, j.result);
    process.exit(1);
  }
  const guid = j.result;
  console.log("Submitted, GUID:", guid);

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const q = new URLSearchParams({
      chainid: CHAIN_ID,
      module: "contract",
      action: "checkverifystatus",
      apikey: apiKey,
      guid,
    });
    const pollUrl = `https://api.etherscan.io/v2/api?${q.toString()}`;
    const poll = await httpGet(dispatcher, pollUrl, 60_000);
    console.log("poll:", poll);
    const pj = JSON.parse(poll);
    const r = String(pj.result || "").toLowerCase();
    if (r.includes("pass")) {
      console.log("Verified.");
      process.exit(0);
    }
    if (r.includes("fail")) {
      console.error("Verification failed:", pj.result);
      process.exit(1);
    }
  }
  console.log("Timeout waiting for verification; check Etherscan manually.");
  // Intentionally do not dispatcher.close(): undici ProxyAgent + process.exit on Windows
  // can trigger libuv "UV_HANDLE_CLOSING" during teardown.
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
