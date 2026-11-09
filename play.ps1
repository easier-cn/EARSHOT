param([int]$Port = 0)
# HUSH launcher: finds a free port (or reuses a running HUSH server), then
# serves the game with Python. Falls back to the single-file build without Python.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Binding is not enough on Windows: other servers set SO_REUSEADDR, so two
# sockets can listen on the same port. A successful connect is the real test.
function Test-Busy([int]$port) {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $task = $client.ConnectAsync('127.0.0.1', $port)
    if ($task.Wait(250) -and $client.Connected) { return $true }
  } catch {}
  finally { if ($client) { try { $client.Close() } catch {} } }
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    $listener.Start()
    return $false
  } catch {
    return $true
  } finally {
    if ($listener) { try { $listener.Stop() } catch {} }
  }
}

function Test-Hush([int]$port) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 1
    # Only reuse a server that sends no-store; an old python -m http.server keeps
    # yesterday's modules in the browser cache, which looks like "fixes vanished".
    $cc = [string]$r.Headers['Cache-Control']
    return ($r.Content -match '<canvas id="game"' -and $cc -match 'no-store')
  } catch {
    return $false
  }
}

# 1. An existing EARSHOT server on 8080 can be reused as-is.
$start = if ($env:HUSH_PORT) { [int]$env:HUSH_PORT } elseif ($Port -gt 0) { $Port } else { 8080 }
$port = 0
$reused = $false
# Reuse only the requested port: a custom start port should not be hijacked by
# some other EARSHOT window that happens to sit further down the range.
if ((Test-Busy $start) -and (Test-Hush $start)) { $port = $start; $reused = $true }

# 2. Otherwise take the first free port in that range.
if (-not $port) {
  for ($p = $start; $p -lt $start + 60; $p++) {
    if (-not (Test-Busy $p)) { $port = $p; break }
  }
}
if (-not $port) {
  # Everything busy: let the OS hand us any free port.
  $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $l.Start(); $port = $l.LocalEndpoint.Port; $l.Stop()
}

$url = "http://127.0.0.1:$port/"
# A fresh query string forces a network fetch: an old cached document can
# otherwise reopen with yesterday's JS and no boot screen (Ctrl+F5 "fixes" it).
$openUrl = $url + "?launch=" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

if ($reused) {
  Write-Host ""
  Write-Host "  EARSHOT  ->  $url"
  Write-Host "  (an existing EARSHOT server is already running here)"
  Write-Host ""
  if (-not $env:HUSH_NO_OPEN) { Start-Process $openUrl }
  exit 0
}

Write-Host ""
Write-Host "  EARSHOT  ->  $url"
Write-Host "  (close this window, or run stop.cmd, to stop the server)"
Write-Host ""

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
if (-not $py) {
  if (Test-Path 'dist\hush.html') {
    Write-Host "  Python not found - opening the single-file build instead."
    Start-Process (Join-Path $root 'dist\hush.html')
    Start-Sleep -Seconds 2
  } else {
    Write-Host "  Neither Python nor dist\hush.html is available."
    Write-Host "  Install Python, or run: node tools/build.mjs"
    Read-Host "Press Enter to close"
  }
  exit 0
}

if (-not $env:HUSH_NO_OPEN) {
  # Open the browser from a detached helper, after the server has had time to bind.
  Start-Process -FilePath 'powershell' -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-Command', "Start-Sleep -Milliseconds 2800; Start-Process '$openUrl'"
  )
}

# Remember who is serving, so stop.ps1 can clean up after the tab is closed.
$pidFile = Join-Path $root '.hush.pid'
Set-Content -Path $pidFile -Value $PID -Encoding ascii
try {
  & $py.Source (Join-Path $root 'tools\serve.py') $port $root
} finally {
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}
