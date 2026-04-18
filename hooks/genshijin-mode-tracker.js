#!/usr/bin/env node
// genshijin — UserPromptSubmit フック。どの genshijin モードが有効か追跡。
// ユーザー入力から /genshijin 系コマンド or 自然言語トリガーを検出し、
// フラグファイルにモード書込。毎ターン補強リマインダも注入。

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode, safeWriteFlag, readFlag } = require('./genshijin-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.genshijin-active');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim();
    const lower = prompt.toLowerCase();

    // 自然言語アクティベーション
    // 「原始人モード」「原始人で」「原始人にして」「短く」「簡潔に」「トークン節約」等
    const activateJa = /(原始人|げんしじん)/.test(prompt) &&
      /(モード|起動|有効|オン|で|にして|化)/.test(prompt) &&
      !/(やめて|解除|停止|オフ|無効)/.test(prompt);
    const activateEn = /\b(activate|enable|turn on|start|talk like)\b.*\bgenshijin\b/i.test(prompt) ||
      /\bgenshijin\b.*\b(mode|activate|enable|turn on|start)\b/i.test(prompt);

    if ((activateJa || activateEn) && !/\b(stop|disable|turn off|deactivate)\b/i.test(lower)) {
      const m = getDefaultMode();
      if (m !== 'off') safeWriteFlag(flagPath, m);
    }

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
        // 日本語レベル名 → ASCII 内部識別子
        if (arg === '丁寧' || arg.toLowerCase() === 'polite' || arg.toLowerCase() === 'teinei') {
          mode = 'polite';
        } else if (arg === '通常' || arg.toLowerCase() === 'normal' || arg.toLowerCase() === 'futsuu') {
          mode = 'normal';
        } else if (arg === '極限' || arg.toLowerCase() === 'extreme' || arg.toLowerCase() === 'kyokugen') {
          mode = 'extreme';
        } else if (arg.toLowerCase() === 'off') {
          mode = 'off';
        } else {
          mode = getDefaultMode();
        }
      }

      if (mode && mode !== 'off') {
        safeWriteFlag(flagPath, mode);
      } else if (mode === 'off') {
        try { fs.unlinkSync(flagPath); } catch (e) {}
      }
    }

    // 解除検出 — 自然言語とスラッシュコマンド
    if (/原始人やめて|原始人\s*解除|原始人\s*停止|原始人\s*オフ|原始人\s*無効/.test(prompt) ||
        /通常モード/.test(prompt) ||
        /\b(stop|disable|deactivate|turn off)\b.*\bgenshijin\b/i.test(lower) ||
        /\bgenshijin\b.*\b(stop|disable|deactivate|turn off)\b/i.test(lower) ||
        /\bnormal mode\b/i.test(lower)) {
      try { fs.unlinkSync(flagPath); } catch (e) {}
    }

    // 毎ターン補強:
    // SessionStart でフルルールセットを1度注入しても、他プラグインが毎ターン
    // 競合するスタイル指示を注入する環境ではドリフトする。毎ユーザー発話で
    // 短い補強リマインダをモデルの attention に置き続ける。
    //
    // 独立モード（commit/review/compress/help）はスキル側挙動と競合するためスキップ。
    // readFlag は symlink-safe + サイズ上限 + VALID_MODES ホワイトリスト。
    // 不正値は null → コンテキストに untrusted bytes 注入せず。
    const INDEPENDENT_MODES = new Set(['commit', 'review', 'compress', 'help']);
    const activeMode = readFlag(flagPath);
    if (activeMode && !INDEPENDENT_MODES.has(activeMode)) {
      const LABEL = { polite: '丁寧', normal: '通常', extreme: '極限' };
      const label = LABEL[activeMode] || activeMode;
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "原始人モード有効 (" + label + ")。" +
            "敬語・クッション・前置き・ぼかし削除。体言止め可。" +
            "コード/コミット/PR/破壊的操作の確認時: 通常日本語。"
        }
      }));
    }
  } catch (e) {
    // silent fail
  }
});
