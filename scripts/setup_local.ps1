param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $Root "Frontend"
$EnvFile = Join-Path $Root ".env"
$EnvExample = Join-Path $Root ".env.example"
$FrontendEnvFile = Join-Path $FrontendDir ".env.local"
$FrontendEnvExample = Join-Path $FrontendDir ".env.example"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python was not found in PATH. Install Python 3.8+ first."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found in PATH. Install Node.js 18+ first."
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
  Write-Host "Created .env from .env.example."
} else {
  Write-Host "Kept existing .env."
}

if (-not (Test-Path -LiteralPath $FrontendEnvFile)) {
  Copy-Item -LiteralPath $FrontendEnvExample -Destination $FrontendEnvFile
  Write-Host "Created Frontend/.env.local from Frontend/.env.example."
} else {
  Write-Host "Kept existing Frontend/.env.local."
}

Push-Location $Root
try {
  python -m pip install -r requirements.txt
  if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
} finally {
  Pop-Location
}

Push-Location $FrontendDir
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
} finally {
  Pop-Location
}

Write-Host "Local setup completed."
Write-Host "Review .env for MySQL, crawler cookies, and DeepSeek settings."
Write-Host "Run: powershell -ExecutionPolicy Bypass -File .\scripts\start_local_dev.ps1"
