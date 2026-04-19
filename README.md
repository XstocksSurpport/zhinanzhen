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

## Security

- Do **not** commit `scripts/.env` or any file containing `PRIVATE_KEY` or API keys.
- Rotate keys if they were ever exposed in chat or in a public fork.

## License

MIT — see [LICENSE](./LICENSE).
