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

`CLAUDE.md` はセッション開始毎に読み込まれる。圧縮すると **毎回** の入力トークンが減る。

```bash
/genshijin-compress CLAUDE.md
```

- 圧縮版が `CLAUDE.md` を上書き、人間可読版は `CLAUDE.original.md` にバックアップ
- コードブロック・URL・ファイルパス・数値・見出しは完全保持
- 機密ファイル（`.env`, `credentials.*`, `id_rsa`, `.ssh/` 配下等）は自動拒否
- Python 3.10+ と `ANTHROPIC_API_KEY` または `claude` CLI が必要

## ベンチマーク

<!-- BENCHMARK_START -->
| タスク | 通常 | caveman | genshijin | caveman削減 | genshijin削減 | genshijin vs caveman |
|--------|------|---------|-----------|------------|-------------|---------------------|
| なぜReactコンポーネントが毎回再レンダリングされるのか説 | 1223 | 251 | 180 | 79% | 85% | 28% |
| 認証ミドルウェアのトークン有効期限チェックにバグがある。修正 | 1710 | 231 | 111 | 86% | 94% | 52% |
| Node.jsでPostgreSQLのコネクションプーリング | 2043 | 462 | 335 | 77% | 84% | 27% |
| git rebaseとmergeの違いを説明して | 720 | 291 | 225 | 60% | 69% | 23% |
| コールバック地獄をasync/awaitにリファクタリングし | 1711 | 461 | 275 | 73% | 84% | 40% |
| マイクロサービスとモノリスの比較を説明して | 1043 | 464 | 260 | 56% | 75% | 44% |
| ExpressルートのPRをセキュリティ観点でレビューして | 1329 | 260 | 103 | 80% | 92% | 60% |
| Dockerのマルチステージビルドを設定して | 1454 | 412 | 194 | 72% | 87% | 53% |
| PostgreSQLのレースコンディションをデバッグして | 1771 | 529 | 341 | 70% | 81% | 36% |
| ReactのError Boundaryを実装して | 2965 | 466 | 277 | 84% | 91% | 41% |
| CORSエラーが出る。原因と解決策を教えて | 799 | 362 | 216 | 55% | 73% | 40% |
| Nginxのリバースプロキシ設定を教えて | 1969 | 418 | 366 | 79% | 81% | 12% |
| Redisを使ったキャッシュ戦略を教えて | 2098 | 633 | 321 | 70% | 85% | 49% |
| TypeScriptのジェネリクスを初心者向けに説明して | 1261 | 668 | 366 | 47% | 71% | 45% |
| REST APIとGraphQLの違いを説明して | 885 | 400 | 313 | 55% | 65% | 22% |
| Node.jsアプリのメモリリークを調査する方法を教えて | 1832 | 584 | 319 | 68% | 83% | 45% |
| GitHub Actionsで基本的なCI/CDパイプライン | 2339 | 1079 | 431 | 54% | 82% | 60% |
| N+1クエリ問題とは何か、どう解決するか教えて | 1265 | 523 | 349 | 59% | 72% | 33% |
| WebSocketとServer-Sent Eventsの使 | 1079 | 480 | 262 | 56% | 76% | 45% |
| Reactの状態管理ライブラリの選び方を教えて | 901 | 363 | 242 | 60% | 73% | 33% |
| Kubernetesの基本概念を説明して | 928 | 415 | 228 | 55% | 75% | 45% |
| OAuth2の認証フローを説明して | 1116 | 425 | 300 | 62% | 73% | 29% |
| CSS FlexboxとGridの使い分けを教えて | 1059 | 333 | 295 | 69% | 72% | 11% |
| Pythonのデコレータの仕組みを説明して | 1395 | 449 | 306 | 68% | 78% | 32% |
| データベースインデックスの仕組みと使いどころを教えて | 1631 | 517 | 257 | 68% | 84% | 50% |
| JWTとセッションベース認証の比較を教えて | 1401 | 349 | 274 | 75% | 80% | 21% |
| Promise.allとPromise.raceの違いと使い | 1236 | 436 | 352 | 65% | 72% | 19% |
| TerraformでAWSインフラを管理する基本を教えて | 1345 | 568 | 383 | 58% | 72% | 33% |
| Node.jsのイベントループの仕組みを説明して | 1287 | 845 | 277 | 34% | 78% | 67% |
| APIのレート制限を実装する方法を教えて | 1819 | 805 | 616 | 56% | 66% | 23% |
| **平均** | **1453** | **482** | **292** | **67%** | **80%** | **39%** |
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
├── .claude-plugin/
│   ├── plugin.json                   # Claude Code プラグインマニフェスト
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
