@echo off
rem HUSH - open the game. Picks a free port automatically, reuses a running
rem HUSH server if one is already up, and falls back to dist\hush.html.
setlocal
cd /d "%~dp0"
if /i "%~1"=="stop" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0play.ps1" %*
if errorlevel 1 pause
