# Changelog

本プロジェクトの変更履歴。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 準拠、バージョンは [Semantic Versioning](https://semver.org/spec/v2.0.0.html) 準拠。

## [Unreleased]

## [1.4.0] - 2026-05-07

caveman 本家 v1.3.0以降 (`56875e8` / `83ec61c` / `e031c1e`) との差分を全項目移植。stats receipts / smart installer / cavecrew相当 / cavepack相当 / MCP-shrink。

### Added

- **`/genshijin-stats` スキル + フック** — 現セッションのリアルトークン使用量 + 推定削減量を表示
  - per-million model pricing で USD 換算 (`claude-opus-4`/`claude-sonnet-4`/`claude-haiku-4` 系自動判定)
  - `--share` ツイート可能1行サマリ、`--all` / `--since 7d` ライフタイム集計
  - `*.original.md` バックアップ検出で input側 (memory compress) 削減も計測
  - statusline に savings suffix `⛏ 12.3k` 追加表示
  - `.genshijin-history.jsonl` に session毎エントリ append (symlink-safe)
- **`genshijin-crew` 3サブエージェント** — 長セッションコンテキスト持続用 (caveman cavecrew 相当)
  - `genshijin-investigator` (read-only locator、haiku model)
  - `genshijin-builder` (1-2ファイル surgical edit)
  - `genshijin-reviewer` (severity-tagged finding、haiku model)
  - subagent tool-result が原始人圧縮 → 主コンテキスト消費約60%減
  - skill `skills/genshijin-crew/SKILL.md` で委譲判断ガイド
- **`genshijin-shrink` MCP middleware proxy** (`mcp-servers/genshijin-shrink/`)
  - 任意の MCP server を wrap → `tools/list` `description` を圧縮
  - コード/URL/パス/識別子は byte-for-byte 保護
  - 英語 + 日本語散文両対応 (敬語/クッション/前置き/ぼかし/形式名詞削除)
  - npm publishable: `npx genshijin-shrink <upstream> [args]`
- **`tools/genshijin-init.js`** — マルチエージェント rules 一発投下スクリプト (caveman cavepack 相当)
  - Cursor/Windsurf/Cline/Copilot/AGENTS.md に rule 投下
  - sentinel チェックで idempotent、`--dry-run` / `--force` / `--only <agent>`
- **root `install.sh` / `install.ps1`** — smart multi-agent installer
  - Claude Code/Cursor/Windsurf/Cline/Copilot 自動検出 → native install
  - `--dry-run` / `--force` / `--only` / `--all` / `--minimal` / `--list`
  - 既存 `hooks/install.sh` は Claude Code 単独 hooks 用として残存
- **commands/genshijin-stats.toml** — `/genshijin-stats` スラッシュコマンド定義
- **agents/** ディレクトリ — 3 subagent definition

### Changed

- `plugin.json` description / keywords に stats/MCP/subagent 機能反映、version 1.4.0 に bump
- `skills/genshijin/SKILL.md` 極限モードに **コードシンボル/関数名/API名/エラー文字列の略称化禁止** 明示 (caveman ultra-mode code-symbol guard 相当)
- 自動解除 (Auto-Clarity) 条件拡張: 多段手順での fragment 順誤読リスク、圧縮自体が技術的曖昧性発生時 (LaTeX/SQL/正規表現境界)、ユーザー混乱表明時
- `hooks/genshijin-mode-tracker.js` 引数ホワイトリスト strict化 — 不正引数で flag file silent overwrite 防止
- `hooks/genshijin-mode-tracker.js` `/genshijin-stats` 検出時に `decision: "block"` で stats hook 出力を即時注入
- `hooks/genshijin-config.js` `appendFlag` / `readHistory` 関数追加 (lifetime stats 用 JSONL)
- `hooks/genshijin-config.js` symlink 検証を immediate parent のみに緩和 — `~/.claude` が symlink な環境 (Nix/dotfiles管理/Docker bind-mount) で誤拒否回避
- `hooks/genshijin-statusline.sh` / `.ps1` に `.genshijin-statusline-suffix` 読込追加 — `/genshijin-stats` 後の savings 値を statusline に表示
- `skills/genshijin-compress/scripts/compress.py`:
  - UTF-8 stdout/stderr 強制 (Windows cp932 環境 UnicodeEncodeError 回避)
  - 空ファイルガード — Anthropic API 送信前に skip
  - 同一出力ガード — 圧縮効果なし時バックアップ作成せず
  - frontmatter cleanup (BOM 除去、frontmatter 後の余白整形、末尾改行正規化)
  - `read_text` / `write_text` に `encoding="utf-8"` 明示
- `AGENTS.md` に `genshijin-stats` / `genshijin-crew` 参照追加

### Fixed

- `hooks/install.ps1` Windows PowerShell + cmd.exe で `node -e "..."` 引用符エスケープ問題 → temp file 経由実行に変更

## [1.3.0] - 2026-04-18

### Added
- スラッシュコマンド定義 — `commands/genshijin.toml`（強度切替）・`commands/genshijin-commit.toml`（コミット生成）・`commands/genshijin-review.toml`（PRレビュー）
- マルチエージェント rules ファイル — `.cursor/rules/genshijin.mdc`（Cursor）・`.windsurf/rules/genshijin.md`（Windsurf）・`.clinerules/genshijin.md`（Cline）・`.github/copilot-instructions.md`（Copilot）・`rules/genshijin-activate.md`（フック無しプラットフォーム向け共通アクティベーション）
- `AGENTS.md` — サブスキル参照インデックス（Codex/Gemini CLI 等マルチエージェント互換）
- standalone フックインストーラ — `hooks/install.sh` / `hooks/uninstall.sh` / `hooks/install.ps1` / `hooks/uninstall.ps1`。プラグイン未使用でも `settings.json` への安全マージで導入可能
- `hooks/package.json`（`"type": "commonjs"`）— Node.js モジュール解決のための明示
- ベンチマーク第4アーム `terse`（簡潔指示のみ） — `benchmarks/run.py` に追加。`genshijin vs 簡潔` 差分で skill 自体が terse 指示を超えて何％削減するかの誠実な指標を計測可能化

### Changed
- `plugin.json` description / keywords に commands・マルチエージェント対応反映、version 1.3.0 に bump
- `benchmarks/run.py` のテーブル出力を 4アーム比較用に再構成（`通常` / `簡潔` / `caveman` / `genshijin`）

### Fixed
- `docs/index.html` モバイル／iOS レイアウト崩れ修正 — `自動化機能` / `genshijin-compress 使い始め` セクションで `.mode` カードを 600px 以下で縦並び化、`min-width: 100px` + `white-space: nowrap` による窮屈さ解消
- iOS Safari スムーススクロール対応 — `pre` / `install-box code` / `.table-wrapper` / `.json-viewer` / `.example-card pre` に `-webkit-overflow-scrolling: touch` 追加
- `install-box code` が長いコマンドで親要素をはみ出す問題を修正（横スクロール化 + Copy ボタン被り回避の `padding-right`）

## [1.2.0] - 2026-04-18

### Added
- SessionStart フック `hooks/genshijin-activate.js` — `SKILL.md` を読込みアクティブレベル行のみフィルタ注入（入力トークン節約 + 多ターン経過後のドリフト防止 anchor）
- UserPromptSubmit フック `hooks/genshijin-mode-tracker.js` — `/genshijin` 系コマンド・自然言語トリガーを検出しモード追跡、毎ターン短い補強リマインダを注入
- Statusline バッジ `hooks/genshijin-statusline.sh` / `.ps1` — `[原始人]` / `[原始人:極限]` / `[原始人:コミット]` 等で現モード可視化
- 設定解決 `hooks/genshijin-config.js` — 環境変数 `GENSHIJIN_DEFAULT_MODE` > `~/.config/genshijin/config.json`（XDG対応）> `normal`（デフォルト）
- `skills/genshijin/SKILL.md` に永続性セクション追加 — 多ターン経過後の敬語回帰・フィラー漂流を明示的に禁止する anchor
- README / Pages に自動化機能セクション追加

### Changed
- `plugin.json` に `hooks` エントリ追加（SessionStart / UserPromptSubmit）、description / keywords にフック機能反映、version 1.2.0 に bump

### Security
- フラグファイル `~/.claude/.genshijin-active` を symlink 拒否・64バイト上限・モードホワイトリスト検証で保護
- `~/.ssh/id_rsa` 等への symlink 差替えで secret バイトが statusline やモデルコンテキストに流れ込む攻撃経路を塞ぐ
- 親ディレクトリ symlink 拒否・O_NOFOLLOW・temp + rename アトミック書込・0o600 パーミッション

## [1.1.0] - 2026-04-18

### Added
- サブスキル `genshijin-commit` — Conventional Commits 形式の簡潔コミットメッセージ生成
- サブスキル `genshijin-review` — 1行PRコメント（`L42: 🔴 バグ: ...`）
- サブスキル `genshijin-help` — 全モード・サブスキル リファレンスカード
- サブスキル `genshijin-compress` — `CLAUDE.md` 等のメモリファイルを原始人モード化し入力トークン永続削減
  - Python CLI（detect / compress / validate / retry 機能付き）
  - 機密ファイル（`.env`, `credentials.*`, SSH鍵, `.ssh`/`.aws` 配下等）の自動拒否
- `plugin.json` に `version`・`homepage` フィールド追加（SemVer 1.1.0 で初バージョン管理開始）
- `docs/caveman-diff-analysis.md` — caveman 本家差分分析と P0-P3 進捗管理
- README / Pages にサブスキルセクション追加
- 自動リリース workflow（タグ push で GitHub Release 自動作成）

### Changed
- `plugin.json` description / keywords をサブスキル機能反映に更新
- Python `scripts/__init__.py` の `__version__` を `plugin.json` から動的読込に変更（Single Source of Truth化）

## [1.0.0] - 2026-04-07

### Added
- 初版リリース
- 本体スキル `genshijin` — 3段階強度（丁寧・通常・極限）の日本語超圧縮コミュニケーションモード
- Claude Code プラグイン構成（`plugin.json`, `marketplace.json`）
- 日本語/英語ベンチマークスクリプト + GitHub Actions 自動実行
- GitHub Pages（`docs/index.html`）でのベンチマーク可視化

[Unreleased]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/InterfaceX-co-jp/genshijin/releases/tag/v1.0.0
