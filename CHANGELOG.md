# Changelog

本プロジェクトの変更履歴。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 準拠、バージョンは [Semantic Versioning](https://semver.org/spec/v2.0.0.html) 準拠。

## [Unreleased]

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

[Unreleased]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/InterfaceX-co-jp/genshijin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/InterfaceX-co-jp/genshijin/releases/tag/v1.0.0
