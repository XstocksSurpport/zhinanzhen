@echo off
cd /d "%~dp0"
if not exist "index.html" (
  msg * 找不到 index.html
  exit /b 1
)
set "PY="
where py >nul 2>&1 && set "PY=py"
if not defined PY where python >nul 2>&1 && set "PY=python"
if not defined PY (
  start "" "%~dp0index.html"
  exit /b 0
)
start "网站-3001" /D "%~dp0" cmd /k "%PY% -m http.server 3001 --bind 127.0.0.1"
ping 127.0.0.1 -n 2 >nul
start "" "http://127.0.0.1:3001/"
exit /b 0
