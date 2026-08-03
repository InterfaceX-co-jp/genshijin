#!/usr/bin/env bash
# genshijin — unified Node installer shim.
set -euo pipefail

REPO="InterfaceX-co-jp/genshijin"
RAW_BASE="https://raw.githubusercontent.com/$REPO/main"

if ! command -v node >/dev/null 2>&1; then
  echo "genshijin: Node.js 18 以上が必要: https://nodejs.org" >&2
  exit 1
fi
if [ "$(node -p "Number(process.versions.node.split('.')[0])")" -lt 18 ]; then
  echo "genshijin: Node.js 18 以上が必要" >&2
  exit 1
fi

SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/cli/install.js" ]; then
  exec node "$SCRIPT_DIR/cli/install.js" "$@"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "genshijin: remote install には curl が必要" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/lib"
curl -fsSL "$RAW_BASE/cli/install.js" -o "$TMP_DIR/install.js"
curl -fsSL "$RAW_BASE/cli/lib/settings.js" -o "$TMP_DIR/lib/settings.js"
node "$TMP_DIR/install.js" "$@"
