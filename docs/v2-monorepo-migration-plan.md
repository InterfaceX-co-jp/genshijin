# v2.0.0 monorepo migration plan

genshijin-suite 化計画。multi-agent対応 + multi-layer token削減統合パッケージへ進化。

## 目的

- 出力削減（現状genshijin）に加え **入力削減** （Read/MCP/Bash応答フィルタ）統合
- multi-agent対応（Claude Code / Cursor / Cline / Aider / Codex CLI）
- 単一ブランドで全層トークン削減提供

## 戦略: 案A monorepo + adapter分離

### コア原則

- **filter-core / compress-core**: agent非依存。stdin/stdout契約
- **adapter-***: 各agentのhook機構に橋渡し
- **skill-claude**: 既存Claude Code skill（互換性維持）

### 想定構造

```
genshijin/
├── packages/
│   ├── filter-core/           # universal CLI (stdin→stdout)
│   ├── compress-core/         # universal圧縮ロジック
│   ├── skill-claude/          # 既存skill (現状維持して移行)
│   ├── adapter-claude/        # PostToolUse hook自動設定
│   ├── adapter-cursor/        # (Phase 2)
│   ├── adapter-cline/         # (Phase 2)
│   ├── adapter-aider/         # (Phase 2)
│   ├── adapter-codex/         # (Phase 2)
│   └── cli/                   # genshijin doctor/install/gain
├── benchmarks/                # 現状維持
├── docs/                      # 共通ドキュメント
├── .claude-plugin/
│   └── marketplace.json       # pluginRoot: ./packages 指定
├── pnpm-workspace.yaml
└── package.json
```

## 既存ユーザー影響評価

| 利用経路 | 影響 | 対処 |
|---------|------|------|
| `/plugin marketplace add InterfaceX-co-jp/genshijin` | 無 | marketplace.json `pluginRoot` 設定で透過 |
| `install.sh` ワンライナー | 無 | URL不変、内部パス書換のみ |
| `${CLAUDE_PLUGIN_ROOT}/hooks/...` 参照 | 無 | plugin root = packages/skill-claude/ に変わるが内部パスは相対 |
| 直接cloneユーザー | 軽微 | README移行ガイド提供 |

参考:
- [Claude Code Plugin Marketplaces docs](https://code.claude.com/docs/en/plugin-marketplaces)

## Phase 進行

### Phase 1: monorepo化基盤 (現)

- [x] feat/v2.0.0-monorepo-suite ブランチ作成
- [x] 既存ユーザー影響リサーチ
- [ ] pnpm workspaces セットアップ
- [ ] 既存 skills/, hooks/, agents/, commands/ → packages/skill-claude/ 移動
- [ ] `.claude-plugin/marketplace.json` `pluginRoot` 設定
- [ ] install.sh パス書換
- [ ] benchmarksで既存skill互換確認

### Phase 2: filter-core / compress-core 分離

- [ ] `packages/filter-core/` 雛形（stdin/stdout契約）
- [ ] `packages/compress-core/` 雛形（既存compressロジック移植）
- [ ] universal CLI仕様策定
- [ ] 単体テスト

### Phase 3: adapter-claude 実装

- [ ] PostToolUse hook自動install設定生成
- [ ] Read / MCP / Bash 各フィルタ動作確認
- [ ] benchmarks/ で削減率計測

### Phase 4: メタCLI (`packages/cli/`)

- [ ] `genshijin doctor` (削減ツール導入状況診断)
- [ ] `genshijin install <adapter>` (各agent対応adapter自動設定)
- [ ] `genshijin gain` (rtk連携・全層削減実績集計)

### Phase 5: 他agent adapter追加

- [ ] adapter-cursor
- [ ] adapter-cline
- [ ] adapter-aider
- [ ] adapter-codex

### Phase 6: リリース

- [ ] CHANGELOG v2.0.0
- [ ] README更新
- [ ] 移行ガイド
- [ ] marketplace再登録テスト
- [ ] v2.0.0タグpush

## 進捗トラッキング

詳細進捗: [v2-progress.md](./v2-progress.md)

## 設計決定ログ

| 日付 | 決定 | 理由 |
|------|------|------|
| 2026-05-07 | monorepo (案A) 採用 | ブランド統一・コア共有・adapter横断テスト容易 |
| 2026-05-07 | pnpm workspaces 採用 | disk効率・workspace機能優秀 |
| 2026-05-07 | skill-claude を `packages/` 配下に移動 | 既存ユーザー影響なし（marketplace pluginRoot対応） |
| 2026-05-07 | filter-core はagent非依存設計 | adapter追加コスト最小化 |
