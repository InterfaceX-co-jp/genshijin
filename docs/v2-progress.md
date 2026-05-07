# v2.0.0 monorepo migration 進捗

リアルタイム更新。チェックボックス状態が現状反映。

## 現在Phase

**Phase 1: monorepo化基盤** → **完了 (PR待ち)**

次: Phase 2 (filter-core / compress-core 分離) 着手予定。

## Phase 1 進捗

### 準備

- [x] feat/v2.0.0-monorepo-suite ブランチ作成 (2026-05-07)
- [x] 既存ユーザー影響リサーチ (2026-05-07)
- [x] migration計画docs作成 (2026-05-07)

### monorepo構築

- [x] `pnpm-workspace.yaml` 作成
- [x] root `package.json` 更新（workspaces / packageManager / engines）
- [x] `packages/` ディレクトリ作成

### skill-claude 移行

- [x] `packages/skill-claude/` 作成
- [x] `skills/` → `packages/skill-claude/skills/` 移動
- [x] `hooks/` → `packages/skill-claude/hooks/` 移動
- [x] `agents/` → `packages/skill-claude/agents/` 移動
- [x] `commands/` → `packages/skill-claude/commands/` 移動
- [x] `packages/skill-claude/.claude-plugin/plugin.json` 移行
- [x] `packages/skill-claude/package.json` 作成（@genshijin/skill-claude）
- (保留) `tools/`: root維持。Phase 4 で `packages/cli/` へ統合候補
- (保留) `mcp-servers/`: root維持。Phase 2-3 で個別package化候補
- (保留) `rules/`: root維持（multi-agent universal rule 配信用）

### marketplace 設定

- [x] root `.claude-plugin/marketplace.json` `metadata.pluginRoot: "./packages"` 設定
- [x] `source: "skill-claude"` 更新

### Path 書換

- [x] root `install.sh` HOOKS_INSTALL_URL を packages/skill-claude/hooks/install.sh に変更
- [x] root `install.ps1` HooksInstallUrl を packages/skill-claude/hooks/install.ps1 に変更
- [x] `packages/skill-claude/hooks/install.sh` REPO_URL 書換 + 使い方ドキュメント
- [x] `packages/skill-claude/hooks/install.ps1` $RepoUrl 書換 + 使い方ドキュメント
- [x] `packages/skill-claude/hooks/uninstall.sh` 使い方ドキュメント書換
- [x] `packages/skill-claude/hooks/uninstall.ps1` 使い方ドキュメント書換
- [x] `Makefile` PLUGIN_JSON 変数経由でパス参照
- [x] `scripts/bump_version.py` PLUGIN_JSON path 更新
- [x] `.github/workflows/release.yml` plugin.json path 更新
- [x] `README.md` 全 curl URL / 相対パス更新 + プロジェクト構成図 v2 化
- [x] `AGENTS.md` skill 参照 packages/skill-claude/skills/ 化

### 検証

- [x] `make version` 動作確認 → v1.4.0 取得 OK
- [x] git status mv 検出確認 → 全ファイル R (rename) 認識 OK
- [ ] benchmark既存skill動作確認 (Phase 2 開始前に実施)
- [ ] `/plugin marketplace add InterfaceX-co-jp/genshijin#feat/v2.0.0-monorepo-suite` 動作確認
- [ ] hooks動作確認（SessionStart/UserPromptSubmit）
- [ ] commands動作確認（/genshijin 等）
- [ ] subagent動作確認

## Phase 2-6 概要

詳細: [v2-monorepo-migration-plan.md](./v2-monorepo-migration-plan.md)

- Phase 2: filter-core / compress-core 分離
- Phase 3: adapter-claude 実装
- Phase 4: メタCLI (`packages/cli/`)
- Phase 5: 他agent adapter追加 (cursor / cline / aider / codex)
- Phase 6: v2.0.0リリース

## ブロッカー

なし。

## 次アクション

1. Phase 1 をcommit + PR
2. ユーザー側で `/plugin marketplace add InterfaceX-co-jp/genshijin#feat/v2.0.0-monorepo-suite` 動作確認
3. Phase 2 着手: `packages/compress-core/` (compress.py 移植) + `packages/filter-core/` (stdin/stdout契約 雛形)
