// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BabyAsteroid
 * @notice ERC20: fixed 420B treasury, 0.01 ETH mint, 3% Uniswap-pair tax, external-token dividends.
 *
 * @dev Minting uses a fixed tranche (no oracle): 0.01 ETH -> TOKENS_PER_MINT (1e8 * 10^18 wei).
 *      Chainlink + fallback remain for off-chain reference / optional `getEthUsdPrice1e8` views only.
 *      `revenueRecipient` is immutable (set in constructor, not changeable by owner).
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Factory} from "./interfaces/IUniswapV2Factory.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

contract BabyAsteroid is ERC20, ERC20Permit, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;
    /// @notice Mint revenue receiver — immutable; cannot be changed after deployment.
    address public immutable revenueRecipient;
    address public immutable admin;

    IUniswapV2Router02 public immutable uniswapV2Router;
    IAggregatorV3 public immutable chainlinkEthUsdFeed;

    /// @notice Used when `chainlinkEthUsdFeed` is zero, or as reference only (mint does not use this).
    uint256 public fallbackEthUsdPrice1e8;

    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 public constant TOTAL_SUPPLY = 420_000_000_000 * 10 ** 18;

    /// @notice Fixed mint output: 1e8 tokens (1 亿枚) per 0.01 ETH tranche (18-decimal wei).
    uint256 public constant TOKENS_PER_MINT = 100_000_000 * 10 ** 18;

    uint256 public constant TAX_BPS = 300;
    uint256 private constant BPS = 10_000;
    uint256 private constant DIV_PRECISION = 1e18;

    address public uniswapV2Pair;
    address public immutable weth;

    mapping(address => bool) public isExcludedFromFee;
    mapping(address => bool) public isExcludedFromDividends;

    /// @dev Sum of balances for addresses marked excluded from dividends (excludes this contract & pair).
    uint256 private dividendExcludedSupply;

    uint256 public rewardPerShareAccumulated;
    mapping(address => uint256) public userRewardPerSharePaid;
    mapping(address => uint256) public rewards;

    event Minted(address indexed buyer, uint256 ethPaid, uint256 tokensOut);
    event TaxTaken(address indexed from, address indexed to, uint256 taxAmount);
    event RewardsNotified(uint256 amount, uint256 rewardPerShareAccumulated);
    event PairUpdated(address indexed pair);
    event ExcludedFromFeeUpdated(address indexed account, bool excluded);
    event ExcludedFromDividendsUpdated(address indexed account, bool excluded);
    event FallbackEthUsdUpdated(uint256 price1e8);
    event Sweep(address indexed token, uint256 amount, address indexed to);

    modifier onlyAdmin() {
        require(msg.sender == admin, "BabyAsteroid: not admin");
        _;
    }

    constructor(
        address rewardToken_,
        address revenueRecipient_,
        address admin_,
        IUniswapV2Router02 router_,
        IAggregatorV3 chainlinkEthUsdFeed_,
        uint256 fallbackEthUsdPrice1e8_
    ) ERC20("BabyAsteroid", "BABYAST") ERC20Permit("BabyAsteroid") Ownable(admin_) {
        require(rewardToken_ != address(0), "BabyAsteroid: reward token");
        require(revenueRecipient_ != address(0), "BabyAsteroid: revenue");
        require(admin_ != address(0), "BabyAsteroid: admin");
        require(address(router_) != address(0), "BabyAsteroid: router");
        require(fallbackEthUsdPrice1e8_ > 0, "BabyAsteroid: eth usd");

        rewardToken = IERC20(rewardToken_);
        revenueRecipient = revenueRecipient_;
        admin = admin_;
        uniswapV2Router = router_;
        chainlinkEthUsdFeed = chainlinkEthUsdFeed_;
        fallbackEthUsdPrice1e8 = fallbackEthUsdPrice1e8_;
        weth = router_.WETH();

        _mint(address(this), TOTAL_SUPPLY);

        isExcludedFromFee[address(this)] = true;
        isExcludedFromFee[admin_] = true;
        isExcludedFromFee[address(router_)] = true;
    }

    /// @notice Reference ETH/USD (8 decimals). Mint amount does not depend on this — see `TOKENS_PER_MINT`.
    function getEthUsdPrice1e8() public view returns (uint256) {
        if (address(chainlinkEthUsdFeed) != address(0)) {
            (, int256 answer,, uint256 updatedAt,) = chainlinkEthUsdFeed.latestRoundData();
            require(answer > 0, "BabyAsteroid: bad feed");
            require(block.timestamp - updatedAt <= 1 hours, "BabyAsteroid: stale feed");
            return uint256(answer);
        }
        return fallbackEthUsdPrice1e8;
    }

    /// @notice Fixed: each 0.01 ETH mint releases `TOKENS_PER_MINT` (1 亿枚, 18 decimals).
    function getTokensPerMint() public pure returns (uint256) {
        return TOKENS_PER_MINT;
    }

    function earned(address account) public view returns (uint256) {
        if (_isDividendExcluded(account)) {
            return rewards[account];
        }
        uint256 paid = userRewardPerSharePaid[account];
        uint256 delta = rewardPerShareAccumulated - paid;
        return rewards[account] + (balanceOf(account) * delta) / DIV_PRECISION;
    }

    function _eligibleSupply() internal view returns (uint256) {
        uint256 inContract = balanceOf(address(this));
        uint256 inPair = uniswapV2Pair == address(0) ? 0 : balanceOf(uniswapV2Pair);
        uint256 nonEligible = inContract + inPair + dividendExcludedSupply;
        if (TOTAL_SUPPLY <= nonEligible) return 0;
        return TOTAL_SUPPLY - nonEligible;
    }

    function _isDividendExcluded(address account) internal view returns (bool) {
        if (account == address(0) || account == address(this)) return true;
        if (uniswapV2Pair != address(0) && account == uniswapV2Pair) return true;
        return isExcludedFromDividends[account];
    }

    function _sync(address account) internal {
        if (_isDividendExcluded(account)) return;
        uint256 paid = userRewardPerSharePaid[account];
        uint256 delta = rewardPerShareAccumulated - paid;
        if (delta > 0) {
            uint256 share = (balanceOf(account) * delta) / DIV_PRECISION;
            rewards[account] += share;
        }
        userRewardPerSharePaid[account] = rewardPerShareAccumulated;
    }

    receive() external payable {
        mint();
    }

    function mint() public payable nonReentrant {
        require(msg.value == MINT_PRICE, "BabyAsteroid: mint price");
        uint256 out = TOKENS_PER_MINT;
        require(balanceOf(address(this)) >= out, "BabyAsteroid: sold out");

        (bool ok,) = payable(revenueRecipient).call{value: msg.value}("");
        require(ok, "BabyAsteroid: eth transfer");

        emit Minted(msg.sender, msg.value, out);

        _update(address(this), msg.sender, out);
    }

    function depositRewards(uint256 amount) external nonReentrant {
        require(amount > 0, "BabyAsteroid: zero amount");
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 supply = _eligibleSupply();
        require(supply > 0, "BabyAsteroid: no eligible");
        rewardPerShareAccumulated += (amount * DIV_PRECISION) / supply;
        emit RewardsNotified(amount, rewardPerShareAccumulated);
    }

    function claimRewards() external nonReentrant {
        _sync(msg.sender);
        uint256 payout = rewards[msg.sender];
        require(payout > 0, "BabyAsteroid: nothing to claim");
        rewards[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, payout);
    }

    function _update(address from, address to, uint256 value) internal override {
        uint256 fromBefore = from == address(0) ? 0 : balanceOf(from);
        uint256 toBefore = to == address(0) ? 0 : balanceOf(to);

        _sync(from);
        _sync(to);

        bool takeFee = _shouldTakeFee(from, to, value);
        uint256 tax = 0;
        if (takeFee) {
            tax = (value * TAX_BPS) / BPS;
        }

        if (tax > 0) {
            super._update(from, address(this), tax);
            emit TaxTaken(from, to, tax);
            value -= tax;
        }

        super._update(from, to, value);

        if (from != address(0) && isExcludedFromDividends[from]) {
            dividendExcludedSupply -= (fromBefore - balanceOf(from));
        }
        if (to != address(0) && isExcludedFromDividends[to]) {
            dividendExcludedSupply += (balanceOf(to) - toBefore);
        }
    }

    function _shouldTakeFee(address from, address to, uint256 value) internal view returns (bool) {
        if (value == 0) return false;
        if (uniswapV2Pair == address(0)) return false;
        if (from == uniswapV2Pair || to == uniswapV2Pair) {
            if (isExcludedFromFee[from] || isExcludedFromFee[to]) return false;
            return true;
        }
        return false;
    }

    function addLiquidityETH(
        uint256 tokenAmountDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        uint256 deadline
    ) external payable onlyAdmin nonReentrant {
        require(deadline >= block.timestamp, "BabyAsteroid: expired");
        require(tokenAmountDesired > 0 && msg.value > 0, "BabyAsteroid: amounts");

        _approveRouter(tokenAmountDesired);

        (,, uint256 liquidity) = uniswapV2Router.addLiquidityETH{value: msg.value}(
            address(this), tokenAmountDesired, amountTokenMin, amountETHMin, admin, deadline
        );
        require(liquidity > 0, "BabyAsteroid: no liquidity");

        if (uniswapV2Pair == address(0)) {
            address pair = IUniswapV2Factory(uniswapV2Router.factory()).getPair(address(this), weth);
            require(pair != address(0), "BabyAsteroid: pair");
            uniswapV2Pair = pair;
            isExcludedFromFee[pair] = true;
            emit PairUpdated(pair);
        }
    }

    function _approveRouter(uint256 amount) internal {
        uint256 current = allowance(address(this), address(uniswapV2Router));
        if (current < amount) {
            if (current > 0) {
                _approve(address(this), address(uniswapV2Router), 0);
            }
            _approve(address(this), address(uniswapV2Router), type(uint256).max);
        }
    }

    /// @notice `minRewardOut` must reflect off-chain quote / MEV-aware bot settings to limit sandwich risk.
    function processFees(uint256 amountIn, uint256 minRewardOut, uint256 deadline) external nonReentrant {
        require(deadline >= block.timestamp, "BabyAsteroid: expired");
        require(amountIn > 0, "BabyAsteroid: zero in");
        require(balanceOf(address(this)) >= amountIn, "BabyAsteroid: fee bal");

        address[] memory path = new address[](3);
        path[0] = address(this);
        path[1] = weth;
        path[2] = address(rewardToken);

        _approveRouter(amountIn);

        uint256 before = rewardToken.balanceOf(address(this));
        uniswapV2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn, minRewardOut, path, address(this), deadline
        );
        uint256 gained = rewardToken.balanceOf(address(this)) - before;
        require(gained >= minRewardOut, "BabyAsteroid: slippage");

        uint256 supply = _eligibleSupply();
        require(supply > 0, "BabyAsteroid: no eligible");
        rewardPerShareAccumulated += (gained * DIV_PRECISION) / supply;
        emit RewardsNotified(gained, rewardPerShareAccumulated);
    }

    function setExcludedFromFee(address account, bool excluded) external onlyAdmin {
        isExcludedFromFee[account] = excluded;
        emit ExcludedFromFeeUpdated(account, excluded);
    }

    /// @notice Excludes address from dividend accrual and removes its balance weight from `_eligibleSupply` denominator.
    function setExcludedFromDividends(address account, bool excluded) external onlyAdmin {
        require(account != address(this), "BabyAsteroid: contract");
        require(account != uniswapV2Pair || uniswapV2Pair == address(0), "BabyAsteroid: pair");

        if (excluded && !isExcludedFromDividends[account]) {
            isExcludedFromDividends[account] = true;
            dividendExcludedSupply += balanceOf(account);
        } else if (!excluded && isExcludedFromDividends[account]) {
            dividendExcludedSupply -= balanceOf(account);
            isExcludedFromDividends[account] = false;
        }
        emit ExcludedFromDividendsUpdated(account, excluded);
    }

    function setPair(address pair_) external onlyAdmin {
        require(pair_ != address(0), "BabyAsteroid: pair");
        uniswapV2Pair = pair_;
        isExcludedFromFee[pair_] = true;
        emit PairUpdated(pair_);
    }

    function setFallbackEthUsdPrice1e8(uint256 price1e8) external onlyOwner {
        require(address(chainlinkEthUsdFeed) == address(0), "BabyAsteroid: oracle active");
        require(price1e8 > 0, "BabyAsteroid: price");
        fallbackEthUsdPrice1e8 = price1e8;
        emit FallbackEthUsdUpdated(price1e8);
    }

    /// @notice Recover stray ERC20; cannot withdraw BABYAST. `revenueRecipient` is not adjustable here.
    function sweepERC20(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(address(token) != address(this), "BabyAsteroid: no sweep native token");
        token.safeTransfer(to, amount);
        emit Sweep(address(token), amount, to);
    }

    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "BabyAsteroid: eth");
    }
}
