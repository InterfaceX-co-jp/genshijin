# genshijin 原始人 🗿

> なぜ多くトークン使う？少なくて済む🗿

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

### 方法1: Claude Code プラグイン（推奨）

Claude Code 内で以下を実行:

```
/plugin install genshijin@InterfaceX-co-jp/genshijin
claude plugin marketplace add InterfaceX-co-jp/genshijin
```

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
  https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/skills/genshijin/SKILL.md
```

**グローバル**（すべてのプロジェクトに適用）:

```bash
mkdir -p ~/.claude/skills/genshijin
curl -o ~/.claude/skills/genshijin/SKILL.md \
  https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/skills/genshijin/SKILL.md
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

本体 `/genshijin` に加え、用途別サブスキル4個同梱。

| スキル | トリガー | 内容 |
|--------|---------|------|
| **genshijin-commit** | `/genshijin-commit` | Conventional Commits 形式の簡潔コミットメッセージ。件名≤50文字、「なぜ」重視 |
| **genshijin-review** | `/genshijin-review` | 1行PRコメント `L42: 🔴 バグ: user null。ガード追加。` |
| **genshijin-compress** | `/genshijin-compress <file>` | `CLAUDE.md` 等のメモリファイルを原始人モード化し入力トークン永続削減 |
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

定義は [commands/](./commands/) 配下。

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
bash hooks/install.sh

# 再インストール
bash hooks/install.sh --force

# アンインストール
bash hooks/uninstall.sh
```

Windows は `hooks/install.ps1` / `hooks/uninstall.ps1`。`settings.json` への安全マージ（既存 statusline を尊重）。

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
bash hooks/install.sh --force   # Windows: hooks/install.ps1 -Force
```

### npx skills 版

```bash
npx skills add InterfaceX-co-jp/genshijin   # 上書き再取得
```

## ベンチマーク

<!-- BENCHMARK_START -->
| タスク | 通常 | caveman | genshijin | caveman削減 | genshijin削減 | genshijin vs caveman |
|--------|------|---------|-----------|------------|-------------|---------------------|
| なぜReactコンポーネントが毎回再レンダリングされるのか説 | 1415 | 341 | 181 | 76% | 87% | 47% |
| 認証ミドルウェアのトークン有効期限チェックにバグがある。修正 | 1721 | 199 | 91 | 88% | 95% | 54% |
| Node.jsでPostgreSQLのコネクションプーリング | 2107 | 539 | 324 | 74% | 85% | 40% |
| git rebaseとmergeの違いを説明して | 822 | 317 | 177 | 61% | 78% | 44% |
| コールバック地獄をasync/awaitにリファクタリングし | 1468 | 469 | 302 | 68% | 79% | 36% |
| マイクロサービスとモノリスの比較を説明して | 1004 | 432 | 266 | 57% | 74% | 38% |
| ExpressルートのPRをセキュリティ観点でレビューして | 1307 | 278 | 142 | 79% | 89% | 49% |
| Dockerのマルチステージビルドを設定して | 1391 | 354 | 202 | 75% | 85% | 43% |
| PostgreSQLのレースコンディションをデバッグして | 1680 | 618 | 362 | 63% | 78% | 41% |
| ReactのError Boundaryを実装して | 2621 | 443 | 257 | 83% | 90% | 42% |
| CORSエラーが出る。原因と解決策を教えて | 1038 | 389 | 293 | 63% | 72% | 25% |
| Nginxのリバースプロキシ設定を教えて | 1692 | 499 | 311 | 71% | 82% | 38% |
| Redisを使ったキャッシュ戦略を教えて | 2079 | 653 | 325 | 69% | 84% | 50% |
| TypeScriptのジェネリクスを初心者向けに説明して | 1151 | 566 | 480 | 51% | 58% | 15% |
| REST APIとGraphQLの違いを説明して | 783 | 366 | 276 | 53% | 65% | 25% |
| Node.jsアプリのメモリリークを調査する方法を教えて | 1663 | 738 | 368 | 56% | 78% | 50% |
| GitHub Actionsで基本的なCI/CDパイプライン | 2209 | 953 | 445 | 57% | 80% | 53% |
| N+1クエリ問題とは何か、どう解決するか教えて | 1063 | 396 | 335 | 63% | 68% | 15% |
| WebSocketとServer-Sent Eventsの使 | 1316 | 449 | 244 | 66% | 81% | 46% |
| Reactの状態管理ライブラリの選び方を教えて | 993 | 408 | 254 | 59% | 74% | 38% |
| Kubernetesの基本概念を説明して | 826 | 437 | 295 | 47% | 64% | 32% |
| OAuth2の認証フローを説明して | 1387 | 451 | 252 | 67% | 82% | 44% |
| CSS FlexboxとGridの使い分けを教えて | 1092 | 367 | 345 | 66% | 68% | 6% |
| Pythonのデコレータの仕組みを説明して | 1703 | 527 | 279 | 69% | 84% | 47% |
| データベースインデックスの仕組みと使いどころを教えて | 1305 | 489 | 305 | 63% | 77% | 38% |
| JWTとセッションベース認証の比較を教えて | 814 | 404 | 269 | 50% | 67% | 33% |
| Promise.allとPromise.raceの違いと使い | 1185 | 476 | 301 | 60% | 75% | 37% |
| TerraformでAWSインフラを管理する基本を教えて | 1924 | 489 | 389 | 75% | 80% | 20% |
| Node.jsのイベントループの仕組みを説明して | 1298 | 648 | 387 | 50% | 70% | 40% |
| APIのレート制限を実装する方法を教えて | 2098 | 715 | 560 | 66% | 73% | 22% |
| **平均** | **1438** | **480** | **300** | **67%** | **79%** | **37%** |
<!-- BENCHMARK_END -->

