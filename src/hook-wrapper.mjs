// @ts-check
// Runs one hook of a git repository in a Claude Code session that starts in the folder above it (spec 4.10). A sync in
// that folder copies the repository's own hooks into the folder's `.claude/settings.local.json`, each through this file,
// which it writes to ~/.harnesspm/hook-wrapper.mjs. It needs Node.js built-ins only.
//
//   node hook-wrapper.mjs <repository> <command>     with the hook's JSON on stdin
//
// The command runs as in a session in the repository: there, with CLAUDE_PROJECT_DIR set to it and `cwd` in the JSON
// rewritten to it. When the JSON names files and none is in the repository, nothing runs and the exit code is 0.
// Otherwise the command's exit code, stdout and stderr pass through, so exit 2 still blocks.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {Record<string, unknown>} data @param {string} key @returns {string | undefined} */
const text = (data, key) => (typeof data[key] === 'string' && data[key] !== '' ? data[key] : undefined);

/** The real path, also of a file that does not exist yet: the real path of its nearest folder that does. @param {string} p */
function real(p) {
  /** @type {string[]} */
  const rest = [];
  for (let dir = path.resolve(p); ; dir = path.dirname(dir)) {
    try {
      return path.join(fs.realpathSync(dir), ...rest.reverse());
    } catch {
      if (path.dirname(dir) === dir) return path.resolve(p);
      rest.push(path.basename(dir));
    }
  }
}

const FILE_KEYS = ['file_path', 'notebook_path', 'path'];

/**
 * The hook's JSON with `cwd` set to the repository, and the files it names: in `tool_input`, and the `file_path` of
 * `InstructionsLoaded`. A relative file becomes absolute, so it names the same file from the new `cwd`.
 * @param {Record<string, unknown>} payload @param {string} repo
 */
function rewrite(payload, repo) {
  const base = text(payload, 'cwd') ?? process.cwd();
  /** @type {string[]} */
  const files = [];
  /** @param {Record<string, unknown>} data @param {string[]} keys */
  const absolute = (data, keys) => {
    const result = { ...data };
    for (const key of keys) {
      const file = text(data, key);
      if (file === undefined) continue;
      result[key] = path.resolve(base, file);
      files.push(path.resolve(base, file));
    }
    return result;
  };
  const next = absolute(payload, ['file_path']);
  if (isRecord(payload['tool_input'])) next['tool_input'] = absolute(payload['tool_input'], FILE_KEYS);
  return { input: { ...next, cwd: repo }, files };
}

/** @returns {number} */
function main() {
  const [repo, command] = process.argv.slice(2);
  if (repo === undefined || command === undefined) throw new Error('usage: hook-wrapper.mjs <repository> <command>');
  // A repository that is gone runs nothing, until the next sync removes its hooks.
  if (!fs.statSync(repo, { throwIfNoEntry: false })?.isDirectory()) return 0;
  let input = fs.readFileSync(0);
  /** @type {unknown} */
  let payload;
  try {
    payload = JSON.parse(input.toString('utf8'));
  } catch {
    payload = undefined;
  }
  if (isRecord(payload)) {
    const rewritten = rewrite(payload, repo);
    const dir = real(repo);
    const inside = (/** @type {string} */ file) => file === dir || file.startsWith(dir + path.sep);
    if (rewritten.files.length > 0 && !rewritten.files.map(real).some(inside)) return 0;
    input = Buffer.from(JSON.stringify(rewritten.input));
  }
  /** @type {import('node:child_process').SpawnSyncOptions} */
  const options = { cwd: repo, env: { ...process.env, CLAUDE_PROJECT_DIR: repo }, input, stdio: ['pipe', 'inherit', 'inherit'] };
  // bash where there is one, as a hook written for Claude Code may use it; sh runs it elsewhere.
  let done = spawnSync('bash', ['-c', command], options);
  if (/** @type {NodeJS.ErrnoException | undefined} */ (done.error)?.code === 'ENOENT') done = spawnSync('sh', ['-c', command], options);
  if (done.error !== undefined) throw done.error;
  return done.status ?? 1;
}

try {
  process.exitCode = main();
} catch (error) {
  // Never blocks by accident: only the repository's hook exits 2.
  process.stderr.write(`harnesspm hook wrapper: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
