# caveman 差分分析 — genshijin アップデート候補ピックアップ

対象: [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) 最新版 vs 現 genshijin。
作成日: 2026-04-18

## 概要

caveman 側は単一スキルから **マルチスキル + フック + マルチエージェント対応** に拡張。genshijin は本体スキル1個のみ。以下に差分と移植優先度をまとめる。

---

## 1. 独立サブスキル群（最大差分・ユーザー価値高）

caveman 側は4スキル構成。genshijin は本体1個のみ。

| caveman | 内容 | genshijin 移植案 |
|---------|------|------------------|
| `caveman-commit` | Conventional Commits／件名≤50文字／理由優先 | `genshijin-commit` — 日本語対応コミット生成 |
| `caveman-review` | 1行PRコメント `L42: 🔴 bug: ...` | `genshijin-review` — `L42: 🔴 バグ: user null。ガード追加。` |
| `caveman-help` | モード一覧カード（one-shot表示・状態非変更） | `genshijin-help` — 強度表・サブコマンド一覧 |
| `compress` | `.md`をcaveman化し入力トークン46%削減。Python CLI＋検証＋再試行 | `genshijin-compress` — `CLAUDE.md`等を原始人モード化 |

`compress` は特に強力：セッション毎に読む `CLAUDE.md` の入力トークン削減→永続的コスト減。caveman 側は Python CLI 実装（検出・圧縮・検証・再試行）完備。

**参考ファイル:**
- `/tmp/caveman-ref/skills/caveman-commit/SKILL.md`
- `/tmp/caveman-ref/skills/caveman-review/SKILL.md`
- `/tmp/caveman-ref/skills/caveman-help/SKILL.md`
- `/tmp/caveman-ref/skills/compress/SKILL.md`
- `/tmp/caveman-ref/skills/compress/scripts/` (Python CLI 実装)

---

## 2. フックシステム一式（genshijin 完全欠落）

`.claude-plugin/plugin.json` にフック定義、`hooks/` ディレクトリに実装。

### 構成

- **SessionStart hook** (`caveman-activate.js`)
  - フラグファイル `~/.claude/.caveman-active` 書込
  - SKILL.md を読んでルールセットを hidden context として注入
  - 現在のモードに該当する intensity 行のみフィルタ注入→入力トークン節約
  - statusline 未設定を検出し設定を Claude に促す

- **UserPromptSubmit hook** (`caveman-mode-tracker.js`)
  - `/caveman` 系コマンド検出・モード追跡
  - 自然言語（"talk like caveman" 等）も検出
  - **毎ターン補強注入** — 他プラグインがスタイル指示を毎ターン注入する環境でのドリフト防止
  - `stop caveman` / `normal mode` で解除

- **Statusline badge** (`caveman-statusline.sh` / `.ps1`)
  - `[CAVEMAN]`, `[CAVEMAN:ULTRA]`, `[CAVEMAN:WENYAN]` 等を Claude Code status bar に表示

- **設定解決** (`caveman-config.js`)
  - 優先度: `CAVEMAN_DEFAULT_MODE` env var > `~/.config/caveman/config.json` > デフォルト `full`
  - `"off"` で auto-activation 無効化可能

- **セキュリティ堅牢化**
  - symlink拒否（ターゲット・親ディレクトリ両方）
  - サイズ上限 64 bytes
  - `VALID_MODES` ホワイトリスト検証
  - 攻撃者が `~/.ssh/id_rsa` を指す symlink で二次被害招くシナリオを塞ぐ
  - O_NOFOLLOW フラグ使用

- **standalone インストーラ** (`install.sh` / `install.ps1`)
  - プラグイン未使用でも導入可
  - `settings.json` への安全マージ（既存 statusline を尊重）

**移植時の注意:** genshijin 側は Node.js 依存を避けたい場合、Python でも同等実装可能。ただし Claude Code 公式フックは Node.js が無難。

---

## 3. スラッシュコマンド定義（.toml）

`commands/` ディレクトリに3ファイル:

- `commands/caveman.toml` — モード切替 `/caveman lite|full|ultra|wenyan`
- `commands/caveman-commit.toml` — コミット生成
- `commands/caveman-review.toml` — PRレビュー

