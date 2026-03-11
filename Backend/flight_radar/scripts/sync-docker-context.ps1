param(
  [string]$Source = ".",
  [string]$Destination
)

$ErrorActionPreference = "Stop"

$src = Resolve-Path $Source

if (-not $Destination) {
  if ($env:LOCALAPPDATA) {
    $Destination = Join-Path $env:LOCALAPPDATA "Temp\flight_radar_docker_context"
  } else {
    $Destination = Join-Path $src.Path "_docker_context"
  }
}

$dst = [System.IO.Path]::GetFullPath($Destination)

if ($dst.Length -lt 10) {
  throw "Refusing to use an unsafe destination path: $dst"
}

if (Test-Path $dst) {
  Remove-Item -LiteralPath $dst -Recurse -Force
}
New-Item -ItemType Directory -Path $dst | Out-Null

$include = @(
  "Dockerfile",
  "Dockerfile.local",
  ".dockerignore",
  ".env",
  "requirements.txt",
  "gunicorn.conf.py",
  "app"
)

foreach ($item in $include) {
  $srcPath = Join-Path $src.Path $item
  if (!(Test-Path $srcPath)) {
    continue
  }

  if ((Get-Item $srcPath).PSIsContainer) {
    Get-ChildItem $srcPath -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($src.Path.Length).TrimStart('\')
      $target = Join-Path $dst $rel
      $parent = Split-Path $target -Parent
      if (!(Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent | Out-Null
      }
      [System.IO.File]::WriteAllBytes($target, [System.IO.File]::ReadAllBytes($_.FullName))
    }
  } else {
    $target = Join-Path $dst $item
    $parent = Split-Path $target -Parent
    if (!(Test-Path $parent)) {
      New-Item -ItemType Directory -Path $parent | Out-Null
    }
    [System.IO.File]::WriteAllBytes($target, [System.IO.File]::ReadAllBytes($srcPath))
  }
}

Write-Host "Docker context synced to $dst"