### English Benchmark (参考値)

genshijin は日本語最適化スキルだが、英語プロンプトでも圧縮効果を発揮するか検証。caveman（英語ネイティブ）との比較。

<!-- BENCHMARK_EN_START -->
| Task | Normal | caveman | genshijin | caveman saved | genshijin saved | genshijin vs caveman |
|------|--------|---------|-----------|--------------|----------------|---------------------|
| Why does my React component re | 1318 | 275 | 112 | 79% | 92% | 59% |
| There's a bug in the auth midd | 877 | 84 | 41 | 90% | 95% | 51% |
| How do I set up PostgreSQL con | 2371 | 298 | 282 | 87% | 88% | 5% |
| Explain the difference between | 516 | 245 | 233 | 53% | 55% | 5% |
| Refactor callback hell to asyn | 2093 | 364 | 270 | 83% | 87% | 26% |
| Compare microservices vs monol | 853 | 331 | 314 | 61% | 63% | 5% |
| Review this Express route PR f | 190 | 47 | 48 | 75% | 75% | -2% |
| Set up Docker multi-stage buil | 2105 | 341 | 311 | 84% | 85% | 9% |
| Debug a race condition in Post | 2113 | 365 | 248 | 83% | 88% | 32% |
| Implement a React Error Bounda | 3196 | 400 | 253 | 87% | 92% | 37% |
| I'm getting CORS errors. What' | 1382 | 260 | 258 | 81% | 81% | 1% |
| Show me how to configure Nginx | 3151 | 462 | 300 | 85% | 90% | 35% |
| What's a good Redis caching st | 1538 | 270 | 255 | 82% | 83% | 6% |
| Explain TypeScript generics fo | 1621 | 632 | 384 | 61% | 76% | 39% |
| Explain the difference between | 614 | 266 | 209 | 57% | 66% | 21% |
| How do I investigate memory le | 2099 | 473 | 337 | 77% | 84% | 29% |
| Build a basic CI/CD pipeline w | 3168 | 537 | 385 | 83% | 88% | 28% |
| What is the N+1 query problem  | 1080 | 328 | 337 | 70% | 69% | -3% |
| When should I use WebSocket vs | 646 | 189 | 215 | 71% | 67% | -14% |
| How do I choose a React state  | 1057 | 232 | 185 | 78% | 82% | 20% |
| Explain the basic concepts of  | 855 | 346 | 296 | 60% | 65% | 14% |
| Explain the OAuth2 authenticat | 1594 | 426 | 321 | 73% | 80% | 25% |
| When should I use CSS Flexbox  | 575 | 234 | 213 | 59% | 63% | 9% |
| Explain how Python decorators  | 1588 | 357 | 368 | 78% | 77% | -3% |
| Explain how database indexes w | 1624 | 346 | 295 | 79% | 82% | 15% |
| Compare JWT vs session-based a | 1068 | 257 | 260 | 76% | 76% | -1% |
| Explain the difference between | 729 | 170 | 229 | 77% | 69% | -35% |
| How do I manage AWS infrastruc | 2603 | 571 | 373 | 78% | 86% | 35% |
| Explain how the Node.js event  | 1406 | 404 | 319 | 71% | 77% | 21% |
| How do I implement API rate li | 2147 | 320 | 286 | 85% | 87% | 11% |
| **Average** | **1539** | **327** | **264** | **79%** | **83%** | **19%** |
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