genshijin `plugin.json` には commands 登録なし。移植対象。

---

## 4. 文言文モード → 日本語等価物の可能性

caveman は 文言文（古典中国語）で80-90%文字削減を実現。genshijin では:

- **漢文訓読風モード**（白文、レ点・送り仮名なし）
- **カタカナ削除モード**（漢字のみ連結）
- **古文モード**（「〜なり」「〜けり」等の古典日本語簡潔体）

訴求力・話題性高いがユースケース狭い。**優先度 下**。実装するなら `極限` より上の新レベル。

---

## 5. Evals — 3-arm harness（誠実なメトリクス）

### 現 genshijin benchmarks

`通常 vs caveman vs genshijin` の3比較。

### caveman evals/

`__baseline__ / __terse__ / <skill>` の3アーム:

| Arm | System prompt |
|-----|---------------|
| `__baseline__` | なし |
| `__terse__` | `Answer concisely.` |
| `<skill>` | `Answer concisely.\n\n{SKILL.md}` |

**誠実な差分 = `<skill>` vs `__terse__`** — 「スキル vs 単なる『簡潔に』指示」の正味効果を分離。

### 移植案

現ベンチに `"簡潔に回答してください"` アームを追加するだけで同等分析可能。

**追加要素:**
- スナップショット git commit で CI 決定論化
- tiktoken `o200k_base` でオフライン計測（API キー不要）
- median/mean/min/max/stdev 複数統計量表示

**参考:** `/tmp/caveman-ref/evals/README.md`, `llm_run.py`, `measure.py`

---

## 6. マルチエージェント対応

caveman は8+ agent対応。genshijin は Claude Code 専用。

### caveman 側のエージェント別ファイル

| Agent | ファイル |
|-------|---------|
| Codex | `.codex/hooks.json`, `.codex/config.toml` |
| Cursor | `.cursor/rules/caveman.mdc` |
| Windsurf | `.windsurf/rules/caveman.md` |
| Cline | `.clinerules/caveman.md` |
| Copilot | `.github/copilot-instructions.md` + `AGENTS.md` |
| Gemini CLI | `GEMINI.md` + `gemini-extension.json` |
| その他40+ | `npx skills add JuliusBrussee/caveman` |

### 共通アクティベーションスニペット

`rules/caveman-activate.md` にフック無しプラットフォーム向け常時有効化プロンプト。

### 移植価値

Claude Code 専用から脱出させる拡張余地。日本語ユーザーの AI コーディング環境は分散しているため有効。

---

## 7. SKILL.md 本体の改善

### Persistence セクション明示

caveman:
```
## Persistence

ACTIVE EVERY RESPONSE. No revert after many turns.
No filler drift. Still active if unsure.
Off only: "stop caveman" / "normal mode".
```

genshijin にも `## 永続性` セクション追加推奨。「多ターン経過後の敬語回帰・フィラー漂流」を明示的に禁止。

### description frontmatter のトリガー明示

caveman:
```yaml
description: >
  ...Use when user says "caveman mode", "talk like caveman",
  "use caveman", "less tokens", "be brief", or invokes /caveman.
  Also auto-triggers when token efficiency is requested.
```

現 genshijin も同等だが再確認。

### SessionStart でのレベル別フィルタ注入

現在のアクティブレベル行のみ intensity テーブルから抽出→入力トークン削減。実装済みコード `/tmp/caveman-ref/hooks/caveman-activate.js` 参照。

---

## 推奨ロードマップ / 進捗管理

凡例: `[ ]` 未着手 / `[~]` 作業中 / `[x]` 完了 / `[-]` スキップ保留

### P0 — 実装軽・価値高

