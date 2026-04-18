#!/bin/bash
# genshijin — Claude Code statusline バッジスクリプト。
# genshijin モードフラグを読み、色付きバッジ出力。
#
# ~/.claude/settings.json 使用例:
#   "statusLine": { "type": "command", "command": "bash /path/to/genshijin-statusline.sh" }

FLAG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.genshijin-active"

# symlink 拒否 — 攻撃者が ~/.ssh/id_rsa 等を指す symlink に置換できた場合、
# バッジ描画の度に secret バイト（ANSI エスケープ含む）を端末に描画してしまう。
[ -L "$FLAG" ] && exit 0
[ ! -f "$FLAG" ] && exit 0

# 64 バイトで読込を打ち切り、[a-z0-9-] 以外を除去
MODE=$(head -c 64 "$FLAG" 2>/dev/null | tr -d '\n\r' | tr '[:upper:]' '[:lower:]')
MODE=$(printf '%s' "$MODE" | tr -cd 'a-z0-9-')

# ホワイトリスト — 該当なしは何も描画しない
case "$MODE" in
  off|polite|normal|extreme|commit|review|compress|help) ;;
  *) exit 0 ;;
esac

# ASCII モード → 日本語ラベル
case "$MODE" in
  polite)   LABEL="丁寧" ;;
  normal)   LABEL="" ;;   # デフォルトは suffix なし
  extreme)  LABEL="極限" ;;
  commit)   LABEL="コミット" ;;
  review)   LABEL="レビュー" ;;
  compress) LABEL="圧縮" ;;
  help)     LABEL="ヘルプ" ;;
  *)        LABEL="" ;;
esac

if [ -z "$LABEL" ]; then
  printf '\033[38;5;172m[原始人]\033[0m'
else
  printf '\033[38;5;172m[原始人:%s]\033[0m' "$LABEL"
fi
