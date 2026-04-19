# One-shot: China mirror + optional proxy from scripts/.env -> install Electron -> desktop shortcut
# Run from repo root: npm run desktop:complete

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envFile = Join-Path $root "scripts\.env"
if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*#' -or $line -eq "") { return }
    if ($line -match '^\s*ETHERSCAN_HTTP_PROXY\s*=\s*(.+)$') {
      $p = $matches[1].Trim().Trim('"').Trim("'")
      $env:HTTPS_PROXY = $p
      $env:HTTP_PROXY = $p
      Write-Host "Using proxy from scripts/.env for downloads."
    }
  }
}

$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
Write-Host "ELECTRON_MIRROR=$env:ELECTRON_MIRROR"

$exe = Join-Path $root "node_modules\electron\dist\electron.exe"
$installJs = Join-Path $root "node_modules\electron\install.js"

function Install-ElectronBinary {
  if (-not (Test-Path -LiteralPath $installJs)) {
    Write-Host "Missing node_modules\electron package. Running npm install..."
    npm install
    return $LASTEXITCODE -eq 0
  }
  Write-Host "Downloading Electron binary (install.js)..."
  node $installJs
  return $LASTEXITCODE -eq 0
}

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Host "Installing / repairing dependencies (close BabyAsteroid/Electron if you see EBUSY)..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed (e.g. EBUSY). Retrying Electron binary only..."
    if (-not (Install-ElectronBinary)) {
      Write-Host "Still failed. Close all Electron windows and Cursor tabs for this folder, then run: npm run desktop:complete"
      exit 1
    }
  }
}

if (-not (Test-Path -LiteralPath $exe)) {
  if (-not (Install-ElectronBinary)) {
    Write-Host "Missing: $exe"
    exit 1
  }
}

Write-Host "Creating desktop shortcut..."
npm run desktop:shortcut
Write-Host "Done. Double-click BabyAsteroidDesktop on Desktop, or: npm run desktop"
