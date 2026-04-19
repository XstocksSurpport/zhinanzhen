# Method A: proxy env for undici (verify:etherscan-api) + global-agent preload for Hardhat (verify:mainnet).
# Usage:
#   .\scripts\verify-method-a.ps1
#   .\scripts\verify-method-a.ps1 -Port 7897
#   .\scripts\verify-method-a.ps1 -IncludeHardhat   # also runs npm run verify:mainnet after API verify
param(
  [int] $Port = 7890,
  [switch] $IncludeHardhat
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$proxy = "http://127.0.0.1:$Port"
$env:HTTPS_PROXY = $proxy
$env:HTTP_PROXY = $proxy
$env:ETHERSCAN_HTTP_PROXY = $proxy
$env:GLOBAL_AGENT_HTTP_PROXY = $proxy
$env:GLOBAL_AGENT_HTTPS_PROXY = $proxy
# Hardhat @nomicfoundation/hardhat-verify uses Node https and ignores HTTP_PROXY; global-agent patches it.
# global-agent v4 没有 `global-agent/bootstrap` 子模块；用仓库内 preload。
# 使用 --require=path（无空格）：部分 PowerShell 会把 "--require ./x" 解析坏，导致 NODE_OPTIONS 变空。
$env:NODE_OPTIONS = '--require=./scripts/global-agent-preload.cjs'

Write-Host "[Method A] HTTPS_PROXY=$proxy"
Write-Host "[Method A] GLOBAL_AGENT_HTTP(S)_PROXY=$proxy"
Write-Host "[Method A] NODE_OPTIONS=$env:NODE_OPTIONS"

npm run verify:etherscan-api
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($IncludeHardhat) {
  Write-Host "[Method A] npm run verify:mainnet ..."
  npm run verify:mainnet
}
