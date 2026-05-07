---
name: genshijin-stats
description: >
  現セッションのリアルトークン使用量と推定削減量を表示。Claude Code セッションログから直接読込 — AI 推定なし。
  `/genshijin-stats` で起動。出力は mode-tracker フックが注入し、モデル自身は数値計算しない。
---

このスキルは `hooks/genshijin-stats.js` が提供（`hooks/genshijin-mode-tracker.js` が `/genshijin-stats` 検出時に呼出）。フックが `decision: "block"` で整形済 stats を reason として返す → ユーザーは即座に数値を見る。モデル側で何もする必要なし。

## 引数

- (なし) — 現セッション stats 表示
- `--share` — ツイート可能な1行サマリ
- `--all` — Lifetime 集計
- `--since 7d` / `--since 24h` — 期間指定 Lifetime 集計
