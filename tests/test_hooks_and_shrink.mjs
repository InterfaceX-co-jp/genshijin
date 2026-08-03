import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';


const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shrinkDir = path.join(repoRoot, 'mcp-servers', 'genshijin-shrink');
const { compress } = require(path.join(shrinkDir, 'compress.js'));
const { safeWriteFlag } = require(path.join(repoRoot, 'hooks', 'genshijin-config.js'));
const {
  attributeByMode,
  deriveSavings,
  deriveNet,
  priceForModel,
  readModeLog,
} = require(path.join(repoRoot, 'hooks', 'genshijin-stats.js'));


test('nested protected segments are fully restored', () => {
  for (const [input, expected] of [
    ['plan type (STARTER/BUSINESS)', 'STARTER/BUSINESS'],
    ['user role (ADMIN/MEMBER/GUEST)', 'ADMIN/MEMBER/GUEST'],
    ['user plan (Free/Pro/Business)', 'Free/Pro/Business'],
  ]) {
    const { compressed } = compress(input);
    assert.ok(compressed.includes(expected), compressed);
    assert.doesNotMatch(compressed, /\u0000\d+\u0000/);
  }
});

test('protected segments keep surrounding newlines', () => {
  const input = 'Before\n```\nconst x = 1;\n```\nAfter';
  const { compressed } = compress(input);
  assert.match(compressed, /Before\n```/);
  assert.match(compressed, /```\nAfter/);
});

test('user text resembling an old sentinel is preserved', () => {
  const marker = `${String.fromCharCode(0xe000)}123${String.fromCharCode(0xe001)}`;
  const { compressed } = compress(`Keep ${marker} and https://example.com.`);
  assert.ok(compressed.includes(marker));
  assert.ok(compressed.includes('https://example.com.'));
});


test('MCP proxy uses cross-spawn for Windows-safe argument quoting', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(shrinkDir, 'package.json'), 'utf8'));
  assert.match(pkg.dependencies['cross-spawn'], /^\^7\./);
  const source = fs.readFileSync(path.join(shrinkDir, 'index.js'), 'utf8');
  assert.match(source, /require\('cross-spawn'\)/);
  assert.doesNotMatch(source, /shell:\s*true/);
});

test('Claude slash commands are shipped as discoverable markdown', () => {
  for (const name of [
    'genshijin',
    'genshijin-commit',
    'genshijin-review',
    'genshijin-stats',
    'genshijin-compress',
    'genshijin-help',
  ]) {
    const commandPath = path.join(repoRoot, 'commands', `${name}.md`);
    const content = fs.readFileSync(commandPath, 'utf8');
    assert.match(content, /^---\ndescription:/);
  }
});

test('stats uses current prices and reports rule overhead', () => {
  assert.equal(priceForModel('claude-opus-4-1-20250805'), 75);
  assert.equal(priceForModel('claude-opus-4-6'), 25);
  assert.equal(priceForModel('claude-haiku-4-5'), 5);
  assert.deepEqual(deriveNet({ estSavedTokens: 4000, turns: 2 }), {
    overheadTokens: 2500,
    netTokens: 1500,
  });
});

test('stats attributes output to the mode active for each message', () => {
  const attribution = attributeByMode({
    messages: [
      { ts: 100, outputTokens: 1000 },
      { ts: 300, outputTokens: 500 },
    ],
    modeLog: [
      { ts: 200, prev: null, mode: 'normal' },
    ],
    mode: 'normal',
    flagMtimeMs: 200,
    outputTokens: 1500,
  });
  assert.deepEqual(attribution.byMode, { none: 1000, normal: 500 });
  assert.equal(attribution.unknownTokens, 0);
  const savings = deriveSavings({
    byMode: attribution.byMode,
    model: 'claude-sonnet-4-5',
  });
  assert.equal(savings.estSavedTokens, 929);
  assert.ok(Math.abs(savings.estSavedUsd - 0.013935) < 1e-12);
});

