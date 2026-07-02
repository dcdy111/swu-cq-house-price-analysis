param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $Root "Frontend"
$VenvDir = Join-Path $Root ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\\python.exe"
$EnvFile = Join-Path $Root ".env"
$EnvExample = Join-Path $Root ".env.example"
$FrontendEnvFile = Join-Path $FrontendDir ".env.local"
$FrontendEnvExample = Join-Path $FrontendDir ".env.example"

function Resolve-PythonCommand {
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

function Assert-NodeVersion {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found in PATH. Install Node.js 18+ first."
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found in PATH. Install Node.js 18+ first."
  }
  $versionText = ((node --version) -replace "^v", "").Trim()
  if ([version]$versionText -lt [version]"18.0") {
    throw "Node.js 18+ is required. Current version: $versionText."
  }
}

$BasePythonCmd = Resolve-PythonCommand
Assert-PythonVersion $BasePythonCmd
Assert-NodeVersion

$PipIndexUrl = if ($env:PIP_INDEX_URL) { $env:PIP_INDEX_URL } else { "https://pypi.tuna.tsinghua.edu.cn/simple" }
$env:PIP_INDEX_URL = $PipIndexUrl
$env:PIP_DISABLE_PIP_VERSION_CHECK = "1"

if (-not (Test-Path -LiteralPath $VenvPython)) {
  & $BasePythonCmd -m venv $VenvDir
  if ($LASTEXITCODE -ne 0) { throw "Failed to create project virtual environment at .venv." }
  Write-Host "Created .venv from $BasePythonCmd."
} else {
  Write-Host "Kept existing .venv."
}

$PythonCmd = $VenvPython

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
  & $PythonCmd -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed." }
  & $PythonCmd -m pip install -r requirements.txt
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
Write-Host "Using virtual environment: $VenvDir"
Write-Host "Using pip mirror: $PipIndexUrl"
Write-Host "Review .env for MySQL, crawler cookies, and DeepSeek settings."
Write-Host "If Playwright-based crawlers are needed, run: $PythonCmd -m playwright install chromium"
Write-Host "Run: powershell -ExecutionPolicy Bypass -File .\scripts\start_local_dev.ps1"
