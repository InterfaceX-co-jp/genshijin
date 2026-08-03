# genshijin — Claude Code standalone hooks uninstaller shim (PowerShell).
[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$ConfigDir
)

$ErrorActionPreference = "Stop"
$Repo = "InterfaceX-co-jp/genshijin"
$RawBase = "https://raw.githubusercontent.com/$Repo/main"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "genshijin: Node.js 18 以上が必要: https://nodejs.org"
    exit 1
}

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { $null }
$LocalInstaller = if ($ScriptDir) { Join-Path $ScriptDir "..\cli\install.js" } else { $null }
$Arguments = @("--hooks-only", "--uninstall")
if ($DryRun) { $Arguments += "--dry-run" }
if ($ConfigDir) { $Arguments += @("--config-dir", $ConfigDir) }

if ($LocalInstaller -and (Test-Path $LocalInstaller)) {
    & node $LocalInstaller @Arguments
    exit $LASTEXITCODE
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "genshijin-installer-$PID"
try {
    New-Item -ItemType Directory -Path (Join-Path $TempDir "lib") -Force | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "$RawBase/cli/install.js" `
        -OutFile (Join-Path $TempDir "install.js")
    Invoke-WebRequest -UseBasicParsing -Uri "$RawBase/cli/lib/settings.js" `
        -OutFile (Join-Path $TempDir "lib\settings.js")
    & node (Join-Path $TempDir "install.js") @Arguments
    exit $LASTEXITCODE
} finally {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