test('stats ignores mode transitions from concurrent sessions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshijin-mode-log-'));
  const logPath = path.join(dir, 'modes.jsonl');
  try {
    fs.writeFileSync(logPath, [
      JSON.stringify({ ts: 100, mode: 'normal', prev: null, session_id: 'a' }),
      JSON.stringify({ ts: 200, mode: 'extreme', prev: 'normal', session_id: 'b' }),
    ].join('\n'));
    assert.deepEqual(readModeLog(logPath, 'a'), [
      { ts: 100, mode: 'normal', prev: null },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('safeWriteFlag replaces content without leaking temp files', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshijin-config-'));
  const flagPath = path.join(configDir, '.genshijin-active');
  try {
    safeWriteFlag(flagPath, 'normal');
    safeWriteFlag(flagPath, 'extreme');
    assert.equal(fs.readFileSync(flagPath, 'utf8'), 'extreme');
    assert.deepEqual(
      fs.readdirSync(configDir).filter(name => name.startsWith('.genshijin-active.')),
      []
    );
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});


test('SessionStart resume preserves the active mode', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshijin-hook-'));
  const script = path.join(repoRoot, 'hooks', 'genshijin-activate.js');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  try {
    let result = spawnSync(process.execPath, [script], {
      env,
      input: JSON.stringify({ source: 'startup' }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    fs.writeFileSync(path.join(configDir, '.genshijin-active'), 'extreme');
    result = spawnSync(process.execPath, [script], {
      env,
      input: JSON.stringify({ source: 'resume' }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      fs.readFileSync(path.join(configDir, '.genshijin-active'), 'utf8'),
      'extreme'
    );
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});


test('SessionStart resume preserves explicit off state', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshijin-off-'));
  const script = path.join(repoRoot, 'hooks', 'genshijin-activate.js');
  const flagPath = path.join(configDir, '.genshijin-active');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  try {
    fs.writeFileSync(flagPath, 'off');
    const result = spawnSync(process.execPath, [script], {
      env,
      input: JSON.stringify({ source: 'resume', session_id: 'session-off' }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(flagPath, 'utf8'), 'off');
    assert.equal(result.stdout, 'OK');
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});


test('mode tracker unwraps Claude slash-command envelopes', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshijin-tracker-'));
  const script = path.join(repoRoot, 'hooks', 'genshijin-mode-tracker.js');
  const flagPath = path.join(configDir, '.genshijin-active');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  try {
    const prompt = [
      '<command-message>genshijin</command-message>',
      '<command-name>/genshijin</command-name>',
      '<command-args>extreme</command-args>',
    ].join('\n');
    const result = spawnSync(process.execPath, [script], {
      env,
      input: JSON.stringify({ prompt }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(flagPath, 'utf8'), 'extreme');

    fs.writeFileSync(flagPath, 'normal');
    const foreign = spawnSync(process.execPath, [script], {
      env,
      input: JSON.stringify({
        prompt: '<command-name>/vim-help</command-name><command-args>normal mode</command-args>',
      }),
      encoding: 'utf8',
    });
    assert.equal(foreign.status, 0, foreign.stderr);
    assert.equal(fs.readFileSync(flagPath, 'utf8'), 'normal');
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});

test('questions about genshijin do not activate the mode', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshijin-question-'));
  const script = path.join(repoRoot, 'hooks', 'genshijin-mode-tracker.js');
  const flagPath = path.join(configDir, '.genshijin-active');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const run = prompt => spawnSync(process.execPath, [script], {
    env,
    input: JSON.stringify({ prompt, session_id: 'question-session' }),
    encoding: 'utf8',
  });
  try {
    fs.writeFileSync(flagPath, 'off');
    assert.equal(run('原始人モードとは？').status, 0);
    assert.equal(fs.readFileSync(flagPath, 'utf8'), 'off');
    assert.equal(run('What is genshijin mode?').status, 0);
    assert.equal(fs.readFileSync(flagPath, 'utf8'), 'off');
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});


test('stats command uses additional context instead of blocking', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshijin-stats-hook-'));
  const script = path.join(repoRoot, 'hooks', 'genshijin-mode-tracker.js');
  const transcript = path.join(configDir, 'stats-session.jsonl');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  try {
    fs.writeFileSync(path.join(configDir, '.genshijin-active'), 'normal');
    fs.writeFileSync(transcript, JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: {
        model: 'claude-sonnet-4-5',
        usage: { output_tokens: 100, cache_read_input_tokens: 50 },
      },
    }) + '\n');
    const result = spawnSync(process.execPath, [script], {
      env,
      input: JSON.stringify({
        prompt: '/genshijin-stats',
        session_id: 'stats-session',
        transcript_path: transcript,
      }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal('decision' in output, false);
    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(output.hookSpecificOutput.additionalContext, /原始人 Stats/);
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});


test('independent skill mode restores the previous prose mode', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshijin-oneshot-'));
  const script = path.join(repoRoot, 'hooks', 'genshijin-mode-tracker.js');
  const flagPath = path.join(configDir, '.genshijin-active');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const run = prompt => spawnSync(process.execPath, [script], {
    env,
    input: JSON.stringify({ prompt }),
    encoding: 'utf8',
  });
  try {
    fs.writeFileSync(flagPath, 'extreme');
    assert.equal(run('/genshijin-review').status, 0);
    assert.equal(fs.readFileSync(flagPath, 'utf8'), 'review');
    assert.equal(run('次の問題を調べて').status, 0);
    assert.equal(fs.readFileSync(flagPath, 'utf8'), 'extreme');
    assert.equal(fs.existsSync(path.join(configDir, '.genshijin-active.prev')), false);
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});
