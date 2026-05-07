# genshijin-shrink

> MCP middleware。任意の MCP server を wrap。散文だけ削る。技術的中身は残す。

`genshijin-shrink` は [Model Context Protocol](https://modelcontextprotocol.io) の stdio proxy。Claude (or 任意 MCP client) と upstream MCP server の間に挟まり、散文 field (`description` 等) を [genshijin](../..) スキルと同境界で圧縮 — コード/URL/パス/識別子は保持し、冠詞/フィラー/ぼかし/前置き/敬語語尾を削除。

結果: モデルがツールカタログを読むのに使うトークンが減る。ツールセマンティクスは不変。

## インストール

```bash
npm install -g genshijin-shrink
# or 直接実行
npx genshijin-shrink <upstream-command> [...args]
```

## 使い方

Claude Code (or 他 MCP client) config で任意の MCP server を wrap:

```jsonc
{
  "mcpServers": {
    "fs-shrunk": {
      "command": "npx",
      "args": [
        "genshijin-shrink",
        "npx", "@modelcontextprotocol/server-filesystem", "/path/to/dir"
      ]
    }
  }
}
```

Proxy は upstream を subprocess として spawn、`tools/list`/`prompts/list`/`resources/list` レスポンスを intercept、`description` field (および `GENSHIJIN_SHRINK_FIELDS` 指定の field) を rewrite。

## 変更しないもの

設計上、v1 は保守的:

- **upstream への request body** は無変更で pass-through
- **tool call response** (`tools/call`) は無変更で pass-through。upstream がモデルに返すデータを silent に mutate するリスク回避。
- **識別子・URL・パス・コードっぽい token** は散文内でも保護。genshijin と同境界。

## 設定

| 環境変数 | デフォルト | 内容 |
|---|---|---|
| `GENSHIJIN_SHRINK_FIELDS` | `description` | 圧縮対象 field 名 comma-separated |
| `GENSHIJIN_SHRINK_DEBUG` | `0` | `1` で field 別圧縮 delta を stderr に log |

## ステータス

Pre-1.0 — 圧縮ルール・field set は変更可能性あり。Plugin は [genshijin ecosystem](https://github.com/InterfaceX-co-jp/genshijin) の一部。

## ライセンス

MIT。
