<#
.SYNOPSIS
  Prints the current quick-tunnel address of the AI service, and optionally
  points the local API server at it.

.DESCRIPTION
  A quick tunnel gets a new random https://....trycloudflare.com address every
  time it starts. Run this from the Ai-service folder after
  "docker compose -f compose.host.yml up -d":

    .\scripts\tunnel-url.ps1                     # just print the address
    .\scripts\tunnel-url.ps1 -UpdateServerEnv    # also set FASTAPI_WEBHOOK_URL in server\.env

  -UpdateServerEnv only changes the FASTAPI_WEBHOOK_URL line of server\.env
  (nothing else in that file is read out or printed). Restart the API server
  afterwards ("npm run dev" restarts by itself when you save a .ts file, but
  not when .env changes: press Ctrl+C and run it again).

  To go back to the AI service running directly on this PC (no tunnel), run:
    .\scripts\tunnel-url.ps1 -Local
#>
param(
  [switch]$UpdateServerEnv,
  [switch]$Local
)

$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$serverEnv = Join-Path (Split-Path -Parent $serviceRoot) 'server\.env'

function Set-ServerEndpoint([string]$endpoint) {
  if (-not (Test-Path $serverEnv)) { throw "server\.env not found at $serverEnv" }
  $lines = Get-Content $serverEnv -Encoding UTF8
  $found = $false
  $lines = foreach ($line in $lines) {
    if ($line -match '^\s*FASTAPI_WEBHOOK_URL\s*=') { $found = $true; "FASTAPI_WEBHOOK_URL=$endpoint" } else { $line }
  }
  if (-not $found) { $lines += "FASTAPI_WEBHOOK_URL=$endpoint" }
  # UTF-8 without BOM, so dotenv reads the first line correctly.
  [System.IO.File]::WriteAllLines($serverEnv, [string[]]$lines, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "server\.env now uses: $endpoint"
  Write-Host 'Restart the API server (Ctrl+C, then "npm run dev") to pick it up.'
}

if ($Local) {
  Set-ServerEndpoint 'http://127.0.0.1:8000/process-floor-plan'
  exit 0
}

Push-Location $serviceRoot
try {
  $logs = docker compose -f compose.host.yml logs tunnel 2>&1 | Out-String
} finally {
  Pop-Location
}
$found = [regex]::Matches($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
if ($found.Count -eq 0) {
  Write-Host 'No tunnel address yet. Is the stack running? Try:' -ForegroundColor Yellow
  Write-Host '  docker compose -f compose.host.yml up -d'
  Write-Host '  docker compose -f compose.host.yml ps'
  exit 1
}
$url = $found[$found.Count - 1].Value  # the newest one, if the tunnel restarted
Write-Host "Tunnel address: $url"
Write-Host "Public health check (open in any browser): $url/health"

if ($UpdateServerEnv) {
  Set-ServerEndpoint "$url/process-floor-plan"
}
