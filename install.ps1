# genshijin — smart multi-agent installer (Windows PowerShell).
#
# ワンライナー:
#   iwr -useb https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/install.ps1 | iex
#
# Claude Code / Cursor / Windsurf / Cline / Copilot を検出し各 agent に native install。

[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Force,
  [switch]$All,
  [switch]$Minimal,
  [switch]$WithHooks,
  [switch]$WithInit,
  [switch]$WithMcpShrink,
  [switch]$List,
  [switch]$NoColor,
  [string[]]$Only = @()
)

$Repo = "InterfaceX-co-jp/genshijin"
$RawBase = "https://raw.githubusercontent.com/$Repo/main"
$HooksInstallUrl = "$RawBase/hooks/install.ps1"
$InitScriptUrl = "$RawBase/tools/genshijin-init.js"
$McpShrinkPkg = "genshijin-shrink"

if ($All) { $WithHooks = $true; $WithInit = $true; $WithMcpShrink = $true }
if ($Minimal) { $WithHooks = $false; $WithMcpShrink = $false }

$Detected = 0
$Installed = @()
$Skipped = @()
$Failed = @()

function Write-Color($Text, $Color) {
  if ($NoColor) { Write-Host $Text } else { Write-Host $Text -ForegroundColor $Color }
}

function Should-Install($Id) {
  if ($Only.Count -eq 0) { return $true }
  return $Only -contains $Id
}

function Run-Cmd($Cmd) {
  if ($DryRun) { Write-Host "  [dry-run] $Cmd" }
  else { Invoke-Expression $Cmd }
}

if ($List) {
  Write-Host @"
genshijin agent matrix:

  claude     Claude Code        plugin marketplace install + hooks + statusline
  cursor     Cursor IDE         .cursor/rules/genshijin.mdc (--WithInit で書込)
  windsurf   Windsurf IDE       .windsurf/rules/genshijin.md
  cline      Cline (VS Code)    .clinerules/genshijin.md
  copilot    GitHub Copilot     .github/copilot-instructions.md
"@
  exit 0
}

Write-Host "🪨 genshijin installer"
Write-Host ""

# ── Claude Code ────────────────────────────────────────────────────────
if (Should-Install "claude") {
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    $Detected++
    Write-Color ">>> Claude Code 検出 → genshijin プラグイン install" Blue
    if (-not $DryRun) {
      try {
        & claude plugin install $Repo 2>$null
        $Installed += "claude"
      } catch {
        Write-Host "  marketplace install 失敗 → hooks installer fallback"
        if ($WithHooks -or $WithHooks -eq $null) {
          Run-Cmd "iwr -useb $HooksInstallUrl | iex"
          $Installed += "claude (hooks-only)"
        }
      }
    } else {
      Write-Host "  [dry-run] claude plugin install $Repo"
    }
    if (($WithHooks -or -not $Minimal) -and -not $DryRun) {
      Run-Cmd "iwr -useb $HooksInstallUrl | iex"
    }
    if ($WithMcpShrink -or (-not $Minimal -and $WithMcpShrink -eq $null)) {
      if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Host "  MCP-shrink 利用可: ~/.claude/settings.json に手動追加例:"
        Write-Host '    "mcpServers": { "shrunk-fs": { "command": "npx", "args": ["genshijin-shrink", "<upstream>"] } }'
      }
    }
  } else {
    $Skipped += "claude (claude CLI 未検出)"
  }
}

# ── Cursor ──────────────────────────────────────────────────────────────
if (Should-Install "cursor") {
  $cursorDirs = @(
    "$env:USERPROFILE\.cursor",
    "$env:APPDATA\Cursor"
  )
  if ($cursorDirs | Where-Object { Test-Path $_ }) {
    $Detected++
    Write-Color ">>> Cursor 検出" Blue
    if ($WithInit -or $All) {
      Run-Cmd "iwr -useb $InitScriptUrl | node - --only cursor"
      $Installed += "cursor"
    } else {
      $Skipped += "cursor (--WithInit 未指定)"
    }
  } else {
    $Skipped += "cursor (Cursor 未検出)"
  }
}

# ── Windsurf ────────────────────────────────────────────────────────────
if (Should-Install "windsurf") {
  if ((Test-Path "$env:USERPROFILE\.codeium") -or (Test-Path "$env:USERPROFILE\.windsurf")) {
    $Detected++
    Write-Color ">>> Windsurf 検出" Blue
    if ($WithInit -or $All) {
      Run-Cmd "iwr -useb $InitScriptUrl | node - --only windsurf"
      $Installed += "windsurf"
    } else {
      $Skipped += "windsurf (--WithInit 未指定)"
    }
  } else {
    $Skipped += "windsurf (Windsurf 未検出)"
  }
}

# ── Cline ───────────────────────────────────────────────────────────────
if (Should-Install "cline") {
  if (Test-Path "$env:USERPROFILE\.vscode\extensions\saoudrizwan.claude-dev*") {
    $Detected++
    Write-Color ">>> Cline 検出" Blue
    if ($WithInit -or $All) {
      Run-Cmd "iwr -useb $InitScriptUrl | node - --only cline"
      $Installed += "cline"
    } else {
      $Skipped += "cline (--WithInit 未指定)"
    }
  } else {
    $Skipped += "cline (Cline VS Code extension 未検出)"
  }
}

# ── Copilot ─────────────────────────────────────────────────────────────
if (Should-Install "copilot") {
  if ((Test-Path "$env:USERPROFILE\.config\github-copilot") -or `
      (Test-Path "$env:USERPROFILE\.vscode\extensions\github.copilot*")) {
    $Detected++
    Write-Color ">>> GitHub Copilot 検出" Blue
    if ($WithInit -or $All) {
      Run-Cmd "iwr -useb $InitScriptUrl | node - --only copilot"
      $Installed += "copilot"
    } else {
      $Skipped += "copilot (--WithInit 未指定)"
    }
  } else {
    $Skipped += "copilot (Copilot 未検出)"
  }
}

# ── サマリ ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Color "=== 結果 ===" Green
Write-Host "検出 agent: $Detected"
if ($Installed.Count -gt 0) { Write-Color "install済: $($Installed -join ', ')" Green }
if ($Skipped.Count -gt 0) {
  Write-Color "skip:" Yellow
  $Skipped | ForEach-Object { Write-Host "  - $_" }
}
if ($Failed.Count -gt 0) {
  Write-Color "失敗:" Red
  $Failed | ForEach-Object { Write-Host "  - $_" }
}

if ($Detected -eq 0) {
  Write-Host ""
  Write-Color "agent 未検出。Claude Code or Cursor/Windsurf/Cline/Copilot を先に install してください。" Yellow
  exit 1
}

Write-Host ""
Write-Host "完了。エージェント再起動で有効化。"
