# Create desktop shortcut -> desktop-launch.bat (reliable when npm is not on Explorer PATH).
# Usage (repo root): npm run desktop:shortcut

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $repoRoot "desktop-launch.bat"
if (-not (Test-Path -LiteralPath $batPath)) {
  throw "Missing desktop-launch.bat in repo root."
}

$desktop = [Environment]::GetFolderPath("Desktop")
if (-not $desktop) { throw "Could not resolve Desktop folder." }
$lnkPath = Join-Path $desktop "BabyAsteroidDesktop.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($lnkPath)
$Shortcut.TargetPath = $batPath
$Shortcut.Arguments = ""
$Shortcut.WorkingDirectory = $repoRoot
$Shortcut.WindowStyle = 1
$Shortcut.Description = "BabyAsteroid desktop (Electron)"
$electronExe = Join-Path $repoRoot "node_modules\electron\dist\electron.exe"
if (Test-Path -LiteralPath $electronExe) {
  $Shortcut.IconLocation = "$electronExe,0"
}
$Shortcut.Save()

Write-Host "Desktop shortcut created:"
Write-Host "  $lnkPath"
Write-Host "Target:"
Write-Host "  $batPath"
