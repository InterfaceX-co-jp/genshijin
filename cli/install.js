#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const settingsIo = require('./lib/settings');

const REPO = 'InterfaceX-co-jp/genshijin';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const HOOK_FILES = [
  'package.json',
  'genshijin-config.js',
  'genshijin-activate.js',
  'genshijin-mode-tracker.js',
  'genshijin-stats.js',
  'genshijin-statusline.sh',
  'genshijin-statusline.ps1',
];
const STATE_FILES = [
  '.genshijin-active',
  '.genshijin-active.prev',
  '.genshijin-mode-log.jsonl',
  '.genshijin-statusline-suffix',
];
const PROVIDERS = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor IDE' },
  { id: 'windsurf', label: 'Windsurf IDE' },
  { id: 'cline', label: 'Cline' },
  { id: 'copilot', label: 'GitHub Copilot' },
];

function fail(message, code = 2) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(argv) {
  const options = {
    all: false,
    configDir: process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
    dryRun: false,
    force: false,
    help: false,
    hooksOnly: false,
    list: false,
    minimal: false,
    noColor: false,
    only: [],
    uninstall: false,
    withHooks: 'auto',
    withInit: false,
    withMcpShrink: 'auto',
  };

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    switch (argument) {
      case '--all':
        options.all = true;
        break;
      case '--config-dir':
        if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
          fail('--config-dir にはパスが必要');
        }
        options.configDir = path.resolve(argv[++i]);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--hooks-only':
        options.hooksOnly = true;
        options.withHooks = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--minimal':
        options.minimal = true;
        break;
      case '--no-color':
        options.noColor = true;
        break;
      case '--only':
        if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
          fail('--only には agent ID が必要');
        }
        options.only.push(argv[++i]);
        break;
      case '--uninstall':
      case '-u':
        options.uninstall = true;
        break;
      case '--with-hooks':
        options.withHooks = true;
        break;
      case '--no-hooks':
        options.withHooks = false;
        break;
      case '--with-init':
        options.withInit = true;
        break;
      case '--with-mcp-shrink':
        options.withMcpShrink = true;
        break;
      case '--no-mcp-shrink':
        options.withMcpShrink = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        fail(`未知フラグ: ${argument}`);
    }
  }

  if (options.all && options.minimal) fail('--all と --minimal は併用不可');
  if (options.all) {
    options.withHooks = true;
    options.withInit = true;
    options.withMcpShrink = true;
  }
  if (options.minimal) {
    options.withHooks = false;
    options.withInit = false;
    options.withMcpShrink = false;
  }
  if (options.withHooks === 'auto') options.withHooks = !options.minimal;
  if (options.withMcpShrink === 'auto') options.withMcpShrink = !options.minimal;

  const known = new Set(PROVIDERS.map((provider) => provider.id));
  for (const id of options.only) {
    if (!known.has(id)) fail(`未知 agent: ${id}`);
  }
  return options;
}

