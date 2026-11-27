// Outputs for sessions that start in a parent folder (spec 4.10): a Claude Code cloud session with several
// repositories, a person's folder of clones, or a job runner's work folder. Agents read settings and instructions only
// from the folder a session starts in, so the repositories' hooks and a pointer to their harness go there.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEntries, emptyEntries, grantKey, hookKey, ownedHooks, type ExecEntries, type HookEntry, type Targets } from './exec-outputs.ts';
import { claudeJsonFile, harnesspmHome } from './homes.ts';
import { claudeImport, repoStateFile } from './outputs.ts';
import { blockRange, CLAUDE_IMPORT, removeBlock, upsertBlock, wrapBlock } from './render.ts';
import { NPX_ANY, compareVersions, gitExcludeFile, installedCli, isFile, isRecord, listDir, readJsonIfExists, readTextIfExists, realpath, shellWord, writeAtomic, writeIfChanged } from './util.ts';

const CONFIG_FILE = 'harnesspm.json';

/** The first harnesspm whose CLI runs every hook of a parent folder: `-C <dir> track` is new in it. */
export const PARENT_HOOKS_SINCE = '0.11.0';

const realOrSame = (p: string): string => {
  try {
    return realpath(p);
  } catch {
    return path.resolve(p);
  }
};

