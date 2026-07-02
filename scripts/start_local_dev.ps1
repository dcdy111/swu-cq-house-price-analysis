param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $Root "Frontend"
$RunDir = Join-Path $Root ".codex-run"
$VenvPython = Join-Path $Root ".venv\\Scripts\\python.exe"
$BackendPort = 5000
$FrontendPort = 5173
$BackendUrl = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://127.0.0.1:$FrontendPort"

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Resolve-PythonCommand {
  if (Test-Path -LiteralPath $VenvPython) {
    return $VenvPython
  }
  if ($env:PYTHON_EXE) {
    return $env:PYTHON_EXE
  }
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return $python.Source
  }
  throw "Python was not found in PATH. Install Python 3.10+ first, or set `$env:PYTHON_EXE."
}

function Assert-PythonVersion([string]$PythonCmd) {
  $versionText = & $PythonCmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to detect Python version from $PythonCmd."
  }
  if ([version]$versionText -lt [version]"3.10") {
    throw "Python 3.10+ is required. Current version: $versionText. If you already installed another interpreter, set `$env:PYTHON_EXE='C:\\Path\\python.exe' and rerun."
  }
}

$PythonCmd = Resolve-PythonCommand
Assert-PythonVersion $PythonCmd

function Test-PortInUse([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Test-BackendCompatibility {
  try {
    $health = Invoke-WebRequest -Uri "$BackendUrl/api/health" -UseBasicParsing -TimeoutSec 5
    $healthJson = $health.Headers["Content-Type"] -match "application/json"
    return $healthJson -and ($health.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
  throw "Frontend dependencies are missing. Run scripts/setup_local.ps1 first."
}

if (-not (Test-Path -LiteralPath $VenvPython)) {
  throw "Project virtual environment .venv is missing. Run scripts/setup_local.ps1 first."
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
    -FilePath $PythonCmd `
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

for ($attempt = 0; $attempt -lt 40 -and -not (Test-PortInUse $FrontendPort); $attempt += 1) {
  Start-Sleep -Milliseconds 500
}

if (-not (Test-BackendCompatibility)) {
  throw "Backend failed to start. Check $backendErr."
}

if (-not (Test-PortInUse $FrontendPort)) {
  throw "Frontend failed to start. Check $frontendErr."
}

Write-Host "Frontend URL: $FrontendUrl"
Write-Host "Backend URL: $BackendUrl"
Write-Host "Backend log: $backendLog"
Write-Host "Frontend log: $frontendLog"
if ($backend) { Write-Host "Backend PID: $($backend.Id)" }
Write-Host "Frontend PID: $($frontend.Id)"
Write-Host "Open http://127.0.0.1:5173; Vite proxies API requests to http://127.0.0.1:5000."
