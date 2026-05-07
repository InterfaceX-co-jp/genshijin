#!/usr/bin/env bash
# genshijin — smart multi-agent installer.
#
# ワンライナー:
#   curl -fsSL https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/install.sh | bash
#
# 利用可能 AI コーディング agent を検出し各 agent に native install (plugin /
# extension / rule file)。未インストール agent は skip。再実行安全 — 各 install
# 自体が idempotent。
#
# `install.sh --help` でフラグ + agent matrix 全表示。

set -euo pipefail

# ── 定数 ──────────────────────────────────────────────────────────────
REPO="InterfaceX-co-jp/genshijin"
RAW_BASE="https://raw.githubusercontent.com/$REPO/main"
HOOKS_INSTALL_URL="$RAW_BASE/hooks/install.sh"
INIT_SCRIPT_URL="$RAW_BASE/tools/genshijin-init.js"
MCP_SHRINK_PKG="genshijin-shrink"

# ── フラグ + state (associative array なし — bash 3.2 互換) ──────────────
DRY=0
FORCE=0
WITH_HOOKS=auto       # Claude Code 検出時 auto-on (--minimal で off)
WITH_INIT=0           # opt-in (cwd に rule file 書込 → 明示的選択)
WITH_MCP_SHRINK=auto  # auto-on (--minimal で off)
ALL=0
MINIMAL=0
LIST_ONLY=0
NO_COLOR=0
ONLY=()

INSTALLED_IDS=()
SKIPPED_IDS=()
SKIPPED_WHY=()
FAILED_IDS=()
FAILED_WHY=()
DETECTED_COUNT=0

if [ ! -t 1 ]; then NO_COLOR=1; fi

print_help() {
  cat <<'EOF'
genshijin installer — agent を検出し各 agent に genshijin 導入。

使い方:
  install.sh [flags]

  curl -fsSL https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/install.sh | bash -s -- --with-hooks

フラグ:
  --dry-run           実行内容表示のみ、書込なし
  --force             "already installed" 報告でも再実行
  --only <agent>      指定 agent のみ導入 (繰返指定可)
  --all               --with-hooks + --with-init + --with-mcp-shrink 全 ON
  --minimal           plugin/extension のみ。hooks/MCP-shrink/rule file skip
  --with-hooks        Claude Code: standalone hooks installer も実行
                      (SessionStart/UserPromptSubmit + statusline + stats badge)
                      auto-on (Claude Code 検出時) — --minimal で off
  --with-init         cwd に per-repo IDE rule file 書込
                      (Cursor/Windsurf/Cline/Copilot/AGENTS.md) — opt-in
  --with-mcp-shrink   Claude Code: genshijin-shrink MCP middleware 登録
                      (or 手動セットアップ用 JSON snippet 表示)
                      auto-on — --minimal で off
  --list              全 provider matrix 表示し終了
  --no-color          ANSI color 無効 (非TTYで自動 off)
  -h, --help          ヘルプ表示

検出 agent:
  Native:
    claude       Claude Code           plugin marketplace + plugin install
    cursor       Cursor IDE            .cursor/rules/ rule file
    windsurf     Windsurf IDE          .windsurf/rules/ rule file
    cline        Cline                 .clinerules/ rule file
    copilot      GitHub Copilot        .github/copilot-instructions.md
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    --all) ALL=1; WITH_HOOKS=1; WITH_INIT=1; WITH_MCP_SHRINK=1 ;;
    --minimal) MINIMAL=1; WITH_HOOKS=0; WITH_MCP_SHRINK=0 ;;
    --with-hooks) WITH_HOOKS=1 ;;
    --with-init) WITH_INIT=1 ;;
    --with-mcp-shrink) WITH_MCP_SHRINK=1 ;;
    --only) ONLY+=("$2"); shift ;;
    --list) LIST_ONLY=1 ;;
    --no-color) NO_COLOR=1 ;;
    -h|--help) print_help; exit 0 ;;
    *) echo "未知フラグ: $1" >&2; print_help; exit 2 ;;
  esac
  shift
done

if [ "$NO_COLOR" -eq 1 ]; then
  C_GREEN=""; C_YELLOW=""; C_RED=""; C_BLUE=""; C_RESET=""
else
  C_GREEN="\033[32m"; C_YELLOW="\033[33m"; C_RED="\033[31m"; C_BLUE="\033[34m"; C_RESET="\033[0m"
