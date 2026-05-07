#!/usr/bin/env node
// genshijin-stats — Claude Code セッションログを読み、リアルトークン使用量と
// ベンチマークから推定削減トークン/USDを表示。
//
// 直接実行:    node hooks/genshijin-stats.js
// Claude内:    /genshijin-stats が UserPromptSubmit hook 経由で起動。
// hook integration では --session-file <transcript_path> を渡すため、
// アクティブセッション以外の最新JSONLを誤読しない。

const fs = require('fs');
const path = require('path');
const os = require('os');
const { readFlag, appendFlag, readHistory, safeWriteFlag } = require('./genshijin-config');

// benchmarks/results/*.json の平均削減率。caveman 本家は 'full' のみ計測済。
// genshijin は 通常モード = 0.65 と仮置き（benchmarks/run.py 結果反映時に更新）。
const COMPRESSION = { 'normal': 0.65 };

// Anthropic 公開 output token 価格 USD per million。モデルID prefix で照合 →
// claude-sonnet-4-20250514, claude-sonnet-4-7 等のポイントリリース横断対応。
// 価格変更時は https://www.anthropic.com/pricing から更新。
const MODEL_OUTPUT_PRICE_PER_M = [
  ['claude-opus-4',     75.00],
  ['claude-sonnet-4',   15.00],
  ['claude-haiku-4',     4.00],
  ['claude-3-5-sonnet', 15.00],
  ['claude-3-5-haiku',   4.00],
  ['claude-3-opus',     75.00],
];

function priceForModel(model) {
  if (!model) return null;
  for (const [prefix, price] of MODEL_OUTPUT_PRICE_PER_M) {
    if (model.startsWith(prefix)) return price;
  }
  return null;
}

function formatUsd(amount) {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

function findRecentSession(claudeDir) {
  const projectsDir = path.join(claudeDir, 'projects');
  let entries;
  try { entries = fs.readdirSync(projectsDir, { withFileTypes: true }); }
  catch { return null; }

  let best = null;
  const stack = entries.map(e => path.join(projectsDir, e.name));
  while (stack.length) {
    const p = stack.pop();
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      try {
        for (const child of fs.readdirSync(p)) stack.push(path.join(p, child));
      } catch {}
    } else if (p.endsWith('.jsonl') && (!best || st.mtimeMs > best.mtime)) {
      best = { file: p, mtime: st.mtimeMs };
    }
  }
  return best ? best.file : null;
}

function parseSession(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch { return { outputTokens: 0, cacheReadTokens: 0, turns: 0, model: null }; }

  let outputTokens = 0;
  let cacheReadTokens = 0;
  let turns = 0;
  let model = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'assistant' || !entry.message) continue;
    const usage = entry.message.usage;
    if (!usage) continue;
    outputTokens    += usage.output_tokens           || 0;
    cacheReadTokens += usage.cache_read_input_tokens || 0;
    turns++;
    if (!model && entry.message.model) model = entry.message.model;
  }
  return { outputTokens, cacheReadTokens, turns, model };
}

// genshijin-compress が残す *.original.md / *.md ペアを検出。
// *.original.md バックアップが存在 → 兄弟 *.md は圧縮済メモリファイル。
// セッション開始毎に圧縮版を読込 → サイズ差 = セッション毎 input側削減 (passive)。
function findCompressedPairs(dirs) {
  const pairs = [];
  for (const dir of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.original.md')) continue;
      const base = entry.name.slice(0, -'.original.md'.length);
      const originalPath = path.join(dir, entry.name);
      const compressedPath = path.join(dir, `${base}.md`);
      let oSize, cSize;
      try {
        oSize = fs.statSync(originalPath).size;
        cSize = fs.statSync(compressedPath).size;
      } catch { continue; }
      if (oSize <= cSize) continue;
      pairs.push({ name: base, dir, originalSize: oSize, compressedSize: cSize });
    }
  }
  return pairs;
}

function summarizeCompressed(pairs) {
  if (!pairs || pairs.length === 0) return null;
  const totalOriginal = pairs.reduce((s, p) => s + p.originalSize, 0);
  const totalCompressed = pairs.reduce((s, p) => s + p.compressedSize, 0);
  const bytesSaved = totalOriginal - totalCompressed;
  // 日本語散文は 1.5〜2 char/token。ASCII含む混在で平均 ~3 byte/token と仮置き。
  // 概算ラベル付き。
  const tokensSaved = Math.round(bytesSaved / 3);
  return { count: pairs.length, bytesSaved, tokensSaved };
}

