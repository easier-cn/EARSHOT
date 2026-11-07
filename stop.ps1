param([switch]$Quiet)
# HUSH stopper: ends the server started by play.cmd, even if the tab/browser is gone.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$pidFile = Join-Path $root '.hush.pid'
$stopped = @()

function Test-Open([int]$port) {
  $c = $null
  try {
    $c = [System.Net.Sockets.TcpClient]::new()
    $t = $c.ConnectAsync('127.0.0.1', $port)
    return ($t.Wait(120) -and $c.Connected)
  } catch { return $false }
  finally { if ($c) { try { $c.Close() } catch {} } }
}

function Test-Hush([int]$port) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 1
    return ($r.Content -match '<canvas id="game"')
  } catch { return $false }
}

function Stop-Tree([int]$target) {
  if (-not $target -or $target -le 4) { return }
  & taskkill /PID $target /T /F 2>$null | Out-Null
  $script:stopped += $target
}

# 1. The pid file written by play.ps1 is the reliable route.
if (Test-Path $pidFile) {
  $saved = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($saved -match '^\d+$') { Stop-Tree ([int]$saved) }
}

# 2. Fallback (only when the pid file did not help): find a HUSH server by probing.
for ($p = 8080; $p -lt 8140; $p++) {
  if ($stopped.Count -gt 0) { break }
  if (-not (Test-Open $p)) { continue }
  if (-not (Test-Hush $p)) { continue }
  $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { Stop-Tree ([int]$conn.OwningProcess) }
}

Remove-Item $pidFile -ErrorAction SilentlyContinue

if (-not $Quiet) {
  if ($stopped.Count -gt 0) { Write-Host "  HUSH server stopped ($($stopped -join ', '))." }
  else { Write-Host "  No HUSH server was running." }
}
