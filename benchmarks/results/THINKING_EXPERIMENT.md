# genshijin × Extended Thinking 実験結果

## 目的

genshijin（原始人モード）の圧縮指示が Claude の extended thinking（内部推論）にも適用されるか、また精度維持しつつ圧縮できるか検証する。

## 実験条件

- **モデル**: `claude-sonnet-4-5-20250929`
- **言語**: ja
- **試行回数**: 1（予備実験）
- **プロンプト**: 2件（解説系・デバッグ系）
- **採点**: LLM-as-judge (`claude-sonnet-4-5-20250929`) で accuracy / completeness を 0-10 採点
- **条件**: thinking無効 / budget=2000 / budget=4000 の3条件

## 生データ

### 条件A: thinking 無効（従来どおり）

| プロンプト | モード | 合計出力 | 思考 | 回答 | 精度 | 完全性 |
|---|---|---|---|---|---|---|
| git rebase vs merge | normal | 554 | 0 | 554 | 9 | 8 |
| | caveman | 432 | 0 | 432 | 9 | 9 |
| | **genshijin** | **241** | 0 | 241 | 9 | 7 |
| postgres race condition | normal | 2078 | 0 | 2078 | 9 | 10 |
| | caveman | 1013 | 0 | 1013 | 9 | 8 |
| | **genshijin** | **160** | 0 | 160 | 7 | **3** |

**平均削減率**: caveman 45% / **genshijin 85%**

### 条件B: thinking budget=2000

| プロンプト | モード | 合計出力 | 思考 | 回答 | 精度 | 完全性 |
|---|---|---|---|---|---|---|
| git rebase vs merge | normal | 802 | 102 | 700 | 9 | 10 |
| | caveman | 615 | 274 | 341 | 9 | 8 |
| | **genshijin** | **744** | **386** | 358 | 9 | 7 |
| postgres race condition | normal | 2110 | 95 | 2015 | 9 | 10 |
| | caveman | 1143 | 258 | 885 | 9 | 7 |
| | **genshijin** | **386** | **287** | 99 | 7 | **2** |

**平均削減率**: caveman 40% / **genshijin 61%** ← 思考有効で悪化

### 条件C: thinking budget=4000

| プロンプト | モード | 合計出力 | 思考 | 回答 | 精度 | 完全性 |
|---|---|---|---|---|---|---|
| git rebase vs merge | normal | 820 | 104 | 716 | 10 | 10 |
| | caveman | 764 | 343 | 421 | 9 | 8 |
| | **genshijin** | **704** | 326 | 378 | 9 | 7 |
| postgres race condition | normal | 1470 | 45 | 1425 | 9 | 10 |
| | caveman | 757 | 183 | 574 | 9 | 7 |
| | **genshijin** | **493** | 221 | 272 | 8 | **6** |

**平均削減率**: caveman 34% / **genshijin 48%** ← さらに悪化

## 主な発見

### 1. 思考トークンは圧縮指示の影響を強く受ける（想定と逆）

genshijin は思考トークンを **増やす** 傾向がある:

| 条件 | normal 思考 | genshijin 思考 | 増加率 |
|---|---|---|---|
| budget=2000, git rebase | 102 | 386 | +278% |
| budget=2000, postgres | 95 | 287 | +202% |
| budget=4000, git rebase | 104 | 326 | +213% |
| budget=4000, postgres | 45 | 221 | +391% |

**仮説**: genshijin指示は通常と異なる出力スタイルを強いるため、モデルが「どう圧縮するか」を内部で考える分、思考トークンが増える。つまりシステムプロンプトは**思考の量**に明確に影響する。

### 2. 思考内容そのものは原始人化しない（推定）

思考トークン数は増えたが、思考テキストの文字数あたりの情報密度は測定外。ただし Anthropic の仕様上、思考ブロックは通常の自然言語で、system promptで強く制御できない設計。

### 3. 思考有効時、genshijin の圧縮メリットが減る

| 条件 | genshijin 削減率 |
|---|---|
| thinking無効 | **85%** |
| budget=2000 | 61% |
| budget=4000 | 48% |

理由: 回答本体は圧縮されても、思考トークンが追加でかかるため総計でのメリットが目減り。

### 4. 複雑質問での完全性崩壊は「思考 budget を増やすと回復」

| プロンプト | 条件 | genshijin 完全性 |
|---|---|---|
| postgres-race | thinking無効 | 3/10 |
| postgres-race | budget=2000 | 2/10 |
| postgres-race | budget=4000 | **6/10** |

thinking budget が小さいと「圧縮しようとして重要情報も落とす」が、budget十分あれば思考で論点を整理でき、短い回答でも要点を押さえられる。

### 5. 簡単な質問では精度維持しつつ圧縮できる

git rebase vs merge は全条件で精度 9/10、完全性 7/10 をキープ。完全性 3 ポイントの差は「網羅度」で、実用上は許容範囲。

## 実務への示唆

### グローバル CLAUDE.md への genshijin 導入判断

- **推奨される使用場面**
  - 簡単な解説・コマンド確認・単純なコード片
  - 明確な正解がある技術質問
  - トークン削減が金額的に重要な大量リクエスト

- **注意すべき場面**
  - 複雑なデバッグ・アーキテクチャ設計
  - 情報網羅性が必要な質問（「全部のパターン教えて」等）
  - extended thinking モデル使用時は効果が目減り（85% → 48%）

### 使い分け戦略

1. **通常用途**: genshijin + thinking無効 で 85% 削減、精度許容
2. **複雑用途**: 通常モード + thinking有効 で情報網羅性優先
3. **折衷**: genshijin + thinking budget 4000+ で完全性6以上を狙う

### モデル選択の観点

- **Sonnet 4.5 / Opus 4.x（思考モデル）**: thinking 自動有効化されがち → genshijin の恩恵半減
- **旧 Sonnet 4（`claude-sonnet-4-20250514`）**: thinking なし → genshijin 85% 削減を最大活用

## 限界

1. **trial=1** — 統計的有意性なし、傾向把握のみ
2. **prompts=2** — カテゴリ網羅性不足
3. **思考文字数は測定したが、トークンは按分推定** — Claude公式の thinking_tokens 個別計上APIは未使用
4. **judge が同一モデル** — 自己採点バイアス可能性

## 次の実験候補

- **trials=3 × prompts=10** で統計有意性確保（コスト ~60倍）
- **judge を Opus 4.x に** してバイアス低減
- **思考内容テキストの定性分析** — 原始人化しているか / 論理構造は維持されているか
- **複雑度別のプロンプト分類** — 簡単/中/難で削減率と完全性の相関分析

## 再現コマンド

```bash
cd benchmarks
python run.py \
  --model claude-sonnet-4-5-20250929 \
  --trials 1 \
  --prompts prompts_thinking_trial.json \
  --thinking 4000 \
  --judge claude-sonnet-4-5-20250929
```

## 参照データ

- [benchmark_ja_20260417_230607.json](benchmark_ja_20260417_230607.json) — 条件A
- [benchmark_ja_think2000_20260417_230849.json](benchmark_ja_think2000_20260417_230849.json) — 条件B
- [benchmark_ja_think4000_20260417_231255.json](benchmark_ja_think4000_20260417_231255.json) — 条件C
