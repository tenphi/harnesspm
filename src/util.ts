import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** The npm package of harnesspm. The command it installs is `harnesspm` (spec 10.1). */
export const PACKAGE_NAME = '@tenphi/harnesspm';
/** Runs harnesspm in a project that depends on it: npx finds the installed command. */
export const NPX_LOCAL = 'npx harnesspm';
/** Runs harnesspm anywhere: npx downloads the package by its full name when it is not installed. */
export const NPX_ANY = `npx -y ${PACKAGE_NAME}`;

/** A command prefix that starts harnesspm: as shell words, for hooks, and as an argument list, for MCP servers. */
export interface Runner {
  shell: string;
  argv: string[];
}

/** A runner through npx, such as `npx -y @tenphi/harnesspm`. */
export const npxRunner = (prefix: string): Runner => ({ shell: prefix, argv: prefix.split(' ') });

/** A word for sh: as it is when it is safe, else in single quotes. */
export function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

/**
 * The CLI file of the harnesspm that the project installed, by the `bin` field of its package.json. The path goes
 * through `node_modules/@tenphi/harnesspm`, not its real path, so it stays the same when pnpm moves the package.
 */
export function installedCli(projectDir: string): string | undefined {
  const dir = path.join(projectDir, 'node_modules', ...PACKAGE_NAME.split('/'));
  try {
    const pkg = readJsonIfExists(path.join(dir, 'package.json'));
    const bin = isRecord(pkg) ? (typeof pkg['bin'] === 'string' ? pkg['bin'] : isRecord(pkg['bin']) ? pkg['bin']['harnesspm'] : undefined) : undefined;
    return typeof bin === 'string' && isFile(path.join(dir, bin)) ? path.join(dir, bin) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * How hooks and MCP servers start harnesspm in a project (spec 5.2, 14.4): `node` with the CLI file that the project
 * installed, else `fallback` through npx, which costs about 0.4 s per call. `node` runs the file whatever its mode: Yarn 4
 * drops the executable bit on an upgrade in place (research/package-managers.md). The path is absolute, so only
 * per-machine files use it. Allow rules keep the npx form, because they must match the command the agent types
 * (spec 5.4). Windows keeps npx, so commands there hold no shell-quoted path.
 */
export function runner(projectDir: string, fallback: string): Runner {
  const cli = process.platform === 'win32' ? undefined : installedCli(projectDir);
  if (cli === undefined) return npxRunner(fallback);
  return { shell: `node ${shellWord(cli)}`, argv: ['node', cli] };
}

/** An error that the CLI prints without a stack trace. */
export class HarnessError extends Error {}

export function exists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function readTextIfExists(file: string): string | undefined {
  return isFile(file) ? readText(file) : undefined;
}

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    throw new HarnessError(`Cannot read ${file}: ${(error as Error).message}`);
  }
}