function hasCommand(command) {
  const executable = process.platform === 'win32' ? 'where' : 'sh';
  const args = process.platform === 'win32'
    ? [command]
    : ['-c', `command -v '${command.replace(/'/g, `'\\''`)}'`];
  const result = childProcess.spawnSync(executable, args, { stdio: 'ignore' });
  return result.status === 0;
}

function run(command, args, dryRun, capture = false) {
  if (dryRun) {
    process.stdout.write(`  [dry-run] ${command} ${args.join(' ')}\n`);
    return { status: 0, stdout: '', stderr: '' };
  }
  return childProcess.spawnSync(command, args, {
    encoding: capture ? 'utf8' : undefined,
    shell: process.platform === 'win32' && !path.isAbsolute(command),
    stdio: capture ? 'pipe' : 'inherit',
  });
}

function download(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (hasCommand('curl')) {
    const result = childProcess.spawnSync('curl', ['-fsSL', url, '-o', destination], {
      stdio: 'inherit',
      shell: false,
    });
    if (result.status === 0) return;
  } else if (process.platform === 'win32') {
    const result = childProcess.spawnSync(
      'powershell',
      ['-NoProfile', '-Command', 'Invoke-WebRequest -UseBasicParsing -Uri $args[0] -OutFile $args[1]', url, destination],
      { stdio: 'inherit' }
    );
    if (result.status === 0) return;
  }
  throw new Error(`download 失敗: ${url}`);
}

function repoRoot() {
  const candidate = path.resolve(__dirname, '..');
  return fs.existsSync(path.join(candidate, 'hooks', 'genshijin-activate.js'))
    ? candidate
    : null;
}

function backupSettings(settingsPath) {
  if (fs.existsSync(settingsPath)) fs.copyFileSync(settingsPath, settingsPath + '.bak');
}

function managedStatusLine(settings) {
  if (!settings || !settings.statusLine) return false;
  const command = typeof settings.statusLine === 'string'
    ? settings.statusLine
    : settings.statusLine.command;
  return settingsIo.referencesManagedScript(command);
}

function installHooks(options) {
  const hooksDir = path.join(options.configDir, 'hooks');
  const settingsPath = path.join(options.configDir, 'settings.json');
  const settings = settingsIo.readSettings(settingsPath);
  if (settings === null) {
    throw new Error('settings.json を解析不能。ファイル変更なし');
  }

  if (options.dryRun) {
    for (const filename of HOOK_FILES) {
      process.stdout.write(`  [dry-run] 配置: ${path.join(hooksDir, filename)}\n`);
    }
    process.stdout.write(`  [dry-run] hooks/statusLine マージ: ${settingsPath}\n`);
    return { added: 0, statusLineAdded: false };
  }

  fs.mkdirSync(hooksDir, { recursive: true });
  const root = repoRoot();
  for (const filename of HOOK_FILES) {
    const destination = path.join(hooksDir, filename);
    const localSource = root && path.join(root, 'hooks', filename);
    if (localSource && fs.existsSync(localSource)) fs.copyFileSync(localSource, destination);
    else download(`${RAW_BASE}/hooks/${filename}`, destination);
    process.stdout.write(`  配置: ${destination}\n`);
  }
  try {
    fs.chmodSync(path.join(hooksDir, 'genshijin-statusline.sh'), 0o755);
  } catch (_) {}

  backupSettings(settingsPath);
  settingsIo.validateHookFields(settings);
  const node = process.execPath;
  let added = 0;
  if (settingsIo.addCommandHook(settings, 'SessionStart', {
    command: `"${node}" "${path.join(hooksDir, 'genshijin-activate.js')}"`,
    marker: 'genshijin-activate.js',
    timeout: 5,
    statusMessage: '原始人モード読込中...',
  })) added++;
  if (settingsIo.addCommandHook(settings, 'UserPromptSubmit', {
    command: `"${node}" "${path.join(hooksDir, 'genshijin-mode-tracker.js')}"`,
    marker: 'genshijin-mode-tracker.js',
    timeout: 5,
    statusMessage: '原始人モード追跡中...',
  })) added++;

  let statusLineAdded = false;
  if (!settings.statusLine) {
    const command = process.platform === 'win32'
      ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(hooksDir, 'genshijin-statusline.ps1')}"`
      : `bash "${path.join(hooksDir, 'genshijin-statusline.sh')}"`;
    settings.statusLine = { type: 'command', command };
    statusLineAdded = true;
  } else if (!managedStatusLine(settings)) {
    process.stdout.write('  注意: 既存 statusLine 維持。genshijin バッジ未追加。\n');
  }

  settingsIo.writeSettings(settingsPath, settings);
  process.stdout.write(`  settings.json 更新: hook ${added}件追加\n`);
  return { added, statusLineAdded };
}

