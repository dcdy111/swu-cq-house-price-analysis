param(
  [int]$LocalPort = 13306
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $Root ".codex-run"
$PidFile = Join-Path $RunDir "dbeaver-mysql-tunnel.pid"
$SshExe = "C:\\Windows\\System32\\OpenSSH\\ssh.exe"
$KeyFile = Join-Path $HOME ".ssh\\id_rsa"

if (-not (Test-Path -LiteralPath $SshExe) -and -not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "ssh was not found in PATH."
}

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

$existing = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "SSH tunnel already listening on 127.0.0.1:$LocalPort"
  exit 0
}

$sshArgs = @(
  "-N"
  "-i"
  $KeyFile
  "-o"
  "StrictHostKeyChecking=no"
  "-o"
  "ServerAliveInterval=60"
  "-o"
  "ServerAliveCountMax=3"
  "-p"
  "22"
  "-L"
  "${LocalPort}:127.0.0.1:3306"
  "root@8.137.170.98"
)

$process = Start-Process -FilePath $SshExe -ArgumentList $sshArgs -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 2

$listening = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  throw "Failed to start SSH tunnel on 127.0.0.1:$LocalPort."
}

Set-Content -LiteralPath $PidFile -Value $process.Id -Encoding ascii
Write-Host "Tunnel ready: 127.0.0.1:$LocalPort -> 127.0.0.1:3306@8.137.170.98"
Write-Host "PID: $($process.Id)"
