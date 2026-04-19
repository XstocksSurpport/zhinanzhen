/**
 * Etherscan API V2 — getabi（已验证合约的 ABI）
 * https://docs.etherscan.io/api-reference/endpoint/getabi.md
 *
 * 配置与 verify 脚本相同：scripts/.env 里 ETHERSCAN_API_KEY、ETHERSCAN_HTTP_PROXY（或 npm run verify:a 后再跑）。
 *
 * 用法：
 *   node scripts/etherscan-get-abi.js
 *   node scripts/etherscan-get-abi.js 0xYourContract
 *   node scripts/etherscan-get-abi.js 0xYourContract --out ./abi/from-etherscan.json
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { request, ProxyAgent, Agent } = require("undici");

const DEFAULT_ADDRESS = "0x320aB41D387267692F59f7F588718D6a46Fc9b0d";
const DEFAULT_CHAIN_ID = "1";

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
  if (p) console.log("Proxy (undici):", p);
  return p
    ? new ProxyAgent(p)
    : new Agent({
        connectTimeout: 120_000,
        headersTimeout: 120_000,
        bodyTimeout: 120_000,
      });
}

async function httpGet(dispatcher, urlString, timeoutMs) {
  const res = await request(urlString, {
    method: "GET",
    dispatcher,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  return { status: res.statusCode, text: await res.body.text() };
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let outPath = null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) {
      outPath = argv[++i];
    } else {
      rest.push(argv[i]);
    }
  }
  const address =
    rest[0] ||
    process.env.ETHERSCAN_ABI_ADDRESS ||
    process.env.CONTRACT_ADDRESS ||
    DEFAULT_ADDRESS;
  const chainid = process.env.ETHERSCAN_CHAIN_ID || DEFAULT_CHAIN_ID;
  return { address, chainid, outPath };
}

async function main() {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("在 scripts/.env 设置 ETHERSCAN_API_KEY");
  }
  if (!getProxyUrl() && process.env.ALLOW_DIRECT_ETHERSCAN !== "1") {
    console.error(
      "未配置代理。请在 scripts/.env 设置 ETHERSCAN_HTTP_PROXY，或先 npm run verify:a，或设 ALLOW_DIRECT_ETHERSCAN=1。\n" +
        "说明见 scripts/etherscan-verify-api.js 文件头注释。"
    );
    process.exit(1);
  }

  const { address, chainid, outPath } = parseArgs();
  const q = new URLSearchParams({
    chainid,
    module: "contract",
    action: "getabi",
    address,
    apikey: apiKey,
  });
  const url = `https://api.etherscan.io/v2/api?${q.toString()}`;
  console.log("GET", url.replace(apiKey, "***"), "...");

  const dispatcher = createDispatcher();
  const { status, text } = await httpGet(dispatcher, url, 120_000);
  console.log("HTTP", status);

  const j = JSON.parse(text);
  if (j.status !== "1") {
    console.error("Etherscan:", j.message, j.result);
    process.exit(1);
  }

  let abi;
  try {
    abi = JSON.parse(j.result);
  } catch {
    console.error("Unexpected result (not JSON ABI):", j.result?.slice?.(0, 200));
    process.exit(1);
  }

  const pretty = JSON.stringify(abi, null, 2);
  console.log(pretty);

  if (outPath) {
    const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, pretty, "utf8");
    console.log("Wrote", abs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