function uninstallHooks(options) {
  const hooksDir = path.join(options.configDir, 'hooks');
  const settingsPath = path.join(options.configDir, 'settings.json');
  let removedEntries = 0;

  if (fs.existsSync(settingsPath)) {
    const settings = settingsIo.readSettings(settingsPath);
    if (settings === null) {
      throw new Error('settings.json を解析不能。hook ファイル含め変更なし');
    }
    removedEntries = settingsIo.removeManagedHooks(settings);
    if (managedStatusLine(settings)) delete settings.statusLine;
    settingsIo.validateHookFields(settings);
    if (options.dryRun) {
      process.stdout.write(`  [dry-run] settings.json から hook ${removedEntries}件削除\n`);
    } else {
      backupSettings(settingsPath);
      settingsIo.writeSettings(settingsPath, settings);
      process.stdout.write(`  settings.json から hook ${removedEntries}件削除\n`);
    }
  }

  for (const filename of HOOK_FILES) {
    const target = path.join(hooksDir, filename);
    if (!fs.existsSync(target)) continue;
    if (options.dryRun) process.stdout.write(`  [dry-run] 削除: ${target}\n`);
    else {
      fs.unlinkSync(target);
      process.stdout.write(`  削除: ${target}\n`);
    }
  }
  for (const filename of STATE_FILES) {
    const target = path.join(options.configDir, filename);
    if (!fs.existsSync(target)) continue;
    if (options.dryRun) process.stdout.write(`  [dry-run] 削除: ${target}\n`);
    else {
      fs.unlinkSync(target);
      process.stdout.write(`  削除: ${target}\n`);
    }
  }
  const history = path.join(options.configDir, '.genshijin-history.jsonl');
  if (fs.existsSync(history)) {
    process.stdout.write(`  stats 履歴維持: ${history}\n`);
  }
  return removedEntries;
}

function detectProvider(id) {
  switch (id) {
    case 'claude':
      return hasCommand('claude');
    case 'cursor':
      return hasCommand('cursor') ||
        fs.existsSync(path.join(os.homedir(), '.cursor')) ||
        fs.existsSync(path.join(os.homedir(), 'Library', 'Application Support', 'Cursor')) ||
        Boolean(process.env.APPDATA && fs.existsSync(path.join(process.env.APPDATA, 'Cursor')));
    case 'windsurf':
      return hasCommand('windsurf') ||
        fs.existsSync(path.join(os.homedir(), '.windsurf')) ||
        fs.existsSync(path.join(os.homedir(), '.codeium'));
    case 'cline':
      return extensionInstalled('saoudrizwan.claude-dev');
    case 'copilot':
      return fs.existsSync(path.join(os.homedir(), '.config', 'github-copilot')) ||
        extensionInstalled('github.copilot');
    default:
      return false;
  }
}

function extensionInstalled(needle) {
  const extensionDirs = [
    path.join(os.homedir(), '.vscode', 'extensions'),
    path.join(os.homedir(), '.cursor', 'extensions'),
  ];
  return extensionDirs.some((directory) => {
    try {
      return fs.readdirSync(directory).some((name) => name.includes(needle));
    } catch (_) {
      return false;
    }
  });
}

function runInit(options, provider) {
  const root = repoRoot();
  const local = root && path.join(root, 'tools', 'genshijin-init.js');
  const args = [process.cwd(), '--only', provider];
  if (options.force) args.push('--force');
  if (options.dryRun) args.push('--dry-run');

  if (local && fs.existsSync(local)) {
    return run(process.execPath, [local, ...args], false).status === 0;
  }
  if (options.dryRun) {
    process.stdout.write(`  [dry-run] ${RAW_BASE}/tools/genshijin-init.js 実行\n`);
    return true;
  }

  const temporary = path.join(os.tmpdir(), `genshijin-init-${process.pid}.js`);
  try {
    download(`${RAW_BASE}/tools/genshijin-init.js`, temporary);
    return run(process.execPath, [temporary, ...args], false).status === 0;
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch (_) {}
  }
}

