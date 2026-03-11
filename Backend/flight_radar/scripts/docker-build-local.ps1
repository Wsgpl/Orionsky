param(
  [string]$Tag = "flightradar-api:latest",
  [string]$Dockerfile = "Dockerfile.local",
  [string]$Target = "runtime"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ($env:LOCALAPPDATA) {
  $contextDir = Join-Path $env:LOCALAPPDATA "Temp\flight_radar_docker_context"
} else {
  $contextDir = Join-Path $projectRoot "_docker_context"
}

& (Join-Path $PSScriptRoot "sync-docker-context.ps1") -Source $projectRoot -Destination $contextDir

$dockerfilePath = Join-Path $contextDir $Dockerfile
if (!(Test-Path $dockerfilePath)) {
  throw "Dockerfile not found in synced context: $dockerfilePath"
}

& docker build --file $dockerfilePath --target $Target --tag $Tag $contextDir
