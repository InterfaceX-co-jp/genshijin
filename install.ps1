# genshijin — unified Node installer shim (Windows PowerShell).
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$InstallerArgs
)

$ErrorActionPreference = "Stop"
$Repo = "InterfaceX-co-jp/genshijin"
$RawBase = "https://raw.githubusercontent.com/$Repo/main"

$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) {
    Write-Error "genshijin: Node.js 18 以上が必要: https://nodejs.org"
    exit 1
}
$NodeMajor = [int](& node -p "Number(process.versions.node.split('.')[0])")
if ($NodeMajor -lt 18) {
    Write-Error "genshijin: Node.js 18 以上が必要"
    exit 1
}

$ScriptDir = if ($PSCommandPath) { Split-Path -Parent $PSCommandPath } else { $null }
$LocalInstaller = if ($ScriptDir) { Join-Path $ScriptDir "cli\install.js" } else { $null }
if ($LocalInstaller -and (Test-Path $LocalInstaller)) {
    & node $LocalInstaller @InstallerArgs
    exit $LASTEXITCODE
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "genshijin-installer-$PID"
try {
    New-Item -ItemType Directory -Path (Join-Path $TempDir "lib") -Force | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "$RawBase/cli/install.js" `
        -OutFile (Join-Path $TempDir "install.js")
    Invoke-WebRequest -UseBasicParsing -Uri "$RawBase/cli/lib/settings.js" `
        -OutFile (Join-Path $TempDir "lib\settings.js")
    & node (Join-Path $TempDir "install.js") @InstallerArgs
    exit $LASTEXITCODE
} finally {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
