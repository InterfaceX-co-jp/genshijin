#!/usr/bin/env node
// genshijin init — 対象 repo に常時有効化 rule を全 IDE agent 用に投下。
// idempotent。再実行安全。
//
// 使い方:
//   node tools/genshijin-init.js [target-dir] [--dry-run] [--force] [--only <agent>]
//   curl -fsSL https://raw.githubusercontent.com/InterfaceX-co-jp/genshijin/main/tools/genshijin-init.js | node - [args]
//
// 引数なし → cwd で実行。Cursor/Windsurf/Cline/Copilot/AGENTS.md 用 rule file 生成。
// CLAUDE.md は変更せず、既存メモリファイル圧縮もしない (それは /genshijin-compress の仕事)。

const fs = require('fs');
const path = require('path');

// standalone (npx-style) で動作するよう embedded。rules/genshijin-activate.md と同期維持。
const RULE_BODY = `原始人のように簡潔に返答せよ。技術的中身はすべて残す。無駄だけ消す。日本語前提。

ルール:
- 削除: 敬語・丁寧語（です/ます）、クッション（えーと/まあ/基本的に）、前置き（ご質問ありがとう）、ぼかし（〜かもしれません/おそらく）
- 体言止め・用言止めOK。短い同義語。技術用語は正確維持。コードブロック無変更
- キーワード列挙OK（助詞省略しスペース区切り）。漢字連結で助詞吸収（「Dockerで起動」→「Docker起動」）
- 形容動詞活用語尾（な/に/で/だ）→ 語幹止め。形式名詞（こと/もの/ため）省略
- パターン: [対象] [状態/動作] [理由]。[次の手順]。
- 不可:「ご質問ありがとうございます、お答えします」
- 可:「認証ミドルウェアにバグ。修正:」

強度切替: /genshijin 丁寧|通常|極限
解除: 「原始人やめて」「通常モード」

自動解除: 破壊的操作の確認・セキュリティ警告・ユーザー混乱時は通常日本語。該当部分後すぐ復帰。

境界: コード/コミットメッセージ/PR本文は通常記述。
`;

const SENTINEL = '原始人のように簡潔に返答せよ';

const AGENTS = [
  { id: 'cursor',   file: '.cursor/rules/genshijin.mdc',
    frontmatter: '---\ndescription: "原始人モード — 超圧縮コミュニケーション、約75%トークン削減、技術的正確性維持"\nalwaysApply: true\n---\n\n',
    mode: 'replace' },
  { id: 'windsurf', file: '.windsurf/rules/genshijin.md',
    frontmatter: '---\ntrigger: always_on\n---\n\n',
    mode: 'replace' },
  { id: 'cline',    file: '.clinerules/genshijin.md',
    frontmatter: '',
    mode: 'replace' },
  { id: 'copilot',  file: '.github/copilot-instructions.md',
    frontmatter: '',
    mode: 'append' },
  { id: 'agents',   file: 'AGENTS.md',
    frontmatter: '',
    mode: 'append' },
];

function loadRuleBody() {
  // in-repo source-of-truth 優先
  try {
    const local = path.join(__dirname, '..', 'rules', 'genshijin-activate.md');
    if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8').trimEnd() + '\n';
  } catch (e) {}
  return RULE_BODY;
}

function processAgent(agent, targetDir, ruleBody, opts) {
  const fullPath = path.join(targetDir, agent.file);
  const exists = fs.existsSync(fullPath);

  if (!exists) {
    if (!opts.dryRun) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, agent.frontmatter + ruleBody, { mode: 0o644 });
    }
    return { status: 'added', label: '+' };
  }

  const existing = fs.readFileSync(fullPath, 'utf8');
  if (existing.includes(SENTINEL)) {
    return { status: 'skipped-already-installed', label: '=' };
  }

  if (agent.mode === 'append') {
    if (!opts.dryRun) {
      const sep = existing.endsWith('\n\n') ? '' : (existing.endsWith('\n') ? '\n' : '\n\n');
      fs.writeFileSync(fullPath, existing + sep + ruleBody, { mode: 0o644 });
    }
    return { status: 'appended', label: '~' };
  }

  if (opts.force) {
    if (!opts.dryRun) {
      fs.writeFileSync(fullPath, agent.frontmatter + ruleBody, { mode: 0o644 });
    }
    return { status: 'overwritten', label: '!' };
  }

  return { status: 'skipped-exists', label: '?' };
}

function parseArgs(argv) {
  const opts = { dryRun: false, force: false, only: null, target: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force' || a === '-f') opts.force = true;
    else if (a === '--only') { opts.only = argv[++i]; }
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!a.startsWith('-')) opts.target = path.resolve(a);
  }
  return opts;
}

function help() {
  console.log(`genshijin init — 対象 repo に常時有効化 rule 投下

使い方: genshijin-init.js [target-dir] [--dry-run] [--force] [--only <agent>]

引数なしで cwd 対象。Idempotent — 再実行安全。

導入対象:
${AGENTS.map(a => `  ${a.id.padEnd(10)} ${a.file}`).join('\n')}

フラグ:
  --dry-run   変更内容を表示するのみ、書込なし
  --force     既存 rule file 上書き (デフォルト: skip)
  --only <id> 1つの agent のみ導入 (id は上記表から)
`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { help(); return; }

  console.log(`🪨 genshijin init — ${opts.target}${opts.dryRun ? ' (dry run)' : ''}\n`);

  const ruleBody = loadRuleBody();
  const counts = { added: 0, appended: 0, overwritten: 0, skipped: 0 };

  for (const agent of AGENTS) {
    if (opts.only && opts.only !== agent.id) continue;
    const result = processAgent(agent, opts.target, ruleBody, opts);
    console.log(`  ${result.label} ${agent.file} (${result.status})`);
    if (result.status === 'added') counts.added++;
    else if (result.status === 'appended') counts.appended++;
    else if (result.status === 'overwritten') counts.overwritten++;
    else counts.skipped++;
  }

  console.log(`\n${counts.added} 追加, ${counts.appended} 追記, ` +
              `${counts.overwritten} 上書き, ${counts.skipped} skip`);
  if (opts.dryRun) console.log('(dry run — ファイル書込なし)');
}

if (require.main === module) main();

module.exports = { processAgent, loadRuleBody, AGENTS, SENTINEL, RULE_BODY };
