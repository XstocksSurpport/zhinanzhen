# BabyAsteroid

ERC20 on Ethereum: fixed supply, ETH mint, pair tax, external-token dividends. Solidity `^0.8.24`, Hardhat, OpenZeppelin v5.

**Mainnet (verified):** [`0x320aB41D387267692F59f7F588718D6a46Fc9b0d`](https://etherscan.io/address/0x320aB41D387267692F59f7F588718D6a46Fc9b0d#code)

## Requirements

- Node.js 18+
- An Ethereum RPC URL and wallet private key for deploys (never commit real keys)

## Setup

```bash
npm install
cp .env.example .env
cp .env.example scripts/.env
# Edit both (or only scripts/.env): PRIVATE_KEY for deploys; ETHERSCAN_API_KEY + optional ETHERSCAN_HTTP_PROXY for verify.
```

## Commands

| Command | Description |
|--------|-------------|
| `npm run compile` | Compile contracts |
| `npm test` | Run tests |
| `npm run deploy:mainnet` | Deploy to mainnet (uses `scripts/deploy.js`) |
| `npm run deploy:sepolia` | Deploy to Sepolia |
| `npm run verify:etherscan-api` | Submit source to Etherscan (V2 API + standard JSON) |
| `npm run verify:a` | PowerShell: set local HTTP proxy then run API verify (Windows) |
| `npm run verify:mainnet` | Hardhat `verify:verify` plugin |
| `npm run etherscan:get-abi` | Fetch verified ABI from Etherscan |
| `npm run screen:tokens` | Research screener: old ETH ERC‑20s on CoinGecko with past high mcap, now low mcap / volume / high holders (see script header) |
| `npm run desktop` | **桌面应用**（Electron）：运行代币筛选、Etherscan API 验证，查看日志；依赖已安装的 `node_modules` |
| `npm run desktop:shortcut` | **Windows**：在用户桌面创建 `BabyAsteroidDesktop.lnk`，指向项目根目录的 `desktop-launch.bat`（不依赖资源管理器里的 PATH） |

双击桌面图标若闪退或打不开：

1. **推荐一键完成**（自动用国内 Electron 镜像，并读取 `scripts/.env` 里的 `ETHERSCAN_HTTP_PROXY` 作下载代理）：  
   `npm run desktop:complete`  
2. 若报 **EBUSY**：先关掉已打开的 Electron / 本项目的桌面窗口，再执行一次。  
3. 仍失败时在本目录执行 **`npm run desktop`** 查看终端报错。

## Security

- Do **not** commit `scripts/.env` or any file containing `PRIVATE_KEY` or API keys.
- Rotate keys if they were ever exposed in chat or in a public fork.

## License

MIT — see [LICENSE](./LICENSE).
