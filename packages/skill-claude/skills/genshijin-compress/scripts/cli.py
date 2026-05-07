#!/usr/bin/env python3
"""
genshijin-compress CLI

使い方:
    genshijin-compress <filepath>
"""

import sys
from pathlib import Path

from .compress import compress_file
from .detect import detect_file_type, should_compress


def print_usage():
    print("使い方: genshijin-compress <filepath>")


def main():
    if len(sys.argv) != 2:
        print_usage()
        sys.exit(1)

    filepath = Path(sys.argv[1])

    if not filepath.exists():
        print(f"❌ ファイルが見つかりません: {filepath}")
        sys.exit(1)

    if not filepath.is_file():
        print(f"❌ ファイルではありません: {filepath}")
        sys.exit(1)

    filepath = filepath.resolve()

    file_type = detect_file_type(filepath)

    print(f"検出: {file_type}")

    if not should_compress(filepath):
        print("スキップ: 自然言語ファイルではありません（コード/設定ファイル）")
        sys.exit(0)

    print("原始人圧縮 開始...\n")

    try:
        success = compress_file(filepath)

        if success:
            print("\n圧縮完了")
            backup_path = filepath.with_name(filepath.stem + ".original.md")
            print(f"圧縮版:   {filepath}")
            print(f"バックアップ: {backup_path}")
            sys.exit(0)
        else:
            print("\n❌ リトライ後も圧縮失敗")
            sys.exit(2)

    except KeyboardInterrupt:
        print("\nユーザー中断")
        sys.exit(130)

    except Exception as e:
        print(f"\n❌ エラー: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
