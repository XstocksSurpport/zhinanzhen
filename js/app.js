(function () {
  const CFG = window.ZNZ_CONFIG || {};
  const RECV = String(CFG.USDT_RECEIVE_ADDRESS || "").trim();
  const PRICE = Number(CFG.PRESALE_PRICE_USDT) > 0 ? Number(CFG.PRESALE_PRICE_USDT) : 0.0018;
  const MIN_U = Number(CFG.MIN_PRESALE_USDT) > 0 ? Number(CFG.MIN_PRESALE_USDT) : 10;
  const MAX_U = Number(CFG.MAX_PRESALE_USDT) > 0 ? Number(CFG.MAX_PRESALE_USDT) : 10000;
  const USDT = String(CFG.USDT_BSC || "0x55d398326f99059fF775485246999027B3197955").trim();
  const BSC_RPC = CFG.BSC_RPC || "https://bsc-dataseed.binance.org";

  const BSC_ID = 56;

  const PROGRESS_START_MS = Date.parse("2026-04-18T08:00:00.000Z");
  const BASE_PROGRESS = 74.71;
  const HOURLY_DELTA = 0.01;

  const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)",
  ];

  let provider = null;
  let signer = null;
  let userAddress = null;
  let chainId = null;
  let usdtDecimals = 18;

  const $ = (id) => document.getElementById(id);

  const RANK_TOTAL = 60;
  const RANK_PER_PAGE = 10;

  function makeRankAddress(i) {
    const seed = "znz:points-rank:v1|" + String(i) + "|" + String(RANK_TOTAL);
    const hash = ethers.keccak256(ethers.toUtf8Bytes(seed));
    const addrBody = hash.slice(26, 66);
    return ethers.getAddress("0x" + addrBody);
  }

  function buildRankList() {
    const list = [];
    const denom = RANK_TOTAL - 1;
    const logMax = Math.log(10000);
    for (let i = 0; i < RANK_TOTAL; i++) {
      const points = Math.max(1, Math.round(10000 * Math.exp((-logMax * i) / denom)));
      list.push({
        rank: i + 1,
        address: makeRankAddress(i),
        points,
      });
    }
    return list;
  }

  let rankData = [];
  let rankPage = 1;

  function renderRankTable() {
    const tb = $("rankTableBody");
    const pager = $("rankPager");
    if (!tb || !pager) return;

    const start = (rankPage - 1) * RANK_PER_PAGE;
    const pageRows = rankData.slice(start, start + RANK_PER_PAGE);
    tb.innerHTML = pageRows
      .map(
        (r) =>
          `<tr><td>${r.rank}</td><td class="mono rank-addr">${shortAddr(r.address)}</td><td class="rank-points">${r.points.toLocaleString(
            "zh-CN"
          )}</td></tr>`
      )
      .join("");

    const totalPages = Math.ceil(rankData.length / RANK_PER_PAGE);
    pager.innerHTML = "";
    for (let p = 1; p <= totalPages; p++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rank-page-btn" + (p === rankPage ? " is-active" : "");
      b.textContent = String(p);
      if (p === rankPage) b.setAttribute("aria-current", "page");
      b.addEventListener("click", () => {
        rankPage = p;
        renderRankTable();
      });
      pager.appendChild(b);
    }
  }

  function initPointsRank() {
    rankData = buildRankList();
    rankPage = 1;
    renderRankTable();
  }

  function shortAddr(a) {
    if (!a || a.length < 12) return a || "—";
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._tid);
    showToast._tid = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function currentProgressPercent() {
    const now = Date.now();
    if (now < PROGRESS_START_MS) return BASE_PROGRESS;
    const hours = Math.floor((now - PROGRESS_START_MS) / 3600000);
    const p = BASE_PROGRESS + hours * HOURLY_DELTA;
    return Math.min(100, Math.round(p * 100) / 100);
  }

  function refreshProgressUI() {
    const p = currentProgressPercent();
    const fill = $("progressFill");
    const bar = fill && fill.parentElement;
    const label = $("progressPercentLabel");
    if (fill) fill.style.width = p + "%";
    if (bar) bar.setAttribute("aria-valuenow", String(p));
    if (label) label.textContent = p.toFixed(2) + "%";
  }

  function bscAddChainParams() {
    return {
      chainId: "0x38",
      chainName: "BNB Smart Chain",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: [BSC_RPC],
      blockExplorerUrls: ["https://bscscan.com"],
    };
  }

  async function ensureBsc() {
    if (!window.ethereum) return false;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
      return true;
    } catch (e) {
      if (e && e.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [bscAddChainParams()],
          });
          return true;
        } catch (e2) {
          showToast(e2.message || "添加 BSC 网络失败");
          return false;
        }
      }
      if (e && e.code === 4001) {
        showToast("已取消网络切换");
        return false;
      }
      showToast(e.message || "请切换至 BSC 主网");
      return false;
    }
  }

  async function syncChainFromWallet() {
    if (!provider) return;
    const net = await provider.getNetwork();
    chainId = Number(net.chainId);
  }

  function onUsdtInput() {
    const raw = ($("usdtAmount") && $("usdtAmount").value) || "";
    const v = parseFloat(raw.replace(/,/g, ""));
    const znzEl = $("znzOut");
    const ptEl = $("divPointsOut");
    if (!Number.isFinite(v) || v <= 0) {
      if (znzEl) znzEl.textContent = "0";
      if (ptEl) ptEl.textContent = "0";
      return;
    }
    const znz = v / PRICE;
    if (znzEl)
      znzEl.textContent = znz.toLocaleString("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    if (ptEl) ptEl.textContent = (v / 10).toLocaleString("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }

  async function readUsdtMeta() {
    if (!provider || chainId !== BSC_ID) return;
    try {
      const c = new ethers.Contract(USDT, ERC20_ABI, provider);
      const d = await c.decimals();
      usdtDecimals = Number(d);
    } catch {
      usdtDecimals = 18;
    }
  }

  async function updateUsdtBalance() {
    const el = $("usdtBal");
    if (!el) return;
    if (!userAddress || !provider) {
      el.textContent = "—";
      return;
    }
    if (chainId !== BSC_ID) {
      el.textContent = "请切换至 BSC";
      return;
    }
    try {
      const c = new ethers.Contract(USDT, ERC20_ABI, provider);
      const raw = await c.balanceOf(userAddress);
      el.textContent = ethers.formatUnits(raw, usdtDecimals);
    } catch {
      el.textContent = "—";
    }
  }

  function setConnected(addr) {
    userAddress = addr;
    $("connectBtn").classList.add("hidden");
    $("walletRow").classList.remove("hidden");
    $("walletAddr").textContent = shortAddr(addr);
    const echo = $("walletEcho");
    if (echo) echo.textContent = addr;
    void Promise.all([readUsdtMeta(), updateUsdtBalance()]);
  }

  function setDisconnected() {
    userAddress = null;
    signer = null;
    $("connectBtn").classList.remove("hidden");
    $("walletRow").classList.add("hidden");
    const echo = $("walletEcho");
    if (echo) echo.textContent = "—";
    const b = $("usdtBal");
    if (b) b.textContent = "—";
  }

  async function connect() {
    if (!window.ethereum) {
      showToast("请安装钱包扩展（如 MetaMask）");
      return;
    }
    const connectBtn = $("connectBtn");
    const prevLabel = connectBtn ? connectBtn.textContent : "";
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.textContent = "连接中…";
    }
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      const accs = await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      userAddress = accs[0];
      const ok = await ensureBsc();
      await syncChainFromWallet();
      setConnected(userAddress);
      showToast(ok && chainId === BSC_ID ? "已连接钱包 · BSC 主网" : "钱包已连接，请切换至 BSC 主网后再支付");
    } catch (e) {
      showToast(e.shortMessage || e.message || "连接失败");
    } finally {
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = prevLabel || "连接钱包";
      }
    }
  }

  async function onBuy() {
    if (!signer || !userAddress) {
      showToast("请先连接钱包");
      return;
    }
    if (!ethers.isAddress(RECV)) {
      showToast("收款地址未配置");
      return;
    }
    await syncChainFromWallet();
    if (chainId !== BSC_ID) {
      const ok = await ensureBsc();
      if (!ok) return;
      await syncChainFromWallet();
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
    }
    if (chainId !== BSC_ID) {
      showToast("请在 BSC 主网下发起支付");
      return;
    }
    const rawAmt = ($("usdtAmount") && $("usdtAmount").value.replace(/,/g, "").trim()) || "";
    const want = Number(rawAmt);
    if (!Number.isFinite(want) || want < MIN_U || want > MAX_U) {
      showToast(`请输入 ${MIN_U}～${MAX_U} USDT 范围内的金额`);
      return;
    }
    let amountWei;
    try {
      amountWei = ethers.parseUnits(String(want), usdtDecimals);
    } catch {
      showToast("金额格式有误，请检查后重试");
      return;
    }
    try {
      const usdt = new ethers.Contract(USDT, ERC20_ABI, signer);
      showToast("正在唤起钱包，请在钱包内确认 USDT 转账");
      const tx = await usdt.transfer(RECV, amountWei);
      await tx.wait();
      showToast("链上转账已确认");
      await updateUsdtBalance();
    } catch (e) {
      showToast(e.shortMessage || e.reason || e.message || "交易未完成或已取消");
    }
  }

  function showPanel(id) {
    document.querySelectorAll(".page-panel").forEach((p) => {
      p.classList.toggle("active", p.getAttribute("data-panel-id") === id);
    });
    document.querySelectorAll(".site-nav a[data-panel]").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("data-panel") === id);
    });
  }

  function routeFromHash() {
    const h = (location.hash || "#home").replace("#", "") || "home";
    const allowed = ["home", "presale", "dividend", "tokenomics", "points"];
    showPanel(allowed.includes(h) ? h : "home");
  }

  function initLabels() {
    const pw = $("configWarn");
    if (pw) {
      pw.textContent = ethers.isAddress(RECV) ? "" : "官方收款地址未配置，暂无法发起支付。";
    }
    const pl = $("priceLabel");
    if (pl) pl.textContent = String(PRICE);
    const mn = $("minLabel");
    const mx = $("maxLabel");
    if (mn) mn.textContent = String(MIN_U);
    if (mx) mx.textContent = String(MAX_U);
    const pe = $("presaleEndLabel");
    if (pe && CFG.PRESALE_END_CN) pe.textContent = String(CFG.PRESALE_END_CN);
  }

  async function onAccountsChanged(accs) {
    if (!accs || !accs.length) {
      setDisconnected();
      return;
    }
    userAddress = accs[0];
    if (provider) signer = await provider.getSigner();
    await ensureBsc();
    await syncChainFromWallet();
    $("walletAddr").textContent = shortAddr(userAddress);
    const echo = $("walletEcho");
    if (echo) echo.textContent = userAddress;
    await Promise.all([readUsdtMeta(), updateUsdtBalance()]);
  }

  function init() {
    initLabels();
    routeFromHash();
    refreshProgressUI();
    setInterval(refreshProgressUI, 60000);

    $("connectBtn").addEventListener("click", connect);
    $("disconnectBtn").addEventListener("click", () => {
      setDisconnected();
      showToast("已断开连接");
    });

    const amt = $("usdtAmount");
    if (amt) amt.addEventListener("input", onUsdtInput);
    const buyBtn = $("buyBtn");
    if (buyBtn) {
      buyBtn.disabled = !ethers.isAddress(RECV);
      buyBtn.addEventListener("click", onBuy);
    }

    window.addEventListener("hashchange", routeFromHash);
    document.querySelectorAll(".site-nav a[data-panel]").forEach((a) => {
      a.addEventListener("click", () => {
        setTimeout(routeFromHash, 0);
      });
    });
    const bh = $("brandHome");
    if (bh)
      bh.addEventListener("click", (e) => {
        e.preventDefault();
        location.hash = "#home";
        routeFromHash();
      });

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", onAccountsChanged);
      window.ethereum.on("chainChanged", () => window.location.reload());
    }

    onUsdtInput();
    initPointsRank();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
