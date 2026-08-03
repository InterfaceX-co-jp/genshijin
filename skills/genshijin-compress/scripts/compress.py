#!/usr/bin/env python3
"""
genshijin メモリ圧縮オーケストレータ

使い方:
    python scripts/compress.py <filepath>
"""

import io
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List

# Windows 環境 cp932 stdout で日本語/特殊文字 UnicodeEncodeError 回避。
# Python 3.7+ は reconfigure 利用可。古い環境は io.TextIOWrapper でラップ。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, io.UnsupportedOperation):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

OUTER_FENCE_REGEX = re.compile(
    r"\A\s*(`{3,}|~{3,})[^\n]*\n(.*)\n\1\s*\Z", re.DOTALL
)

# YAML frontmatter。圧縮対象から外し、byte-equivalent な文字列として復元。
FRONTMATTER_REGEX = re.compile(
    r"\A(---\r?\n.*?\r?\n---\r?\n)(.*)", re.DOTALL
)

# 機密・PII を含む可能性高いファイル名/パス。圧縮すると Anthropic API に生データ送信 →
# 機密リポジトリでは越えられない第三者データ境界。detect.py は .env を拡張子で弾くが、
# credentials.md / secrets.txt / ~/.aws/credentials は自然言語フィルタをすり抜ける。
# read 前にハード拒否する。
SENSITIVE_BASENAME_REGEX = re.compile(
    r"(?ix)^("
    r"\.env(\..+)?"
    r"|\.netrc"
    r"|credentials(\..+)?"
    r"|secrets?(\..+)?"
    r"|passwords?(\..+)?"
    r"|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?"
    r"|authorized_keys"
    r"|known_hosts"
    r"|.*\.(pem|key|p12|pfx|crt|cer|jks|keystore|asc|gpg)"
    r")$"
)

SENSITIVE_PATH_COMPONENTS = frozenset({".ssh", ".aws", ".gnupg", ".kube", ".docker"})

SENSITIVE_NAME_TOKENS = (
    "secret", "credential", "password", "passwd",
    "apikey", "accesskey", "token", "privatekey",
)


def is_sensitive_path(filepath: Path) -> bool:
    """第三者API送信厳禁ファイルのヒューリスティック拒否リスト。"""
    name = filepath.name
    if SENSITIVE_BASENAME_REGEX.match(name):
        return True
    lowered_parts = {p.lower() for p in filepath.parts}
    if lowered_parts & SENSITIVE_PATH_COMPONENTS:
        return True
    # "api-key" と "api_key" 両方を "apikey" にマッチさせるため区切り文字正規化
    lower = re.sub(r"[_\-\s.]", "", name.lower())
    return any(tok in lower for tok in SENSITIVE_NAME_TOKENS)


def strip_llm_wrapper(text: str) -> str:
    """出力全体を包む外側の ```markdown ... ``` フェンスを除去。"""
    m = OUTER_FENCE_REGEX.match(text)
    if m:
        return m.group(2)
    return text


def split_frontmatter(text: str):
    """UTF-8 BOM/YAML frontmatter と本文を分離。prefix は無変更で復元。"""
    bom = "\ufeff" if text.startswith("\ufeff") else ""
    source = text[len(bom):]
    m = FRONTMATTER_REGEX.match(source)
    if m:
        return bom + m.group(1), m.group(2)
    if bom:
        return bom, source
    return "", source


def cleanup_compressed(text: str) -> str:
    """圧縮後テキストの最終整形:
    - frontmatter 後の連続空行を1行に
    - 末尾改行正規化 (1個)
    - 先頭BOM除去
    """
    if text.startswith("﻿"):
        text = text[1:]
    # 末尾改行 1個に
    text = text.rstrip() + "\n"
    return text


def write_text_atomic(path: Path, text: str) -> None:
    """UTF-8へ先にencodeし、同一ディレクトリの一時ファイルからatomic置換。"""
    data = text.encode("utf-8")
    fd, tmp_name = tempfile.mkstemp(
        dir=str(path.parent), prefix=path.name + ".", suffix=".tmp"
    )
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        if path.exists():
            os.chmod(tmp_path, stat.S_IMODE(path.stat().st_mode))
        os.replace(tmp_path, path)
    except Exception:
        try:
            tmp_path.unlink()
        except OSError:
            pass
        raise


