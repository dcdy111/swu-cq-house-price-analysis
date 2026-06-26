param(
  [string]$FrontendUrl = "http://127.0.0.1:5178",
  [string]$BackendUrl = "http://127.0.0.1:5050"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TempPackageRoot = Join-Path $Root ".codex-run\pw"
$PlaywrightPackage = Join-Path $TempPackageRoot "node_modules\playwright"

function Find-BrowserExecutable {
  $candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($item in $candidates) {
    if (Test-Path $item) {
      return $item
    }
  }
  throw "No Chrome/Edge executable found. Install Chrome or Edge, then rerun this script."
}

New-Item -ItemType Directory -Force -Path $TempPackageRoot | Out-Null
if (-not (Test-Path $PlaywrightPackage)) {
  npm install --prefix $TempPackageRoot playwright@1.61.1 --no-audit --no-fund
}

$env:PLAYWRIGHT_CHROME_EXECUTABLE = Find-BrowserExecutable
node (Join-Path $PSScriptRoot "ui_acceptance_check.js") --frontend $FrontendUrl --backend $BackendUrl
exit $LASTEXITCODE
