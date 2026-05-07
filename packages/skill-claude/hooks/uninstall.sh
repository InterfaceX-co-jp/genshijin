#!/bin/bash
# genshijin — SessionStart + UserPromptSubmit フック アンインストーラ
# 削除: ~/.claude/hooks のフックファイル、settings.json のエントリ、フラグファイル
# 使い方: bash hooks/uninstall.sh
#   or:  bash <(curl -s https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/hooks/uninstall.sh)
set -e

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS="$CLAUDE_DIR/settings.json"
FLAG_FILE="$CLAUDE_DIR/.genshijin-active"

HOOK_FILES=("package.json" "genshijin-config.js" "genshijin-activate.js" "genshijin-mode-tracker.js" "genshijin-statusline.sh")

# genshijin がプラグインとしてインストールされているか検出
PLUGIN_INSTALLED=0
if [ -d "$CLAUDE_DIR/plugins" ]; then
  if find "$CLAUDE_DIR/plugins" -path "*/genshijin*" -name "plugin.json" -print -quit 2>/dev/null | grep -q .; then
    PLUGIN_INSTALLED=1
  fi
fi

if [ "$PLUGIN_INSTALLED" -eq 1 ]; then
  echo "genshijin は Claude Code プラグインとしてインストール済のようです。"
  echo "プラグインを無効化するには以下を実行:"
  echo ""
  echo "  claude plugin disable genshijin"
  echo ""
  echo "本スクリプトは standalone フック（install.sh 経由）を削除します。"
  echo "standalone 削除を続行..."
  echo ""
fi

echo "genshijin フック アンインストール中..."

# 1. フックファイル削除
REMOVED_FILES=0
for hook in "${HOOK_FILES[@]}"; do
  if [ -f "$HOOKS_DIR/$hook" ]; then
    rm "$HOOKS_DIR/$hook"
    echo "  削除: $HOOKS_DIR/$hook"
    REMOVED_FILES=$((REMOVED_FILES + 1))
  fi
done

if [ "$REMOVED_FILES" -eq 0 ]; then
  echo "  $HOOKS_DIR にフックファイルなし。"
fi

# 2. settings.json から genshijin エントリ削除（idempotent）
if [ -f "$SETTINGS" ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "WARNING: 'node' なし — settings.json を安全に編集不可。"
    echo "         $SETTINGS から genshijin の SessionStart / UserPromptSubmit"
    echo "         エントリを手動削除してください。"
  else
    cp "$SETTINGS" "$SETTINGS.bak"

    GENSHIJIN_SETTINGS="$SETTINGS" GENSHIJIN_HOOKS_DIR="$HOOKS_DIR" node -e "
      const fs = require('fs');
      const settingsPath = process.env.GENSHIJIN_SETTINGS;
      const hooksDir = process.env.GENSHIJIN_HOOKS_DIR;
      const managedStatusLinePath = hooksDir + '/genshijin-statusline.sh';
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
        if (cmd.includes(managedStatusLinePath)) {
          delete settings.statusLine;
          console.log('  settings.json から genshijin statusLine を削除。');
        }
      }

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      console.log('  settings.json から ' + removed + ' 個の genshijin フックエントリを削除。');
    "
  fi
fi

# 3. バックアップファイル クリーンアップ
if [ -f "$SETTINGS.bak" ]; then
  rm "$SETTINGS.bak"
  echo "  削除: $SETTINGS.bak"
fi

# 4. フラグファイル削除
if [ -f "$FLAG_FILE" ]; then
  rm "$FLAG_FILE"
  echo "  削除: $FLAG_FILE"
fi

echo ""
echo "完了。Claude Code 再起動でアンインストール確定。"

echo ""
echo "他エージェント:"
echo "  Cursor/Windsurf/Cline/Copilot: .cursor/rules/genshijin.mdc 等を手動削除"
echo "  claude plugin disable genshijin  # Claude Code プラグイン"
