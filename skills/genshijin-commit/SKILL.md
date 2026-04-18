---
name: genshijin-commit
description: >
  超圧縮コミットメッセージ生成。Conventional Commits形式で件名≤50文字、
  「何を」より「なぜ」を重視。日本語・英語両対応。
  「コミットメッセージ作って」「/commit」「/genshijin-commit」で起動。
  ステージング変更時に自動起動候補。
---

コミットメッセージは簡潔かつ正確に。Conventional Commits 形式。冗長禁止。「何を」より「なぜ」。

## ルール

### 件名

- `<type>(<scope>): <命令形の要約>` — `<scope>` 任意
- types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- 命令形: 「追加」「修正」「削除」 — 「追加した」「追加します」不可
- ≤50文字目標・72文字上限
- 末尾ピリオド不要
- 日本語/英語はリポジトリ既存コミット履歴に合わせる（`git log` 確認）

### 本文（必要時のみ）

- 件名で自明なら省略
- 追加する場合:
  - 非自明な「なぜ」
  - 破壊的変更
  - マイグレーション注意
  - 関連Issue/PR
- 72文字で折返し
- 箇条書きは `-`（`*` 不使用）
- 末尾にIssue/PR参照: `Closes #42` `Refs #17`

### 絶対入れない

- 「このコミットは〜します」「私は」「我々は」「現在」「今」— diff 見れば自明
- 「〇〇の依頼により」— `Co-authored-by` trailer 使う
- 「Generated with Claude Code」等 AI 帰属表記
- 絵文字（プロジェクト慣習で必須な場合を除く）
- scope で既出のファイル名再記述

## 例

diff: ユーザープロフィール用新エンドポイント、なぜ必要か本文で説明
- ❌ `feat: ユーザープロフィール情報をDBから取得する新しいエンドポイントを追加`
- ✅
  ```
  feat(api): GET /users/:id/profile 追加

  モバイルクライアント コールドスタート時
  LTE帯域削減のため、完全user payload不要なprofileデータ
  取得エンドポイントが必要。

  Closes #128
  ```

diff: 破壊的API変更
- ✅
  ```
  feat(api)!: /v1/orders を /v1/checkout にリネーム

  BREAKING CHANGE: /v1/orders クライアント 2026-06-01 までに
  /v1/checkout 移行必須。以降旧ルート 410 返却。
  ```

diff: 小さいバグ修正（本文不要例）
- ✅ `fix(auth): トークン期限チェック境界条件修正`

## 自動明瞭化

以下は件名のみ禁止・本文必須:
- 破壊的変更
- セキュリティ修正
- データマイグレーション
- revert コミット

将来のデバッガーがコンテキスト必要。圧縮し過ぎない。

## 境界

- メッセージ生成のみ。`git commit` 実行・ステージング・amend 不実施
- 出力はコードブロックで貼付可能な形式
- 「原始人コミットやめて」「通常モード」で解除
