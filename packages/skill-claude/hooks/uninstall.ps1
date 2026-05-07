# genshijin — SessionStart + UserPromptSubmit フック アンインストーラ (Windows)
# 使い方: powershell -ExecutionPolicy Bypass -File packages\skill-claude\hooks\uninstall.ps1

$ErrorActionPreference = "Stop"

$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".claude" }
$HooksDir = Join-Path $ClaudeDir "hooks"
$Settings = Join-Path $ClaudeDir "settings.json"
$FlagFile = Join-Path $ClaudeDir ".genshijin-active"

$HookFiles = @("package.json", "genshijin-config.js", "genshijin-activate.js", "genshijin-mode-tracker.js", "genshijin-statusline.sh", "genshijin-statusline.ps1")

$PluginInstalled = $false
$PluginsDir = Join-Path $ClaudeDir "plugins"
if (Test-Path $PluginsDir) {
    $pluginJson = Get-ChildItem -Path $PluginsDir -Recurse -Filter "plugin.json" -ErrorAction SilentlyContinue |
                  Where-Object { $_.FullName -like "*genshijin*" } | Select-Object -First 1
    if ($pluginJson) { $PluginInstalled = $true }
}

if ($PluginInstalled) {
    Write-Host "genshijin は Claude Code プラグインとしてインストール済のようです。"
    Write-Host "プラグインを無効化するには以下を実行:"
    Write-Host ""
    Write-Host "  claude plugin disable genshijin"
    Write-Host ""
    Write-Host "本スクリプトは standalone フックを削除します。続行..."
    Write-Host ""
}

Write-Host "genshijin フック アンインストール中..."

$RemovedFiles = 0
foreach ($hook in $HookFiles) {
    $p = Join-Path $HooksDir $hook
    if (Test-Path $p) {
        Remove-Item $p -Force
        Write-Host "  削除: $p"
        $RemovedFiles++
    }
}

if ($RemovedFiles -eq 0) {
    Write-Host "  $HooksDir にフックファイルなし。"
}

if (Test-Path $Settings) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "WARNING: 'node' なし — settings.json を安全に編集不可。" -ForegroundColor Yellow
        Write-Host "         $Settings から genshijin エントリを手動削除してください。" -ForegroundColor Yellow
    } else {
        Copy-Item $Settings "$Settings.bak" -Force

        $env:GENSHIJIN_SETTINGS = $Settings -replace '\\', '/'
        $env:GENSHIJIN_HOOKS_DIR = $HooksDir -replace '\\', '/'

        $nodeScript = @'
const fs = require('fs');
const settingsPath = process.env.GENSHIJIN_SETTINGS;
const hooksDir = process.env.GENSHIJIN_HOOKS_DIR;
const managedShPath = hooksDir + '/genshijin-statusline.sh';
const managedPsPath = hooksDir + '/genshijin-statusline.ps1';
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

const isGenshijinEntry = (entry) =>
  entry && entry.hooks && entry.hooks.some(h =>
    h.command && h.command.includes('genshijin')
  );

let removed = 0;
if (settings.hooks) {
  for (const event of ['SessionStart', 'UserPromptSubmit']) {
    if (Array.isArray(settings.hooks[event])) {
      const before = settings.hooks[event].length;
      settings.hooks[event] = settings.hooks[event].filter(e => !isGenshijinEntry(e));
      removed += before - settings.hooks[event].length;
      if (settings.hooks[event].length === 0) {
        delete settings.hooks[event];
      }
    }
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
}

if (settings.statusLine) {
  const cmd = typeof settings.statusLine === 'string'
    ? settings.statusLine
    : (settings.statusLine.command || '');
  if (cmd.includes(managedShPath) || cmd.includes(managedPsPath)) {
    delete settings.statusLine;
    console.log('  settings.json から genshijin statusLine を削除。');
  }
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('  settings.json から ' + removed + ' 個の genshijin フックエントリを削除。');
'@

        node -e $nodeScript
    }
}

if (Test-Path "$Settings.bak") {
    Remove-Item "$Settings.bak" -Force
    Write-Host "  削除: $Settings.bak"
}

if (Test-Path $FlagFile) {
    Remove-Item $FlagFile -Force
    Write-Host "  削除: $FlagFile"
}

Write-Host ""
Write-Host "完了。Claude Code 再起動でアンインストール確定。" -ForegroundColor Green
