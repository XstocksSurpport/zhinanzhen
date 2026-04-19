/**
 * 主网合约源码验证（Etherscan）
 *
 * 用法（在项目根目录）：
 *   在 .env 或 scripts/.env 中设置 ETHERSCAN_API_KEY=你的Key
 *   npx hardhat run scripts/verify-mainnet.js --network mainnet
 *
 * 若出现 Connect Timeout：本机需代理时在同一 PowerShell 会话执行 scripts/verify-method-a.ps1
 * 中的 GLOBAL_AGENT_* 与 NODE_OPTIONS（见 scripts/verify-method-a.ps1、scripts/global-agent-preload.cjs），
 * 或运行 npm run verify:mainnet:a（走代理并先跑 API 验证）。
 *
 * 与部署时构造函数参数一致（与 scripts/deploy.js 中 FALLBACK 等一致）。
 */
const hre = require("hardhat");

const CONTRACT = "0x320aB41D387267692F59f7F588718D6a46Fc9b0d";

const CONSTRUCTOR_ARGS = [
  "0xf280B16EF293D8e534e370794ef26bF312694126",
  "0x58325B7B20F47daFAc135eA523a6619c9cEa5884",
  "0x000000000000000000000000000000000000dEaD",
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  "351000000000",
];

async function main() {
  if (!process.env.ETHERSCAN_API_KEY) {
    throw new Error("Set ETHERSCAN_API_KEY in .env or scripts/.env");
  }
  console.log("Verifying", CONTRACT, "...");
  await hre.run("verify:verify", {
    address: CONTRACT,
    constructorArguments: CONSTRUCTOR_ARGS,
  });
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