- [x] 1. `genshijin-commit` 追加 — コミット生成スキル（2026-04-18 完了 · [skills/genshijin-commit/SKILL.md](../skills/genshijin-commit/SKILL.md)）
- [x] 2. `genshijin-review` 追加 — PR レビュースキル（2026-04-18 完了 · [skills/genshijin-review/SKILL.md](../skills/genshijin-review/SKILL.md)）
- [x] 3. `genshijin-help` 追加 — リファレンスカード（2026-04-18 完了 · [skills/genshijin-help/SKILL.md](../skills/genshijin-help/SKILL.md)）
- [x] 4. `genshijin-compress` Python 実装ポート — 入力トークン永続削減（2026-04-18 完了 · [skills/genshijin-compress/](../skills/genshijin-compress/)）
- [x] 4a. `plugin.json` 更新 — description / keywords 新機能反映（2026-04-18）

### P1 — 中規模・効果持続

- [x] 5. SessionStart + UserPromptSubmit フック実装（モード追跡・毎ターン補強・ドリフト防止）（2026-04-18 完了 · [hooks/genshijin-activate.js](../hooks/genshijin-activate.js) · [hooks/genshijin-mode-tracker.js](../hooks/genshijin-mode-tracker.js)）
- [x] 6. Statusline badge（`[原始人]`, `[原始人:極限]` 等）（2026-04-18 完了 · [hooks/genshijin-statusline.sh](../hooks/genshijin-statusline.sh) · [hooks/genshijin-statusline.ps1](../hooks/genshijin-statusline.ps1)）
- [x] 7. 設定解決（env var + config file）（2026-04-18 完了 · [hooks/genshijin-config.js](../hooks/genshijin-config.js) · `GENSHIJIN_DEFAULT_MODE` / `~/.config/genshijin/config.json`）
- [x] 7a. SKILL.md に永続性セクション追加（2026-04-18 · ドリフト防止のモデル anchor）
- [x] 7b. plugin.json に hooks 登録 + version 1.2.0（2026-04-18）

### P2 — 拡張性・誠実性

- [x] 8. Evals 3-arm 化（`"簡潔に"` 対照アーム追加）（2026-04-18 完了 · [benchmarks/run.py](../benchmarks/run.py) · `terse` アーム追加で誠実な `genshijin vs 簡潔` 差分を計測可能化）
- [x] 9. マルチエージェント rules ファイル（Cursor/Windsurf/Cline/Copilot）（2026-04-18 完了 · [.cursor/rules/genshijin.mdc](../.cursor/rules/genshijin.mdc) · [.windsurf/rules/genshijin.md](../.windsurf/rules/genshijin.md) · [.clinerules/genshijin.md](../.clinerules/genshijin.md) · [.github/copilot-instructions.md](../.github/copilot-instructions.md) · [rules/genshijin-activate.md](../rules/genshijin-activate.md) · [AGENTS.md](../AGENTS.md)）
- [x] 10. standalone `install.sh`/`uninstall.sh`（2026-04-18 完了 · [hooks/install.sh](../hooks/install.sh) · [hooks/uninstall.sh](../hooks/uninstall.sh) · [hooks/install.ps1](../hooks/install.ps1) · [hooks/uninstall.ps1](../hooks/uninstall.ps1)）
- [x] 11. スラッシュコマンド `.toml` 定義（2026-04-18 完了 · [commands/genshijin.toml](../commands/genshijin.toml) · [commands/genshijin-commit.toml](../commands/genshijin-commit.toml) · [commands/genshijin-review.toml](../commands/genshijin-review.toml)）

### P3 — 話題性重視

- [ ] 12. 文言文相当の日本語超圧縮モード（漢文訓読風 or 漢字のみ）

### P4 — 本家 v1.3.0以降 (2026-04-30〜05-01) 差分

caveman 本家 commits `56875e8` / `83ec61c` / `e031c1e` で大規模拡張: stats receipts / smart installer / cavecrew / cavepack / MCP-shrink。本家59テスト合格。genshijin v1.4.0 で全項目移植。

- [x] 13. `genshijin-stats` — リアルセッショントークン使用量 + 削減見積もり（2026-05-07 完了）
  - `/genshijin-stats` 起動。フックが `decision: "block"` で即時表示
  - per-million 価格 USD 換算、`--share` ツイート可能ライン、`--all` / `--since N[d|h]` ライフタイム集計
  - `*.original.md` 検出で input側削減 (memory compress) も計測
  - statusline savings suffix `.genshijin-statusline-suffix`
  - [hooks/genshijin-stats.js](../hooks/genshijin-stats.js) · [skills/genshijin-stats/SKILL.md](../skills/genshijin-stats/SKILL.md)