function installClaude(options, results) {
  const list = run('claude', ['plugin', 'list'], false, true);
  const alreadyInstalled = !options.force &&
    list.status === 0 &&
    /genshijin/i.test(list.stdout || '');
  if (alreadyInstalled) {
    results.skipped.push('claude (既に導入済)');
  } else {
    const marketplace = run(
      'claude',
      ['plugin', 'marketplace', 'add', REPO],
      options.dryRun
    );
    const plugin = marketplace.status === 0
      ? run('claude', ['plugin', 'install', 'genshijin@genshijin'], options.dryRun)
      : marketplace;
    if (plugin.status === 0) results.installed.push('claude');
    else results.failed.push('claude plugin');
  }

  if (options.withHooks) {
    installHooks(options);
    results.installed.push('claude-hooks');
  }
  if (options.withMcpShrink && hasCommand('npm')) {
    process.stdout.write(
      '  MCP-shrink: npx genshijin-shrink <upstream-mcp-server-cmd> で利用可能\n'
    );
  }
}

function install(options) {
  if (options.hooksOnly) {
    process.stdout.write('🪨 genshijin hooks installer\n');
    installHooks(options);
    process.stdout.write('完了。Claude Code 再起動で有効化。\n');
    return 0;
  }

  const selected = options.only.length > 0
    ? PROVIDERS.filter((provider) => options.only.includes(provider.id))
    : PROVIDERS;
  const results = { detected: 0, installed: [], skipped: [], failed: [] };
  process.stdout.write('🪨 genshijin installer\n\n');

  for (const provider of selected) {
    if (!detectProvider(provider.id)) {
      results.skipped.push(`${provider.id} (未検出)`);
      continue;
    }
    results.detected++;
    process.stdout.write(`>>> ${provider.label} 検出\n`);
    if (provider.id === 'claude') {
      installClaude(options, results);
    } else if (options.withInit) {
      if (runInit(options, provider.id)) results.installed.push(provider.id);
      else results.failed.push(provider.id);
    } else {
      results.skipped.push(`${provider.id} (--with-init 未指定)`);
    }
  }

  process.stdout.write(`\n検出 agent: ${results.detected}\n`);
  if (results.installed.length) process.stdout.write(`install済: ${results.installed.join(', ')}\n`);
  if (results.skipped.length) process.stdout.write(`skip: ${results.skipped.join(', ')}\n`);
  if (results.failed.length) process.stdout.write(`失敗: ${results.failed.join(', ')}\n`);
  if (results.detected === 0) return 1;
  return results.failed.length > 0 ? 1 : 0;
}

function uninstall(options) {
  process.stdout.write('🪨 genshijin uninstaller\n');
  uninstallHooks(options);
  if (!options.hooksOnly && hasCommand('claude')) {
    run('claude', ['plugin', 'uninstall', 'genshijin@genshijin'], options.dryRun);
  }
  process.stdout.write('完了。Claude Code 再起動でアンインストール確定。\n');
  return 0;
}

function printList() {
  process.stdout.write('genshijin agent matrix:\n\n');
  for (const provider of PROVIDERS) {
    process.stdout.write(`  ${provider.id.padEnd(10)} ${provider.label}\n`);
  }
}

function printHelp() {
  process.stdout.write(`genshijin installer — 共通 Node 実装

使い方:
  node cli/install.js [flags]

フラグ:
  --dry-run             書込・削除なし
  --force               再インストール
  --only <agent>        指定 agent のみ
  --all                 hooks/init/MCP-shrink 全有効
  --minimal             plugin のみ
  --with-hooks          standalone hooks 導入
  --no-hooks            standalone hooks 無効
  --with-init           cwd に IDE rule file 導入
  --with-mcp-shrink     MCP-shrink 案内有効
  --uninstall, -u       install と同じ実装で削除
  --config-dir <path>   Claude 設定ディレクトリ指定
  --list                agent 一覧
  -h, --help            ヘルプ
`);
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (nodeMajor < 18) fail(`Node.js 18 以上が必要（現在 ${process.versions.node}）`, 1);
    options = parseArgs(argv);
    if (options.help) {
      printHelp();
      return 0;
    }
    if (options.list) {
      printList();
      return 0;
    }
    return options.uninstall ? uninstall(options) : install(options);
  } catch (error) {
    process.stderr.write(`genshijin: ${error.message}\n`);
    return error.exitCode || 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  HOOK_FILES,
  PROVIDERS,
  STATE_FILES,
  installHooks,
  main,
  parseArgs,
  uninstallHooks,
};
