param(
  [int]$BackendPort = 5000,
  [int]$FrontendPort = 5173,
  [switch]$UseFreePorts
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $Root "Frontend"
$RunDir = Join-Path $Root ".codex-run"
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Test-PortInUse([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Find-FreePort([int]$StartPort) {
  $port = $StartPort
  while (Test-PortInUse $port) {
    $port += 1
  }
  return $port
}

function Test-BackendCompatibility([int]$Port) {
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 5
    $login = Invoke-WebRequest `
      -Uri "http://127.0.0.1:$Port/api/auth/login" `
      -Method POST `
      -ContentType "application/json" `
      -Body '{"username":"admin","password":"swu@2026"}' `
      -UseBasicParsing `
      -SkipHttpErrorCheck `
      -TimeoutSec 5
    $healthJson = $health.Headers["Content-Type"] -match "application/json"
    $loginJson = $login.Headers["Content-Type"] -match "application/json"
    return $healthJson -and $loginJson -and ($login.StatusCode -lt 500)
  } catch {
    return $false
  }
}

if ((Test-PortInUse $BackendPort) -and -not (Test-BackendCompatibility $BackendPort)) {
  if ($UseFreePorts) {
    $BackendPort = Find-FreePort ($BackendPort + 1)
  } else {
    throw "Port $BackendPort is occupied by an incompatible backend. Stop the old Flask process, or use -UseFreePorts / -BackendPort 5050."
  }
}

if (Test-PortInUse $FrontendPort) {
  if ($UseFreePorts) {
    $FrontendPort = Find-FreePort ($FrontendPort + 1)
  } else {
    throw "Port $FrontendPort is occupied. Stop the old Vite process, or use -UseFreePorts / -FrontendPort 5176."
  }
}

$backendLog = Join-Path $RunDir "local-backend-$BackendPort.log"
$backendErr = Join-Path $RunDir "local-backend-$BackendPort.err.log"
$frontendLog = Join-Path $RunDir "local-frontend-$FrontendPort.log"
$frontendErr = Join-Path $RunDir "local-frontend-$FrontendPort.err.log"

if (-not (Test-PortInUse $BackendPort)) {
  $backend = Start-Process `
    -FilePath "python" `
    -ArgumentList "-m","flask","--app","Backend.app","run","--host","127.0.0.1","--port",$BackendPort `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError $backendErr `
    -WindowStyle Hidden `
    -PassThru
  Start-Sleep -Seconds 3
} else {
  $backend = $null
}

$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"
$frontendCommand = "`$env:VITE_API_BASE_URL=''; `$env:VITE_BACKEND_PROXY_TARGET='$backendUrl'; npm run dev -- --host 127.0.0.1 --port $FrontendPort"
$frontend = Start-Process `
  -FilePath "powershell" `
  -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command",$frontendCommand `
  -WorkingDirectory $FrontendDir `
  -RedirectStandardOutput $frontendLog `
  -RedirectStandardError $frontendErr `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 3

Write-Host "Unified browser URL: $frontendUrl"
Write-Host "Backend API target: $backendUrl"
Write-Host "Backend log: $backendLog"
Write-Host "Frontend log: $frontendLog"
if ($backend) { Write-Host "Backend PID: $($backend.Id)" }
Write-Host "Frontend PID: $($frontend.Id)"
Write-Host "Note: open only the unified browser URL. The frontend forwards /api to the backend target."