export function readJsonIfExists(file: string): unknown {
  return isFile(file) ? readJson(file) : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hash(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** A forward-slash path, for outputs that must be the same on every machine. */
export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function relPosix(from: string, to: string): string {
  return toPosix(path.relative(from, to)) || '.';
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Writes a file only when its content changes. Returns true when it wrote. */
export function writeIfChanged(file: string, content: string): boolean {
  if (readTextIfExists(file) === content) return false;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
  return true;
}

/** Creates or updates a relative symbolic link. Returns true when it changed the link. */
export function linkIfChanged(linkPath: string, target: string): boolean {
  const relTarget = path.relative(path.dirname(linkPath), target) || '.';
  try {
    if (fs.lstatSync(linkPath).isSymbolicLink() && fs.readlinkSync(linkPath) === relTarget) return false;
    fs.rmSync(linkPath, { recursive: false, force: true });
  } catch {
    // The link does not exist yet.
  }
  ensureDir(path.dirname(linkPath));
  fs.symlinkSync(relTarget, linkPath, 'dir');
  return true;
}

export function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function realpath(p: string): string {
  return fs.realpathSync(p);
}

/** Whether `from`, by default the folder harnesspm started in, is `dir` or inside it. Both are compared as real paths. */
export function insideDir(dir: string, from = process.cwd()): boolean {
  const real = (p: string): string => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const inner = real(from);
  const outer = real(dir);
  return inner === outer || inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);
}

/** Compares versions like 1.2.10 and 1.10.0 by their numeric parts. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/);
  const pb = b.split(/[.+-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== '') {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** The file that holds this clone's git excludes, or undefined outside a git repository. */
export function gitExcludeFile(projectDir: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: projectDir, encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  const p = result.stdout.trim();
  return path.isAbsolute(p) ? p : path.join(projectDir, p);
}

/**
 * Which files below `dir` a docs unit counts, by their posix path relative to `dir` (spec 2.7): every file but
 * the ones git ignores. An ignored file never reaches another clone, so counting it would make this machine's
 * lock, index and check differ from everyone else's. Every file counts when git is missing, `dir` is outside a
 * work tree, or git ignores `dir` itself, as it ignores an installed package in node_modules.
 */
export function gitKeeps(dir: string): (rel: string) => boolean {
  // Exit 1: git ignores nothing here. 0 means it ignores the folder itself, 128 that there is no work tree.
  if (spawnSync('git', ['check-ignore', '-q', '.'], { cwd: dir }).status !== 1) return () => true;
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (listed.status !== 0) return () => true;
  const kept = new Set(listed.stdout.split('\0'));
  return (rel) => kept.has(rel);
}

export function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

export type Caller = 'model' | 'hook' | 'person';

/**
 * Who runs harnesspm (spec 6.2, rule 4). Claude Code marks model commands (`AI_AGENT=…_agent`) and hooks
 * (`…_harness`). Codex sets `CODEX_CI=1` and `CODEX_TOOL_CALL_ID` only in commands the model runs.
 */
export function caller(env: NodeJS.ProcessEnv = process.env): Caller {
  const agent = env['AI_AGENT'] ?? '';
  if (agent.endsWith('_agent')) return 'model';
  if (agent.endsWith('_harness')) return 'hook';
  if (agent === '' && env['CLAUDECODE'] === '1') return 'model';
  if (codexRun(env)) return 'model';
  return 'person';
}

/** True when Codex's model runs the command: Codex marks only those (spec 6.2, rule 4). */
export function codexRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['CODEX_CI'] === '1' || (env['CODEX_TOOL_CALL_ID'] ?? '') !== '';
}

/** True in a Claude Code cloud session, where the person has no terminal of their own (spec 9). */
export function inCloudSession(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['CLAUDE_CODE_REMOTE'] === 'true';
}

/** `<host>/<path>` of a repository's `origin` remote, without `.git`, for SSH and HTTPS URLs. Undefined without one. */
export function remoteKey(projectDir: string): string | undefined {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: projectDir, encoding: 'utf8' });
  const url = (result.stdout ?? '').trim();
  return result.status === 0 && url !== '' ? normalizeRemote(url) : undefined;
}

export function normalizeRemote(url: string): string {
  let rest = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const scp = /^[^@/]+@([^:/]+):(.+)$/.exec(rest);
  if (scp) return `${scp[1]}/${scp[2]!.replace(/^\/+/, '')}`;
  rest = rest.replace(/^[a-z+]+:\/\//i, '').replace(/^[^@/]+@/, '');
  const [hostPort, ...segments] = rest.split('/');
  return [hostPort!.replace(/:\d+$/, ''), ...segments].join('/');
}

/** The agent whose marker is in the environment: `claude`, `codex`, or undefined (spec 5.1). */
export function agentOf(env: NodeJS.ProcessEnv = process.env): 'claude' | 'codex' | undefined {
  if ((env['AI_AGENT'] ?? '').startsWith('claude-code') || env['CLAUDECODE'] === '1') return 'claude';
  if (env['CODEX_CI'] === '1' || (env['CODEX_TOOL_CALL_ID'] ?? '') !== '') return 'codex';
  return undefined;
}
