#!/bin/bash
# genshijin — Claude Code フック ワンコマンドインストーラ
# 導入: SessionStart フック（ルール自動読込） + UserPromptSubmit フック（モード追跡）
# 使い方: bash hooks/install.sh
#   or:  bash <(curl -s https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/hooks/install.sh)
#   or:  bash hooks/install.sh --force   （既存フック上書き再インストール）
set -e

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
  esac
done

# Windows (Git Bash / MSYS / MINGW) 検出 — WSL は "linux-gnu"
case "$OSTYPE" in
  msys*|cygwin*|mingw*)
    echo "WARNING: Windows ($OSTYPE) で実行中。"
    echo "         Git Bash/MSYS で動作するが symlink は Developer Mode または admin 権限要。"
    echo "         'claude plugin install' 経由導入済なら本スクリプト不要。"
    echo ""
    ;;
esac

# node 必須 — settings.json への安全マージに使用
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 'node' が必要です（~/.claude/settings.json への安全マージに使用）。"
  echo "       https://nodejs.org から Node.js をインストール後 再実行してください。"
  exit 1
fi

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS="$CLAUDE_DIR/settings.json"
REPO_URL="https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/hooks"

HOOK_FILES=("package.json" "genshijin-config.js" "genshijin-activate.js" "genshijin-mode-tracker.js" "genshijin-statusline.sh")

# ソース解決 — repo clone でも curl パイプでも動作
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
fi

# 既インストール検出（--force 指定なし時）
ALREADY_INSTALLED=0
if [ "$FORCE" -eq 0 ]; then
  ALL_FILES_PRESENT=1
  for hook in "${HOOK_FILES[@]}"; do
    if [ ! -f "$HOOKS_DIR/$hook" ]; then
      ALL_FILES_PRESENT=0
      break
    fi
  done

  HOOKS_WIRED=0
  HAS_STATUSLINE=0
  if [ "$ALL_FILES_PRESENT" -eq 1 ] && [ -f "$SETTINGS" ]; then
    if GENSHIJIN_SETTINGS="$SETTINGS" node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync(process.env.GENSHIJIN_SETTINGS, 'utf8'));
      const hasGenshijinHook = (event) =>
        Array.isArray(settings.hooks?.[event]) &&
        settings.hooks[event].some(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('genshijin'))
        );
      process.exit(
        hasGenshijinHook('SessionStart') &&
        hasGenshijinHook('UserPromptSubmit') &&
        !!settings.statusLine
          ? 0
          : 1
      );
    " >/dev/null 2>&1; then
      HOOKS_WIRED=1
      HAS_STATUSLINE=1
    fi
  fi

  if [ "$ALL_FILES_PRESENT" -eq 1 ] && [ "$HOOKS_WIRED" -eq 1 ] && [ "$HAS_STATUSLINE" -eq 1 ]; then
    ALREADY_INSTALLED=1
    echo "genshijin フック 既にインストール済: $HOOKS_DIR"
    echo "  強制再インストール: bash hooks/install.sh --force"
    echo ""
  fi
fi

if [ "$ALREADY_INSTALLED" -eq 1 ] && [ "$FORCE" -eq 0 ]; then
  echo "既に配置済。何もしません。"
  exit 0
fi

if [ "$FORCE" -eq 1 ] && [ -f "$HOOKS_DIR/genshijin-activate.js" ]; then
  echo "genshijin フック再インストール中（--force）..."
else
  echo "genshijin フックインストール中..."
fi

# 1. hooks ディレクトリ作成
mkdir -p "$HOOKS_DIR"

# 2. フックファイルをコピー or ダウンロード
for hook in "${HOOK_FILES[@]}"; do
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/$hook" ]; then
    cp "$SCRIPT_DIR/$hook" "$HOOKS_DIR/$hook"
  else
    curl -fsSL "$REPO_URL/$hook" -o "$HOOKS_DIR/$hook"
  fi
  echo "  配置: $HOOKS_DIR/$hook"
done

# statusline スクリプト実行権付与
chmod +x "$HOOKS_DIR/genshijin-statusline.sh"

# 3. settings.json に hooks + statusline を登録（idempotent）
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi

# バックアップ
cp "$SETTINGS" "$SETTINGS.bak"

# 環境変数経由でパス渡し — $HOME に単引用符含む場合の shell injection 回避
GENSHIJIN_SETTINGS="$SETTINGS" GENSHIJIN_HOOKS_DIR="$HOOKS_DIR" node -e "
  const fs = require('fs');
  const settingsPath = process.env.GENSHIJIN_SETTINGS;
  const hooksDir = process.env.GENSHIJIN_HOOKS_DIR;
  const managedStatusLinePath = hooksDir + '/genshijin-statusline.sh';
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (!settings.hooks) settings.hooks = {};

  // SessionStart — genshijin ルール自動読込
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  const hasStart = settings.hooks.SessionStart.some(e =>
    e.hooks && e.hooks.some(h => h.command && h.command.includes('genshijin'))
  );
  if (!hasStart) {
    settings.hooks.SessionStart.push({
      hooks: [{
        type: 'command',
        command: 'node \"' + hooksDir + '/genshijin-activate.js\"',
        timeout: 5,
        statusMessage: '原始人モード読込中...'
      }]
    });
  }

  // UserPromptSubmit — モード追跡
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
  const hasPrompt = settings.hooks.UserPromptSubmit.some(e =>
    e.hooks && e.hooks.some(h => h.command && h.command.includes('genshijin'))
  );
  if (!hasPrompt) {
    settings.hooks.UserPromptSubmit.push({
      hooks: [{
        type: 'command',
        command: 'node \"' + hooksDir + '/genshijin-mode-tracker.js\"',
        timeout: 5,
        statusMessage: '原始人モード追跡中...'
      }]
    });
  }

  // Statusline バッジ
  if (!settings.statusLine) {
    settings.statusLine = {
      type: 'command',
      command: 'bash \"' + managedStatusLinePath + '\"'
    };
    console.log('  Statusline バッジを設定しました。');
  } else {
    const cmd = typeof settings.statusLine === 'string'
      ? settings.statusLine
      : (settings.statusLine.command || '');
    if (cmd.includes(managedStatusLinePath)) {
      console.log('  Statusline バッジ 既に設定済。');
    } else {
      console.log('  注意: 既存 statusline 検出 — genshijin バッジ追加せず。');
      console.log('        既存 statusline にバッジ追加する場合 hooks/README.md 参照。');
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('  settings.json に hooks 登録完了。');
"

echo ""
echo "完了。Claude Code 再起動で有効化。"
echo ""
echo "インストール内容:"
echo "  - SessionStart フック: セッション毎に genshijin ルール自動読込"
echo "  - Mode tracker フック: モード切替時 statusline バッジ更新"
echo "    （/genshijin 丁寧, /genshijin 極限, /genshijin-commit 等）"
echo "  - Statusline バッジ: [原始人] / [原始人:極限] 等表示"