fi

run() {
  if [ "$DRY" -eq 1 ]; then
    printf "  [dry-run] %s\n" "$*"
  else
    eval "$@"
  fi
}

agent_in_only() {
  local id="$1"
  if [ ${#ONLY[@]} -eq 0 ]; then return 0; fi
  for o in "${ONLY[@]}"; do
    [ "$o" = "$id" ] && return 0
  done
  return 1
}

# ── 検出 + install 関数 ─────────────────────────────────────────────────

install_claude() {
  agent_in_only claude || return 0
  if ! command -v claude >/dev/null 2>&1; then
    SKIPPED_IDS+=("claude"); SKIPPED_WHY+=("claude CLI 未検出")
    return 0
  fi
  DETECTED_COUNT=$((DETECTED_COUNT + 1))
  printf "${C_BLUE}>>>${C_RESET} Claude Code 検出 → genshijin プラグイン install\n"

  # Claude plugin marketplace 経由 install
  if [ "$DRY" -eq 0 ]; then
    if claude plugin install "$REPO" 2>/dev/null; then
      INSTALLED_IDS+=("claude")
    else
      # Fallback: hooks installer のみ
      printf "  marketplace install 失敗 → hooks installer fallback\n"
      if [ "$WITH_HOOKS" != "0" ]; then
        run "curl -fsSL '$HOOKS_INSTALL_URL' | bash"
        INSTALLED_IDS+=("claude (hooks-only)")
      fi
    fi
  else
    printf "  [dry-run] claude plugin install %s\n" "$REPO"
  fi

  # auto-on hooks (Claude Code only)
  if [ "$WITH_HOOKS" = "auto" ] || [ "$WITH_HOOKS" = "1" ]; then
    if [ "$WITH_HOOKS" != "1" ] && [ "$MINIMAL" -eq 1 ]; then return 0; fi
    run "curl -fsSL '$HOOKS_INSTALL_URL' | bash"
  fi

  # MCP-shrink 登録
  if [ "$WITH_MCP_SHRINK" = "1" ] || ([ "$WITH_MCP_SHRINK" = "auto" ] && [ "$MINIMAL" -eq 0 ]); then
    if command -v npm >/dev/null 2>&1; then
      printf "  MCP-shrink 利用可: ~/.claude/settings.json に手動追加例:\n"
      cat <<EOF
    "mcpServers": {
      "shrunk-fs": {
        "command": "npx",
        "args": ["$MCP_SHRINK_PKG", "<upstream-mcp-server-cmd>"]
      }
    }
EOF
    fi
  fi
}

install_cursor() {
  agent_in_only cursor || return 0
  if [ ! -d "$HOME/.cursor" ] && [ ! -d "$HOME/Library/Application Support/Cursor" ] && \
     [ ! -d "$HOME/AppData/Roaming/Cursor" ]; then
    SKIPPED_IDS+=("cursor"); SKIPPED_WHY+=("Cursor 未検出")
    return 0
  fi
  DETECTED_COUNT=$((DETECTED_COUNT + 1))
  printf "${C_BLUE}>>>${C_RESET} Cursor 検出 → cwd に rule file 投下\n"
  if [ "$WITH_INIT" -eq 1 ] || [ "$ALL" -eq 1 ]; then
    run "curl -fsSL '$INIT_SCRIPT_URL' | node - --only cursor"
    INSTALLED_IDS+=("cursor")
  else
    SKIPPED_IDS+=("cursor"); SKIPPED_WHY+=("--with-init 未指定")
  fi
}

install_windsurf() {
  agent_in_only windsurf || return 0
  if [ ! -d "$HOME/.codeium" ] && [ ! -d "$HOME/.windsurf" ]; then
    SKIPPED_IDS+=("windsurf"); SKIPPED_WHY+=("Windsurf 未検出")
    return 0
  fi
  DETECTED_COUNT=$((DETECTED_COUNT + 1))
  printf "${C_BLUE}>>>${C_RESET} Windsurf 検出\n"
  if [ "$WITH_INIT" -eq 1 ] || [ "$ALL" -eq 1 ]; then
    run "curl -fsSL '$INIT_SCRIPT_URL' | node - --only windsurf"
    INSTALLED_IDS+=("windsurf")
  else
    SKIPPED_IDS+=("windsurf"); SKIPPED_WHY+=("--with-init 未指定")
  fi
}

install_cline() {
  agent_in_only cline || return 0
  # Cline は VS Code extension。検出ヒューリスティック: ~/.vscode/extensions に saoudrizwan.claude-dev
  if ! ls "$HOME/.vscode/extensions/" 2>/dev/null | grep -q "saoudrizwan.claude-dev"; then
    SKIPPED_IDS+=("cline"); SKIPPED_WHY+=("Cline VS Code extension 未検出")
    return 0
  fi
  DETECTED_COUNT=$((DETECTED_COUNT + 1))
  printf "${C_BLUE}>>>${C_RESET} Cline 検出\n"
  if [ "$WITH_INIT" -eq 1 ] || [ "$ALL" -eq 1 ]; then
    run "curl -fsSL '$INIT_SCRIPT_URL' | node - --only cline"
    INSTALLED_IDS+=("cline")
  else
    SKIPPED_IDS+=("cline"); SKIPPED_WHY+=("--with-init 未指定")
  fi
}

install_copilot() {
  agent_in_only copilot || return 0
  # Copilot 検出: ~/.config/github-copilot or VS Code extension
  if [ ! -d "$HOME/.config/github-copilot" ] && \
     ! ls "$HOME/.vscode/extensions/" 2>/dev/null | grep -q "github.copilot"; then
    SKIPPED_IDS+=("copilot"); SKIPPED_WHY+=("Copilot 未検出")
    return 0
  fi
  DETECTED_COUNT=$((DETECTED_COUNT + 1))
  printf "${C_BLUE}>>>${C_RESET} GitHub Copilot 検出\n"
  if [ "$WITH_INIT" -eq 1 ] || [ "$ALL" -eq 1 ]; then
    run "curl -fsSL '$INIT_SCRIPT_URL' | node - --only copilot"
    INSTALLED_IDS+=("copilot")
  else
    SKIPPED_IDS+=("copilot"); SKIPPED_WHY+=("--with-init 未指定")
  fi
}

# ── --list ────────────────────────────────────────────────────────────────
if [ "$LIST_ONLY" -eq 1 ]; then
  cat <<EOF
genshijin agent matrix:

  claude     Claude Code        plugin marketplace install + hooks + statusline
  cursor     Cursor IDE         .cursor/rules/genshijin.mdc (--with-init で書込)
  windsurf   Windsurf IDE       .windsurf/rules/genshijin.md
  cline      Cline (VS Code)    .clinerules/genshijin.md
  copilot    GitHub Copilot     .github/copilot-instructions.md

検出後は --with-init / --all で per-repo rule file 書込。
EOF
  exit 0
fi

# ── 実行 ────────────────────────────────────────────────────────────────
echo "🪨 genshijin installer"
echo ""

install_claude
install_cursor
install_windsurf
install_cline
install_copilot

# ── 結果サマリ ──────────────────────────────────────────────────────────
echo ""
printf "${C_GREEN}=== 結果 ===${C_RESET}\n"
echo "検出 agent: $DETECTED_COUNT"
[ ${#INSTALLED_IDS[@]} -gt 0 ] && printf "${C_GREEN}install済:${C_RESET} %s\n" "${INSTALLED_IDS[*]}"
if [ ${#SKIPPED_IDS[@]} -gt 0 ]; then
  printf "${C_YELLOW}skip:${C_RESET}\n"
  for i in "${!SKIPPED_IDS[@]}"; do
    printf "  - %s (%s)\n" "${SKIPPED_IDS[$i]}" "${SKIPPED_WHY[$i]}"
  done
fi
if [ ${#FAILED_IDS[@]} -gt 0 ]; then
  printf "${C_RED}失敗:${C_RESET}\n"
  for i in "${!FAILED_IDS[@]}"; do
    printf "  - %s (%s)\n" "${FAILED_IDS[$i]}" "${FAILED_WHY[$i]}"
  done
fi

if [ "$DETECTED_COUNT" -eq 0 ]; then
  echo ""
  printf "${C_YELLOW}agent 未検出。${C_RESET}\n"
  echo "Claude Code or Cursor/Windsurf/Cline/Copilot を先に install してください。"
  exit 1
fi

echo ""
echo "完了。エージェント再起動で有効化。"
