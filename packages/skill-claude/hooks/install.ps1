# genshijin — Claude Code フック ワンコマンドインストーラ (Windows PowerShell)
# 導入: SessionStart フック（ルール自動読込） + UserPromptSubmit フック（モード追跡）
# 使い方: powershell -ExecutionPolicy Bypass -File packages\skill-claude\hooks\install.ps1
#   or:  powershell -ExecutionPolicy Bypass -File packages\skill-claude\hooks\install.ps1 -Force
#   or (リモート、-Force パイプ経由不可):
#        irm https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/packages/skill-claude/hooks/install.ps1 | iex
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# node 必須
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'node' が必要です（settings.json への安全マージに使用）。" -ForegroundColor Red
    Write-Host "       https://nodejs.org から Node.js をインストール後 再実行してください。" -ForegroundColor Red
    exit 1
}

$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".claude" }
$HooksDir = Join-Path $ClaudeDir "hooks"
$Settings = Join-Path $ClaudeDir "settings.json"
$RepoUrl = "https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/packages/skill-claude/hooks"

$HookFiles = @("package.json", "genshijin-config.js", "genshijin-activate.js", "genshijin-mode-tracker.js", "genshijin-stats.js", "genshijin-statusline.sh", "genshijin-statusline.ps1")

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { $null }

# 既インストール検出
if (-not $Force) {
    $AllFilesPresent = $true
    foreach ($hook in $HookFiles) {
        if (-not (Test-Path (Join-Path $HooksDir $hook))) {
            $AllFilesPresent = $false
            break
        }
    }

    $HooksWired = $false
    $HasStatusLine = $false
    if ($AllFilesPresent -and (Test-Path $Settings)) {
        try {
            $settingsObj = Get-Content $Settings -Raw | ConvertFrom-Json
            $hasGenshijinHook = {
                param([string]$eventName)
                if (-not $settingsObj.hooks) { return $false }
                $entries = $settingsObj.hooks.$eventName
                if (-not $entries) { return $false }
                foreach ($entry in $entries) {
                    if ($entry.hooks) {
                        foreach ($hookDef in $entry.hooks) {
                            if ($hookDef.command -and $hookDef.command.Contains("genshijin")) {
                                return $true
                            }
                        }
                    }
                }
                return $false
            }
            $HooksWired = (& $hasGenshijinHook "SessionStart") -and (& $hasGenshijinHook "UserPromptSubmit")
            $HasStatusLine = $null -ne $settingsObj.statusLine
        } catch {
            $HooksWired = $false
            $HasStatusLine = $false
        }
    }

    if ($AllFilesPresent -and $HooksWired -and $HasStatusLine) {
        Write-Host "genshijin フック 既にインストール済: $HooksDir"
        Write-Host "  強制再インストール: powershell -File packages\skill-claude\hooks\install.ps1 -Force"
        Write-Host ""
        Write-Host "既に配置済。何もしません。"
        exit 0
    }
}

if ($Force -and (Test-Path (Join-Path $HooksDir "genshijin-activate.js"))) {
    Write-Host "genshijin フック再インストール中 (-Force)..."
} else {
    Write-Host "genshijin フックインストール中..."
}

# 1. hooks ディレクトリ作成
if (-not (Test-Path $HooksDir)) {
    New-Item -ItemType Directory -Path $HooksDir -Force | Out-Null
}

# 2. フックファイルをコピー or ダウンロード
foreach ($hook in $HookFiles) {
    $dest = Join-Path $HooksDir $hook
    $localSource = if ($ScriptDir) { Join-Path $ScriptDir $hook } else { $null }

    if ($localSource -and (Test-Path $localSource)) {
        Copy-Item $localSource $dest -Force
    } else {
        Invoke-WebRequest -Uri "$RepoUrl/$hook" -OutFile $dest -UseBasicParsing
    }
    Write-Host "  配置: $dest"
}

# 3. settings.json に hooks + statusline を登録
if (-not (Test-Path $Settings)) {
    Set-Content -Path $Settings -Value "{}"
}

Copy-Item $Settings "$Settings.bak" -Force

$env:GENSHIJIN_SETTINGS = $Settings -replace '\\', '/'
$env:GENSHIJIN_HOOKS_DIR = $HooksDir -replace '\\', '/'

$nodeScript = @'
const fs = require('fs');
const settingsPath = process.env.GENSHIJIN_SETTINGS;
const hooksDir = process.env.GENSHIJIN_HOOKS_DIR;
const managedStatusLinePath = hooksDir + '/genshijin-statusline.ps1';
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
if (!settings.hooks) settings.hooks = {};

// SessionStart
if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
const hasStart = settings.hooks.SessionStart.some(e =>
  e.hooks && e.hooks.some(h => h.command && h.command.includes('genshijin'))
);
if (!hasStart) {
  settings.hooks.SessionStart.push({
    hooks: [{
      type: 'command',
      command: 'node "' + hooksDir + '/genshijin-activate.js"',
      timeout: 5,
      statusMessage: '原始人モード読込中...'
    }]
  });
}

// UserPromptSubmit
if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
const hasPrompt = settings.hooks.UserPromptSubmit.some(e =>
  e.hooks && e.hooks.some(h => h.command && h.command.includes('genshijin'))
);
if (!hasPrompt) {
  settings.hooks.UserPromptSubmit.push({
    hooks: [{
      type: 'command',
      command: 'node "' + hooksDir + '/genshijin-mode-tracker.js"',
      timeout: 5,
      statusMessage: '原始人モード追跡中...'
    }]
  });
}

// Statusline
if (!settings.statusLine) {
  settings.statusLine = {
    type: 'command',
    command: 'powershell -ExecutionPolicy Bypass -File "' + managedStatusLinePath + '"'
  };
  console.log('  Statusline バッジを設定しました。');
} else {
  const cmd = typeof settings.statusLine === 'string'
    ? settings.statusLine
    : (settings.statusLine.command || '');
  if (cmd.includes(managedStatusLinePath)) {
    console.log('  Statusline バッジ 既に設定済。');
  } else {
    console.log('  注意: 既存 statusline 検出 - genshijin バッジ追加せず。');
    console.log('        既存 statusline にバッジ追加する場合 hooks/README.md 参照。');
  }
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('  settings.json に hooks 登録完了。');
'@

# Windows PowerShell + cmd.exe で `node -e "..."` の引用符エスケープが壊れる問題回避:
# temp file に書出し node <file> で実行。実行後 temp file は finally で削除。
$tempScript = [System.IO.Path]::GetTempFileName() + ".js"
try {
    Set-Content -Path $tempScript -Value $nodeScript -Encoding UTF8
    & node $tempScript
} finally {
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "完了。Claude Code 再起動で有効化。" -ForegroundColor Green
Write-Host ""
Write-Host "インストール内容:"
Write-Host "  - SessionStart フック: セッション毎に genshijin ルール自動読込"
Write-Host "  - Mode tracker フック: モード切替時 statusline バッジ更新"
Write-Host "  - Statusline バッジ: [原始人] / [原始人:極限] 等表示"
