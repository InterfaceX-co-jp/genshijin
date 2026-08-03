#!/usr/bin/env node
// genshijin — UserPromptSubmit フック。どの genshijin モードが有効か追跡。
// ユーザー入力から /genshijin 系コマンド or 自然言語トリガーを検出し、
// フラグファイルにモード書込。毎ターン補強リマインダも注入。

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const {
  getDefaultMode,
  safeWriteFlag,
  readFlag,
  recordModeChange,
  VALID_MODES,
} = require('./genshijin-config');

// 独立スキルモード — 自身のスラッシュコマンド (/genshijin-commit 等) で起動。
// /genshijin <arg> 経由で選択不可。
const INDEPENDENT_MODES = new Set(['commit', 'review', 'compress', 'help']);

// /genshijin <arg> で選択可能なベースモード（独立スキル除外）
const BASE_MODES = new Set(['polite', 'normal', 'extreme']);

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.genshijin-active');
const prevPath = path.join(claudeDir, '.genshijin-active.prev');

function setActiveMode(mode, sessionId) {
  const previous = readFlag(flagPath);
  const stored = mode || 'off';
  if (safeWriteFlag(flagPath, stored)) {
    recordModeChange(claudeDir, mode || null, sessionId, previous);
    return true;
  }
  return false;
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    let prompt = (data.prompt || '').trim();
    let normalized = prompt.toLowerCase().replace(/\s+/g, ' ');

    if (/<scheduled-task\b/.test(normalized)) return;

    // Claude Code は slash command をXML envelopeとして渡すため、literal形式へ復元。
    // 他コマンドの引数による自然言語トリガー誤発火は抑止。
    let skipNaturalLanguage = false;
    const envelopeName = /<command-name>\s*([^<\s]+)\s*<\/command-name>/.exec(normalized);
    if (envelopeName) {
      if (envelopeName[1].startsWith('/genshijin')) {
        const envelopeArgs = /<command-args>\s*([^<]*?)\s*<\/command-args>/.exec(normalized);
        const args = envelopeArgs ? envelopeArgs[1].trim() : '';
        prompt = args ? `${envelopeName[1]} ${args}` : envelopeName[1];
        normalized = prompt.toLowerCase().replace(/\s+/g, ' ');
      } else {
        skipNaturalLanguage = true;
      }
    }
    const lower = normalized;

    // /genshijin-stats — フック側でブロック実行し結果を reason として注入。
    // モデルは何もせずユーザーに数値を即時表示する。
    const statsMatch = /^\/genshijin(?::genshijin)?-stats(?:\s+(.*))?$/i.exec(prompt);
    if (statsMatch) {
      const tailArgs = (statsMatch[1] || '').trim().split(/\s+/).filter(Boolean);
      let block;
      try {
        const statsPath = path.join(__dirname, 'genshijin-stats.js');
        const argv = [statsPath];
        if (data.transcript_path) argv.push('--session-file', data.transcript_path);
        if (tailArgs.includes('--share')) argv.push('--share');
        if (tailArgs.includes('--all')) argv.push('--all');
        const sinceIdx = tailArgs.indexOf('--since');
        if (sinceIdx !== -1 && tailArgs[sinceIdx + 1]) {
          argv.push('--since', tailArgs[sinceIdx + 1]);
        }
        block = execFileSync(process.execPath, argv, {
          encoding: 'utf8',
          timeout: 5000,
        }).trim();
      } catch (e) {
        block = 'genshijin-stats: 起動失敗。手動実行: node hooks/genshijin-stats.js';
      }
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: '次のstatsブロックをコードフェンス内へ原文どおり表示。他の文章は禁止。\n\n' + block,
        },
      }));
      return;
    }

    // 自然言語アクティベーション
    const isQuestionJa = /(とは|って何|何ですか|何なの|について(?:説明|教えて)|どういう)/.test(prompt);
    const isQuestionEn = /^(?:what|what's|how|why|when|where|who|does|do|did|is|are|can|could|would|should|explain|tell me)\b/i.test(lower);
    const activateJa = !isQuestionJa && /(原始人|げんしじん)/.test(prompt) &&
      /(モード|起動|有効|オン|で|にして|化)/.test(prompt) &&
      !/(やめて|解除|停止|オフ|無効)/.test(prompt);
    const activateEn = !isQuestionEn && (
      /\b(activate|enable|turn on|start|talk like)\b.*\bgenshijin\b/i.test(prompt) ||
      /\bgenshijin\b.*\b(mode|activate|enable|turn on|start)\b/i.test(prompt)
    );

    if (!skipNaturalLanguage && (activateJa || activateEn) &&
        !/\b(stop|disable|turn off|deactivate)\b/i.test(lower)) {
      const m = getDefaultMode();
      if (m !== 'off') {
        setActiveMode(m, data.session_id);
      }
    }

    let setIndependentThisTurn = false;

    // /genshijin 系コマンド検出
    if (lower.startsWith('/genshijin')) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = (parts[1] || '').trim();

      let mode = null;

      if (cmd === '/genshijin-commit' || cmd === '/genshijin:genshijin-commit') {
        mode = 'commit';
      } else if (cmd === '/genshijin-review' || cmd === '/genshijin:genshijin-review') {
        mode = 'review';
      } else if (cmd === '/genshijin-compress' || cmd === '/genshijin:genshijin-compress') {
        mode = 'compress';
      } else if (cmd === '/genshijin-help' || cmd === '/genshijin:genshijin-help') {
        mode = 'help';
      } else if (cmd === '/genshijin' || cmd === '/genshijin:genshijin') {
        // 引数なし → デフォルトモード起動
        if (!arg) {
          mode = getDefaultMode();
        } else if (arg === 'off' || arg === 'stop' || arg === 'disable') {
          mode = 'off';
        } else if (arg === '丁寧' || arg.toLowerCase() === 'polite' || arg.toLowerCase() === 'teinei') {
          mode = 'polite';
        } else if (arg === '通常' || arg.toLowerCase() === 'normal' || arg.toLowerCase() === 'futsuu') {
          mode = 'normal';
        } else if (arg === '極限' || arg.toLowerCase() === 'extreme' || arg.toLowerCase() === 'kyokugen') {
          mode = 'extreme';
        }
        // 不正引数 → mode は null のまま、フラグ未変更（silent overwrite 防止）
      }

      // ホワイトリスト最終検証 — INDEPENDENT_MODES + BASE_MODES のみ書込許可
      if (mode === 'off') {
        setActiveMode(null, data.session_id);
        try { fs.unlinkSync(prevPath); } catch (e) {}
      } else if (mode && (BASE_MODES.has(mode) || INDEPENDENT_MODES.has(mode))) {
        if (INDEPENDENT_MODES.has(mode)) {
          const current = readFlag(flagPath);
          if (current && !INDEPENDENT_MODES.has(current)) {
            safeWriteFlag(prevPath, current);
          }
          setIndependentThisTurn = true;
        }
        setActiveMode(mode, data.session_id);
      }
    }

    // 解除検出 — 自然言語とスラッシュコマンド
    if (!skipNaturalLanguage && (
        /原始人やめて|原始人\s*解除|原始人\s*停止|原始人\s*オフ|原始人\s*無効/.test(prompt) ||
        /^(?:通常モード|通常モードに戻して)[。.!]?$/.test(prompt) ||
        (/通常モード/.test(prompt) && /原始人|げんしじん/.test(prompt)) ||
        /\b(stop|disable|deactivate|turn off)\b.*\bgenshijin\b/i.test(lower) ||
        /\bgenshijin\b.*\b(stop|disable|deactivate|turn off)\b/i.test(lower) ||
        /^(?:please\s+)?(?:go\s+|back\s+to\s+|switch\s+(?:back\s+)?to\s+|return\s+to\s+)?normal mode\b/i.test(lower) ||
        (/\bnormal mode\b/i.test(lower) && /\bgenshijin\b/i.test(lower)))) {
      setActiveMode(null, data.session_id);
      try { fs.unlinkSync(prevPath); } catch (e) {}
    }

    // commit/review/compress/help は1回限り。次の通常プロンプトで以前の文体へ復帰。
    const afterChangeMode = readFlag(flagPath);
    if (!setIndependentThisTurn && INDEPENDENT_MODES.has(afterChangeMode)) {
      const previous = readFlag(prevPath);
      if (previous && BASE_MODES.has(previous)) {
        setActiveMode(previous, data.session_id);
      } else {
        setActiveMode(null, data.session_id);
      }
      try { fs.unlinkSync(prevPath); } catch (e) {}
    }

    // 毎ターン補強:
    // SessionStart でフルルールセットを1度注入しても、他プラグインが毎ターン
    // 競合するスタイル指示を注入する環境ではドリフトする。毎ユーザー発話で
    // 短い補強リマインダをモデルの attention に置き続ける。
    //
    // 独立モード（commit/review/compress/help）はスキル側挙動と競合するためスキップ。
    // readFlag は symlink-safe + サイズ上限 + VALID_MODES ホワイトリスト。
    // 不正値は null → コンテキストに untrusted bytes 注入せず。
    const activeMode = readFlag(flagPath);
    if (activeMode && activeMode !== 'off' && !INDEPENDENT_MODES.has(activeMode)) {
      const LABEL = { polite: '丁寧', normal: '通常', extreme: '極限' };
      const label = LABEL[activeMode] || activeMode;
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "原始人モード有効 (" + label + ")。" +
            "敬語・クッション・前置き・ぼかし削除。体言止め可。" +
            "コード/コミット/PR/破壊的操作の確認時: 通常日本語。" +
            "テキスト形式ファイル（.md/.txt/.rst/.adoc/.yaml/.yml/.toml/.json/.xml/.html/.htm/.env/.ini/.cfg/.conf/.csv等）生成・編集依頼時: genshijin口調を自動適用しない。初回のみ「genshijin口調で書くか？」確認。No/無回答→通常日本語。確認済なら以降スキップ。ソースコード（.py/.js/.ts/.sh等）はコード本体は対象外、日本語コメント大量追加時のみ確認。"
        }
      }));
    }
  } catch (e) {
    // silent fail
  }
});
