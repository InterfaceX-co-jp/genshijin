"""genshijin-compress scripts.

自然言語Markdownファイルを原始人形式に圧縮し入力トークン削減するツール群。
"""

import json
from pathlib import Path

__all__ = ["cli", "compress", "detect", "validate"]


def _read_plugin_version() -> str:
    # plugin.json が single source of truth。
    # パッケージ構造: <repo>/skills/genshijin-compress/scripts/__init__.py
    # plugin.json:    <repo>/.claude-plugin/plugin.json
    manifest = Path(__file__).resolve().parents[3] / ".claude-plugin" / "plugin.json"
    try:
        return json.loads(manifest.read_text())["version"]
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        return "0.0.0"


__version__ = _read_plugin_version()
