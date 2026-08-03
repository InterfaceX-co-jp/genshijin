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
const {
  readFlag,
  appendFlag,
  readHistory,
  safeWriteFlag,
  VALID_MODES,
  MODE_LOG_BASENAME,
} = require('./genshijin-config');

// benchmarks/results/*.json の平均削減率。caveman 本家は 'full' のみ計測済。
// genshijin は 通常モード = 0.65 と仮置き（benchmarks/run.py 結果反映時に更新）。
const COMPRESSION = { 'normal': 0.65 };

const DEFAULT_RULE_OVERHEAD_TOKENS_PER_TURN = 1250;

function ruleOverheadPerTurn() {
  const raw = process.env.GENSHIJIN_RULE_OVERHEAD_TOKENS;
  if (raw === undefined) return DEFAULT_RULE_OVERHEAD_TOKENS_PER_TURN;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_RULE_OVERHEAD_TOKENS_PER_TURN;
}

function deriveNet({ estSavedTokens, turns }) {
  const overheadTokens = Math.max(0, turns || 0) * ruleOverheadPerTurn();
  return {
    overheadTokens,
    netTokens: (estSavedTokens || 0) - overheadTokens,
  };
}

// Anthropic 公開 output token 価格 USD per million。モデルID prefix で照合 →
// claude-sonnet-4-20250514, claude-sonnet-4-7 等のポイントリリース横断対応。
// 価格変更時は https://www.anthropic.com/pricing から更新。
const MODEL_OUTPUT_PRICE_PER_M = [
  ['claude-opus-4-0',    75.00],
  ['claude-opus-4-1',    75.00],
  ['claude-opus-4-2025', 75.00],
  ['claude-opus-4',      25.00],
  ['claude-sonnet-4',   15.00],
  ['claude-haiku-4',      5.00],
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
  catch {
    return {
      outputTokens: 0,
      cacheReadTokens: 0,
      turns: 0,
      model: null,
      messages: [],
    };
  }

  let outputTokens = 0;
  let cacheReadTokens = 0;
  let turns = 0;
  let model = null;
  const messages = [];
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
    const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
    messages.push({
      ts: Number.isFinite(ts) ? ts : null,
      outputTokens: usage.output_tokens || 0,
    });
  }
  return { outputTokens, cacheReadTokens, turns, model, messages };
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

function readModeLog(logPath, sessionId) {
  const rows = [];
  for (const line of readHistory(logPath)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.ts)) continue;
    if (sessionId && entry.session_id !== sessionId) continue;
    const normalize = value => {
      if (value == null) return null;
      const mode = String(value);
      return VALID_MODES.includes(mode) ? mode : undefined;
    };
    const mode = normalize(entry.mode);
    const prev = normalize(entry.prev);
    if (mode === undefined || prev === undefined) continue;
    rows.push({ ts: entry.ts, mode, prev });
  }
  rows.sort((a, b) => a.ts - b.ts);
  return rows;
}

function attributeByMode({ messages, modeLog, mode, flagMtimeMs, outputTokens }) {
  const currentKey = mode || 'none';
  const sessionMessages = messages || [];
  const timestamps = sessionMessages
    .map(message => message.ts)
    .filter(timestamp => timestamp != null);
  const firstTs = timestamps.length ? Math.min(...timestamps) : null;

  let events = modeLog || [];
  let basis = 'log';
  let prefixMode;
  if (events.length === 0) {
    if (flagMtimeMs != null && firstTs != null && flagMtimeMs > firstTs) {
      events = [{ ts: flagMtimeMs, mode: mode || null }];
      basis = 'flag-mtime';
    } else {
      return {
        byMode: { [currentKey]: outputTokens || 0 },
        unknownTokens: 0,
        basis: 'whole-session',
      };
    }
  } else {
    prefixMode = events[0].prev;
  }

  const byMode = {};
  let unknownTokens = 0;
  const add = (key, tokens) => {
    byMode[key] = (byMode[key] || 0) + tokens;
  };
  for (const message of sessionMessages) {
    if (message.ts == null) {
      unknownTokens += message.outputTokens;
      continue;
    }
    let active;
    for (const event of events) {
      if (event.ts <= message.ts) active = event;
      else break;
    }
    if (active) add(active.mode || 'none', message.outputTokens);
    else if (prefixMode !== undefined) add(prefixMode || 'none', message.outputTokens);
    else unknownTokens += message.outputTokens;
  }
  return { byMode, unknownTokens, basis };
}

function wholeSessionAttribution(mode, outputTokens) {
  return {
    byMode: { [mode || 'none']: outputTokens || 0 },
    unknownTokens: 0,
    basis: 'whole-session',
  };
}

