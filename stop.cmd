@echo off
chcp 65001 >nul
rem EARSHOT - stop the local server (works even after the browser tab is closed).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
pause
