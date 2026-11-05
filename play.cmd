@echo off
rem HUSH - open the game. Uses a local server when available, otherwise falls
rem back to the prebuilt single-file version in dist\.
setlocal
cd /d "%~dp0"
set PORT=8080
set URL=http://127.0.0.1:%PORT%/

powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %PORT%); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto open

where python >nul 2>&1
if errorlevel 1 goto file

echo Starting HUSH server on %URL%
start "HUSH server" /min cmd /c python -m http.server %PORT% --bind 127.0.0.1
timeout /t 1 /nobreak >nul
goto open

:file
if not exist "dist\hush.html" goto nobuild
echo Python not found - opening the single-file build.
start "" "dist\hush.html"
goto :eof

:nobuild
echo Neither Python nor dist\hush.html is available.
echo Install Python, or run:  node tools/build.mjs
pause
goto :eof

:open
start "" "%URL%"
