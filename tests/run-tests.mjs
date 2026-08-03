import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';


const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pythonCommand = process.platform === 'win32' ? 'py' : 'python3';
const pythonPrefix = process.platform === 'win32' ? ['-3'] : [];
const python = spawnSync(
  pythonCommand,
  [...pythonPrefix, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'],
  { cwd: repoRoot, stdio: 'inherit' }
);
if (python.status !== 0) process.exit(python.status ?? 1);

const nodeTests = fs.readdirSync(path.join(repoRoot, 'tests'))
  .filter(name => name.startsWith('test_') && name.endsWith('.mjs'))
  .map(name => path.join('tests', name));
const node = spawnSync(process.execPath, ['--test', ...nodeTests], {
  cwd: repoRoot,
  stdio: 'inherit',
});
process.exit(node.status ?? 1);