```
genshijin/
├── skills/
│   ├── genshijin/SKILL.md            # 本体スキル
│   ├── genshijin-commit/SKILL.md     # コミット生成サブスキル
│   ├── genshijin-review/SKILL.md     # PRレビューサブスキル
│   ├── genshijin-help/SKILL.md       # ヘルプサブスキル
│   └── genshijin-compress/
│       ├── SKILL.md                  # メモリ圧縮サブスキル
│       └── scripts/                  # Python CLI 実装
├── hooks/                            # v1.2.0〜
│   ├── genshijin-activate.js         # SessionStart: ルール注入
│   ├── genshijin-mode-tracker.js     # UserPromptSubmit: モード追跡 + 毎ターン補強
│   ├── genshijin-config.js           # 設定解決（env var + config file）
│   ├── genshijin-statusline.sh       # statusline バッジ（Unix）
│   ├── genshijin-statusline.ps1      # statusline バッジ（Windows）
│   ├── install.sh / uninstall.sh     # standalone インストーラ（v1.3.0〜）
│   └── install.ps1 / uninstall.ps1   # standalone インストーラ Windows
├── commands/                         # v1.3.0〜スラッシュコマンド定義
│   ├── genshijin.toml                # /genshijin 強度切替
│   ├── genshijin-commit.toml         # /genshijin-commit
│   └── genshijin-review.toml         # /genshijin-review
├── rules/                            # v1.3.0〜
│   └── genshijin-activate.md         # フック無しプラットフォーム向け共通ルール
├── .cursor/rules/                    # Cursor 用（v1.3.0〜）
├── .windsurf/rules/                  # Windsurf 用（v1.3.0〜）
├── .clinerules/                      # Cline 用（v1.3.0〜）
├── .github/copilot-instructions.md   # GitHub Copilot 用（v1.3.0〜）
├── AGENTS.md                         # マルチエージェント参照インデックス（v1.3.0〜）
├── .claude-plugin/
│   ├── plugin.json                   # Claude Code プラグインマニフェスト（hooks 登録）
│   └── marketplace.json              # マーケットプレイス定義
├── benchmarks/
│   ├── run.py                        # ベンチマークスクリプト
│   ├── prompts.json                  # テスト用プロンプト
│   └── requirements.txt              # Python依存パッケージ
├── docs/
│   ├── index.html                    # GitHub Pages
│   └── caveman-diff-analysis.md      # caveman差分分析 + 進捗管理
├── README.md
├── LICENSE
└── .gitignore
```

## 元プロジェクト

[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) — 英語版オリジナル

## Star History

<a href="https://www.star-history.com/?repos=InterfaceX-co-jp%2Fgenshijin&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=InterfaceX-co-jp/genshijin&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=InterfaceX-co-jp/genshijin&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=InterfaceX-co-jp/genshijin&type=date&legend=top-left" />
 </picture>
</a>

## ライセンス

MIT
