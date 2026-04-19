const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env") });
const hre = require("hardhat");
const fs = require("fs");

/** Sepolia Chainlink ETH/USD — verified `latestRoundData` on Sepolia (docs.chain.link). */
const SEPOLIA_ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

/** Ethereum mainnet Chainlink ETH/USD (docs.chain.link). */
const MAINNET_ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

/** Uniswap V2 Router02 on Ethereum mainnet. */
const MAINNET_UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

/**
 * 分红代币（按持币比例领取的 ERC20）— 主网与测试网默认均使用此地址。
 * 仅在需要覆盖时设置环境变量 REWARD_TOKEN。
 */
const DEFAULT_DIVIDEND_TOKEN = "0xf280B16EF293D8e534e370794ef26bF312694126";

/**
 * 黑洞地址：部署时把 admin 与 Ownable owner 设为此地址 = 永久放弃加池/免税/Owner 提现等权限
 *（无人持有私钥，链上无法调用 onlyAdmin / onlyOwner）。
 */
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

const REVENUE = "0x58325B7B20F47daFAc135eA523a6619c9cEa5884";

/** ETH = 3510 USD => 3510e8 (Chainlink-style 8 decimals); matches mainnet BabyAsteroid deploy ctor. */
const FALLBACK_ETH_USD_1E8 = 3510n * 10n ** 8n;

/**
 * Common community Uniswap V2 Router02 on Sepolia (no official deployment).
 * Override with env UNISWAP_V2_ROUTER if this pair/router does not match your tests.
 */
const DEFAULT_SEPOLIA_UNISWAP_V2_ROUTER =
  "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";

/** Normalize hex addresses for ethers v6 (avoids "bad address checksum"). */
function toAddress(addr) {
  const z = hre.ethers.ZeroAddress;
  const s = String(addr || "").trim();
  if (!s || s.toLowerCase() === z.toLowerCase()) return z;
  return hre.ethers.getAddress(s);
}

async function main() {
  const net = await hre.ethers.provider.getNetwork();
  const chainId = net.chainId;
  const isSepolia = chainId === 11155111n;
  const isMainnet = chainId === 1n;
  const isHardhat = chainId === 31337n;

  if (!isHardhat && !process.env.PRIVATE_KEY) {
    throw new Error(
      "在 .env 或 scripts/.env 中设置 PRIVATE_KEY（0x 开头）。主网部署会消耗真实 ETH gas。"
    );
  }

  if (!isHardhat) {
    const [signer] = await hre.ethers.getSigners();
    const deployer = await signer.getAddress();
    const bal = await hre.ethers.provider.getBalance(deployer);
    console.log("Deployer address:", deployer);
    console.log("Deployer balance (wei):", bal.toString());
  }

  let router = process.env.UNISWAP_V2_ROUTER;
  if (!router) {
    if (isMainnet) {
      router = MAINNET_UNISWAP_V2_ROUTER;
      console.log("Using mainnet Uniswap V2 Router02 (set UNISWAP_V2_ROUTER to override):", router);
    } else if (isSepolia) {
      router = DEFAULT_SEPOLIA_UNISWAP_V2_ROUTER;
      console.log("Using default Sepolia V2 router (set UNISWAP_V2_ROUTER to override):", router);
    } else if (isHardhat) {
      const RouterStub = await hre.ethers.getContractFactory("RouterStub");
      const r = await RouterStub.deploy();
      await r.waitForDeployment();
      router = await r.getAddress();
      console.log("Local: deployed RouterStub:", router);
    } else {
      throw new Error("Unsupported network: set UNISWAP_V2_ROUTER in .env.");
    }
  }

  let rewardToken = process.env.REWARD_TOKEN || "";
  let chainlinkFeed = process.env.CHAINLINK_ETH_USD || "";

  if (isHardhat) {
    if (!rewardToken) {
      const Mock = await hre.ethers.getContractFactory("MockERC20");
      const mock = await Mock.deploy("RewardPlaceholder", "RWD");
      await mock.waitForDeployment();
      rewardToken = await mock.getAddress();
      console.log("Local Hardhat: MockERC20 reward token (override with REWARD_TOKEN):", rewardToken);
    }
    chainlinkFeed = hre.ethers.ZeroAddress;
  } else if (isSepolia) {
    if (!rewardToken) {
      rewardToken = DEFAULT_DIVIDEND_TOKEN;
      console.log("Dividend / reward token (default):", rewardToken);
    } else {
      console.log("Dividend / reward token (from REWARD_TOKEN):", rewardToken);
    }
    if (!chainlinkFeed) {
      chainlinkFeed = SEPOLIA_ETH_USD_FEED;
      console.log("Using Sepolia Chainlink ETH/USD feed:", chainlinkFeed);
    }
  } else if (isMainnet) {
    if (!rewardToken) {
      rewardToken = DEFAULT_DIVIDEND_TOKEN;
      console.log("Dividend / reward token (default):", rewardToken);
    } else {
      console.log("Dividend / reward token (from REWARD_TOKEN):", rewardToken);
    }
    if (!chainlinkFeed) {
      chainlinkFeed = MAINNET_ETH_USD_FEED;
      console.log("Using mainnet Chainlink ETH/USD feed:", chainlinkFeed);
    }
  } else {
    if (!rewardToken) {
      rewardToken = DEFAULT_DIVIDEND_TOKEN;
      console.log("Dividend / reward token (default):", rewardToken);
    }
    if (!chainlinkFeed) {
      chainlinkFeed = hre.ethers.ZeroAddress;
    }
  }

  const feedAddr = toAddress(chainlinkFeed);

  let adminAddr = process.env.ADMIN;
  if (!adminAddr) {
    if (isHardhat) {
      const [s] = await hre.ethers.getSigners();
      adminAddr = await s.getAddress();
      console.log("Hardhat: admin / owner = first signer:", adminAddr);
    } else {
      adminAddr = BURN_ADDRESS;
      console.log(
        "admin + owner = burn address — onlyAdmin/onlyOwner permanently unusable (set ADMIN to override):",
        adminAddr
      );
    }
  } else {
    console.log("Admin / owner (from ADMIN env):", adminAddr);
  }

  const BabyAsteroid = await hre.ethers.getContractFactory("BabyAsteroid");
  const token = await BabyAsteroid.deploy(
    toAddress(rewardToken),
    toAddress(REVENUE),
    toAddress(adminAddr),
    toAddress(router),
    feedAddr,
    FALLBACK_ETH_USD_1E8
  );
  await token.waitForDeployment();

  const addr = await token.getAddress();
  /** Prefer immutable getter; some RPCs mis-handle `pure` view calls. */
  let tokensPerMint;
  try {
    tokensPerMint = (await token.TOKENS_PER_MINT()).toString();
  } catch {
    tokensPerMint = (await token.getTokensPerMint()).toString();
  }

  console.log("BabyAsteroid deployed to:", addr);
  console.log("tokensPerMint (wei):", tokensPerMint);

  const deployment = {
    network: net.name,
    chainId: chainId.toString(),
    babyAsteroid: addr,
    rewardToken,
    router,
    chainlinkFeed: feedAddr === hre.ethers.ZeroAddress ? null : feedAddr,
    tokensPerMintWei: tokensPerMint,
    admin: toAddress(adminAddr),
    adminLockedToBurn: adminAddr.toLowerCase() === BURN_ADDRESS.toLowerCase(),
    revenue: REVENUE,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `deployment-${chainId}.json`);
  fs.writeFileSync(file, JSON.stringify(deployment, null, 2));
  console.log("Wrote", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
