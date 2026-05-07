# genshijin 原始人 🗿

> なぜ多くトークン使う？少なくて済む🗿

<p align="center">
  <a href="https://github.com/InterfaceX-co-jp/genshijin/stargazers"><img src="https://img.shields.io/github/stars/InterfaceX-co-jp/genshijin?style=flat&color=yellow" alt="Stars"></a>
  <a href="https://github.com/InterfaceX-co-jp/genshijin/commits/main"><img src="https://img.shields.io/github/last-commit/InterfaceX-co-jp/genshijin?style=flat" alt="Last Commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/InterfaceX-co-jp/genshijin?style=flat" alt="License"></a>
</p>

Claude Code 公式プラグインディレクトリに公開済み。`/plugin install genshijin` でワンライナーインストール。

Claude Code / Codex 向けの超圧縮コミュニケーションスキル。[caveman](https://github.com/JuliusBrussee/caveman) の日本語版をベースに、日本語特有の冗長表現に最適化。

トークン使用量を **約75%削減** しつつ、技術的正確性は100%維持。
コミット生成・PRレビュー・メモリ圧縮の用途別サブスキルも同梱。

## 日本語への最適化ポイント

英語版 caveman は冠詞(a/an/the)やフィラーの削除が中心だが、日本語版は以下に対応:

| 英語版の削減対象 | 日本語版の削減対象 |
|-----------------|-------------------|
| 冠詞 (a/an/the) | 敬語・丁寧語 (です/ます/ございます) |
| フィラー (just/really/basically) | クッション言葉 (えーと/まあ/基本的に/一応) |
| 前置き (Sure! I'd be happy to...) | 前置き表現 (ご質問ありがとうございます...) |
| ぼかし (might/perhaps/likely) | ぼかし (〜かもしれません/おそらく/〜と思われます) |
| 冗長表現 | 冗長な助詞連続・敬語の二重化 |

## インストール

### 方法1: Claude Code 公式プラグインディレクトリ（推奨）

Claude Code 内で以下を実行:

```
/plugin install genshijin
```

Anthropic 公式 [プラグインディレクトリ](https://claude.ai/settings/plugins) に公開済み。marketplace add 不要。

### 方法1b: GitHub 直接インストール（開発版）

```
claude plugin marketplace add InterfaceX-co-jp/genshijin
/plugin install genshijin@InterfaceX-co-jp/genshijin
```

main ブランチ最新を取得したい場合。

### 方法2: npx skills（サードパーティ）

```bash
npx skills add InterfaceX-co-jp/genshijin
```

### 方法3: 手動インストール

**プロジェクト単位**（このリポジトリだけに適用）:

```bash
# リポジトリのルートで実行
mkdir -p .claude/skills/genshijin
curl -o .claude/skills/genshijin/SKILL.md \
  https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/packages/skill-claude/skills/genshijin/SKILL.md
```

**グローバル**（すべてのプロジェクトに適用）:

```bash
mkdir -p ~/.claude/skills/genshijin
curl -o ~/.claude/skills/genshijin/SKILL.md \
  https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/packages/skill-claude/skills/genshijin/SKILL.md
```

### 方法4: 一時的に使う

```bash
claude --plugin-dir ./path/to/genshijin
```

## 使い方

```
/genshijin          # 通常モード（デフォルト）で起動
/genshijin 丁寧     # ビジネス向け簡潔体
/genshijin 極限     # 最大圧縮
```

会話中に `原始人やめて` または `通常モード` で解除。

## 3段階の強度

### 丁寧モード
クッション言葉・ぼかし表現を削除。敬語は維持。ビジネスメール向き。

**Before:**
> ご質問ありがとうございます。お調べしたところ、こちらの問題につきましては、認証ミドルウェアにおけるトークンの有効期限チェックの部分に原因がある可能性が考えられます。

**After:**
> コンポーネントが再レンダリングされるのは、レンダリングごとに新しいオブジェクト参照が生成されるためです。`useMemo`で解決できます。

### 通常モード（デフォルト）
敬語を落とし体言止め。助詞も最小限。原始人の基本形。

**Before:**
> こちらの問題は、レンダリングが行われるたびに新しいオブジェクトの参照が生成されてしまうことが原因となっております。

**After:**
> レンダリング毎に新オブジェクト参照が生成。インラインオブジェクトprop = 新しい参照 = 再レンダリング。`useMemo`で包む。

### 極限モード
略語・矢印記法・一語回答。電報のような圧縮。

**Before:**
> データベースのコネクションプーリングというのは、リクエストが来るたびに新しい接続を確立するのではなく、あらかじめ作成しておいた接続を再利用する仕組みのことです。

**After:**
> プール = DB接続再利用。ハンドシェイク省略 → 高負荷時に高速。

## サブスキル

本体 `/genshijin` に加え、用途別サブスキル6個同梱。

| スキル | トリガー | 内容 |
|--------|---------|------|
| **genshijin-commit** | `/genshijin-commit` | Conventional Commits 形式の簡潔コミットメッセージ。件名≤50文字、「なぜ」重視 |
| **genshijin-review** | `/genshijin-review` | 1行PRコメント `L42: 🔴 バグ: user null。ガード追加。` |
| **genshijin-compress** | `/genshijin-compress <file>` | `CLAUDE.md` 等のメモリファイルを原始人モード化し入力トークン永続削減 |
| **genshijin-stats** (v1.4.0〜) | `/genshijin-stats [--share / --all / --since 7d]` | 現セッションのリアルトークン使用量＋推定削減量＋USD換算をフックが即時表示 |
| **genshijin-crew** (v1.4.0〜) | (auto) | 3 subagent preset (`investigator`/`builder`/`reviewer`)。tool-result 原始人圧縮で主コンテキスト約60%減 |
| **genshijin-help** | `/genshijin-help` | 全モード・サブスキル・設定方法のリファレンスカード |

### genshijin-compress について

`CLAUDE.md` はセッション開始毎に読込 → 圧縮で **毎回** の入力トークン削減。

#### 使い始め（3ステップ）

**1. 前提準備**

Python 3.10+ に加え、以下いずれか:

```bash
# オプションA: API key 直接利用
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# オプションB: claude CLI ログイン済みなら 追加設定不要（CLI fallback）
claude --version
```

**2. 対象ファイル選定**

典型的な圧縮対象:
- `~/.claude/CLAUDE.md` — ユーザー全体メモリ（全セッションで毎回読込）
- `./CLAUDE.md` — プロジェクト単位メモリ
- `~/.claude/projects/<project>/memory/MEMORY.md` — auto memory インデックス

**3. 圧縮実行**

```
/genshijin-compress ~/.claude/CLAUDE.md
```

結果:
- 圧縮版が原ファイルを上書き
- 人間可読版は `CLAUDE.original.md` にバックアップ（復元可能）
- 失敗時は原ファイル無変更

#### 保持・拒否ルール

- **完全保持**: コードブロック / URL / ファイルパス / 数値 / 見出し / 技術用語
- **自動拒否**: `.env` / `credentials.*` / `id_rsa` / `.ssh/` 配下 等

誤検知時はファイル名変更で回避可能。

## 自動化機能（v1.2.0〜）

プラグイン導入後、Claude Code のフック機構で以下が自動で動く。

### SessionStart フック — 原始人ルール注入
セッション開始毎に `SKILL.md` を読み、現アクティブレベルの該当行のみフィルタして hidden context に注入。多ターン経過後の敬語回帰・フィラー漂流を防ぐ anchor。

### UserPromptSubmit フック — モード追跡 + 毎ターン補強
- `/genshijin 丁寧|通常|極限` や自然言語（「原始人モード」「原始人やめて」等）でモード切替を検出
- アクティブ中は毎ユーザー発話で短い補強リマインダを注入 → 他プラグインが競合するスタイル指示を毎ターン注入する環境でもドリフト防止

### Statusline バッジ
現モードを `[原始人]` / `[原始人:丁寧]` / `[原始人:極限]` / `[原始人:コミット]` 等で可視化。初回セッションで未設定を検知したら Claude がセットアップを提案する。

### 既定モードの設定（任意）

優先度: 環境変数 > 設定ファイル > `normal`（デフォルト）。

```bash
# 環境変数（最優先）
export GENSHIJIN_DEFAULT_MODE=extreme   # polite | normal | extreme | off

# 設定ファイル
mkdir -p ~/.config/genshijin
cat > ~/.config/genshijin/config.json <<'JSON'
{ "defaultMode": "extreme" }
JSON
```

`off` を指定するとフックがルール注入をスキップしフラグも削除 — プラグインインストール済みのまま一時停止できる。

### セキュリティ

フラグファイル `~/.claude/.genshijin-active` は symlink 拒否・64バイト上限・モードホワイトリスト検証で保護。`~/.ssh/id_rsa` 等への symlink 差替えで secret バイトが statusline やモデルコンテキストに流れ込む攻撃を塞ぐ。

## スラッシュコマンド（v1.3.0〜）

プラグイン導入後、以下のコマンドが利用可能。

- `/genshijin 丁寧|通常|極限` — 強度レベル切替
- `/genshijin-commit` — 現在のステージング変更から簡潔なコミットメッセージ生成（Conventional Commits）
- `/genshijin-review` — 現在のコード変更を1行1指摘でレビュー（`L42: 🔴 バグ: ...`）
- `/genshijin-stats` (v1.4.0〜) — 現セッションのリアルトークン使用量＋推定削減量＋USD換算をフックが即時表示。`--share` ツイート用1行サマリ、`--all` / `--since 7d` ライフタイム集計対応

定義は [packages/skill-claude/commands/](./packages/skill-claude/commands/) 配下。

## v1.4.0 拡張機能

caveman 本家 v1.3.0以降の差分（stats receipts / smart installer / cavecrew相当 / cavepack相当 / MCP-shrink）を全項目移植。

### Smart multi-agent installer — root `install.sh` / `install.ps1`

Claude Code/Cursor/Windsurf/Cline/Copilot を自動検出し、各 agent に native install。

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/install.sh | bash

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/install.ps1 | iex
```

`--dry-run` / `--force` / `--only <agent>` / `--all` / `--minimal` / `--list` 対応。再実行安全。

### genshijin-init — per-repo rule 一発投下

1コマンドで対象 repo に常時有効化 rule を全 IDE agent 用に投下。idempotent。

```bash
npx -y https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/tools/genshijin-init.js
```

Cursor / Windsurf / Cline / Copilot / AGENTS.md 用 rule file 生成。`--dry-run` / `--force` / `--only` 対応。

### genshijin-shrink — MCP middleware

任意の MCP server を wrap → `tools/list` の `description` field を圧縮。コード/URL/パス/識別子は byte-for-byte 保護。

```jsonc
{
  "mcpServers": {
    "fs-shrunk": {
      "command": "npx",
      "args": ["genshijin-shrink", "npx", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  }
}
```

詳細は [mcp-servers/genshijin-shrink/README.md](./mcp-servers/genshijin-shrink/README.md)。

### genshijin-crew — 3 subagent preset

長セッションでコンテキストを温存するための subagent 3種。

| Subagent | 用途 |
|----------|------|
| `genshijin-investigator` | read-only locator (haiku model)、`file:line` 表で返却 |
| `genshijin-builder` | 1-2ファイル surgical edit。3+ファイルは `too-big.` で拒否 |
| `genshijin-reviewer` | severity-tagged finding (🔴bug / 🟡risk / 🔵nit / ❓question) |

委譲判断ガイドは [packages/skill-claude/skills/genshijin-crew/SKILL.md](./packages/skill-claude/skills/genshijin-crew/SKILL.md)。

## マルチエージェント対応（v1.3.0〜）

Claude Code 以外の AI コーディングエージェントでも原始人モード利用可能:

| エージェント | ファイル |
|-------------|---------|
| Cursor | [.cursor/rules/genshijin.mdc](./.cursor/rules/genshijin.mdc) |
| Windsurf | [.windsurf/rules/genshijin.md](./.windsurf/rules/genshijin.md) |
| Cline | [.clinerules/genshijin.md](./.clinerules/genshijin.md) |
| GitHub Copilot | [.github/copilot-instructions.md](./.github/copilot-instructions.md) |
| Codex / Gemini CLI 等 | [AGENTS.md](./AGENTS.md) |
| フック無し共通 | [rules/genshijin-activate.md](./rules/genshijin-activate.md) |

## Standalone インストーラ（v1.3.0〜）

プラグイン未使用でも `~/.claude` 配下に直接フックを導入可能。

```bash
# インストール
bash packages/skill-claude/hooks/install.sh

# 再インストール
bash packages/skill-claude/hooks/install.sh --force

# アンインストール
bash packages/skill-claude/hooks/uninstall.sh
```

Windows は `packages/skill-claude/hooks/install.ps1` / `packages/skill-claude/hooks/uninstall.ps1`。`settings.json` への安全マージ（既存 statusline を尊重）。

## アップデート

### プラグイン版（推奨）

```bash
# マーケットプレイス側を最新取得
claude plugin marketplace update genshijin

# プラグイン本体を更新（再起動で適用）
claude plugin update genshijin@genshijin
```

Claude Code 内の `/plugin update genshijin` が使える環境ではそれでも可。インストール済バージョン確認は `claude plugin list`。

### Standalone 版

```bash
cd /path/to/genshijin
git pull
bash packages/skill-claude/hooks/install.sh --force   # Windows: packages/skill-claude/hooks/install.ps1 -Force
```

### npx skills 版

```bash
npx skills add InterfaceX-co-jp/genshijin   # 上書き再取得
```

## ベンチマーク

<!-- BENCHMARK_START -->
| タスク | 通常 | 簡潔 | caveman | genshijin | genshijin削減 | gs vs 簡潔 | gs vs caveman |
|--------|------|------|---------|-----------|---------------|-----------|---------------|
| なぜReactコンポーネントが毎回再レンダリングされるのか説 | 1237 | 593 | 319 | 233 | 81% | 61% | 27% |
| 認証ミドルウェアのトークン有効期限チェックにバグがある。修正 | 2086 | 985 | 332 | 195 | 91% | 80% | 41% |
| Node.jsでPostgreSQLのコネクションプーリング | 2050 | 1389 | 854 | 397 | 81% | 71% | 54% |
| git rebaseとmergeの違いを説明して | 705 | 434 | 312 | 237 | 66% | 45% | 24% |
| コールバック地獄をasync/awaitにリファクタリングし | 1768 | 679 | 546 | 332 | 81% | 51% | 39% |
| マイクロサービスとモノリスの比較を説明して | 1197 | 484 | 371 | 306 | 74% | 37% | 18% |
| ExpressルートのPRをセキュリティ観点でレビューして | 1214 | 596 | 349 | 126 | 90% | 79% | 64% |
| Dockerのマルチステージビルドを設定して | 1667 | 463 | 357 | 190 | 89% | 59% | 47% |
| PostgreSQLのレースコンディションをデバッグして | 1790 | 1192 | 510 | 389 | 78% | 67% | 24% |
| ReactのError Boundaryを実装して | 2791 | 1963 | 737 | 276 | 90% | 86% | 63% |
| CORSエラーが出る。原因と解決策を教えて | 1105 | 494 | 387 | 284 | 74% | 43% | 27% |
| Nginxのリバースプロキシ設定を教えて | 1790 | 750 | 408 | 320 | 82% | 57% | 22% |
| Redisを使ったキャッシュ戦略を教えて | 2181 | 1085 | 688 | 354 | 84% | 67% | 49% |
| TypeScriptのジェネリクスを初心者向けに説明して | 1240 | 763 | 573 | 444 | 64% | 42% | 23% |
| REST APIとGraphQLの違いを説明して | 856 | 441 | 457 | 340 | 60% | 23% | 26% |
| Node.jsアプリのメモリリークを調査する方法を教えて | 1794 | 1316 | 590 | 373 | 79% | 72% | 37% |
| GitHub Actionsで基本的なCI/CDパイプライン | 2206 | 1274 | 674 | 601 | 73% | 53% | 11% |
| N+1クエリ問題とは何か、どう解決するか教えて | 1033 | 562 | 391 | 351 | 66% | 38% | 10% |
| WebSocketとServer-Sent Eventsの使 | 1159 | 475 | 489 | 179 | 85% | 62% | 63% |
| Reactの状態管理ライブラリの選び方を教えて | 1185 | 493 | 398 | 333 | 72% | 32% | 16% |
| Kubernetesの基本概念を説明して | 658 | 442 | 338 | 264 | 60% | 40% | 22% |
| OAuth2の認証フローを説明して | 1495 | 520 | 520 | 290 | 81% | 44% | 44% |
| CSS FlexboxとGridの使い分けを教えて | 1159 | 450 | 321 | 286 | 75% | 36% | 11% |
| Pythonのデコレータの仕組みを説明して | 1370 | 584 | 517 | 342 | 75% | 41% | 34% |
| データベースインデックスの仕組みと使いどころを教えて | 1410 | 504 | 550 | 335 | 76% | 34% | 39% |
| JWTとセッションベース認証の比較を教えて | 1265 | 452 | 463 | 345 | 73% | 24% | 25% |
| Promise.allとPromise.raceの違いと使い | 1207 | 573 | 450 | 326 | 73% | 43% | 28% |
| TerraformでAWSインフラを管理する基本を教えて | 2284 | 822 | 724 | 458 | 80% | 44% | 37% |
| Node.jsのイベントループの仕組みを説明して | 1438 | 455 | 706 | 343 | 76% | 25% | 51% |
| APIのレート制限を実装する方法を教えて | 2006 | 1413 | 613 | 406 | 80% | 71% | 34% |
| **平均** | **1511** | **754** | **498** | **321** | **79%** | **57%** | **35%** |
<!-- BENCHMARK_END -->

### English Benchmark (参考値)

genshijin は日本語最適化スキルだが、英語プロンプトでも圧縮効果を発揮するか検証。caveman（英語ネイティブ）との比較。

<!-- BENCHMARK_EN_START -->
| Task | Normal | Terse | caveman | genshijin | gs saved | gs vs terse | gs vs caveman |
|------|--------|-------|---------|-----------|----------|-------------|---------------|
| Why does my React component re | 914 | 692 | 228 | 120 | 87% | 83% | 47% |
| There's a bug in the auth midd | 728 | 593 | 86 | 151 | 79% | 75% | -76% |
| How do I set up PostgreSQL con | 2344 | 1374 | 338 | 327 | 86% | 76% | 3% |
| Explain the difference between | 688 | 399 | 298 | 206 | 70% | 48% | 31% |
| Refactor callback hell to asyn | 2026 | 1822 | 394 | 272 | 87% | 85% | 31% |
| Compare microservices vs monol | 785 | 517 | 322 | 387 | 51% | 25% | -20% |
| Review this Express route PR f | 193 | 165 | 83 | 76 | 61% | 54% | 8% |
| Set up Docker multi-stage buil | 2396 | 1658 | 238 | 343 | 86% | 79% | -44% |
| Debug a race condition in Post | 2097 | 1924 | 354 | 295 | 86% | 85% | 17% |
| Implement a React Error Bounda | 3363 | 2672 | 478 | 374 | 89% | 86% | 22% |
| I'm getting CORS errors. What' | 1463 | 495 | 257 | 227 | 84% | 54% | 12% |
| Show me how to configure Nginx | 2802 | 2240 | 438 | 286 | 90% | 87% | 35% |
| What's a good Redis caching st | 1552 | 702 | 304 | 263 | 83% | 63% | 13% |
| Explain TypeScript generics fo | 1387 | 1140 | 388 | 419 | 70% | 63% | -8% |
| Explain the difference between | 601 | 415 | 240 | 233 | 61% | 44% | 3% |
| How do I investigate memory le | 2153 | 1704 | 359 | 356 | 83% | 79% | 1% |
| Build a basic CI/CD pipeline w | 3023 | 2501 | 619 | 749 | 75% | 70% | -21% |
| What is the N+1 query problem  | 1377 | 770 | 324 | 275 | 80% | 64% | 15% |
| When should I use WebSocket vs | 746 | 399 | 276 | 253 | 66% | 37% | 8% |
| How do I choose a React state  | 1275 | 617 | 242 | 190 | 85% | 69% | 21% |
| Explain the basic concepts of  | 837 | 442 | 306 | 282 | 66% | 36% | 8% |
| Explain the OAuth2 authenticat | 1449 | 545 | 304 | 305 | 79% | 44% | 0% |
| When should I use CSS Flexbox  | 601 | 410 | 224 | 193 | 68% | 53% | 14% |
| Explain how Python decorators  | 1489 | 742 | 395 | 359 | 76% | 52% | 9% |
| Explain how database indexes w | 1629 | 1262 | 378 | 371 | 77% | 71% | 2% |
| Compare JWT vs session-based a | 1463 | 543 | 237 | 319 | 78% | 41% | -35% |
| Explain the difference between | 686 | 533 | 216 | 248 | 64% | 53% | -15% |
| How do I manage AWS infrastruc | 2479 | 1854 | 628 | 397 | 84% | 79% | 37% |
| Explain how the Node.js event  | 1458 | 838 | 311 | 411 | 72% | 51% | -32% |
| How do I implement API rate li | 2814 | 1855 | 561 | 403 | 86% | 78% | 28% |
| **Average** | **1560** | **1060** | **327** | **303** | **81%** | **71%** | **7%** |
<!-- BENCHMARK_EN_END -->

> ベンチマークは英語版 [caveman](https://github.com/JuliusBrussee/caveman) の結果を参考値として掲載。
> 自分で計測するには:

```bash
cd benchmarks
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python run.py --trials 3 --update-readme              # 日本語
python run.py --lang en --trials 3 --update-readme     # 英語
```

## 安全機能

セキュリティ警告や破壊的操作の確認時は自動的に通常の丁寧な日本語に切り替わる。誤解が致命的になる場面では正確性を優先。

## プロジェクト構成

v2.0.0 以降は monorepo (pnpm workspaces) 化。Claude Code skill は `packages/skill-claude/` 配下に集約。

```
genshijin/
├── packages/
│   └── skill-claude/                       # Claude Code plugin (本体)
│       ├── .claude-plugin/
│       │   └── plugin.json                 # plugin マニフェスト（hooks 登録）
│       ├── skills/
│       │   ├── genshijin/SKILL.md          # 本体スキル
│       │   ├── genshijin-commit/SKILL.md   # コミット生成サブスキル
│       │   ├── genshijin-review/SKILL.md   # PRレビューサブスキル
│       │   ├── genshijin-help/SKILL.md     # ヘルプサブスキル
│       │   ├── genshijin-stats/SKILL.md    # 統計表示サブスキル
│       │   ├── genshijin-crew/SKILL.md     # 委譲ガイド
│       │   └── genshijin-compress/
│       │       ├── SKILL.md                # メモリ圧縮サブスキル
│       │       └── scripts/                # Python CLI 実装
│       ├── hooks/                          # SessionStart / UserPromptSubmit + statusline
│       │   ├── genshijin-activate.js
│       │   ├── genshijin-mode-tracker.js
│       │   ├── genshijin-config.js
│       │   ├── genshijin-stats.js
│       │   ├── genshijin-statusline.sh
│       │   ├── genshijin-statusline.ps1
│       │   ├── install.sh / uninstall.sh
│       │   └── install.ps1 / uninstall.ps1
│       ├── commands/                       # スラッシュコマンド定義
│       │   ├── genshijin.toml
│       │   ├── genshijin-commit.toml
│       │   ├── genshijin-review.toml
│       │   └── genshijin-stats.toml
│       └── agents/                         # subagent preset
│           ├── genshijin-investigator.md
│           ├── genshijin-builder.md
│           └── genshijin-reviewer.md
├── rules/                                  # フック無しプラットフォーム向け共通ルール
│   └── genshijin-activate.md
├── tools/                                  # マルチエージェント installer 補助
│   └── genshijin-init.js
├── mcp-servers/                            # MCP middleware
│   └── genshijin-shrink/
├── .claude-plugin/
│   └── marketplace.json                    # マーケットプレイス定義（pluginRoot: ./packages）
├── benchmarks/
│   ├── run.py
│   ├── prompts.json
│   └── requirements.txt
├── docs/
│   ├── index.html                          # GitHub Pages
│   ├── caveman-diff-analysis.md            # caveman差分分析
│   ├── v2-monorepo-migration-plan.md       # v2.0.0 移行計画
│   └── v2-progress.md                      # v2.0.0 進捗
├── install.sh / install.ps1                # smart multi-agent installer (root)
├── pnpm-workspace.yaml
├── package.json
├── README.md
├── LICENSE
└── .gitignore
```

## 元プロジェクト

[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) — 英語版オリジナル

## Star History

<a href="https://www.star-history.com/?repos=InterfaceX-co-jp%2Fgenshijin&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=InterfaceX-co-jp/genshijin&type=date&theme=dark&legend=top-left&cb=v1.3.0" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=InterfaceX-co-jp/genshijin&type=date&legend=top-left&cb=v1.3.0" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=InterfaceX-co-jp/genshijin&type=date&legend=top-left&cb=v1.3.0" />
 </picture>
</a>

## ライセンス

MIT
