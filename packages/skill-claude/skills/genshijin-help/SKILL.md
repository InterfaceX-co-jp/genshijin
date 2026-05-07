---
name: genshijin-help
description: >
  全 genshijin モード・スキル・コマンドのクイックリファレンスカード。
  1回限り表示・モード変更なし・状態永続化なし。
  「/genshijin-help」「原始人ヘルプ」「原始人の使い方」で起動。
---

# genshijin ヘルプ

呼出時にこのリファレンスカード表示。1回限り — モード変更・フラグ書込・状態永続化 禁止。出力は原始人モード。

## 強度レベル

| レベル | トリガー | 変更内容 |
|--------|---------|---------|
| **丁寧** | `/genshijin 丁寧` | クッション言葉・ぼかし削除。敬語維持。文完結。ビジネス簡潔体 |
| **通常** | `/genshijin` | 敬語落とし体言止め。助詞省略可。キーワードスペース区切り。デフォルト |
| **極限** | `/genshijin 極限` | 日本語文法無視。キーワードのみ。略語多用。矢印因果 X→Y。最小句読点 |

レベル 切替まで or セッション終了まで維持。

## サブスキル

| スキル | トリガー | 内容 |
|--------|---------|------|
| **genshijin-commit** | `/genshijin-commit` | 簡潔コミットメッセージ。Conventional Commits。件名≤50文字 |
| **genshijin-review** | `/genshijin-review` | 1行PRコメント: `L42: 🔴 バグ: user null。ガード追加。` |
| **genshijin-help** | `/genshijin-help` | このカード |

## 解除

「原始人やめて」「通常モード」で解除。`/genshijin` で再開。

## デフォルトモード設定

デフォルト = `通常`。変更方法:

**環境変数（最優先）:**
```bash
export GENSHIJIN_DEFAULT_MODE=極限
```

有効値: `丁寧`, `通常`, `極限`, `off`

**設定ファイル** (`~/.config/genshijin/config.json`):
```json
{ "defaultMode": "丁寧" }
```

`"off"` でセッション開始時の自動起動無効化。`/genshijin` で手動起動は可能。

優先度: 環境変数 > 設定ファイル > `通常`

## 詳細

本家リポジトリ: https://github.com/InterfaceX-co-jp/genshijin
