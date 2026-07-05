param(
  [int]$LocalPort = 13306
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path (Join-Path $Root ".codex-run") "dbeaver-mysql-tunnel.pid"

if (Test-Path -LiteralPath $PidFile) {
  $pidValue = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
  if ($pidValue) {
    Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

$listeners = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
  $listeners | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Tunnel on 127.0.0.1:$LocalPort stopped."
