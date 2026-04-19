const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BabyAsteroid economics", function () {
  it("fixed mint: TOKENS_PER_MINT = 1e8 * 10^18 wei", async function () {
    const [owner, revenue, admin] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockERC20");
    const reward = await Mock.deploy("R", "R");
    await reward.waitForDeployment();
    const rewardAddr = await reward.getAddress();

    const Router = await ethers.getContractFactory("RouterStub");
    const router = await Router.deploy();
    await router.waitForDeployment();

    const BabyAsteroid = await ethers.getContractFactory("BabyAsteroid");
    const token = await BabyAsteroid.deploy(
      rewardAddr,
      revenue.address,
      admin.address,
      await router.getAddress(),
      ethers.ZeroAddress,
      3510n * 10n ** 8n
    );
    await token.waitForDeployment();

    const out = await token.getTokensPerMint();
    const expected = 100_000_000n * 10n ** 18n;
    expect(out).to.equal(expected);
  });
});