function deriveSavings({ outputTokens, mode, model }) {
  const ratio = COMPRESSION[mode] != null ? COMPRESSION[mode] : null;
  const price = priceForModel(model);
  if (ratio === null) return { estSavedTokens: 0, estSavedUsd: 0 };
  const estNormal = Math.round(outputTokens / (1 - ratio));
  const estSavedTokens = estNormal - outputTokens;
  const estSavedUsd = price !== null ? (estSavedTokens / 1_000_000) * price : 0;
  return { estSavedTokens, estSavedUsd };
}

function parseDuration(spec) {
  if (!spec) return null;
  const m = /^(\d+)([dh])$/.exec(spec.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return m[2] === 'd' ? n * 86_400_000 : n * 3_600_000;
}

function aggregateHistory(historyPath, sinceMs) {
  const lines = readHistory(historyPath);
  const cutoff = sinceMs ? Date.now() - sinceMs : null;
  const latestPerSession = new Map();
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;
    if (cutoff !== null && (entry.ts || 0) < cutoff) continue;
    const id = entry.session_id || '_';
    const prev = latestPerSession.get(id);
    if (!prev || (entry.ts || 0) >= (prev.ts || 0)) latestPerSession.set(id, entry);
  }
  let outputTokens = 0, estSavedTokens = 0, estSavedUsd = 0;
  for (const e of latestPerSession.values()) {
    outputTokens   += e.output_tokens     || 0;
    estSavedTokens += e.est_saved_tokens  || 0;
    estSavedUsd    += e.est_saved_usd     || 0;
  }
  return { sessions: latestPerSession.size, outputTokens, estSavedTokens, estSavedUsd };
}

function humanizeTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

