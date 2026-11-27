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

/**
 * Writes a file through a temporary file and a rename, so a reader at the same time, such as Claude Code reloading a
 * settings file or a hook starting the hook wrapper, sees the old file or the new one, never a part. A link stays a
 * link: the file it points to is replaced, with its mode.
 */
export function writeAtomic(file: string, content: string): void {
  const target = fs.existsSync(file) ? fs.realpathSync(file) : file;
  ensureDir(path.dirname(target));
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  if (fs.existsSync(target)) fs.chmodSync(tmp, fs.statSync(target).mode);
  fs.renameSync(tmp, target);
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

/** Where a project's per-machine files are excluded from git (spec 4.1). */
export interface GitExclude {
  /** The clone's exclude file, usually `.git/info/exclude` at the git root. */
  file: string;
  /** The top folder of the work tree. */
  root: string;
  /** The project's folder from `root`, such as `docs-site/`, or `''` at the root. Patterns in `file` start from `root`, so every entry starts with it. */
  prefix: string;
}

/** The clone's exclude file and the project's path inside the work tree, or undefined outside a git repository. */
export function gitExclude(projectDir: string): GitExclude | undefined {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel', '--show-prefix', '--git-path', 'info/exclude'], { cwd: projectDir, encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  const [root = projectDir, prefix = '', p = ''] = result.stdout.split('\n');
  return { file: path.isAbsolute(p) ? p : path.join(projectDir, p), root, prefix };
}

/** The file that holds this clone's git excludes, or undefined outside a git repository. */
export function gitExcludeFile(projectDir: string): string | undefined {
  return gitExclude(projectDir)?.file;
}

/** An exclude entry for a path from the project folder, such as `CLAUDE.local.md`: anchored at the git root, as git reads it. */
export const excludeEntry = (prefix: string, rel: string): string => `/${prefix}${rel.replace(/^\/+/, '')}`;

/** Adds one entry to the clone's exclude file, after everything else in it, unless it is there already. */
export function addExclude(projectDir: string, rel: string): void {
  const exclude = gitExclude(projectDir);
  if (!exclude) return;
  const entry = excludeEntry(exclude.prefix, rel);
  const text = readTextIfExists(exclude.file) ?? '';
  if (text.split('\n').includes(entry)) return;
  writeIfChanged(exclude.file, `${text.replace(/\s*$/, '')}${text.trim() ? '\n' : ''}${entry}\n`);
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

/** Whether `file` is `dir` or below it. */
export function isInside(dir: string, file: string): boolean {
  const rel = path.relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** A fence line: its indent, its run of backticks or tildes, and the rest of the line. */
const FENCE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
/** An escaped character, a code span (backticks closed by a run of the same length within one paragraph), or backticks that open nothing. */
const CODE_SPAN = /\\[\s\S]|(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)|`+/g;
const blank = (text: string): string => text.replace(/[^\r\n]/g, ' ');

/**
 * A Markdown page with its code samples blanked out, so that a link in a sample is not read (spec 2.10):
 * fenced code blocks and code spans, as CommonMark reads them. A fence that is never closed runs to the end of the page.
 * A fence may be indented, as in a list item. Its closing fence is indented at most 3 columns more.
 * Indented code blocks stay: telling one from a list item's paragraph needs a full Markdown parser.
 * Blanks keep every other character where it was, so a match in the result is at the same place in the page.
 */
export function withoutCode(text: string): string {
  const lines = text.split('\n');
  let open: { char: string; length: number; indent: number } | undefined;
  for (const [i, line] of lines.entries()) {
    const fence = FENCE.exec(line.replace(/\r$/, ''));
    if (open) {
      if (fence && fence[2]![0] === open.char && fence[2]!.length >= open.length && fence[3]!.trim() === '' && fence[1]!.length <= open.indent + 3) open = undefined;
      lines[i] = blank(line);
    } else if (fence && !(fence[2]![0] === '`' && fence[3]!.includes('`'))) {
      // The info string of a backtick fence has no backticks: such a line starts a code span instead.
      open = { char: fence[2]![0]!, length: fence[2]!.length, indent: fence[1]!.length };
      lines[i] = blank(line);
    }
  }
  // Spaces keep the text around a span apart, so that `[a]` and `(b)` on each side of it do not become a link.
  return lines.join('\n').replace(CODE_SPAN, (match: string, ticks?: string) => (ticks === undefined ? match : blank(match)));
}

/**
 * The links of a Markdown page outside its code samples that point at a file of its own package: neither a URL nor
 * an absolute path. Each is the target without its fragment, and where that target starts in the page.
 */
export function relativeLinks(text: string): { link: string; index: number }[] {
  const links: { link: string; index: number }[] = [];
  for (const match of withoutCode(text).matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
    const link = match[1]!;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link) && !link.startsWith('/')) links.push({ link, index: match.index + 2 });
  }
  return links;
}

/** Whether git ignores the folder `dir` itself. False outside a work tree, or when git is missing. */
export function gitIgnoresDir(dir: string): boolean {
  return spawnSync('git', ['check-ignore', '-q', '.'], { cwd: dir }).status === 0;
}

/**
 * The file whose pattern makes git ignore `rel`, a path in `projectDir` that need not exist (a folder ends in `/`): a
 * `.gitignore` or `.git/info/exclude` by its path from the git root, or a global excludes file by its absolute path.
 * Null when git does not ignore it, undefined outside a work tree.
 */
export function gitIgnoreSource(projectDir: string, rel: string): string | null | undefined {
  // -z, so git does not quote a path with non-ASCII characters.
  const result = spawnSync('git', ['check-ignore', '-z', '-v', '--stdin'], { cwd: projectDir, encoding: 'utf8', input: `${rel}\0` });
  if (result.status === 1) return null;
  // Git also fails inside a work tree, as on an exclude file it cannot read, in a repository it calls unsafe, or when
  // it is missing: then nothing is known to be ignored.
  if (result.status !== 0) return hasGitAbove(projectDir) ? null : undefined;
  const [source = '', , pattern = ''] = result.stdout.split('\0');
  return source !== '' && !pattern.startsWith('!') ? source : null;
}

/** Whether `dir` or a folder above it holds `.git`, whether or not git can read it. */
function hasGitAbove(dir: string): boolean {
  for (let current = path.resolve(dir); ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) return true;
    if (path.dirname(current) === current) return false;
  }
}

/** Whether a file written at `rel` stays out of every commit: git ignores it, or there is no work tree. */
export function gitKeepsOut(projectDir: string, rel: string): boolean {
  return gitIgnoreSource(projectDir, rel) !== null;
}

export function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

export type Caller = 'model' | 'hook' | 'person';

/** Set by `--hook`, which the user-level session hook passes (spec 7.5): the run is a hook's, whatever else the environment says. */
export const HOOK_RUN = 'HARNESSPM_HOOK_RUN';

/**
 * Who runs harnesspm (spec 6.2, rule 4). Claude Code marks model commands (`AI_AGENT=…_agent`) and hooks
 * (`…_harness`). Codex sets `CODEX_CI=1` and `CODEX_TOOL_CALL_ID` only in commands the model runs, and marks no hook,
 * so the session hook says it with `--hook`. The model's marks are checked first, so a model run that passes `--hook`
 * stays a model run. The other order would be safe too: `--hook` only turns a person's run into a hook's, which grants
 * less, as a hook's run never opts a folder in (spec 4.10).
 */
export function caller(env: NodeJS.ProcessEnv = process.env): Caller {
  const agent = env['AI_AGENT'] ?? '';
  if (agent.endsWith('_agent')) return 'model';
  if (agent.endsWith('_harness')) return 'hook';
  if (agent === '' && env['CLAUDECODE'] === '1') return 'model';
  if (codexRun(env)) return 'model';
  if (env[HOOK_RUN] === '1') return 'hook';
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
