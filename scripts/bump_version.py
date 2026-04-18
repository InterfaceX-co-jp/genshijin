#!/usr/bin/env python3
"""
バージョンバンプスクリプト。

使い方:
    python3 scripts/bump_version.py {patch|minor|major} [--dry-run]

挙動:
    1. .claude-plugin/plugin.json から現バージョン取得
    2. bump 種別に応じて新バージョン算出
    3. plugin.json の version を更新
    4. CHANGELOG.md の [Unreleased] を [X.Y.Z] - YYYY-MM-DD にリネーム、
       新しい空の [Unreleased] を追加、末尾の比較リンクを更新
    5. 標準出力に「次の手順」を表示

git commit / tag は呼出し側（Makefile）で実施。
"""

from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
PLUGIN_JSON = REPO_ROOT / ".claude-plugin" / "plugin.json"
CHANGELOG = REPO_ROOT / "CHANGELOG.md"
COMPARE_BASE = "https://github.com/InterfaceX-co-jp/genshijin"


def get_current_version() -> str:
    manifest = json.loads(PLUGIN_JSON.read_text(encoding="utf-8"))
    v = manifest.get("version")
    if not v or not re.match(r"^\d+\.\d+\.\d+$", v):
        sys.exit(f"❌ plugin.json の version が SemVer 形式でない: {v!r}")
    return v


def bump(current: str, kind: str) -> str:
    major, minor, patch = (int(x) for x in current.split("."))
    if kind == "major":
        return f"{major + 1}.0.0"
    if kind == "minor":
        return f"{major}.{minor + 1}.0"
    if kind == "patch":
        return f"{major}.{minor}.{patch + 1}"
    sys.exit(f"❌ 不明な bump 種別: {kind}")


def update_plugin_json(new_version: str, dry_run: bool) -> None:
    text = PLUGIN_JSON.read_text(encoding="utf-8")
    new_text, n = re.subn(
        r'("version":\s*")\d+\.\d+\.\d+(")',
        rf'\g<1>{new_version}\g<2>',
        text,
        count=1,
    )
    if n != 1:
        sys.exit("❌ plugin.json の version 行が見つからない")
    if dry_run:
        print(f"[dry-run] plugin.json: version → {new_version}")
    else:
        PLUGIN_JSON.write_text(new_text, encoding="utf-8")
        print(f"✅ plugin.json: version → {new_version}")


def update_changelog(old_version: str, new_version: str, dry_run: bool) -> None:
    text = CHANGELOG.read_text(encoding="utf-8")
    today = datetime.date.today().isoformat()

    # [Unreleased] 見出しを [new_version] - DATE に置換、新しい空の [Unreleased] を前に追加
    marker = "## [Unreleased]"
    if marker not in text:
        sys.exit("❌ CHANGELOG.md に [Unreleased] セクションがない")
    new_text = text.replace(
        marker,
        f"{marker}\n\n## [{new_version}] - {today}",
        1,
    )

    # 末尾の compare link を更新
    # [Unreleased]: .../compare/vOLD...HEAD → .../compare/vNEW...HEAD
    new_text, n_unrel = re.subn(
        r"^\[Unreleased\]:\s*" + re.escape(COMPARE_BASE) + r"/compare/v\d+\.\d+\.\d+\.\.\.HEAD",
        f"[Unreleased]: {COMPARE_BASE}/compare/v{new_version}...HEAD",
        new_text,
        count=1,
        flags=re.MULTILINE,
    )
    if n_unrel != 1:
        print("⚠️  CHANGELOG.md の [Unreleased] 比較リンクを更新できなかった。手動で確認してください。")

    # 新バージョンの compare link を、旧バージョンの直上に挿入
    old_link_pattern = rf"^\[{re.escape(old_version)}\]:"
    old_link_match = re.search(old_link_pattern, new_text, flags=re.MULTILINE)
    if old_link_match:
        insert_pos = old_link_match.start()
        new_link = f"[{new_version}]: {COMPARE_BASE}/compare/v{old_version}...v{new_version}\n"
        new_text = new_text[:insert_pos] + new_link + new_text[insert_pos:]
    else:
        print(f"⚠️  [{old_version}] の compare link が見つからない。手動で追記してください。")

    if dry_run:
        print(f"[dry-run] CHANGELOG.md: [Unreleased] → [{new_version}] - {today}")
        print(f"[dry-run] CHANGELOG.md: compare link 追加")
    else:
        CHANGELOG.write_text(new_text, encoding="utf-8")
        print(f"✅ CHANGELOG.md: [Unreleased] → [{new_version}] - {today}")


def check_unreleased_has_content() -> bool:
    text = CHANGELOG.read_text(encoding="utf-8")
    # [Unreleased] 以降から次の ## [ または EOF まで
    m = re.search(r"^## \[Unreleased\]\s*\n(.*?)(?=^## \[|\Z)", text, flags=re.DOTALL | re.MULTILINE)
    if not m:
        return False
    return bool(m.group(1).strip())


def main() -> None:
    parser = argparse.ArgumentParser(description="SemVer bump + CHANGELOG 更新")
    parser.add_argument("kind", choices=["patch", "minor", "major"], help="bump 種別")
    parser.add_argument("--dry-run", action="store_true", help="ファイル書込なし、差分のみ表示")
    args = parser.parse_args()

    current = get_current_version()
    new = bump(current, args.kind)

    print(f"現在: v{current}")
    print(f"新規: v{new}")
    print()

    if not check_unreleased_has_content():
        print("⚠️  CHANGELOG.md の [Unreleased] セクションが空です。リリース内容なしで進めます。")
        print()

    update_plugin_json(new, args.dry_run)
    update_changelog(current, new, args.dry_run)

    if not args.dry_run:
        print()
        print("次の手順:")
        print("  git diff                              # 変更確認")
        print(f"  git add -A && git commit -m 'chore(release): v{new}'")
        print(f"  git tag v{new}")
        print(f"  git push && git push origin v{new}   # リリース workflow 起動")
        print()
        print(f"  または: make release-commit VERSION={new}")


if __name__ == "__main__":
    main()