- [x] 14. ultra-mode code-symbol guard — SKILL.md 極限モード強化（2026-05-07 完了）
  - コードシンボル/関数名/API名/エラー文字列は略称化禁止を明示
  - 自動解除条件拡張: 多段手順での fragment順誤読リスク、圧縮自体が技術的曖昧性発生時
  - [skills/genshijin/SKILL.md](../skills/genshijin/SKILL.md)

- [x] 15. compress fixes — `genshijin-compress` 品質向上（2026-05-07 完了）
  - UTF-8 stdout 強制、空入力 / 同一出力ガード、frontmatter cleanup
  - [skills/genshijin-compress/scripts/compress.py](../skills/genshijin-compress/scripts/compress.py)

- [x] 16. cavecrew相当 — `genshijin-crew` 3サブエージェント（2026-05-07 完了）
  - `genshijin-investigator` (read-only locator)、`genshijin-builder` (1-2ファイル surgical edit)、`genshijin-reviewer` (severity-tagged finding)
  - subagent tool-result が原始人圧縮で約60%縮小 → 主コンテキスト持続
  - [agents/genshijin-investigator.md](../agents/genshijin-investigator.md) · [agents/genshijin-builder.md](../agents/genshijin-builder.md) · [agents/genshijin-reviewer.md](../agents/genshijin-reviewer.md) · [skills/genshijin-crew/SKILL.md](../skills/genshijin-crew/SKILL.md)

- [x] 17. `genshijin-shrink` MCP middleware proxy（2026-05-07 完了）
  - 任意の MCP サーバー wrap → `tools/list` `description` を圧縮
  - コード/URL/パス/識別子は byte-for-byte 保護
  - npm publishable: `npx genshijin-shrink <upstream> [args]`
  - [mcp-servers/genshijin-shrink/](../mcp-servers/genshijin-shrink/)

- [x] 18. `tools/genshijin-init.js` — マルチエージェント rules 一発投下（2026-05-07 完了）
  - Cursor/Windsurf/Cline/Copilot/AGENTS.md に rule 投下
  - sentinel チェック idempotent、`--dry-run` / `--force` / `--only <agent>`
  - [tools/genshijin-init.js](../tools/genshijin-init.js)

- [x] 19. root `install.sh` / `install.ps1` — smart multi-agent installer（2026-05-07 完了）
  - Claude Code/Gemini/Codex/Cursor/Windsurf/Cline 検出 → native install
  - `--dry-run` / `--force` / `--only` / `--all` / `--minimal` / `--list`
  - 既存 `hooks/install.sh` は Claude Code 単独用として残す
  - [install.sh](../install.sh) · [install.ps1](../install.ps1)

- [x] 20. Windows PowerShell tempfile fix（2026-05-07 完了）
  - `node -e "..."` 引用符エスケープ問題回避
  - [hooks/install.ps1](../hooks/install.ps1)

- [x] 21. `/genshijin` 引数ホワイトリスト + symlinked-parent `~/.claude` 対応（2026-05-07 完了）
  - 不正引数で flag file silent overwrite 防止
  - `~/.claude` が symlink の場合の immediate parent チェック
  - [hooks/genshijin-mode-tracker.js](../hooks/genshijin-mode-tracker.js) · [hooks/genshijin-config.js](../hooks/genshijin-config.js)

### 更新ルール

- 着手時: `[ ]` → `[~]`、コミットハッシュ・PR番号・メモを項目末尾に追記
- 完了時: `[~]` → `[x]`、完了日（YYYY-MM-DD）追記
- スキップ時: `[-]` に変更し理由を追記

---

## 参考リンク

- caveman 本家: https://github.com/JuliusBrussee/caveman
- 3-arm eval harness: `/tmp/caveman-ref/evals/`
- フック実装: `/tmp/caveman-ref/hooks/`
- Python compress CLI: `/tmp/caveman-ref/skills/compress/scripts/`