function deriveSavings({ outputTokens, mode, model, byMode }) {
  const attributed = byMode || { [mode || 'none']: outputTokens || 0 };
  let estSavedTokens = 0;
  for (const [key, tokens] of Object.entries(attributed)) {
    const ratio = COMPRESSION[key];
    if (ratio == null || tokens <= 0) continue;
    estSavedTokens += Math.round(tokens / (1 - ratio)) - tokens;
  }
  const price = priceForModel(model);
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

function formatShare({ outputTokens, turns, mode, model, attribution }) {
  if (turns === 0) {
    return '🪨 原始人モード起動済 ターン未開始 — genshijin';
  }
  const attributed = attribution || wholeSessionAttribution(mode, outputTokens);
  const { estSavedTokens, estSavedUsd } = deriveSavings({
    byMode: attributed.byMode,
    model,
  });
  if (estSavedTokens > 0) {
    const usd = estSavedUsd > 0 ? ` (~${formatUsd(estSavedUsd)})` : '';
    return `🪨 ${turns}ターンで output ${estSavedTokens.toLocaleString()} tokens 削減${usd} — genshijin`;
  }
  return `🪨 ${turns}ターン, ${outputTokens.toLocaleString()} output tokens — genshijin`;
}

function formatStats({
  outputTokens,
  cacheReadTokens,
  turns,
  mode,
  model,
  sessionPath,
  compressed,
  attribution,
}) {
  const sep = '──────────────────────────────────';
  const shortPath = sessionPath && sessionPath.length > 45
    ? '...' + sessionPath.slice(-45)
    : (sessionPath || '');

  if (turns === 0) {
    return `\n原始人 Stats\n${sep}\n対話未開始 — 初回応答後に Stats 利用可能。\n${sep}\n`;
  }

  const attributed = attribution || wholeSessionAttribution(mode, outputTokens);
  const activeModes = Object.keys(attributed.byMode)
    .filter(key => attributed.byMode[key] > 0);
  const uniform = attributed.unknownTokens === 0 &&
    (activeModes.length === 0 ||
      (activeModes.length === 1 && activeModes[0] === (mode || 'none')));
  const ratio = COMPRESSION[mode] != null ? COMPRESSION[mode] : null;
  const price = priceForModel(model);

  let savings;
  let footer = '';
  if (!uniform) {
    const { estSavedTokens, estSavedUsd } = deriveSavings({
      byMode: attributed.byMode,
      model,
    });
    const lines = [
      attributed.basis === 'flag-mtime'
        ? 'モードがセッション途中で設定されたため、変更後のみ集計:'
        : 'セッション途中のモード変更を反映:',
    ];
    for (const key of activeModes) {
      const tokens = attributed.byMode[key];
      const modeRatio = COMPRESSION[key];
      const label = key === 'none' ? '原始人off' : key;
      const estimate = modeRatio == null
        ? '推定対象外'
        : `推定${(Math.round(tokens / (1 - modeRatio)) - tokens).toLocaleString()}削減`;
      lines.push(`  ${label}: ${tokens.toLocaleString()} tokens (${estimate})`);
    }
    if (attributed.unknownTokens > 0) {
      lines.push(`  モード不明: ${attributed.unknownTokens.toLocaleString()} tokens (推定除外)`);
    }
    lines.push(`推定output削減:          ${estSavedTokens.toLocaleString()}`);
    if (estSavedUsd > 0) lines.push(`推定削減USD:             ~${formatUsd(estSavedUsd)}`);
    savings = lines.join('\n');
    footer = 'モード判定可能な区間のみ推定。削減率はoutput tokenのみ。入力/cache使用量は未削減。';
  } else if (ratio !== null) {
    const estNormal = Math.round(outputTokens / (1 - ratio));
    const estSaved = estNormal - outputTokens;
    const { overheadTokens, netTokens } = deriveNet({
      estSavedTokens: estSaved,
      turns,
    });
    let usdLine = '';
    if (price !== null) {
      const usd = (estSaved / 1_000_000) * price;
      usdLine = `推定削減USD:           ~${formatUsd(usd)}\n`;
      footer = `推定値 = benchmarks/ 平均値由来。価格 = ${model}。削減率はoutput tokenのみ。入力/cache使用量は未削減。`;
    } else {
      footer = '推定値 = benchmarks/ 平均値由来。削減率はoutput tokenのみ。入力/cache使用量は未削減。';
    }
    savings = `推定 原始人未使用時:   ${estNormal.toLocaleString()}\n` +
              `推定output削減:          ${estSaved.toLocaleString()} (~${Math.round(ratio * 100)}%)\n` +
              `推定ルール入力コスト:     ${overheadTokens.toLocaleString()} (~${ruleOverheadPerTurn().toLocaleString()}/turn)\n` +
              `推定net:                 ${netTokens >= 0 ? '+' : ''}${netTokens.toLocaleString()}\n` +
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
  const sessionId = path.basename(sessionFile, '.jsonl');
  const flagPath = path.join(claudeDir, '.genshijin-active');
  const flagMode = readFlag(flagPath);
  const mode = flagMode === 'off' ? null : flagMode;
  let flagMtimeMs = null;
  try { flagMtimeMs = fs.statSync(flagPath).mtimeMs; } catch (e) {}
  const attribution = attributeByMode({
    messages: parsed.messages,
    modeLog: readModeLog(path.join(claudeDir, MODE_LOG_BASENAME), sessionId),
    mode,
    flagMtimeMs,
    outputTokens: parsed.outputTokens,
  });

  if (parsed.turns > 0) {
    const { estSavedTokens, estSavedUsd } = deriveSavings({
      byMode: attribution.byMode,
      model: parsed.model,
    });
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
    process.stdout.write(formatShare({ ...parsed, mode, attribution }) + '\n');
  } else {
    const scanDirs = [claudeDir, process.cwd()].filter((d, i, a) => a.indexOf(d) === i);
    const compressed = summarizeCompressed(findCompressedPairs(scanDirs));
    process.stdout.write(formatStats({
      ...parsed,
      mode,
      sessionPath: sessionFile,
      compressed,
      attribution,
    }));
  }
}

if (require.main === module) main();

module.exports = {
  formatStats, formatShare, formatHistory, aggregateHistory, parseDuration, deriveSavings,
  deriveNet, ruleOverheadPerTurn,
  parseSession, priceForModel, formatUsd, COMPRESSION, MODEL_OUTPUT_PRICE_PER_M,
  findCompressedPairs, summarizeCompressed, humanizeTokens,
  readModeLog, attributeByMode,
};
