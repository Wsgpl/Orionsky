param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ComposeArgs
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ($env:LOCALAPPDATA) {
  $contextDir = Join-Path $env:LOCALAPPDATA "Temp\flight_radar_docker_context"
} else {
  $contextDir = Join-Path $projectRoot "_docker_context"
}

$shouldSyncContext = $ComposeArgs.Count -eq 0 -or $ComposeArgs -contains "build" -or $ComposeArgs -contains "up"
if ($shouldSyncContext) {
  & (Join-Path $PSScriptRoot "sync-docker-context.ps1") -Source $projectRoot -Destination $contextDir
}

$env:FLIGHT_RADAR_DOCKER_CONTEXT = $contextDir -replace "\\", "/"

Push-Location $projectRoot
try {
  if ($ComposeArgs.Count -eq 0) {
    $ComposeArgs = @("up", "--build", "-d")
  }

  $legacyCompose = Get-Command "docker-compose" -ErrorAction SilentlyContinue
  if ($null -ne $legacyCompose) {
    & docker-compose @ComposeArgs
  } else {
    & docker compose @ComposeArgs
  }
} finally {
  Pop-Location
  Remove-Item Env:FLIGHT_RADAR_DOCKER_CONTEXT -ErrorAction SilentlyContinue
}
