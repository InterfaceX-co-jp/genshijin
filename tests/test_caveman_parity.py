import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "skills" / "genshijin-compress"))

from scripts.compress import compress_file, split_frontmatter, write_text_atomic  # noqa: E402
from scripts.detect import detect_file_type, should_compress  # noqa: E402
from scripts.validate import validate  # noqa: E402


class CompressSafetyTests(unittest.TestCase):
    def test_frontmatter_is_split_verbatim(self):
        original = "---\r\ntitle: 日本語\r\n---\r\n# 見出し\n本文\n"
        frontmatter, body = split_frontmatter(original)
        self.assertEqual(frontmatter, "---\r\ntitle: 日本語\r\n---\r\n")
        self.assertEqual(body, "# 見出し\n本文\n")

    def test_atomic_write_preserves_permissions_and_utf8(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "memory.md"
            path.write_text("before", encoding="utf-8")
            path.chmod(0o640)
            write_text_atomic(path, "日本語😀\n")
            self.assertEqual(path.read_text(encoding="utf-8"), "日本語😀\n")
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_build_files_and_shebang_are_not_compressible(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ("Dockerfile", "Makefile", "CMakeLists.txt"):
                path = Path(tmp) / name
                path.write_text("build instructions\n", encoding="utf-8")
                self.assertEqual(detect_file_type(path), "code")
                self.assertFalse(should_compress(path))

            script = Path(tmp) / "deploy"
            script.write_text("#!/usr/bin/env bash\necho ok\n", encoding="utf-8")
            self.assertEqual(detect_file_type(script), "code")
            self.assertFalse(should_compress(script))

    def test_inline_code_loss_is_validation_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "original.md"
            compressed = Path(tmp) / "compressed.md"
            original.write_text("Use `foo()` twice: `foo()`.\n", encoding="utf-8")
            compressed.write_text("Use `foo()` once.\n", encoding="utf-8")
            result = validate(original, compressed)
            self.assertFalse(result.is_valid)
            self.assertTrue(any("インラインコード消失" in error for error in result.errors))

    def test_backticks_inside_indented_fence_are_not_inline_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "original.md"
            compressed = Path(tmp) / "compressed.md"
            original.write_text("   ```js\nconst x = `inside`;\n   ```\n", encoding="utf-8")
            compressed.write_text("   ```js\nconst x = `inside`;\n   ```\n", encoding="utf-8")
            self.assertTrue(validate(original, compressed).is_valid)

    def test_retry_never_sends_frontmatter_to_llm(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "memory.md"
            frontmatter = "\ufeff---\r\ntitle: 秘密でない設定\r\n---\r\n"
            url = "https://example.com/docs"
            original = frontmatter + f"# 見出し\r\nSee {url} for details.\r\n"
            path.write_bytes(original.encode("utf-8"))
            with patch(
                "scripts.compress.call_claude",
                side_effect=["# 見出し\nSee docs.\n", f"# 見出し\nSee {url} now.\n"],
            ) as call:
                self.assertTrue(compress_file(path))

            self.assertTrue(path.read_bytes().startswith(frontmatter.encode("utf-8")))
            self.assertEqual(
                (Path(tmp) / "memory.original.md").read_bytes(),
                original.encode("utf-8"),
            )
            self.assertNotIn("title:", call.call_args_list[0].args[0])
            self.assertNotIn("title:", call.call_args_list[1].args[0])
            self.assertNotIn("\ufeff", call.call_args_list[0].args[0])

    def test_invalid_utf8_is_rejected_without_modification(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "memory.md"
            original = b"# title\ninvalid: \xff\n"
            path.write_bytes(original)
            with self.assertRaises(UnicodeDecodeError):
                compress_file(path)
            self.assertEqual(path.read_bytes(), original)
            self.assertFalse((Path(tmp) / "memory.original.md").exists())


if __name__ == "__main__":
    unittest.main()
