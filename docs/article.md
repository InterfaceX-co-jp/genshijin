[注意]AIに書かせた記事をそのまま私の方でレビューして掲載しています。
~~Claudeマーケットプレイスにだしたらまた更新するかも？よろしくおねがいします。~~

@追記: 2026年4月18日
![](https://storage.googleapis.com/zenn-user-upload/1e23d98cbf46-20260418.png)
- Claudeのマーケットプレイスに無事公開されました🎉
- [`genshijin@v1.3.0`](https://github.com/InterfaceX-co-jp/genshijin/releases/tag/v1.3.0)を公開しました。マルチエージェント対応やセキュリティ対応、ベンチマーク更新などを含めています

@追記: 2026年5月7日
- [`genshijin@v1.4.0`](https://github.com/InterfaceX-co-jp/genshijin/releases/tag/v1.4.0)を公開しました
- caveman本家v1.3.0以降の差分（stats receipts / smart installer / cavecrew相当 / cavepack相当 / MCP-shrink）を全項目移植
- 主な追加: `/genshijin-stats` でリアルセッション削減量＋USD推定表示、3 subagent (`genshijin-investigator/builder/reviewer`) で長セッションコンテキスト持続、`genshijin-shrink` MCP middleware、root マルチエージェント installer、ultra-mode code-symbol guard 強化
- 技術的に面白いトピックを下記「v1.4.0 技術深掘り」に追加（[MCP middleware proxy の仕組み](#mcp-middleware-proxy-の仕組み)、[USD換算の見積もり方法](#usd換算の見積もり方法), [subagent 圧縮による長セッション持続](#subagent-圧縮による長セッション持続)）

## TL;DR

- **caveman**: Claude Code向けの英語圧縮スキル。冠詞やフィラーを消してトークン約68%削減
- **genshijin（原始人）**: cavemanの日本語最適化版。敬語・クッション言葉・冗長助詞を消してトークン約80%削減
- cavemanより**さらに38%少ないトークン**で同じ技術的内容を伝達できる
- なぜそんなことが可能なのか？ Claudeのトークナイザと日本語の言語構造に秘密がある

## はじめに：あなたのClaudeは喋りすぎている

Claude Codeを日常的に使っているエンジニアなら、こんな応答を見たことがあるはずだ。

> ご質問ありがとうございます。お調べしたところ、こちらの問題につきましては、認証ミドルウェアにおけるトークンの有効期限チェックの部分に原因がある可能性が考えられます。具体的には、`<` 演算子を使用しているところを `<=` に変更していただくことで解決できるかと思います。

**67トークン。** 伝えたい情報はこれだけ：

> 認証ミドルウェア バグ。トークン期限チェック `<`→`<=`。修正:

**14トークン。** 内容は同じ。80%が「敬語」「前置き」「ぼかし」という装飾だった。

Claude Codeの出力トークンには課金がかかる。Max planで月額$100、あるいはAPI経由なら出力トークン1Mあたり$15（Sonnet）。あなたが「ありがとうございます」と「かと思われます」に毎日お金を払っている。

## caveman とは何か

[caveman](https://github.com/JuliusBrussee/caveman) は、Julius Brussee氏が作ったClaude Code向けスキルだ。コンセプトはシンプル：

**「原始人みたいに喋れ。中身は全部残せ。無駄だけ消せ。」**

システムプロンプトにこう書くだけで、Claudeの応答が劇的に変わる。

```
Respond terse like smart caveman. All technical substance stay. Only fluff die.
```

### Before（通常応答）
> Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by the authentication middleware where the token expiry check uses `<` instead of `<=`.

### After（cavemanモード）
> Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:

冠詞（a/an/the）、フィラー（just/really/basically）、前置き（Sure! I'd be happy to...）、ぼかし（might/perhaps/likely）を削除。技術用語とコードブロックはそのまま。

これだけで英語環境では**平均68%のトークン削減**を実現する。

## なぜこれが機能するのか── Claudeの仕組みから理解する

「プロンプトに『短く喋れ』と書くだけでそんなに変わるの？」と思うかもしれない。これを理解するには、Claudeの内部動作を3つのレイヤーで見る必要がある。

### レイヤー1: トークナイザ── 文字列はこう分割される

ClaudeはBPE（Byte Pair Encoding）ベースのトークナイザを使っている。テキストは文字そのものではなく「トークン」という単位に分割されて処理される。

英語の場合：
```
"I'd be happy to help you with that."
→ ["I", "'d", " be", " happy", " to", " help", " you", " with", " that", "."]
→ 10トークン
```

この10トークンには**情報量がほぼゼロ**のものが多い。"I'd be happy to" は意味的に何も伝えていない。cavemanはこの「情報量ゼロのトークン」を生成させないようにする。

### レイヤー2: 自己回帰生成── 冗長さは雪だるま式に増える

Claudeは自己回帰モデルだ。つまり、**1トークンずつ、前のトークンを見て次のトークンを予測する**。

ここが重要：「ご質問ありがとうございます」と出力してしまうと、その後の文体が丁寧モードに「ロック」される。丁寧な前置きの後には丁寧な本文が続き、丁寧な本文の後には丁寧なまとめが続く。冗長さは雪だるま式に膨らむ。

cavemanのシステムプロンプトは、この**最初の1トークン目の方向を変える**。"Sure" ではなく "Bug" から始めさせることで、後続のトークン列全体が簡潔な方向に収束する。

### レイヤー3: システムプロンプトの特権的位置

Claude のアーキテクチャにおいて、システムプロンプトはユーザーメッセージより**優先度が高い**。Anthropicのドキュメントにも明記されている通り、システムプロンプトは応答の「人格」を規定する。

cavemanはこの仕組みを利用して、「丁寧に振る舞う」というClaudeのデフォルト人格を「原始人のように簡潔に振る舞う」に上書きする。ユーザーが毎回「短く答えて」と書く必要はない。スキルとして一度設定すれば、セッション中ずっと有効になる。

## なぜ日本語では caveman だけでは足りないのか

ここからが本題。cavemanは英語では見事に機能する。しかし日本語の質問に対してcavemanを適用すると、**英語ほどの圧縮率が出ない**。

30種類のプロンプトでベンチマークを取った結果がこれだ：

| モード | 平均トークン数 | 通常比削減率 |
|--------|-------------|------------|
| 通常（敬語あり） | 1,483 | ── |
| caveman | 476 | 68% |
| **genshijin** | **296** | **80%** |

cavemanでも68%削減できているが、genshijinはそこからさらに38%削り込んでいる。なぜか？

### 理由1: 日本語の冗長性は英語と構造が違う

英語の冗長性は主に「付加的」だ：

```
Sure, I'd be happy to help.  ← 付け足された前置き
The issue is basically that... ← 付け足されたフィラー
```

これらは単純に削除できる。cavemanの "Drop articles, filler, pleasantries" で対処可能。

しかし日本語の冗長性は**文末に埋め込まれている**：

```
問題でございます → 問題           （「でございます」が冗長）
することができます → できる        （「することが」が冗長）
〜ということになります → 〜になる   （「ということ」が冗長）
```

英語の冠詞削除ルール "Drop a/an/the" に相当する日本語のルールは存在しない。日本語には冠詞がないからだ。代わりに必要なのは：

- **敬語レイヤーの除去**: です/ます/ございます → 体言止め
- **助詞の圧縮**: 〜することができる → 〜できる
- **接続詞の圧縮**: 〜ということになりますので → だから

cavemanの英語ルールをそのまま日本語に適用しても、これらの削減は起きない。

### 理由2: 日本語のトークン効率は英語より悪い

BPEトークナイザにとって、日本語は英語よりコストが高い。

英語：
```
"authentication" → ["auth", "ent", "ication"] → 3トークン
```

日本語：
```
"認証" → ["認", "証"] → 2トークン（漢字2文字で2トークン）
"認証ミドルウェア" → ["認", "証", "ミドル", "ウェア"] → 4トークン
```

一見すると日本語の方が効率が良さそうだが、問題は**付随する文法要素**だ：

```
"認証ミドルウェアにおけるトークンの有効期限チェックの部分に原因がある可能性が考えられます"
```

この文の内容は「認証ミドルウェア トークン期限チェック 原因」で伝わる。しかし日本語の文法に従うと「における」「の」「に」「がある」「可能性が」「考えられます」という助詞・助動詞・敬語が連鎖する。

これらは**それぞれ1〜2トークンを消費する**にもかかわらず、情報量はほぼゼロ。genshijinはここを攻撃する。

### 理由3: genshijin の日本語特化ルール

genshijinが caveman より多くのトークンを削れる理由は、日本語固有の冗長パターンを明示的にルール化しているからだ。

```markdown
# cavemanのルール（英語向け）
Drop: articles (a/an/the), filler (just/really/basically),
      pleasantries (sure/certainly), hedging

# genshijinのルール（日本語向け）
削除対象:
- 敬語・丁寧語（です/ます/ございます → 体言止め・用言止め）
- クッション言葉（えーと/まあ/ちなみに/一応/基本的に）
- ぼかし（〜かもしれません/〜と思われます/おそらく）
- 冗長助詞（〜することができる→〜できる）
- 冗長接続（〜ということになりますので→だから）
- 自明な助詞（が/の/を/に/で/は/と/も）— 意味通じるなら省略
- 情報水増し — 聞かれたことだけ答える
```

特に強力なのが最後の2つだ。

**自明な助詞の省略**は、日本語話者なら自然に補完できる情報を削る：

```
Before: 「レンダリングが行われるたびに新しいオブジェクトの参照が生成される」
After:  「レンダリング毎 新オブジェクト参照 生成」
```

助詞を消してスペースで区切る。日本語文法としては破綻しているが、技術者なら一瞬で意味が取れる。

**情報水増しの禁止**は、LLMの「親切に網羅的に答えたい」という傾向を抑制する：

```
質問: 「CORSエラーが出る」

通常: CORSとは何か → 原因5パターン → 各パターンの解決策 → ブラウザごとの違い → ...
genshijin: サーバ側 Access-Control-Allow-Origin 未設定。ヘッダ追加。
```

聞かれていない背景説明や網羅的な列挙を禁止することで、回答の構造レベルでトークンを削減する。

## 実際の回答を見比べてみよう

数字だけでは伝わらない。実際の応答を並べて見てほしい。すべて同じプロンプト・同じモデル（Claude Sonnet）で生成したものだ。

### 例1: 「CORSエラーが出る。原因と解決策を教えて」

**通常モード（1,168トークン）:**

> CORSエラーの原因と解決策について詳しく説明します。
>
> ## CORSエラーとは
>
> CORS（Cross-Origin Resource Sharing）エラーは、ブラウザのセキュリティ機能によって、異なるオリジン（ドメイン、プロトコル、ポート）間でのリソース共有が制限されることで発生します。
>
> ## よくある原因
>
> 1. **異なるドメイン間でのAPI呼び出し**
>    - フロントエンド: `http://localhost:3000`
>    - バックエンド: `http://localhost:8000`
> 2. **プロトコルの違い** ...（以下、Express/Spring Boot/Django/Nginx の設定例が延々と続く）

**caveman（358トークン）:**

> CORS = ブラウザのセキュリティ機能。別ドメインからのリクエスト遮断。
>
> ## 原因
> フロント `http://localhost:3000` → API `http://localhost:8080` = 異なるオリジン → CORS制限
>
> ## 解決策
> ### サーバー側対応（推奨）
> ```javascript
> app.use((req, res, next) => {
>   res.header('Access-Control-Allow-Origin', '*');
>   res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
>   res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
>   next();
> });
> ```
> OPTIONS preflight来る = 複雑リクエスト。サーバーがOPTIONS応答必要。

**genshijin（217トークン）:**

> CORS エラー原因:
> - ブラウザ同一オリジン制限
> - サーバ側 CORS設定なし
> - preflight リクエスト失敗
>
> 解決策:
>
> **サーバ側（推奨）:**
> ```javascript
> app.use(cors({
>   origin: 'http://localhost:3000',
>   credentials: true
> }));
> ```
>
> **確認点:**
> - `Access-Control-Allow-Origin` ヘッダ
> - `OPTIONS` メソッド対応
> - 認証Cookie使用時 `credentials: true`
>
> 本番環境は必ずサーバ側修正。

通常モードは「CORSとは何か」から丁寧に始まり、4つのフレームワークの設定例を網羅する。genshijinは「原因3行、解決策コード1つ、確認ポイント3行」で終わる。情報量は同じ。

---

### 例2: 「Node.jsのイベントループの仕組みを説明して」

**通常モード（1,294トークン）:**

> Node.jsのイベントループについて詳しく説明させていただきます。
>
> ## イベントループとは
>
> イベントループは、Node.jsの非同期処理の中核となる仕組みで、**シングルスレッド**でありながら**並行処理**を実現するための仕組みです。
>
> ## イベントループの構造
>
> イベントループは以下の6つのフェーズから構成されています：
>
> ```
> ┌───────────────────────────┐
> ┌─>│           timers          │  ←─ setTimeout, setInterval
> │  └─────────────┬─────────────┘
> │  ┌─────────────┴─────────────┐
> │  │     pending callbacks     │
> ...
> ```
> （以下、各フェーズの詳細解説、コード例、図解が続く）

**caveman（741トークン）:**

cavemanでも741トークン使っている。ASCII図をそのまま出力し、フェーズごとの説明も丁寧だ。cavemanは英語のフィラーを消すが、**日本語の丁寧な説明構造はそのまま残してしまう**。

**genshijin（244トークン）:**

> イベントループ = シングルスレッド 非同期処理機構。
>
> **基本構造:**
> - コールスタック: 実行中fn
> - コールバックキュー: 完了待ちfn
> - イベントループ: キュー→スタック転送
>
> **動作順序:**
> 1. 同期コード スタック実行
> 2. 非同期処理 → WebAPI/libuv委託
> 3. 完了後 コールバック→キュー追加
> 4. スタック空 → キューからpop→スタック追加
> 5. 繰り返し
>
> **フェーズ順:**
> ```
> Timer → Pending → Poll → Check → Close
> ```
>
> **重要:**
> - スタック空でないとキュー処理なし
> - 重い同期処理 = UI/他処理ブロック
> - `process.nextTick` > Promise > 他コールバック
>
> シングルスレッド故 CPU集約処理注意。

caveman比で**67%削減**。ASCII図を省き、フェーズを1行にまとめ、要点だけを箇条書きにした。概念説明系タスクでの差が最も顕著に出る。

---

### 例3: 「認証ミドルウェアのトークン有効期限チェックにバグがある。修正して」

**通常モード（1,766トークン）:**

> 認証ミドルウェアのトークン有効期限チェックのバグを修正いたします。一般的なバグパターンとその修正例を示します。
>
> ## よくあるバグパターンと修正
>
> ### 1. 時刻比較のバグ
> ```javascript
> // ❌ 間違った例
> function validateToken(token) {
>     const decoded = jwt.verify(token, secret);
>     const currentTime = Date.now();
>     // バグ: 単位が異なる（exp は秒、Date.now() はミリ秒）
>     if (decoded.exp < currentTime) { ...
> ```
> （以下、3パターンの修正例、タイムゾーン考慮、堅牢なミドルウェア完全実装が続く）

**caveman（202トークン）:**

> バグ詳細不明。推測：期限切れトークン通す問題。
>
> よくある原因：
> - `<` vs `<=` 混同
> - タイムゾーン不一致
> - 時刻単位違い (秒 vs ミリ秒)
>
> 典型例修正：
> ```javascript
> // バグ版
> if (token.exp < Date.now()) {
>   return next(); // 危険！期限切れなのに通す
> }
>
> // 修正版
> if (token.exp <= Date.now() / 1000) {
>   return res.status(401).json({ error: 'Token expired' });
> }
> ```
>
> 具体的エラーメッセージ・コード見せて。正確修正出す。

**genshijin（80トークン）:**

> 認証ミドルウェア バグ。トークン期限チェック問題。
>
> コード貼れ。現状見ないと修正不可。
>
> よくある原因:
> - 時刻比較 `<` → `<=` 必要
> - UTC/JST混在
> - `exp`フィールド 秒/ミリ秒 単位違い
>
> ```javascript
> // 悪い例
> if (Date.now() < tokenExp * 1000)
> // 良い例
> if (Date.now() <= tokenExp * 1000)
> ```
>
> 現コード貼って。

**80トークン。** 通常モードの95%削減。そして注目すべきは「コード貼れ」という応答だ。通常モードは聞かれてもいないのに3パターンの修正例を網羅的に提示する。genshijinは「コードを見ないと正確な修正はできない」と正直に返す。これこそが「情報水増し禁止」ルールの効果だ。

---

### 全30タスクの平均

| 指標 | 値 |
|------|-----|
| 通常→caveman 削減率 | 68% |
| 通常→genshijin 削減率 | **80%** |
| caveman→genshijin 追加削減率 | **38%** |

**caveman が取りこぼした32%のトークン（通常比）のうち、genshijinはその約半分をさらに回収している。**

## 技術的に面白いポイント

### なぜ「体言止め」がこんなに効くのか

日本語の文末処理は驚くほどトークンを消費する：

```
「設定されています」   → 「設定」
  ↑ 5-6トークン          ↑ 1-2トークン
```

「されています」だけで3〜4トークン。これが応答中の全文に適用されると、文末だけで全体の20〜30%のトークンを消費する。体言止めに切り替えるだけで、この分がまるごと消える。

### 3段階の強度設計

genshijinは用途に応じて3段階の圧縮レベルを持つ：

**丁寧モード** ── ビジネス向け。敬語は残す。クッション言葉だけ消す。
```
Before: 「ご質問ありがとうございます。お調べしたところ、こちらの問題につきましては...」
After:  「コンポーネントが再レンダリングされるのは、レンダリングごとに新しい
         オブジェクト参照が生成されるためです。useMemoで解決できます。」
```

**通常モード** ── 普段使い。敬語を落とし体言止め。
```
Before: 「こちらの問題は、レンダリングが行われるたびに...」
After:  「レンダリング毎 新オブジェクト参照 生成。inline obj prop = 新参照
         = 再レンダリング。useMemoで包む。」
```

**極限モード** ── 電報。日本語文法を完全無視。
```
Before: 「データベースのコネクションプーリングというのは...」
After:  「プール=DB接続再利用。ハンドシェイク省略→高負荷時高速。」
```

### 安全弁の設計

圧縮モードには危険がつきまとう。破壊的操作の確認を圧縮したら、ユーザーが誤読して本番DBを吹き飛ばすかもしれない。

genshijinは**破壊的操作の確認時のみ自動的に通常の日本語に復帰**する：

```
> ⚠️ 警告: `users`テーブル全行削除。取消不可。
> DROP TABLE users;
>
> 原始人復帰。バックアップ確認。
```

この「安全弁」の設計は、実用ツールとして重要なポイントだ。

## 導入方法

### Claude Code プラグイン（推奨）

```bash
claude plugin marketplace add InterfaceX-co-jp/genshijin
```

### 手動インストール（グローバル）

```bash
mkdir -p ~/.claude/skills/genshijin
curl -o ~/.claude/skills/genshijin/SKILL.md \
  https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/skills/genshijin/SKILL.md
```

### 使い方

```
/genshijin          # 通常モード（デフォルト）
/genshijin 丁寧     # ビジネス向け
/genshijin 極限     # 最大圧縮
```

`原始人やめて` で解除。

## 補記：v1.3.0 時点の自動化・拡張機能

圧縮スキルの最大の弱点は「**数ターン後に忘れる**」ことだ。セッション冒頭で `/genshijin` を叩いても、20〜30ターン経過すると敬語が回帰し、フィラーが漂流して元の冗長モードに戻る。プロンプト1発では永続化しない。

genshijin はこの問題を v1.2.0 でフック機構に対応して解決し、v1.3.0 で対応環境を Claude Code 外にも広げた。

### 自動化フック（v1.2.0〜）

Claude Code プラグイン導入後、以下が自動で動く。

- **SessionStart フック** (`hooks/genshijin-activate.js`): セッション開始毎に `SKILL.md` から現アクティブレベルの該当行のみフィルタして hidden context に注入。多ターン経過後の敬語回帰・フィラー漂流を防ぐ anchor として機能する。
- **UserPromptSubmit フック** (`hooks/genshijin-mode-tracker.js`): `/genshijin` 系コマンドや自然言語トリガー（「原始人モード」「原始人やめて」等）でモード切替を追跡。アクティブ中は毎ターン短い補強リマインダを注入して、他プラグインがスタイル指示を毎ターン注入する環境でもドリフトを防ぐ。
- **Statusline バッジ**: `[原始人]` / `[原始人:極限]` / `[原始人:コミット]` 等で現モード可視化。
- **既定モード設定**: `GENSHIJIN_DEFAULT_MODE` 環境変数、または `~/.config/genshijin/config.json`（XDG対応）で上書き可能。`off` 指定で一時停止（アンインストール不要）。

フラグファイル `~/.claude/.genshijin-active` は symlink 拒否・64バイト上限・モードホワイトリスト検証で保護。親ディレクトリの symlink 差替えで `~/.ssh/id_rsa` 等の secret バイトが statusline やモデルコンテキストに流れ込む攻撃経路を、`O_NOFOLLOW` + temp+rename アトミック書込 + `0o600` パーミッションで塞ぐ設計にした。

### スラッシュコマンド（v1.3.0〜）

v1.3.0 で `commands/` 配下にコマンド定義を追加。強度切替・コミット生成・PRレビューを単発呼び出しできる。

```
/genshijin          # 通常モード（デフォルト）
/genshijin 丁寧     # ビジネス向け
/genshijin 極限     # 最大圧縮
/genshijin-commit   # Conventional Commits 形式の簡潔コミットメッセージ生成
/genshijin-review   # 1行PRコメント（L42: 🔴 バグ: ...）
/genshijin-help     # 全モード・サブスキル リファレンスカード
```

### マルチエージェント対応（v1.3.0〜）

Claude Code 以外の環境でも同じ圧縮ルールを効かせるため、主要 AI エージェント向け rules ファイルを同梱した。

- `.cursor/rules/genshijin.mdc` — Cursor
- `.windsurf/rules/genshijin.md` — Windsurf
- `.clinerules/genshijin.md` — Cline
- `.github/copilot-instructions.md` — GitHub Copilot
- `AGENTS.md` — Codex / Gemini CLI 等のサブスキル参照インデックス
- `rules/genshijin-activate.md` — フック機構を持たないプラットフォーム向け共通アクティベーション

### Standalone フックインストーラ（v1.3.0〜）

Claude Code プラグイン機構を使わずに、フックだけを手動導入したいケース向け。

```bash
# macOS / Linux
./hooks/install.sh
./hooks/uninstall.sh

# Windows
./hooks/install.ps1
./hooks/uninstall.ps1
```

既存 `~/.claude/settings.json` への安全マージ（既存エントリ破壊なし・重複追加なし）で SessionStart / UserPromptSubmit / Statusline を導入する。

### ベンチマーク第4アーム `terse`（v1.3.0〜）

「genshijin の削減効果は、単に『簡潔に答えて』と指示すれば再現できるのでは？」という疑問への正直な回答として、第4アーム `terse`（簡潔指示のみ・ルール無し）を追加した。

現行ベンチマークは4アーム比較になっている。

- `通常`（敬語あり）
- `簡潔`（terse 指示のみ）
- `caveman`（英語圧縮スキル）
- `genshijin`（日本語特化スキル）

`genshijin vs 簡潔` の差分こそが、skill 自体が汎用的な terse 指示を超えて削減する純粋な効果量になる。

## v1.4.0 技術深掘り

v1.4.0 で本家 caveman v1.3.0 以降の機能をまとめて移植した。中でも実装としておもしろい3つを掘り下げる。

### MCP middleware proxy の仕組み

`genshijin-shrink` は MCP（Model Context Protocol）の **stdio middleware proxy** だ。Claude（or 任意の MCP client）と upstream MCP server の間に挟まり、JSON-RPC レスポンス内の `description` field だけを圧縮する。

なぜこれが効くか。MCP サーバーは Claude に「このツールが使えるよ」と教えるとき、`tools/list` という RPC で全ツールのメタデータを返す。これがトークンを食う。例えば Filesystem MCP サーバーは数十のツール × 各 200〜400 トークンの英語 description で **数千トークンを毎セッション開始時に消費**する。

genshijin-shrink はそこを削る。

```
Claude  ←→  genshijin-shrink (proxy)  ←→  upstream MCP server
                ↑
        tools/list レスポンスを intercept
        description field のみ圧縮
        コード/URL/パス/識別子は byte-for-byte 保護
```

実装で気をつけたポイント:

1. **stdio line-buffering**：JSON-RPC は1行1メッセージなので両方向で line buffer を入れる。途中で stdin/stdout が部分的に flush されても reassemble する。
2. **保護トークンの sentinel 置換**：圧縮前に code block / URL / パス / CamelCase 識別子を sentinel 文字列に置換 → 散文部分だけを正規表現で削る → sentinel を元に戻す。これで `useEffect` や `https://...` を絶対に壊さない。
3. **request side は無変更で pass-through**：upstream に向かう request body は触らない。`tools/call` のレスポンスも触らない（content を mutate すると downstream parsing が壊れるリスクが高い）。**v1 は徹底的に保守的**にして、`tools/list` / `prompts/list` / `resources/list` の `description` だけに介入する。

```js
// 保護パターン (mcp-servers/genshijin-shrink/compress.js)
const PROTECTED_PATTERNS = [
  /```[\s\S]*?```/g,                          // fenced code
  /`[^`\n]+`/g,                               // inline code
  /\bhttps?:\/\/\S+/gi,                       // URLs
  /\b[\w.-]*[\/\\][\w.\/\\\-]+/g,             // paths
  /\b[A-Z][A-Za-z0-9]*(?:_[A-Z][A-Za-z0-9]*)+\b/g, // CONST_CASE
  /\b\w+\.\w+(?:\.\w+)*\(\)?/g,               // dotted.method()
  /[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/g,      // function calls
  /\b\d+\.\d+\.\d+\b/g,                       // semver
];
```

LSP（Language Server Protocol）に触ったことがあるエンジニアなら、stdio middleware proxy のパターンは馴染み深いはずだ。**MCP も同じ JSON-RPC ベース**なので、同じ middleware アプローチが効く。MCP エコシステムが今後広がっていくほど、この種の proxy 系ツールの価値は上がる。

### USD換算の見積もり方法

`/genshijin-stats` は「セッションで $29 削減」みたいな数字を出す。これがどう計算されているか説明する。

#### Step 1: 実消費トークンの取得

Claude Code はセッションログを `~/.claude/projects/<project>/<session-id>.jsonl` に書き出す。1行1JSON エントリで、assistant メッセージには `usage.output_tokens` が含まれる。

```js
// hooks/genshijin-stats.js
function parseSession(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let outputTokens = 0, turns = 0, model = null;
  for (const line of raw.split('\n')) {
    const entry = JSON.parse(line);
    if (entry.type !== 'assistant') continue;
    outputTokens += entry.message.usage.output_tokens || 0;
    turns++;
    if (!model) model = entry.message.model;
  }
  return { outputTokens, turns, model };
}
```

ここでポイントは「**AI 推定ではなく実ファイルから読む**」こと。Claude 自身に「君何トークン使った？」と聞くと適当な数字を返してくる。フックスクリプトが直接 JSONL を parse して数えるので、数値の信頼性は 100%。

#### Step 2: 推定削減量の計算

ベンチマークで「genshijin 通常モードは平均 65% 削減」と分かっている。`actual_output = normal_output × (1 - 0.65)` の関係から逆算:

```
estimated_normal = actual_output / (1 - 0.65)
estimated_saved  = estimated_normal - actual_output
```

つまり実出力が 18,000 トークンなら、推定で 51,400 トークン使うはずだったところを 33,400 トークン削った計算になる。

#### Step 3: USD 換算

Anthropic の出力トークン pricing を model id prefix で照合する:

```js
const MODEL_OUTPUT_PRICE_PER_M = [
  ['claude-opus-4',     75.00],
  ['claude-sonnet-4',   15.00],
  ['claude-haiku-4',     4.00],
  // ...
];

function priceForModel(model) {
  for (const [prefix, price] of MODEL_OUTPUT_PRICE_PER_M) {
    if (model.startsWith(prefix)) return price;
  }
  return null;
}
```

prefix 照合にしている理由：`claude-sonnet-4-20250514` も `claude-sonnet-4-7` も同じ料金階層なので、point release ごとに table を更新する手間を避ける。新しいモデル世代が出たときだけ entry を追加すれば良い。

最終計算:

```
estimated_saved_usd = (estimated_saved_tokens / 1_000_000) × price_per_million
```

これで「セッションで $0.51 削減」が出る。

#### なぜこれが「正直な数字」なのか

`estimated_saved` は **平均 65%** という前提が成立している場合の見積もり。タスクによっては圧縮率が 40% のこともあるし 80% のこともある。だから出力には常にこう書く:

> 推定値 = benchmarks/ 平均値由来。実数はタスク依存。

実消費（左半分）は 100% 正確。推定削減（右半分）は **事前ベンチマーク統計の適用結果** であってモデルが幻覚で答えた数字ではない。これがさり気ないけど大事。

#### Lifetime 集計

`.genshijin-history.jsonl` に session 毎のスナップショットを append し、`/genshijin-stats --all` で集計する。**`session_id` で latest-per-session を取る**ことで、同セッション内で何度 `/stats` を叩いてもダブルカウントを避けている:

```js
const latestPerSession = new Map();
for (const entry of historyEntries) {
  const id = entry.session_id;
  const prev = latestPerSession.get(id);
  if (!prev || entry.ts >= prev.ts) latestPerSession.set(id, entry);
}
```

これは時系列ログを集計するときの定番パターン。Datadog や Prometheus を触ったことがあるなら馴染みの dedup ロジックだ。

エンジニアが [`rtk gain`](https://github.com/your-handle/rtk) や `time` コマンドの出力を眺めるのが好きなのと同じで、**自分が削った数字が見えると嬉しい**。`genshijin-stats` も同じ気持ちで作った。

### subagent 圧縮による長セッション持続

`genshijin-crew` は3つの Claude Code subagent preset。

| Subagent | 役割 |
|----------|------|
| `genshijin-investigator` | read-only コード位置特定（haiku model） |
| `genshijin-builder` | 1-2ファイル surgical 編集 |
| `genshijin-reviewer` | severity-tagged レビュー（haiku model） |

なぜこれが必要か。Claude Code には `Explore`（vanilla）という subagent があって、コードを探させたら散文で結果を返してくる。

```
Sure! I'll search for the safeWriteFlag function. I found it defined in
hooks/genshijin-config.js at line 81. It's an atomic write function that
uses O_NOFOLLOW to prevent symlink attacks. It's called from...
（2,000トークン）
```

この 2,000 トークンが **主スレッドのコンテキストに verbatim 注入される**。20回 Explore を叩くと 40,000 トークンが脇の調査ログでコンテキストを食う。長セッションが context exhaustion で死ぬ典型パターン。

`genshijin-investigator` は同じ仕事を圧縮形式で返す:

```
Defs:
- hooks/genshijin-config.js:81 — `safeWriteFlag` — atomic write w/ O_NOFOLLOW
Callers:
- hooks/genshijin-mode-tracker.js:33,87
- hooks/genshijin-activate.js:40
1 def, 2 callers.
（700トークン）
```

3分の1のトークンで同じ情報。**delegations が多いほど効く**ので、1セッションで 30 〜 50 回 subagent を呼ぶような長作業（refactoring / migration / 大規模調査）で context budget が大きく持続する。

実装上のキモは「**出力契約を厳密に書いた SKILL.md**」だ。subagent に「圧縮して返してね」と頼むだけだと表記揺れが出る。だから出力フォーマットを SKILL.md に明示する:

```
出力形式:
<path:line> — `<symbol>` — <≤6語メモ>

3行以上時は1語ヘッダ付与: Defs: / Refs: / Callers: / Tests: / Imports:
0ヒット → No match.
末尾 → 集計: 2 defs, 5 refs.
```

これで主スレッド側は `path:\d+` で grep して結果を機械的に拾える。**human-readable と machine-readable の両立**は subagent 設計の難所で、cavecrew はそこをよく解いている。

### モデル独自の挙動が必要な領域は LLM に任せ、構造化された結果が欲しい場面は subagent + 出力契約で固める

これが v1.4.0 で広く適用された設計原則だ。`/genshijin-stats` も同様で、数値計算を Claude にやらせず Node スクリプトに任せ、Claude は表示しか担当しない（フックが `decision: "block"` で文字列を返すだけ）。LLM の周辺ツールを書くときの定石として覚えておくと使い回せる。

## まとめ

LLMのトークン消費を減らすアプローチには、モデルの切り替え、コンテキストの刈り込み、プロンプトの工夫などがある。caveman / genshijin は「**出力側の文体を制御する**」というシンプルかつ効果的な手法だ。

特にgenshijinが示したのは、**言語ごとに冗長性の構造が違う**という事実だ。英語の冗長性は付加的（前置き、フィラー、冠詞）で、日本語の冗長性は構造的（敬語、助詞連鎖、文末処理）。汎用的な圧縮ルールでは後者を取りこぼす。

我々エンジニアは日々、データの圧縮・最適化をやっている。gzip、brotli、Protocol Buffers──すべて「伝えたい情報はそのままに、冗長な表現を削る」という思想だ。genshijinがやっているのは、まさにそれの自然言語版にすぎない。

あなたのClaudeも、原始人になれる。

---

**ウェブサイト**: [https://interfacex-co-jp.github.io/genshijin/](https://interfacex-co-jp.github.io/genshijin/)
**リポジトリ**: [InterfaceX-co-jp/genshijin](https://github.com/InterfaceX-co-jp/genshijin)
**元プロジェクト**: [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)
**ライセンス**: MIT
