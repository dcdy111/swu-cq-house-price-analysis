param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $Root "Frontend"
$RunDir = Join-Path $Root ".codex-run"
$BackendPort = 5000
$FrontendPort = 5173
$BackendUrl = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://127.0.0.1:$FrontendPort"

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Test-PortInUse([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Test-BackendCompatibility {
  try {
    $health = Invoke-WebRequest -Uri "$BackendUrl/api/health" -UseBasicParsing -TimeoutSec 5
    $login = Invoke-WebRequest `
      -Uri "$BackendUrl/api/auth/login" `
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

if (Test-PortInUse $BackendPort) {
  if (-not (Test-BackendCompatibility)) {
    throw "Port 5000 is occupied by an incompatible service. Stop it and retry."
  }
}

if (Test-PortInUse $FrontendPort) {
  throw "Port 5173 is already in use. Stop the old frontend process and retry."
}

$backendLog = Join-Path $RunDir "local-backend-5000.log"
$backendErr = Join-Path $RunDir "local-backend-5000.err.log"
$frontendLog = Join-Path $RunDir "local-frontend-5173.log"
$frontendErr = Join-Path $RunDir "local-frontend-5173.err.log"

if (-not (Test-PortInUse $BackendPort)) {
  $backend = Start-Process `
    -FilePath "python" `
    -ArgumentList "-m","flask","--app","Backend.app","run","--host","127.0.0.1","--port","5000" `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError $backendErr `
    -WindowStyle Hidden `
    -PassThru
  Start-Sleep -Seconds 3
} else {
  $backend = $null
}

$frontend = Start-Process `
  -FilePath "powershell" `
  -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","npm run dev -- --host 127.0.0.1 --port 5173" `
  -WorkingDirectory $FrontendDir `
  -RedirectStandardOutput $frontendLog `
  -RedirectStandardError $frontendErr `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 3

Write-Host "Frontend URL: $FrontendUrl"
Write-Host "Backend URL: $BackendUrl"
Write-Host "Backend log: $backendLog"
Write-Host "Frontend log: $frontendLog"
if ($backend) { Write-Host "Backend PID: $($backend.Id)" }
Write-Host "Frontend PID: $($frontend.Id)"
Write-Host "Open http://127.0.0.1:5173; Vite proxies API requests to http://127.0.0.1:5000."
