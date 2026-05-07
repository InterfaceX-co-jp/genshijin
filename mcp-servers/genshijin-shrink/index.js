#!/usr/bin/env node
// genshijin-shrink — MCP middleware proxy。upstream MCP server を wrap し
// 散文 field を圧縮 → モデル消費トークン削減。
//
// 使い方:
//   genshijin-shrink <upstream-command> [...args]
//
// 例 (filesystem MCP server を wrap):
//   "mcpServers": {
//     "fs-shrunk": {
//       "command": "npx",
//       "args": ["genshijin-shrink", "npx", "@modelcontextprotocol/server-filesystem", "/some/path"]
//     }
//   }
//
// 圧縮対象:
//   - tools/list, prompts/list, resources/list レスポンスの "description"
//   - 同境界 = genshijin-compress: コード/URL/パス/識別子保持
//
// v1で意図的に変更しないもの:
//   - tools/call レスポンス content (downstream parsing 破壊リスク高)
//   - upstream への request payload
//
// 環境変数:
//   GENSHIJIN_SHRINK_FIELDS  圧縮対象 field 名 comma-separated (default: description)
//   GENSHIJIN_SHRINK_DEBUG=1  圧縮 delta を stderr に log

const { spawn } = require('child_process');
const { compressDescriptionsInPlace, compress } = require('./compress');

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stderr.write('genshijin-shrink: upstream command 不足。\n');
  process.stderr.write('使い方: genshijin-shrink <upstream-command> [...args]\n');
  process.exit(2);
}

const debug = process.env.GENSHIJIN_SHRINK_DEBUG === '1';
const fields = (process.env.GENSHIJIN_SHRINK_FIELDS || 'description')
  .split(',').map(s => s.trim()).filter(Boolean);

const upstream = spawn(args[0], args.slice(1), {
  stdio: ['pipe', 'pipe', 'inherit'],
});

upstream.on('error', err => {
  process.stderr.write(`genshijin-shrink: upstream spawn 失敗: ${err.message}\n`);
  process.exit(1);
});

upstream.on('exit', (code, signal) => {
  if (signal) process.exit(128 + (signal === 'SIGTERM' ? 15 : 9));
  process.exit(code || 0);
});

// JSON-RPC framing over stdio: メッセージは改行区切り (MCP stdio transport は
// LSP-like content だが多くの server は1行1JSONを emit)。両方向で line-buffer。
function makeLineBuffer(onLine) {
  let buf = '';
  return chunk => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim()) onLine(line);
    }
  };
}

function transformResponse(msg) {
  if (!msg || !msg.result || typeof msg.result !== 'object') return msg;
  const r = msg.result;
  let compressedSomething = false;

  for (const arrayName of ['tools', 'prompts', 'resources', 'resourceTemplates']) {
    if (Array.isArray(r[arrayName])) {
      for (const item of r[arrayName]) {
        for (const field of fields) {
          if (typeof item[field] === 'string') {
            const before = item[field];
            const out = compress(before).compressed;
            if (out !== before) {
              item[field] = out;
              compressedSomething = true;
              if (debug) {
                process.stderr.write(
                  `[genshijin-shrink] ${arrayName}.${item.name || '?'}.${field}: ` +
                  `${before.length}→${out.length} bytes\n`
                );
              }
            }
          }
        }
      }
    }
  }

  // 一部 server は nested schema に description を埋める。top-level で何も
  // matchしなかった場合のみ walk → tool nested params の二重処理回避。
  if (!compressedSomething) compressDescriptionsInPlace(r, fields);

  return msg;
}

upstream.stdout.on('data', makeLineBuffer(line => {
  let msg;
  try { msg = JSON.parse(line); } catch {
    process.stdout.write(line + '\n');
    return;
  }
  const out = transformResponse(msg);
  process.stdout.write(JSON.stringify(out) + '\n');
}));

process.stdin.on('data', chunk => upstream.stdin.write(chunk));
process.stdin.on('end',  () => upstream.stdin.end());
