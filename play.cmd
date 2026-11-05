@echo off
rem HUSH - start a local static server (if needed) and open the game.
setlocal
cd /d "%~dp0"
set PORT=8080
set URL=http://127.0.0.1:%PORT%/

powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %PORT%); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo Starting HUSH server on %URL%
  start "HUSH server" /min cmd /c python -m http.server %PORT% --bind 127.0.0.1
  timeout /t 1 /nobreak >nul
)

start "" "%URL%"
