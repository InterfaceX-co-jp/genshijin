'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANAGED_HOOK_BASENAMES = new Set([
  'genshijin-activate.js',
  'genshijin-mode-tracker.js',
  'genshijin-stats.js',
  'genshijin-statusline.sh',
  'genshijin-statusline.ps1',
]);

function stripTrailingCommas(source) {
  let output = '';
  let inString = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      output += char;
      if (char === '\\' && i + 1 < source.length) {
        output += source[++i];
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ',') {
      let next = i + 1;
      while (next < source.length && /\s/.test(source[next])) next++;
      if (source[next] === '}' || source[next] === ']') continue;
    }
    output += char;
  }

  return output;
}

function stripJsonComments(source) {
  if (typeof source !== 'string') return source;

  let output = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      } else if (char === '\n') {
        output += char;
      }
      continue;
    }
    if (inString) {
      output += char;
      if (char === '\\' && i + 1 < source.length) {
        output += source[++i];
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
    } else if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
    } else {
      output += char;
    }
  }

  return stripTrailingCommas(output);
}

function readSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return {};

  let source;
  try {
    source = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    process.stderr.write(`genshijin: settings 読込失敗 ${settingsPath}: ${error.message}\n`);
    return null;
  }

  if (!source.trim()) return {};
  try {
    return JSON.parse(source);
  } catch (_) {
    try {
      return JSON.parse(stripJsonComments(source));
    } catch (error) {
      process.stderr.write(
        `genshijin: settings が有効な JSON/JSONC ではない: ${settingsPath}: ${error.message}\n`
      );
      return null;
    }
  }
}

function writeSettings(settingsPath, settings) {
  const directory = path.dirname(settingsPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(settingsPath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );

  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporaryPath, settingsPath);
  } finally {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch (_) {}
  }
}

function validateHookFields(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    if (settings.hooks != null) delete settings.hooks;
    return settings;
  }

  for (const event of Object.keys(settings.hooks)) {
    const entries = settings.hooks[event];
    if (!Array.isArray(entries)) {
      delete settings.hooks[event];
      continue;
    }
    settings.hooks[event] = entries.filter((entry) => {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return false;
      entry.hooks = entry.hooks.filter((hook) => {
        if (!hook || typeof hook !== 'object') return false;
        if (hook.type === 'command') return typeof hook.command === 'string' && hook.command.length > 0;
        if (hook.type === 'agent') return typeof hook.prompt === 'string' && hook.prompt.length > 0;
        return false;
      });
      return entry.hooks.length > 0;
    });
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

function hasManagedHook(settings, event, marker) {
  const entries = settings && settings.hooks && settings.hooks[event];
  return Array.isArray(entries) && entries.some(
    (entry) => entry && Array.isArray(entry.hooks) && entry.hooks.some(
      (hook) => hook && typeof hook.command === 'string' && hook.command.includes(marker)
    )
  );
}

function addCommandHook(settings, event, options) {
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }
  if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
  if (hasManagedHook(settings, event, options.marker || options.command)) return false;

  const hook = { type: 'command', command: options.command };
  if (typeof options.timeout === 'number') hook.timeout = options.timeout;
  if (typeof options.statusMessage === 'string') hook.statusMessage = options.statusMessage;
  settings.hooks[event].push({ hooks: [hook] });
  return true;
}

function commandTokens(command) {
  const tokens = [];
  const matcher = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = matcher.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function referencesManagedScript(command) {
  if (typeof command !== 'string') return false;
  return commandTokens(command).some(
    (token) => MANAGED_HOOK_BASENAMES.has(path.win32.basename(token))
  );
}

function removeManagedHooks(settings) {
  if (!settings || !settings.hooks || typeof settings.hooks !== 'object') return 0;
  let removed = 0;

  for (const event of Object.keys(settings.hooks)) {
    const entries = settings.hooks[event];
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((entry) => {
      if (!entry || !Array.isArray(entry.hooks)) return true;
      return !entry.hooks.some(
        (hook) => hook && referencesManagedScript(hook.command)
      );
    });
    removed += entries.length - kept.length;
    if (kept.length === 0) delete settings.hooks[event];
    else settings.hooks[event] = kept;
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return removed;
}

module.exports = {
  MANAGED_HOOK_BASENAMES,
  addCommandHook,
  hasManagedHook,
  readSettings,
  referencesManagedScript,
  removeManagedHooks,
  stripJsonComments,
  stripTrailingCommas,
  validateHookFields,
  writeSettings,
};
