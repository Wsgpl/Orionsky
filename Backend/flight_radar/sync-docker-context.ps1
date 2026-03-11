$ErrorActionPreference = "Stop"

$src = Resolve-Path "."
$dst = Join-Path $src "_docker_context"

if (Test-Path $dst) {
  Remove-Item $dst -Recurse -Force
}
New-Item -ItemType Directory -Path $dst | Out-Null

$include = @(
  "Dockerfile.local",
  ".dockerignore",
  ".env",
  "requirements.txt",
  "gunicorn.conf.py",
  "app"
)

foreach ($item in $include) {
  $srcPath = Join-Path $src $item
  if (!(Test-Path $srcPath)) { continue }

  if ((Get-Item $srcPath).PSIsContainer) {
    Get-ChildItem $srcPath -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($src.Path.Length).TrimStart('\')
      $target = Join-Path $dst $rel
      $parent = Split-Path $target -Parent
      if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
      [System.IO.File]::WriteAllBytes($target, [System.IO.File]::ReadAllBytes($_.FullName))
    }
  } else {
    $target = Join-Path $dst $item
    $parent = Split-Path $target -Parent
    if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
    [System.IO.File]::WriteAllBytes($target, [System.IO.File]::ReadAllBytes($srcPath))
  }
}

Write-Host "Docker context synced to $dst"