def read_text_exact(path: Path, errors: str = "strict") -> str:
    """UTF-8読込。改行変換を無効化し、CRLF/LFをそのまま保持。"""
    with path.open("r", encoding="utf-8", errors=errors, newline="") as file:
        return file.read()


def first_nonblank_line(text: str) -> str:
    for line in text.splitlines():
        if line.strip():
            return line.strip()
    return ""


def _write_target(filepath: Path, text: str, backup_path: Path) -> None:
    try:
        write_text_atomic(filepath, text)
    except Exception:
        print(f"❌ {filepath} への書込失敗。原文バックアップ: {backup_path}")
        raise


from .detect import should_compress
from .validate import validate

MAX_RETRIES = 2


def call_claude(prompt: str) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=api_key)
            msg = client.messages.create(
                model=os.environ.get("GENSHIJIN_MODEL", "claude-sonnet-4-5"),
                max_tokens=8192,
                messages=[{"role": "user", "content": prompt}],
            )
            return strip_llm_wrapper(msg.content[0].text.strip())
        except ImportError:
            pass  # anthropic未インストール → CLI fallback
    # Fallback: claude CLI 使用（デスクトップ認証対応）
    claude_bin = shutil.which("claude") or "claude"
    try:
        result = subprocess.run(
            [claude_bin, "--print"],
            input=prompt,
            text=True,
            capture_output=True,
            check=True,
            encoding="utf-8",
            errors="replace",
        )
        return strip_llm_wrapper(result.stdout.strip())
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Claude 呼出失敗:\n{e.stderr}")


def build_compress_prompt(original: str) -> str:
    return f"""以下のMarkdownを原始人モード（genshijin）形式に圧縮してください。

厳守ルール:
- ``` コードブロック内は一切変更しない
- インラインバッククォート内は一切変更しない
- 全URLを正確に保持
- 全見出しを正確に保持
- ファイルパス・コマンドを保持
- 数値・日付・バージョン番号を保持
- 技術用語・ライブラリ名・API名を保持
- エラーメッセージ原文を保持
- 圧縮後のMarkdown本体のみを返す — 出力全体を ```markdown フェンスで包まないこと。原文の内部コードブロックはそのまま残す

圧縮方針（自然言語部分のみ）:
- 敬語・丁寧語を削除（です/ます → 体言止め）
- クッション言葉・前置き・ぼかしを削除
- 自明な助詞（が/の/を/に/で/は）を省略
- 形容動詞活用語尾（な/に/で/だ）を語幹止めに
- 形式名詞（こと/もの/ため）を削除 or 名詞化
- 補助動詞（ている/ておく/てしまう）を状態表現に
- 漢字連結で助詞吸収（「高負荷時に高速」→「高負荷時高速」）
- 和語→漢語化で圧縮（「速く動作」→「高速動作」）
- 体言止め・用言止めを許可
- 重複を統合、同パターン複数例は1例のみ

テキスト:
{original}
"""


def build_fix_prompt(original: str, compressed: str, errors: List[str]) -> str:
    errors_str = "\n".join(f"- {e}" for e in errors)
    return f"""genshijin 圧縮済みMarkdownファイルの検証エラー修正タスクです。

重要ルール:
- 再圧縮・言い換え 禁止
- 指摘されたエラーのみ修正 — 他は完全にそのまま
- 原文は参考情報（消失した内容を復元する用途のみ）
- 未変更セクションは原始人スタイル維持

修正対象エラー:
{errors_str}

修正方針:
- URL消失: 原文から見つけて、COMPRESSED の該当位置に正確に復元
- コードブロック不一致: 原文の正確なコードブロックを COMPRESSED に復元
- 見出し不一致: 原文の正確な見出しテキストを COMPRESSED に復元
- エラーに記載のないセクションは絶対に触らない

原文（参考のみ）:
{original}

圧縮版（これを修正）:
{compressed}

修正後の圧縮ファイルのみ返してください。説明不要。
"""