/** A path as one word of a hook command. Windows commands hold no shell-quoted path (spec 5.2). */
const commandWord = (p: string): string => (process.platform === 'win32' ? (/[\s"]/.test(p) ? `"${p}"` : p) : shellWord(p));

/** The projects right below `dir`: its subfolders with a harnesspm.json, as real paths. */
export function childProjects(dir: string): string[] {
  return listDir(dir)
    .filter((name) => !name.startsWith('.') && name !== 'node_modules' && isFile(path.join(dir, name, CONFIG_FILE)))
    .map((name) => realOrSame(path.join(dir, name)));
}

/**
 * A folder that may be a parent folder: not a project, not inside a git repository, and not the home folder, whose
 * `.claude/` and `.codex/` hold the user-level settings of every session on the machine.
 */
function parentCandidate(dir: string): boolean {
  return realOrSame(dir) !== realOrSame(os.homedir()) && !isFile(path.join(dir, CONFIG_FILE)) && gitExcludeFile(dir) === undefined;
}

/**
 * The git repositories right below a folder that may be a parent folder, as real paths, for their own hooks and the
 * per-machine outputs of added harnesses (spec 4.10). A repository needs no harnesspm.json: it may have hooks of its
 * own, and an added harness's entry may target any.
 */
export function childRepos(dir: string): string[] {
  if (!parentCandidate(dir)) return [];
  return listDir(dir)
    .filter((name) => !name.startsWith('.') && name !== 'node_modules' && fs.existsSync(path.join(dir, name, '.git')))
    .map((name) => realOrSame(path.join(dir, name)));
}

/** A parent folder: a candidate with projects or other git repositories right below it. */
export function isParentFolder(dir: string): boolean {
  return parentCandidate(dir) && (childProjects(dir).length > 0 || childRepos(dir).length > 0);
}

const slug = (dir: string): string => `${path.basename(dir)}-${createHash('sha256').update(dir).digest('hex').slice(0, 8)}`;

/** The per-machine records of the parent folder's entries: one file per repository, so they never take each other's. */
const stateDir = (parentDir: string): string => path.join(harnesspmHome(), 'state', 'parents', slug(realOrSame(parentDir)));

const hasBlock = (dir: string): boolean => blockRange(readTextIfExists(path.join(dir, 'AGENTS.md'))) !== undefined;

/** The record that a person ran harnesspm in the parent folder, next to the records of its entries. */
const OPT_IN = 'person.json';

/** Whether a person opted the folder in, so that it gets the repositories' own hooks (spec 4.10, rule 1). */
const optedIn = (parentDir: string): boolean => isFile(path.join(stateDir(parentDir), OPT_IN));

/**
 * Records that a person ran harnesspm in the parent folder. Only a person's run calls it: the `SessionStart` hook runs in
 * whatever folder a session starts in, and the agent's model grants nothing (spec 4.10, rule 1).
 */
export function optIn(parentDir: string): void {
  const file = path.join(stateDir(parentDir), OPT_IN);
  if (!isFile(file)) writeIfChanged(file, `${JSON.stringify({ since: new Date().toISOString() }, null, 2)}\n`);
}

/** Whether a sync ran in `dir` as a parent folder, so a project's own sync keeps its entries there current. */
export function hasParentOutputs(dir: string): boolean {
  return hasBlock(dir) && isParentFolder(dir);
}

/** Whether `dir` holds parent outputs to write or to clean up: repositories below it now, or outputs of earlier ones. */
export function parentToSync(dir: string): boolean {
  return isParentFolder(dir) || (parentCandidate(dir) && (hasBlock(dir) || listDir(stateDir(dir)).length > 0));
}

/**
 * How a hook in the parent folder starts harnesspm for `projectDir`, with `-C`: the project's installed CLI file when it
 * runs parent hooks, else npx. A newer harnesspm may sync the parent folder than the one the project installed.
 */
function parentRunner(projectDir: string): string {
  const cli = process.platform === 'win32' ? undefined : installedCli(projectDir);
  const pkg = cli !== undefined ? readJsonIfExists(path.join(path.dirname(cli), '..', 'package.json')) : undefined;
  const version = isRecord(pkg) && typeof pkg['version'] === 'string' ? pkg['version'] : undefined;
  const local = version !== undefined && !version.includes('-') && compareVersions(version, PARENT_HOOKS_SINCE) >= 0;
  return `${local ? `node ${shellWord(cli!)}` : NPX_ANY} -C ${commandWord(projectDir)}`;
}

/**
 * The project's hooks as the parent folder runs them: the same events and matchers, with `-C <project>` after the runner.
 * `runner` is the prefix that the project's own hook commands start with. Permissions, MCP servers and sub-agents stay in
 * the project: they name commands and files that only work from there.
 */
export function parentEntries(team: ExecEntries, projectDir: string, runner: string): ExecEntries {
  const entries = emptyEntries();
  const prefix = parentRunner(projectDir);
  const move = (hooks: HookEntry[]): HookEntry[] =>
    hooks.filter((h) => h.command.startsWith(`${runner} `)).map((h) => ({ ...h, command: `${prefix} ${h.command.slice(runner.length + 1)}` }));
  entries.claude.hooks = move(team.claude.hooks);
  entries.codex.hooks = move(team.codex.hooks);
  return entries;
}

/** The wrapper of the harnesspm that runs: the file next to this module, in `src/` or `dist/`. */
const WRAPPER_SOURCE = fileURLToPath(new URL('./hook-wrapper.mjs', import.meta.url));

/** Where a sync writes the wrapper. The hooks name it by its absolute path, so it is one file per machine. */
const wrapperFile = (): string => path.join(harnesspmHome(), 'hook-wrapper.mjs');

/** Writes the wrapper, so it follows the harnesspm that syncs. Atomic, as a hook may start it at the same time. */
function writeWrapper(): boolean {
  const source = fs.readFileSync(WRAPPER_SOURCE, 'utf8');
  if (readTextIfExists(wrapperFile()) === source) return false;
  writeAtomic(wrapperFile(), source);
  return true;
}

/** A repository's own hook as the parent folder runs it: through the wrapper, which does nothing when it is gone. */
const wrapCommand = (repoDir: string, command: string): string =>
  `f=${shellWord(wrapperFile())}; [ -f "$f" ] || exit 0; exec node "$f" ${shellWord(repoDir)} ${shellWord(command)}`;

const WORD = String.raw`(?:[^\s';]+|'(?:[^']|'\\'')*')`;
const WRAPPED = new RegExp(String.raw`^f=${WORD}; \[ -f "\$f" \] \|\| exit 0; exec node "\$f" (${WORD}) (${WORD})$`, 's');
const unquote = (word: string): string => (word.startsWith("'") ? word.slice(1, -1).replaceAll("'\\''", "'") : word);

/** A held-back entry as people read it: a wrapped hook by its repository's folder name and its own command. */
function heldText(entry: string): string {
  const wrapped = WRAPPED.exec(entry.replace(/^Claude Code hook: /, ''));
  return wrapped !== null ? `Claude Code hook of ${path.basename(unquote(wrapped[1]!))}: ${unquote(wrapped[2]!)}` : entry;
}

/** The keys of a handler that the parent folder keeps. A handler with another key, such as `args` or `if`, would run differently. */
const HANDLER_KEYS = new Set(['type', 'command', 'timeout', 'async']);

const short = (command: string): string => (command.length > 60 ? `${command.slice(0, 57)}...` : command);

/**
 * The repository's own Claude Code hooks (spec 4.10): each command hook in its `.claude/settings.json` and
 * `.claude/settings.local.json`, with its event, matcher, `timeout` and `async`, wrapped to run as in a session there.
 * Hooks that harnesspm wrote for the project's harness are left out: `parentEntries` copies those with `-C`. `team` are
 * the project's own entries, for a hook that its state file no longer records. The commands are shell words, so there
 * are none on Windows.
 */
function repoHooks(repoDir: string, team: HookEntry[], warnings: string[]): HookEntry[] {
  if (process.platform === 'win32') return [];
  const owned = new Set(ownedHooks(repoStateFile(repoDir), 'team').map(hookKey));
  const copied = new Set(team.map(grantKey));
  const hooks: HookEntry[] = [];
  for (const name of ['settings.json', 'settings.local.json']) {
    const file = path.join('.claude', name);
    let raw: unknown;
    try {
      raw = readJsonIfExists(path.join(repoDir, file));
    } catch {
      warnings.push(`${file} is not valid JSON, so its hooks do not run in sessions that start in the folder above`);
      continue;
    }
    const events = isRecord(raw) && isRecord(raw['hooks']) ? raw['hooks'] : {};
    for (const [event, groups] of Object.entries(events)) {
      for (const group of Array.isArray(groups) ? groups : []) {
        if (!isRecord(group) || !Array.isArray(group['hooks'])) continue;
        const matcher = typeof group['matcher'] === 'string' ? { matcher: group['matcher'] } : {};
        for (const handler of group['hooks']) {
          if (!isRecord(handler)) continue;
          const command = typeof handler['command'] === 'string' ? handler['command'] : '';
          const own: HookEntry = { event, ...matcher, command };
          if (owned.has(hookKey(own)) || copied.has(grantKey(own))) continue;
          const type = typeof handler['type'] === 'string' ? handler['type'] : 'command';
          const other = Object.keys(handler).filter((key) => !HANDLER_KEYS.has(key));
          if (type !== 'command' || command === '' || other.length > 0) {
            const why = type !== 'command' ? `type "${type}"` : command === '' ? 'no command' : other.map((key) => `"${key}"`).join(', ');
            warnings.push(`a ${event} hook in ${file} does not run in sessions that start in the folder above, because of its ${why}${command !== '' ? `: ${short(command)}` : ''}`);
            continue;
          }
          const timeout = typeof handler['timeout'] === 'number' ? { timeout: handler['timeout'] } : {};
          hooks.push({ ...own, command: wrapCommand(repoDir, command), ...timeout, ...(handler['async'] === true ? { async: true } : {}) });
        }
      }
    }
  }
  return hooks;
}

function parentTargets(parentDir: string, stateFile: string): Targets {
  return {
    claudeSettings: path.join(parentDir, '.claude', 'settings.local.json'),
    claudeJson: claudeJsonFile(),
    codexHooks: path.join(parentDir, '.codex', 'hooks.json'),
    codexRules: path.join(parentDir, '.codex', 'rules', 'harnesspm.rules'),
    stateFile,
  };
}

function pruneDirs(parentDir: string): void {
  for (const dir of [path.join(parentDir, '.codex', 'rules'), path.join(parentDir, '.codex'), path.join(parentDir, '.claude')]) {
    try {
      fs.rmdirSync(dir);
    } catch {
      // Not empty, or not there.
    }
  }
}

export interface ParentResult {
  changed: string[];
  held: string[];
  warnings: string[];
  /** How many hooks of the repository the folder asks for, held ones included. */
  hooks: number;
}

/**
 * Writes one repository's hooks into the parent folder's agent settings: the project's harness with `-C`, and, in a
 * folder a person opted into, the repository's own hooks through the wrapper. `widen` is false for a run by the agent's model: it keeps and removes
 * hooks but adds none, also those the project's default branch records, because the parent folder is the person's and
 * the agent may have cloned the repository or written its hooks (spec 4.10, rule 5).
 */
export function writeParent(parentDir: string, projectDir: string, team: ExecEntries, runner: string, widen: boolean): ParentResult {
  const stateFile = path.join(stateDir(parentDir), `${slug(projectDir)}.json`);
  const warnings: string[] = [];
  const entries = parentEntries(team, projectDir, runner);
  // Without a person's opt-in, a repository's own hooks are neither written nor held, and earlier copies go.
  const own = optedIn(parentDir) ? repoHooks(projectDir, team.claude.hooks, warnings) : [];
  entries.claude.hooks.push(...own);
  const hooks = entries.claude.hooks.length + entries.codex.hooks.length;
  // Nothing to write and nothing written before: no record either, so a folder no person synced keeps none.
  if (hooks === 0 && !isFile(stateFile)) return { changed: [], held: [], warnings, hooks };
  const changed = own.length > 0 && writeWrapper() ? [wrapperFile()] : [];
  const applied = applyEntries('team', entries, parentTargets(parentDir, stateFile), widen);
  pruneDirs(parentDir);
  return { changed: [...changed, ...applied.changed], held: applied.held.map(heldText), warnings, hooks };
}

/** Removes the entries of repositories that are no longer below the parent folder. Removing grants nothing, so any run may. */
export function removeGone(parentDir: string, projects: string[]): string[] {
  const dir = stateDir(parentDir);
  const keep = new Set(projects.map((p) => `${slug(p)}.json`));
  const changed: string[] = [];
  for (const name of listDir(dir)) {
    if (!name.endsWith('.json') || keep.has(name) || name === OPT_IN) continue;
    const file = path.join(dir, name);
    changed.push(...applyEntries('team', emptyEntries(), parentTargets(parentDir, file), false).changed);
    fs.rmSync(file, { force: true });
  }
  try {
    fs.rmdirSync(dir);
  } catch {
    // Repositories or the opt-in remain, or it was never there.
  }
  pruneDirs(parentDir);
  return changed;
}

/** The block that names each project below `parentDir` and how to reach its harness. Paths are absolute: the file is per machine. */
export function parentBlock(parentDir: string): string {
  const lines = childProjects(parentDir).map(
    (dir) => `- \`${path.basename(dir)}\`: \`${dir}\`. Rules: \`${path.join(dir, 'AGENTS.md')}\`. Its harness: \`${NPX_ANY} -C ${commandWord(dir)} help\`.`,
  );
  return wrapBlock(
    [
      '## Repositories with a harness',
      '',
      'A session that starts in this folder does not load the agent rules of the repositories below it. Before you change files in one, read its `AGENTS.md`, and the `AGENTS.md` of the folder you change. `help` lists its rules, docs, skills and tools; run a tool with `-C <path> run <tool> [args]`.',
      '',
      ...lines,
    ].join('\n'),
  );
}

/**
 * Writes the block in the parent folder's `AGENTS.md`, with the `@AGENTS.md` import that makes Claude Code read it, or
 * removes both when no project is left below the folder.
 */
export function writePointer(parentDir: string): string[] {
  const changed: string[] = [];
  const agentsFile = path.join(parentDir, 'AGENTS.md');
  const claudeFile = path.join(parentDir, 'CLAUDE.md');
  if (childProjects(parentDir).length > 0) {
    if (writeIfChanged(agentsFile, upsertBlock(readTextIfExists(agentsFile), parentBlock(parentDir)))) changed.push(agentsFile);
    const claude = claudeImport(parentDir);
    if (writeIfChanged(claude.file, claude.text)) changed.push(claude.file);
    return changed;
  }
  if (!hasBlock(parentDir)) return changed;
  const rest = removeBlock(readTextIfExists(agentsFile));
  if (rest === undefined) fs.rmSync(agentsFile, { force: true });
  else writeIfChanged(agentsFile, rest);
  changed.push(agentsFile);
  // The import that sync added, when the file holds nothing else.
  if ((readTextIfExists(claudeFile) ?? '').trim() === CLAUDE_IMPORT && rest === undefined) {
    fs.rmSync(claudeFile, { force: true });
    changed.push(claudeFile);
  }
  return changed;
}
