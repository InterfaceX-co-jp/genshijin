#!/usr/bin/env node
// genshijin — Claude Code SessionStart アクティベーションフック
//
// セッション開始毎に実行:
//   1. フラグファイル $CLAUDE_CONFIG_DIR/.genshijin-active 書込（statusline が読む）
//   2. genshijin ルールセットを hidden SessionStart context として注入
//   3. statusline 未設定を検知しセットアップを促す

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode, safeWriteFlag, MODE_TO_LABEL } = require('./genshijin-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.genshijin-active');
const settingsPath = path.join(claudeDir, 'settings.json');

const mode = getDefaultMode();

// "off" モード — アクティベート一切せず、フラグ削除してルール注入なし
if (mode === 'off') {
  try { fs.unlinkSync(flagPath); } catch (e) {}
  process.stdout.write('OK');
  process.exit(0);
}

// 1. フラグファイル書込（symlink-safe）
safeWriteFlag(flagPath, mode);

// 独立スキルモード（サブスキル側で挙動定義）
const INDEPENDENT_MODES = new Set(['commit', 'review', 'compress', 'help']);

if (INDEPENDENT_MODES.has(mode)) {
  process.stdout.write('原始人モード有効 — レベル: ' + mode + '。挙動は /genshijin-' + mode + ' スキル側で定義。');
  process.exit(0);
}

// SKILL.md 表記ラベル（日本語）に変換
const modeLabel = MODE_TO_LABEL[mode] || mode;

// SKILL.md を実行時読込 — genshijin 挙動の唯一の真実源。
// プラグイン導入: __dirname = <plugin_root>/hooks/, SKILL.md は <plugin_root>/skills/genshijin/SKILL.md
// standalone 導入: __dirname = $CLAUDE_CONFIG_DIR/hooks/, SKILL.md 不在 → ハードコードフォールバック。
let skillContent = '';
try {
  skillContent = fs.readFileSync(
    path.join(__dirname, '..', 'skills', 'genshijin', 'SKILL.md'), 'utf8'
  );
} catch (e) { /* standalone 導入 — 下のフォールバックを使用 */ }

let output;

if (skillContent) {
  // YAML frontmatter 除去
  const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');

  // intensity テーブル行を filter: ヘッダ/区切りは残し、アクティブレベル行のみ残す
  const filtered = body.split('\n').reduce((acc, line) => {
    // intensity テーブル行: | **丁寧** | ...
    const tableRowMatch = line.match(/^\|\s*\*\*(\S+?)\*\*\s*\|/);
    if (tableRowMatch) {
      if (tableRowMatch[1] === modeLabel) {
        acc.push(line);
      }
      return acc;
    }

    // 例の行: "- 丁寧:" 形式 — アクティブレベル行のみ残す
    const exampleMatch = line.match(/^-\s*(丁寧|通常|極限):\s/);
    if (exampleMatch) {
      if (exampleMatch[1] === modeLabel) {
        acc.push(line);
      }
      return acc;
    }

    acc.push(line);
    return acc;
  }, []);

  output = '原始人モード有効 — レベル: ' + modeLabel + '\n\n' + filtered.join('\n');
} else {
  // SKILL.md 不在時のフォールバック（standalone フック導入 + skills ディレクトリなし）
  output =
    '原始人モード有効 — レベル: ' + modeLabel + '\n\n' +
    '原始人のように簡潔に返答せよ。技術的中身はすべて残す。無駄だけ消す。\n\n' +
    '## 永続性\n\n' +
    '毎レスポンス有効。多ターン経過後も敬語回帰・フィラー漂流 禁止。不明時も維持。\n' +
    '解除条件のみ: 「原始人やめて」「通常モード」。\n\n' +
    '現レベル: **' + modeLabel + '**。切替: `/genshijin 丁寧|通常|極限`\n\n' +
    '## ルール\n\n' +
    '削除: 敬語・クッション言葉・前置き・ぼかし・冗長助詞。体言止め/用言止め可。' +
    '技術用語はそのまま。コードブロック/エラーメッセージ原文維持。\n\n' +
    'パターン: `[対象] [状態/動作] [理由]。[次の手順]。`\n\n' +
    '## 境界\n\n' +
    'コード/コミット/PR: 通常記述。「原始人やめて」「通常モード」で解除。' +
    'レベルは変更またはセッション終了まで維持。';
}

// 3. statusline 未設定検知 → セットアップを Claude に促す
try {
  let hasStatusline = false;
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.statusLine) {
      hasStatusline = true;
    }
  }

  if (!hasStatusline) {
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'genshijin-statusline.ps1' : 'genshijin-statusline.sh';
    const scriptPath = path.join(__dirname, scriptName);
    const command = isWindows
      ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
      : `bash "${scriptPath}"`;
    const statusLineSnippet =
      '"statusLine": { "type": "command", "command": ' + JSON.stringify(command) + ' }';
    output += "\n\n" +
      "STATUSLINE 未設定: genshijin プラグインは現モード表示用 statusline バッジ " +
      "（例: [原始人], [原始人:極限]）を同梱。未設定状態。" +
      "有効化するには " + path.join(claudeDir, 'settings.json') + " に次を追加: " +
      statusLineSnippet + " " +
      "初回対話時にユーザーにセットアップを proactively 提案すること。";
  }
} catch (e) {
  // silent fail — statusline 検出失敗でセッション開始を止めない
}

process.stdout.write(output);