def compress_file(filepath: Path) -> bool:
    filepath = filepath.resolve()
    MAX_FILE_SIZE = 500_000  # 500KB
    if not filepath.exists():
        raise FileNotFoundError(f"ファイルが見つかりません: {filepath}")
    if filepath.stat().st_size > MAX_FILE_SIZE:
        raise ValueError(f"安全圧縮可能サイズ超過（上限500KB）: {filepath}")

    # 機密・鍵・認証情報ファイルは拒否。圧縮は Anthropic API に生データ送信 =
    # 第三者境界越え。サイレント流出を避け、ここで明示的に失敗させる。
    # 誤検知時はファイル名変更で回避可能。
    if is_sensitive_path(filepath):
        raise ValueError(
            f"圧縮拒否: {filepath} — ファイル名が機密情報（認証情報・鍵・シークレット・"
            "既知のプライベートパス）を示唆します。"
            "圧縮はファイル内容を Anthropic API に送信します。"
            "誤検知の場合はファイル名を変更してください。"
        )

    print(f"処理中: {filepath}")

    if not should_compress(filepath):
        print("スキップ（自然言語ではない）")
        return False

    original_text = read_text_exact(filepath)

    # 空ファイル ガード — Claude API 送信不要、原ファイル無変更
    if not original_text.strip():
        print("スキップ: 空ファイル")
        return False

    backup_path = filepath.with_name(filepath.stem + ".original.md")

    # バックアップ既存時は誤上書き防止のため中止
    if backup_path.exists():
        print(f"⚠️ バックアップ既存: {backup_path}")
        print("既存バックアップに重要な内容が含まれる可能性あり。")
        print("データ損失防止のため中止。続行するには既存バックアップを削除 or リネームしてください。")
        return False

    # frontmatter は LLM に渡さず、そのまま復元
    frontmatter, body = split_frontmatter(original_text)
    if frontmatter:
        label = "YAML frontmatter" if frontmatter.lstrip("\ufeff").startswith("---") else "UTF-8 BOM"
        print(f"{label} 検出（{len(frontmatter)}文字）— 無変更で保持")
    if not body.strip():
        print("スキップ: frontmatter 除去後の本文が空")
        return False

    # Step 1: 本文のみ圧縮
    print("Claude で圧縮中...")
    compressed_body = call_claude(build_compress_prompt(body))

    if compressed_body is None or not compressed_body.strip():
        print("スキップ: Claude が空出力を返したため原ファイル無変更")
        return False

    compressed_body = cleanup_compressed(compressed_body)

    # 同一出力 ガード — Claude が圧縮失敗 or 既に圧縮済の場合バックアップ作らず終了
    if compressed_body.strip() == body.strip():
        print("スキップ: 圧縮効果なし（既に最小形 or LLM未削減）")
        return False

    compressed = frontmatter + compressed_body

    # 原ファイルをバックアップ、圧縮版を原パスに書き込み
    write_text_atomic(backup_path, original_text)
    if read_text_exact(backup_path) != original_text:
        backup_path.unlink(missing_ok=True)
        print("❌ バックアップ検証失敗。原ファイル無変更")
        return False
    _write_target(filepath, compressed, backup_path)

    # Step 2: 検証 + リトライ
    for attempt in range(MAX_RETRIES):
        print(f"\n検証 {attempt + 1}回目")

        result = validate(backup_path, filepath)

        if result.is_valid:
            print("検証 合格")
            break

        print("❌ 検証失敗:")
        for err in result.errors:
            print(f"   - {err}")

        if attempt == MAX_RETRIES - 1:
            # 失敗時は原ファイル復元
            _write_target(filepath, original_text, backup_path)
            backup_path.unlink(missing_ok=True)
            print("❌ リトライ後も失敗 — 原ファイル復元")
            return False

        print("Claude でピンポイント修正中...")
        current_body = compressed[len(frontmatter):] if frontmatter else compressed
        fixed_body = call_claude(
            build_fix_prompt(body, current_body, result.errors)
        )
        if fixed_body is None or not fixed_body.strip():
            print("❌ 修正出力が空。今回の修正をスキップ")
            continue
        fixed_body = cleanup_compressed(fixed_body)
        anchor = first_nonblank_line(body)
        if anchor.startswith("#") and first_nonblank_line(fixed_body) != anchor:
            print("❌ 修正出力の先頭構造が原文と不一致。前置き混入の可能性によりスキップ")
            continue
        compressed = frontmatter + fixed_body
        _write_target(filepath, compressed, backup_path)

    return True
