$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$release = Join-Path $workspace "release"
$version = (& node -e "process.stdout.write(require('./package.json').version)")
$appDir = Join-Path $release "FileOrganizer-win-v$version"
$electronExe = (& node -e "process.stdout.write(require('electron'))")
$electronDist = Split-Path -Parent $electronExe

if (-not $release.StartsWith($workspace)) {
  throw "release path is outside workspace"
}

New-Item -ItemType Directory -Path $appDir -Force | Out-Null
Get-ChildItem -LiteralPath $electronDist -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $appDir -Recurse -Force
}

Rename-Item -LiteralPath (Join-Path $appDir "electron.exe") -NewName "FileOrganizer.exe"

$appResource = Join-Path $appDir "resources\app"
New-Item -ItemType Directory -Path $appResource -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $workspace "dist") -Destination $appResource -Recurse -Force
Copy-Item -LiteralPath (Join-Path $workspace "electron") -Destination $appResource -Recurse -Force
Copy-Item -LiteralPath (Join-Path $workspace "package.json") -Destination $appResource -Force

Write-Output (Join-Path $appDir "FileOrganizer.exe")
