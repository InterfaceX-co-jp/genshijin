# Changelog

本プロジェクトの変更履歴。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 準拠、バージョンは [Semantic Versioning](https://semver.org/spec/v2.0.0.html) 準拠。

## [Unreleased]

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

[Unreleased]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/InterfaceX-co-jp/genshijin/releases/tag/v1.0.0
