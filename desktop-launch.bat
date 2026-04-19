@echo off
REM Desktop shortcut runs this file: start Electron without relying on Explorer PATH.
cd /d "%~dp0"
set "ROOT=%CD%"
set "ELECTRON_EXE=%ROOT%\node_modules\electron\dist\electron.exe"

if exist "%ELECTRON_EXE%" (
  start "" "%ELECTRON_EXE%" "%ROOT%"
  exit /b 0
)

if exist "%ProgramFiles%\nodejs\npm.cmd" (
  start "BabyAsteroid" /D "%ROOT%" "%ProgramFiles%\nodejs\npm.cmd" run desktop
  exit /b 0
)
if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" (
  start "BabyAsteroid" /D "%ROOT%" "%ProgramFiles(x86)%\nodejs\npm.cmd" run desktop
  exit /b 0
)

for /f "delims=" %%A in ('where npm.cmd 2^>nul') do (
  start "BabyAsteroid" /D "%ROOT%" "%%A" run desktop
  exit /b 0
)

echo.
echo [BabyAsteroid] Electron is not installed in this project.
echo   Expected: %ELECTRON_EXE%
echo.
echo Open PowerShell here and run:
echo   npm install
echo   npm run desktop
echo.
pause
exit /b 1