function formatHistory({ sessions, outputTokens, estSavedTokens, estSavedUsd, since }) {
  const sep = '──────────────────────────────────';
  const window = since ? ` (直近 ${since})` : '';
  if (sessions === 0) {
    return `\n原始人 Stats — Lifetime${window}\n${sep}\nセッション履歴なし — 任意セッション内で /genshijin-stats を実行すると追跡開始。\n${sep}\n`;
  }
  const usdLine = estSavedUsd > 0 ? `推定削減USD:           ~${formatUsd(estSavedUsd)}\n` : '';
  return `\n原始人 Stats — Lifetime${window}\n${sep}\n` +
    `セッション数:   ${sessions.toLocaleString()}\n${sep}\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `推定削減トークン:       ${estSavedTokens.toLocaleString()}\n` +
    usdLine + sep + '\n';
}

function formatShare({ outputTokens, turns, mode, model }) {
  if (turns === 0) {
    return '🪨 原始人モード起動済 ターン未開始 — genshijin';
  }
  const ratio = COMPRESSION[mode] != null ? COMPRESSION[mode] : null;
  const price = priceForModel(model);

  if (ratio !== null) {
    const estSaved = Math.round(outputTokens / (1 - ratio)) - outputTokens;
    let usd = '';
    if (price !== null) {
      const amt = (estSaved / 1_000_000) * price;
      usd = ` (~${formatUsd(amt)})`;
    }
    return `🪨 ${turns}ターンで output ${estSaved.toLocaleString()} tokens 削減${usd} — genshijin`;
  }
  return `🪨 ${turns}ターン, ${outputTokens.toLocaleString()} output tokens — genshijin`;
}

function formatStats({ outputTokens, cacheReadTokens, turns, mode, model, sessionPath, compressed }) {
  const sep = '──────────────────────────────────';
  const shortPath = sessionPath && sessionPath.length > 45
    ? '...' + sessionPath.slice(-45)
    : (sessionPath || '');

  if (turns === 0) {
    return `\n原始人 Stats\n${sep}\n対話未開始 — 初回応答後に Stats 利用可能。\n${sep}\n`;
  }

  const ratio = COMPRESSION[mode] != null ? COMPRESSION[mode] : null;
  const price = priceForModel(model);

  let savings;
  let footer = '';
  if (ratio !== null) {
    const estNormal = Math.round(outputTokens / (1 - ratio));
    const estSaved = estNormal - outputTokens;
    let usdLine = '';
    if (price !== null) {
      const usd = (estSaved / 1_000_000) * price;
      usdLine = `推定削減USD:           ~${formatUsd(usd)}\n`;
      footer = `推定値 = benchmarks/ 平均値由来。価格 = ${model}。実数はタスク依存。`;
    } else {
      footer = '推定値 = benchmarks/ 平均値由来。実数はタスク依存。';
    }
    savings = `推定 原始人未使用時:   ${estNormal.toLocaleString()}\n` +
              `推定削減トークン:       ${estSaved.toLocaleString()} (~${Math.round(ratio * 100)}%)\n` +
              usdLine.replace(/\n$/, '');
  } else if (mode && mode !== 'off') {
    savings = `'${mode}' モード未ベンチマーク — 'normal' のみ計測済。`;
  } else {
    savings = '原始人モード非アクティブ。';
  }

  let memoryLine = '';
  if (compressed && compressed.count > 0) {
    const tokensApprox = compressed.tokensSaved.toLocaleString();
    memoryLine = `${sep}\nメモリ圧縮済:           ${compressed.count} 件, ` +
      `~${tokensApprox} tokens セッション開始毎削減 (概算)\n`;
  }

  return `\n原始人 Stats\n${sep}\n` +
    (shortPath ? `Session:  ${shortPath}\n` : '') +
    `Turns:    ${turns}\n${sep}\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `Cache-read tokens:     ${cacheReadTokens.toLocaleString()}\n${sep}\n` +
    `${savings}\n` +
    memoryLine +
    (footer ? footer + '\n' : '');
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--session-file');
  const sessionFileArg = i !== -1 ? args[i + 1] : null;
  const share = args.includes('--share');
  const all = args.includes('--all');
  const sinceIdx = args.indexOf('--since');
  const sinceArg = sinceIdx !== -1 ? args[sinceIdx + 1] : null;

  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const historyPath = path.join(claudeDir, '.genshijin-history.jsonl');

  if (all || sinceArg) {
    const sinceMs = parseDuration(sinceArg);
    if (sinceArg && sinceMs === null) {
      process.stderr.write(`genshijin-stats: --since は Nh または Nd 形式 (例: 7d, 24h)。受信: ${sinceArg}\n`);
      process.exit(2);
    }
    const agg = aggregateHistory(historyPath, sinceMs);
    process.stdout.write(formatHistory({ ...agg, since: sinceArg || null }));
    return;
  }

  const sessionFile = sessionFileArg || findRecentSession(claudeDir);

  if (!sessionFile) {
    process.stderr.write('genshijin-stats: Claude Code セッション未検出。\n');
    process.exit(1);
  }

  const parsed = parseSession(sessionFile);
  const mode = readFlag(path.join(claudeDir, '.genshijin-active'));

  if (parsed.turns > 0) {
    const { estSavedTokens, estSavedUsd } = deriveSavings({ ...parsed, mode });
    const sessionId = path.basename(sessionFile, '.jsonl');
    appendFlag(historyPath, JSON.stringify({
      ts: Date.now(),
      session_id: sessionId,
      mode: mode || null,
      model: parsed.model || null,
      output_tokens: parsed.outputTokens,
      est_saved_tokens: estSavedTokens,
      est_saved_usd: estSavedUsd,
    }));

    // statusline suffix: shell statusline が JSONL parse なしで cat 可能な小ファイル
    const agg = aggregateHistory(historyPath, null);
    const suffix = agg.estSavedTokens > 0 ? `⛏ ${humanizeTokens(agg.estSavedTokens)}` : '';
    safeWriteFlag(path.join(claudeDir, '.genshijin-statusline-suffix'), suffix);
  }

  if (share) {
    process.stdout.write(formatShare({ ...parsed, mode }) + '\n');
  } else {
    const scanDirs = [claudeDir, process.cwd()].filter((d, i, a) => a.indexOf(d) === i);
    const compressed = summarizeCompressed(findCompressedPairs(scanDirs));
    process.stdout.write(formatStats({ ...parsed, mode, sessionPath: sessionFile, compressed }));
  }
}

if (require.main === module) main();

module.exports = {
  formatStats, formatShare, formatHistory, aggregateHistory, parseDuration, deriveSavings,
  parseSession, priceForModel, formatUsd, COMPRESSION, MODEL_OUTPUT_PRICE_PER_M,
  findCompressedPairs, summarizeCompressed, humanizeTokens,
};
