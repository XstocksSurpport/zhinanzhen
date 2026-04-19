/**
 * 筛选以太坊主网 ERC20（在 CoinGecko 有收录）的大致满足：
 *   - 主网合约「年龄」≥ 3 年（优先 CoinGecko genesis_date，否则 Etherscan 创建区块时间）
 *   - 历史市值峰值（CoinGecko market_chart 日级）≥ 5000 万美元
 *   - 当前市值（markets）< 100 万美元
 *   - 24h 成交额（markets 的 total_volume，全市场口径）< 10 万美元
 *   - 持币地址数（Ethplorer getTokenInfo 的 holdersCount）> 1 万
 *
 * 说明：口径与第三方「机构」不一定一致；结果仅供研究，不构成投资建议。
 *
 * 环境变量（与仓库其它脚本一致）：
 *   scripts/.env 或根 .env：ETHERSCAN_API_KEY（查部署时间）、ETHERSCAN_HTTP_PROXY（建议）
 *   可选：ETHPLORER_API_KEY（Ethplorer 正式 key，不设则用免费档 freekey，易限流）
 *   可选：COINGECKO_API_KEY（Pro 时降低限频概率）
 *   可选：TOKEN_SCREEN_MARKET_PAGES（默认 55）、TOKEN_SCREEN_DEEP（默认 45）、
 *         TOKEN_SCREEN_MARKET_SLEEP_MS（默认 1200）、TOKEN_SCREEN_COIN_SLEEP_MS（默认 2000）
 *
 * 运行：node scripts/token-dead-screen.js
 * 或：npm run screen:tokens
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { request, ProxyAgent, Agent } = require("undici");

const MIN_AGE_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;
const MIN_PEAK_MARKET_CAP_USD = 50_000_000;
const MAX_CURRENT_MARKET_CAP_USD = 1_000_000;
const MAX_VOLUME_24H_USD = 100_000;
const MIN_HOLDERS = 10_000;

const SKIP_IDS = new Set([
  "bitcoin",
  "ethereum",
  "tether",
  "usd-coin",
  "dai",
  "wrapped-steth",
  "staked-ether",
  "wrapped-bitcoin",
  "binancecoin",
  "binance-usd",
  "chainlink",
  "weth",
  "steth",
]);

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
  if (p) console.log("HTTP proxy:", p);
  return p
    ? new ProxyAgent(p)
    : new Agent({
        connectTimeout: 120_000,
        headersTimeout: 120_000,
        bodyTimeout: 120_000,
      });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpGetJson(dispatcher, url, label) {
  const headers = {};
  const cg = process.env.COINGECKO_API_KEY;
  if (cg && url.includes("coingecko.com")) headers["x-cg-pro-api-key"] = cg;

  const res = await request(url, {
    method: "GET",
    dispatcher,
    headers,
    headersTimeout: 120_000,
    bodyTimeout: 120_000,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`${label} HTTP ${res.statusCode}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} invalid JSON: ${text.slice(0, 200)}`);
  }
}

function peakFromMarketCaps(marketCaps) {
  let peak = 0;
  for (const pair of marketCaps || []) {
    const v = pair[1];
    if (typeof v === "number" && Number.isFinite(v)) peak = Math.max(peak, v);
  }
  return peak;
}

function parseGenesisMs(genesisDate) {
  if (!genesisDate || typeof genesisDate !== "string") return null;
  const t = Date.parse(genesisDate);
  return Number.isFinite(t) ? t : null;
}

async function etherscanContractAgeMs(dispatcher, apiKey, contract) {
  const q = new URLSearchParams({
    chainid: "1",
    module: "contract",
    action: "getcontractcreation",
    contractaddresses: contract,
    apikey: apiKey,
  });
  const base = "https://api.etherscan.io/v2/api";
  const j = await httpGetJson(dispatcher, `${base}?${q}`, "etherscan getcontractcreation");
  if (j.status !== "1" || !Array.isArray(j.result) || j.result.length === 0) return null;
  const txHash = j.result[0].txHash;
  if (!txHash) return null;

  const q2 = new URLSearchParams({
    chainid: "1",
    module: "proxy",
    action: "eth_getTransactionByHash",
    txhash: txHash,
    apikey: apiKey,
  });
  const tx = await httpGetJson(dispatcher, `${base}?${q2}`, "etherscan tx");
  const hexBlock = tx.result?.blockNumber;
  if (!hexBlock) return null;
  const q3 = new URLSearchParams({
    chainid: "1",
    module: "proxy",
    action: "eth_getBlockByNumber",
    tag: hexBlock,
    boolean: "false",
    apikey: apiKey,
  });
  const block = await httpGetJson(dispatcher, `${base}?${q3}`, "etherscan block");
  const tsHex = block.result?.timestamp;
  if (!tsHex) return null;
  return Number.parseInt(tsHex, 16) * 1000;
}

async function ethplorerHolders(dispatcher, contract) {
  const key = process.env.ETHPLORER_API_KEY || "freekey";
  const q = new URLSearchParams({ apiKey: key });
  const url = `https://api.ethplorer.io/getTokenInfo/${contract}?${q}`;
  const res = await request(url, {
    method: "GET",
    dispatcher,
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) return null;
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const h = j.holdersCount;
  return typeof h === "number" && Number.isFinite(h) ? h : null;
}

async function main() {
  const etherscanKey = process.env.ETHERSCAN_API_KEY;
  if (!etherscanKey) {
    console.error("需要 ETHERSCAN_API_KEY（scripts/.env）用于部署时间；建议同时配置 ETHERSCAN_HTTP_PROXY。");
    process.exit(1);
  }
  if (!getProxyUrl() && process.env.ALLOW_DIRECT_ETHERSCAN !== "1") {
    console.error(
      "建议设置 ETHERSCAN_HTTP_PROXY，否则 CoinGecko / Etherscan / Ethplorer 在国内易超时。\n" +
        "若可直连，请设 ALLOW_DIRECT_ETHERSCAN=1。"
    );
    process.exit(1);
  }

  const MARKET_PAGES = Math.min(200, Math.max(5, Number(process.env.TOKEN_SCREEN_MARKET_PAGES || 55)));
  const DEEP = Math.min(200, Math.max(5, Number(process.env.TOKEN_SCREEN_DEEP || 45)));
  const SLEEP_MARKET = Math.max(500, Number(process.env.TOKEN_SCREEN_MARKET_SLEEP_MS || 1200));
  const SLEEP_COIN = Math.max(800, Number(process.env.TOKEN_SCREEN_COIN_SLEEP_MS || 2000));

  const dispatcher = createDispatcher();
  const cg = "https://api.coingecko.com/api/v3";

  console.log("Loading CoinGecko coin list (ethereum platform)…");
  const list = await httpGetJson(
    dispatcher,
    `${cg}/coins/list?include_platform=true`,
    "coingecko list"
  );
  await sleep(SLEEP_COIN);

  /** @type {Map<string, string>} */
  const idToEth = new Map();
  for (const row of list) {
    if (!row || !row.id || SKIP_IDS.has(row.id)) continue;
    const addr = row.platforms?.ethereum;
    if (typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
      idToEth.set(row.id, addr.toLowerCase());
    }
  }
  console.log("Ethereum-listed CoinGecko ids:", idToEth.size);

  /** @type {Array<{id:string,symbol:string,name:string,market_cap:number,total_volume:number,contract:string}>} */
  const shallow = [];

  for (let page = 1; page <= MARKET_PAGES; page++) {
    const url = `${cg}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`;
    const rows = await httpGetJson(dispatcher, url, `coingecko markets p${page}`);
    for (const r of rows) {
      if (!idToEth.has(r.id)) continue;
      const mc = r.market_cap;
      const vol = r.total_volume ?? 0;
      if (mc == null || mc <= 0 || mc >= MAX_CURRENT_MARKET_CAP_USD) continue;
      if (vol >= MAX_VOLUME_24H_USD) continue;
      shallow.push({
        id: r.id,
        symbol: r.symbol,
        name: r.name,
        market_cap: mc,
        total_volume: vol,
        contract: idToEth.get(r.id),
      });
    }
    if (rows.length < 250) break;
    await sleep(SLEEP_MARKET);
  }

  shallow.sort((a, b) => b.market_cap - a.market_cap);
  const toScan = shallow.slice(0, DEEP);
  console.log(
    `Shallow matches (mc<$${MAX_CURRENT_MARKET_CAP_USD}, vol<$${MAX_VOLUME_24H_USD}): ${shallow.length}; deep-scanning top ${toScan.length} by current mcap…`
  );

  const now = Date.now();
  const matches = [];

  for (const row of toScan) {
    let chart;
    try {
      chart = await httpGetJson(
        dispatcher,
        `${cg}/coins/${encodeURIComponent(row.id)}/market_chart?vs_currency=usd&days=max`,
        `chart ${row.id}`
      );
    } catch (e) {
      console.warn("skip", row.id, String(e.message || e));
      await sleep(SLEEP_COIN);
      continue;
    }
    await sleep(SLEEP_COIN);

    const peak = peakFromMarketCaps(chart.market_caps);
    if (peak < MIN_PEAK_MARKET_CAP_USD) continue;

    let detail;
    try {
      detail = await httpGetJson(
        dispatcher,
        `${cg}/coins/${encodeURIComponent(row.id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
        `detail ${row.id}`
      );
    } catch (e) {
      console.warn("skip detail", row.id, String(e.message || e));
      await sleep(SLEEP_COIN);
      continue;
    }
    await sleep(SLEEP_COIN);

    let ageMs = null;
    const g = parseGenesisMs(detail.genesis_date);
    if (g != null) ageMs = now - g;
    if (ageMs == null || ageMs < MIN_AGE_MS) {
      const deployMs = await etherscanContractAgeMs(dispatcher, etherscanKey, row.contract);
      await sleep(350);
      if (deployMs == null) {
        console.warn("skip age unknown", row.id, row.contract);
        continue;
      }
      ageMs = now - deployMs;
    }
    if (ageMs < MIN_AGE_MS) continue;

    const holders = await ethplorerHolders(dispatcher, row.contract);
    await sleep(450);
    if (holders == null) {
      console.warn("skip holders unknown", row.id, row.contract);
      continue;
    }
    if (holders < MIN_HOLDERS) continue;

    matches.push({
      coingecko_id: row.id,
      symbol: row.symbol,
      name: row.name,
      contract: row.contract,
      current_market_cap_usd: row.market_cap,
      peak_market_cap_usd: Math.round(peak),
      volume_24h_usd: row.total_volume,
      holders,
      age_years: Number((ageMs / (365.25 * 24 * 60 * 60 * 1000)).toFixed(2)),
      coingecko_url: `https://www.coingecko.com/en/coins/${row.id}`,
      etherscan_url: `https://etherscan.io/token/${row.contract}`,
    });

    console.log("HIT:", row.symbol, row.contract, "holders", holders, "peakMc", Math.round(peak));
  }

  const outPath = path.join(process.cwd(), "token-screen-output.json");
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), count: matches.length, matches }, null, 2), "utf8");
  console.log("\nDone. Matches:", matches.length);
  console.log("Wrote", outPath);
  if (matches.length === 0) {
    console.log(
      "No rows passed all filters. Try raising TOKEN_SCREEN_MARKET_PAGES / TOKEN_SCREEN_DEEP, or check Ethplorer rate limits (ETHPLORER_API_KEY)."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
