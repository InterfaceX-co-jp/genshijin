#!/usr/bin/env node
// genshijin — 共有設定リゾルバ
//
// defaultMode の解決順:
//   1. GENSHIJIN_DEFAULT_MODE 環境変数
//   2. 設定ファイル defaultMode フィールド:
//      - $XDG_CONFIG_HOME/genshijin/config.json（設定されていれば任意プラットフォーム）
//      - ~/.config/genshijin/config.json（macOS / Linux フォールバック）
//      - %APPDATA%\genshijin\config.json（Windows フォールバック）
//   3. 'normal'

const fs = require('fs');
const path = require('path');
const os = require('os');

// 内部モード識別子は ASCII で統一。UI/SKILL.md 表記は日本語にマッピング。
const VALID_MODES = [
  'off', 'polite', 'normal', 'extreme',
  'commit', 'review', 'compress', 'help'
];

// ASCII モード → SKILL.md intensity 表記（日本語ラベル）
const MODE_TO_LABEL = {
  polite: '丁寧',
  normal: '通常',
  extreme: '極限'
};

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'genshijin');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'genshijin'
    );
  }
  return path.join(os.homedir(), '.config', 'genshijin');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function getDefaultMode() {
  const envMode = process.env.GENSHIJIN_DEFAULT_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  try {
    const configPath = getConfigPath();
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.defaultMode && VALID_MODES.includes(config.defaultMode.toLowerCase())) {
      return config.defaultMode.toLowerCase();
    }
  } catch (e) {
    // 設定ファイル不在 or 不正 → フォールスルー
  }

  return 'normal';
}

// Symlink-safe フラグファイル書込。immediate parent ディレクトリと対象ファイル
// 両方で symlink を拒否し、O_NOFOLLOW を使い、temp + rename で 0o600 アトミック書込。
// 予測可能なフラグパス（~/.claude/.genshijin-active）を symlink で差し替えて
// 他のファイルを破壊する攻撃を塞ぐ。
//
// 注: ~/.claude 自体が symlink の環境（Nix / dotfiles管理 / Docker bind-mount）
// が存在するため、parent dir resolved path のみチェック。フルチェイン検証は誤拒否多。
function safeWriteFlag(flagPath, content) {
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });

    // flagPath 自体が symlink なら拒否 (filename自体の差替防止)
    try {
      if (fs.lstatSync(flagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const tempPath = path.join(flagDir, `.genshijin-active.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(content));
      try { fs.fchmodSync(fd, 0o600); } catch (e) { /* Windows ベストエフォート */ }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, flagPath);
  } catch (e) {
    // silent fail — フラグはベストエフォート
  }
}

// symlink 拒否・サイズ上限・ホワイトリスト検証付きフラグ読込。
// 攻撃者が ~/.ssh/id_rsa 等への symlink で差替えた場合でも、
// 不正値として null を返しコンテキストに混入させない。
const MAX_FLAG_BYTES = 64;

function readFlag(flagPath) {
  try {
    let st;
    try {
      st = fs.lstatSync(flagPath);
    } catch (e) {
      return null;
    }
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > MAX_FLAG_BYTES) return null;

    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_RDONLY | O_NOFOLLOW;
    let fd;
    let out;
    try {
      fd = fs.openSync(flagPath, flags);
      const buf = Buffer.alloc(MAX_FLAG_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }

    const raw = out.trim().toLowerCase();
    if (!VALID_MODES.includes(raw)) return null;
    return raw;
  } catch (e) {
    return null;
  }
}

// 履歴ログ append (lifetime stats 用)。symlink-safe + JSONL line append。
// readFlag/safeWriteFlag と違いサイズ上限なし。1行=1JSONエントリ前提。
function appendFlag(flagPath, line) {
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });

    try {
      if (fs.lstatSync(flagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(flagPath, flags, 0o600);
      fs.writeSync(fd, String(line).replace(/\n+$/, '') + '\n');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  } catch (e) {
    // silent fail
  }
}

// 履歴ログ読込。symlink拒否、最大10MBで打切。
const MAX_HISTORY_BYTES = 10 * 1024 * 1024;

function readHistory(flagPath) {
  try {
    let st;
    try {
      st = fs.lstatSync(flagPath);
    } catch (e) {
      return [];
    }
    if (st.isSymbolicLink() || !st.isFile()) return [];

    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_RDONLY | O_NOFOLLOW;
    let fd;
    let raw;
    try {
      fd = fs.openSync(flagPath, flags);
      const size = Math.min(st.size, MAX_HISTORY_BYTES);
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
      raw = buf.toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    return raw.split('\n').filter(line => line.trim());
  } catch (e) {
    return [];
  }
}

module.exports = {
  getDefaultMode,
  getConfigDir,
  getConfigPath,
  VALID_MODES,
  MODE_TO_LABEL,
  safeWriteFlag,
  readFlag,
  appendFlag,
  readHistory
};
