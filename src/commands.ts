// CLI commands (spec chapter 10).
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  caller,
  configFileFor,
  fetchSource,
  loadAdded,
  parseSource,
  readList,
  updateSource,
  writeList,
  type AddedHarness,
  type Scope,
} from './added.ts';
import { checkHarness } from './check.ts';
import { checkLocalFiles, excludeWritable, formatFinding, type Finding } from './doctor.ts';
import { CONFIG_FILE, CONFIG_SCHEMA } from './config.ts';
import { loadHarnessPackage, NS } from './manifest.ts';
import { heldEntries, trustOf } from './exec-outputs.ts';
import { buildLock, LOCK_FILE, readLock, serializeLock, type Lock } from './lock.ts';
import { applyPlan, checkPlan, claudeImport, computePlan, repoStateFile, STATE_DIR, type Plan } from './outputs.ts';
import { fetchLocked, locateLocked } from './fetch.ts';
import { createPatch, createUnit, KINDS, resolveTarget, type Kind } from './new.ts';
import { reviewedState, type Reviewed } from './reviewed.ts';
import { runMcp, runScript } from './run.ts';
import { pathTools } from './outputs.ts';
import { alwaysOnText, blockRange, helpTarget, ruleBodyWithoutTitle, type PathFor } from './render.ts';
import { resolve, resolvePackageDir, type FinalAgent, type FinalHook, type FinalMcp, type FinalPermissions, type FinalRule, type FinalScript, type FinalSkill, type Resolution, type ResolvedPackage } from './resolve.ts';
import { demoteHeadings } from './sections.ts';
import { tryFrontmatter } from './frontmatter.ts';
import { commandCaller, describeSend, readIndex, readTelemetryState, sendEvent, type EventContext } from './telemetry.ts';
import { userHeld, writeUserOutputs, writeUserSettings, type UserReport } from './user-outputs.ts';
import { HarnessError, NPX_ANY, NPX_LOCAL, PACKAGE_NAME, codexRun, gitExcludeFile, inCloudSession, isDir, isFile, isRecord, readJson, readJsonIfExists, readTextIfExists, realpath, relPosix, shellWord, writeIfChanged } from './util.ts';
import { spawnSync } from 'node:child_process';

export interface Output {
  log(line: string): void;
  warn(line: string): void;
}

const printWarnings = (out: Output, warnings: string[]): void => {
  for (const w of [...new Set(warnings)]) out.warn(`⚠️  ${w}`);
};

const plural = (count: number, word: string, many = `${word}s`): string => `${count} ${count === 1 ? word : many}`;

/**
 * Where a person grants what an agent could not. A Claude Code cloud session has no terminal of the person's, and its
 * container goes away, so there the setup script runs the command, before each new session starts (spec 9).
 */
const cloudStep = (what: string, them: string): string => `In a Claude Code cloud session, ask the person to run ${what} in the environment's setup script. New sessions then start with ${them}.`;
function grantStep(projectDir: string, inTerminal: string): string {
  if (!inCloudSession()) return inTerminal;
  const line = setupLine(projectDir);
  return cloudStep(`${line !== undefined ? `\`${line}\`` : 'the install'}, or their own \`npx -y @tenphi/harnesspm add <source>\`,`, 'these entries');
}

const firstThree = (items: string[]): string => `${items.slice(0, 3).join('; ')}${items.length > 3 ? '; …' : ''}`;
const heldList = (report: UserReport): string => `${plural(report.held.length, 'entry', 'entries')} that an agent cannot grant (${firstThree(report.held)})${report.why !== undefined ? `, because ${report.why}` : ''}`;
const unwrittenList = ({ entries, branch }: NonNullable<UserReport['unwritten']>): string => `${plural(entries.length, 'entry', 'entries')} that ${branch} records (${firstThree(entries)})`;

function printPending(out: Output, report: UserReport, projectDir: string): void {
  for (const line of [...new Set(report.pending)]) out.log(`⏳ pending: ${line}`);
  if (report.unwritten) out.log(`⏳ not written yet: ${unwrittenList(report.unwritten)}. Run \`${NPX_LOCAL} sync\`.`);
  if (report.held.length > 0) {
    out.log(`⏳ held back: ${heldList(report)}.`);
    out.log(`   ${grantStep(projectDir, `Ask the person to run \`${NPX_ANY} sync\` or \`${NPX_ANY} approve\` in their own terminal.`)}`);
  }
}

/** The repository to work on: the nearest folder with harnesspm.json, else the git root, else `cwd`. */
export function findProjectDir(cwd: string): string {
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    if (isFile(path.join(dir, CONFIG_FILE))) return dir;
    if (path.dirname(dir) === dir) break;
  }
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return top.status === 0 ? top.stdout.trim() : cwd;
}

/** True when every direct dependency that is not optional is installed. */
function dependenciesInstalled(projectDir: string): boolean {
  const pkg = readJsonIfExists(path.join(projectDir, 'package.json'));
  if (!isRecord(pkg)) return true;
  if (!isDir(path.join(projectDir, 'node_modules'))) {
    const any = ['dependencies', 'devDependencies'].some((f) => isRecord(pkg[f]) && Object.keys(pkg[f] as object).length > 0);
    return !any;
  }
  for (const field of ['dependencies', 'devDependencies']) {
    const deps = pkg[field];
    if (!isRecord(deps)) continue;
    for (const name of Object.keys(deps)) if (!resolvePackageDir(name, projectDir)) return false;
  }
  return true;
}

interface Resolved {
  team?: Resolution;
  full: Resolution;
  added: AddedHarness[];
  mode: 'full' | 'added-only' | 'none';
  warnings: string[];
}

function resolveAll(projectDir: string, options: { withAdded: boolean }): Resolved {
  const warnings: string[] = [];
  const usesHarnesspm = isFile(path.join(projectDir, CONFIG_FILE));
  const installed = usesHarnesspm && dependenciesInstalled(projectDir);
  if (usesHarnesspm && !installed) warnings.push('the dependencies are not installed, so the committed outputs are left as they are');
  const inRepo = gitExcludeFile(projectDir) !== undefined;
  const added = options.withAdded && process.env['CI'] !== 'true' ? loadAdded(inRepo ? projectDir : undefined, warnings) : [];
  const team = installed ? resolve(projectDir) : undefined;
  // Outside a git repository only user-scope harnesses load, and no repository outputs are written.
  const full = resolve(projectDir, { team: installed, added });
  const mode = installed ? 'full' : inRepo && added.length > 0 ? 'added-only' : 'none';
  return { ...(team ? { team } : {}), full, added, mode, warnings: [...warnings, ...(team?.warnings ?? []), ...full.warnings] };
}

/**
 * `check` compares and writes nothing. With `CI=true`, the committed outputs stay as they are unless `write` is set,
 * so that an install's sync cannot hide a missed sync from a later `sync --check` (spec 6.4, 10.1).
 */
export function sync(cwd: string, out: Output, options: { check?: boolean; write?: boolean; quiet?: boolean } = {}): number {
  const projectDir = findProjectDir(cwd);
  if (options.check && options.write) throw new HarnessError('Use either --check or --write, not both.');
  if (options.check) {
    const { team, full, warnings } = resolveAll(projectDir, { withAdded: false });
    const plan = computePlan(team, full);
    printWarnings(out, [...warnings, ...plan.warnings]);
    const problems = checkPlan(projectDir, plan);
    for (const p of problems) out.log(`❌ ${p}`);
    if (problems.length > 0) {
      out.log('Run `npx harnesspm sync` and commit the result.');
      return 1;
    }
    out.log('✅ harnesspm outputs are up to date');
    return 0;
  }
  const resolved = resolveAll(projectDir, { withAdded: true });
  const { full, mode } = resolved;
  const warnings = [...resolved.warnings];
  const changed: string[] = [];
  const report: UserReport = { pending: [], held: [] };
  const before = readLock(projectDir);
  const keepCommitted = process.env['CI'] === 'true' && options.write !== true;
  let keptCommitted = false;
  if (mode !== 'none') {
    const model = caller() === 'model';
    const plan = computePlan(resolved.team, full, { widen: !model });
    warnings.push(...plan.warnings);
    keptCommitted = keepCommitted && plan.committed !== undefined;
    const reviewed = model ? reviewedFor(projectDir, resolved.team, plan) : undefined;
    const applied = applyPlan(projectDir, plan, { committed: !keepCommitted, reviewed: reviewed?.ok === true });
    changed.push(...applied.changed);
    report.held.push(...(plan.telemetryHeld !== undefined ? [plan.telemetryHeld] : []), ...applied.held);
    if (reviewed?.ok === false && (applied.teamHeld || plan.telemetryHeld !== undefined)) report.why = reviewed.reason;
    report.pending.push(...(plan.exec.team?.pending ?? []), ...plan.exec.added.pending);
  }
  if (resolved.team) syncEvent(resolved.team, before, readLock(projectDir));
  if (process.env['CI'] !== 'true') changed.push(...writeUserOutputs(resolved.added, warnings, report));
  printWarnings(out, warnings);
  printPending(out, report, projectDir);
  if (options.quiet) return 0;
  if (keptCommitted) out.log(`CI: committed outputs left as they are; \`${NPX_LOCAL} sync --check\` compares them, \`sync --write\` writes them.`);
  const counts = `${plural(full.rules.length, 'rule')}, ${plural(full.skills.length, 'skill')}, ${plural(full.docs.length, 'doc')} from ${plural(full.packages.length, 'package')}`;
  const what = mode === 'none' ? 'Nothing to do in this folder' : mode === 'added-only' ? `Added harnesses only: ${counts}` : counts;
  out.log(changed.length > 0 ? `harnesspm: ${what}. Updated ${plural(changed.length, 'file')}.` : `harnesspm: ${what}. Nothing changed.`);
  return 0;
}

/** Where events about a resolved project go (spec chapter 14). */
const eventContext = (res: Resolution): EventContext => ({ projectDir: res.projectDir, project: res.projectName, workspaces: res.workspaces.map((ws) => ws.key) });

/** The `sync` event: packages and the units that changed since the last lock (spec 14.2). CI sends none: every job syncs. */
function syncEvent(team: Resolution, before: Lock | undefined, after: Lock | undefined): void {
  const state = readTelemetryState(team.projectDir);
  if (!state.events.has('sync') || !after || commandCaller().caller === 'ci') return;
  const old = before?.units ?? {};
  const units = after.units;
  const pending = team.packages.filter(
    (pkg) => pkg.layer === 'dependencies' && [...team.scripts, ...team.hooks, ...team.mcp].some((u) => u.pkg === pkg) && !trustOf(pkg, team, after).trusted,
  );
  sendEvent(state, eventContext(team), {
    type: 'sync',
    ...commandCaller(),
    packages: team.packages.filter((p) => p.layer !== 'added').map((p) => ({ name: p.name, version: p.version })),
    added: Object.keys(units).filter((id) => old[id] === undefined),
    removed: Object.keys(old).filter((id) => units[id] === undefined),
    changed: Object.keys(units).filter((id) => old[id] !== undefined && old[id].hash !== units[id]!.hash),
    pending: pending.map((p) => p.name),
  });
}

/**
 * The install hook that `init` writes (spec 10.1). harnesspm is a dev dependency, so an install without dev
 * dependencies, such as `npm ci --omit=dev`, has no `harnesspm` command. The `node -e` part ends with success
 * exactly then, and `||` skips the sync. When harnesspm is installed, it fails, so the sync runs and a failing
 * sync still fails the install. `node -e` and `||` work in sh, Windows cmd and Yarn's shell; `|| true` does not.
 */
const INSTALL_HOOK = `node -e "try{require.resolve('${PACKAGE_NAME}/package.json');process.exit(1)}catch{}" || harnesspm sync`;
const HOOK_SCRIPTS = ['prepare', 'postinstall'] as const;
const OLD_HOOK = 'harnesspm sync';

/** The script with the guarded hook in place of the form that `init` wrote before, or undefined when it has none. */
function upgradedHook(script: unknown): string | undefined {
  if (typeof script !== 'string') return undefined;
  if (script === OLD_HOOK) return INSTALL_HOOK;
  // The parentheses keep a failure of the existing script visible: `a && b || c` runs c when a fails.
  if (script.endsWith(` && ${OLD_HOOK}`)) return `${script.slice(0, -OLD_HOOK.length)}(${INSTALL_HOOK})`;
  return undefined;
}

/** Whether a package.json lists harnesspm, so the project has the `harnesspm` command. Its own repository is the package. */
function dependsOnHarnesspm(pkg: unknown): boolean {
  if (!isRecord(pkg)) return false;
  if (pkg['name'] === PACKAGE_NAME) return true;
  return ['dependencies', 'devDependencies', 'optionalDependencies'].some((field) => {
    const dependencies = pkg[field];
    return isRecord(dependencies) && PACKAGE_NAME in dependencies;
  });
}

/** Lockfiles that an install changes, with the install that each one asks for. */
const INSTALLS: Record<string, string> = {
  'package-lock.json': 'npm ci',
  'npm-shrinkwrap.json': 'npm ci',
  'pnpm-lock.yaml': 'pnpm install',
  'yarn.lock': 'yarn install',
  'bun.lock': 'bun install',
  'bun.lockb': 'bun install',
};
/** `init` names the lockfile the project has with the files to commit. */
const LOCKFILES = Object.keys(INSTALLS);

/**
 * The project's install for a Claude Code cloud environment's setup script (spec 9.1), or undefined when it is not
 * known. It names the project by its absolute path, because the setup script does not start in the clone. A pinned
 * package manager needs corepack, and the default network access does not reach corepack's host for Yarn, so corepack
 * downloads from the npm registry.
 */
function setupLine(projectDir: string): string | undefined {
  const lock = LOCKFILES.find((file) => isFile(path.join(projectDir, file)));
  if (lock === undefined || !isFile(path.join(projectDir, CONFIG_FILE))) return undefined;
  const pkg = readJsonIfExists(path.join(projectDir, 'package.json'));
  const corepack = isRecord(pkg) && typeof pkg['packageManager'] === 'string' ? 'corepack enable && COREPACK_NPM_REGISTRY=https://registry.npmjs.org ' : '';
  const dir = /^[\w./-]+$/.test(projectDir) ? projectDir : `'${projectDir.replaceAll("'", "'\\''")}'`;
  return `cd ${dir} && ${corepack}${INSTALLS[lock]}`;
}

/** The committed files (spec 1.7) that git sees as new or changed, in a fixed order. Empty outside git. */
function filesToCommit(projectDir: string): string[] {
  const { team, full } = resolveAll(projectDir, { withAdded: false });
  const committed = team ? computePlan(team, full).committed : undefined;
  const nested = committed ? [...committed.workspaces.filter((ws) => ws.agentsMd !== undefined).map((ws) => path.join(ws.dir, 'AGENTS.md')), ...committed.claudeMds.map((c) => c.file)] : [];
  const candidates = [...new Set(['AGENTS.md', 'CLAUDE.md', ...nested.map((file) => relPosix(projectDir, file)), CONFIG_FILE, LOCK_FILE, 'package.json', ...LOCKFILES])];
  // The short format shows paths relative to the current folder, also in a subfolder of the repository.
  const result = spawnSync('git', ['status', '--short', '--untracked-files=all', '--', ...candidates], { cwd: projectDir, encoding: 'utf8' });
  if (result.status !== 0) return [];
  const changed = new Set(result.stdout.split('\n').filter((line) => line.length > 3).map((line) => line.slice(3).replace(/^.* -> /, '')));
  return candidates.filter((file) => changed.has(file));
}

export function init(projectDir: string, out: Output): number {
  const pkgFile = path.join(projectDir, 'package.json');
  if (!isFile(pkgFile)) throw new HarnessError('No package.json here. Run `npm init` first.');
  const raw = readTextIfExists(pkgFile)!;
  const pkg = readJson(pkgFile);
  if (!isRecord(pkg)) throw new HarnessError('package.json must be a JSON object');
  // The script that `init` adds calls the `harnesspm` command. Without the dependency, the next install fails with
  // "harnesspm: not found" (research/package-managers.md). So stop before anything changes.
  if (!dependsOnHarnesspm(pkg)) {
    throw new HarnessError(`${PACKAGE_NAME} is not a dependency of this project, so the install script that \`init\` adds would fail. Run \`npm i -D ${PACKAGE_NAME}\` first, then \`${NPX_LOCAL} init\`.`);
  }
  const configFile = path.join(projectDir, CONFIG_FILE);
  if (!isFile(configFile)) {
    writeIfChanged(configFile, `${JSON.stringify({ $schema: CONFIG_SCHEMA }, null, 2)}\n`);
    out.log(`Created ${CONFIG_FILE}`);
  }
  // A private package is never installed by others, so `postinstall` is safe there, and Yarn 2+ runs only
  // `postinstall`. A published package uses `prepare`, which does not run when others install it.
  const scripts = isRecord(pkg['scripts']) ? pkg['scripts'] : {};
  const hookName = pkg['private'] === true ? 'postinstall' : 'prepare';
  const has = (name: string): boolean => typeof scripts[name] === 'string' && (scripts[name] as string).includes(OLD_HOOK);
  let changed = false;
  if (!HOOK_SCRIPTS.some(has)) {
    const current = typeof scripts[hookName] === 'string' ? (scripts[hookName] as string) : undefined;
    scripts[hookName] = current === undefined ? INSTALL_HOOK : `${current} && (${INSTALL_HOOK})`;
    changed = true;
    out.log(`Added \`harnesspm sync\` to the "${hookName}" script`);
  } else {
    for (const name of HOOK_SCRIPTS) {
      const next = upgradedHook(scripts[name]);
      if (next === undefined) continue;
      scripts[name] = next;
      changed = true;
      out.log(`Updated the "${name}" script: it now skips \`harnesspm sync\` when harnesspm is not installed, as in \`npm ci --omit=dev\``);
    }
  }
  if (changed) {
    pkg['scripts'] = scripts;
    const indent = /^\{\r?\n(\s+)/.exec(raw)?.[1] ?? '  ';
    writeIfChanged(pkgFile, `${JSON.stringify(pkg, null, indent)}\n`);
  }
  const claude = claudeImport(projectDir);
  if (writeIfChanged(claude.file, claude.text)) out.log(`${relPosix(projectDir, claude.file)} now imports AGENTS.md`);
  const code = sync(projectDir, out, { write: true });
  // Say which files belong in git, and that the rest stays out of it, so nobody has to work it out from `git status`.
  const toCommit = filesToCommit(projectDir);
  if (toCommit.length > 0) out.log(`To commit: ${toCommit.join(', ')}`);
  if (gitExcludeFile(projectDir) !== undefined) out.log('Links and settings for this machine stay out of git: .git/info/exclude lists them.');
  return code;
}

/** Directories of editable added harnesses, which agents may write to (spec 8.5). */
function writableDirs(): string[] {
  const dirs = new Set<string>();
  for (const spec of readList(configFileFor('user', ''))) {
    const source = parseSource(spec);
    if (source.editable) dirs.add(source.dir);
  }
  return [...dirs].sort();
}

/** Writes the hook and write access, unless the agent's model runs harnesspm (spec 6.2, rule 4). */
function settingsAfterChange(out: Output, hook: boolean): void {
  if (caller() === 'model') {
    out.log('⏳ The SessionStart hook and write access to the harness folder are pending: an agent cannot grant them.');
    out.log(`   ${inCloudSession() ? cloudStep('the same command', 'them') : 'Ask the person to run the same command in their own terminal.'}`);
    return;
  }
  const anyUser = readList(configFileFor('user', '')).length > 0;
  writeUserSettings(hook && anyUser, writableDirs());
}

function printAddedRules(projectDir: string, spec: string, out: Output): void {
  const warnings: string[] = [];
  const harness = loadAdded(gitExcludeFile(projectDir) ? projectDir : undefined, warnings).find((h) => h.source.spec === spec);
  if (!harness) return;
  const res = resolve(projectDir, { team: false, added: [harness] });
  const always = res.rules.filter((r) => r.activation === 'always');
  if (always.length === 0) return;
  out.log('');
  out.log(`Rules from ${spec}, to follow from now on in this session:`);
  out.log('');
  for (const rule of always) out.log(`${alwaysOnText(rule)}\n`);
}

export function add(cwd: string, spec: string, out: Output, options: { local?: boolean; hook?: boolean } = {}): number {
  const projectDir = findProjectDir(cwd);
  const scope: Scope = options.local ? 'local' : 'user';
  if (scope === 'local' && !gitExcludeFile(projectDir)) throw new HarnessError('--local needs a git repository');
  const source = parseSource(spec, cwd);
  const note = fetchSource(source);
  if (note !== undefined) out.log(note);
  const pkg = loadHarnessPackage(source.dir, 'added');
  if (!pkg) throw new HarnessError(`${source.spec} has no harness/plugin.json`);
  const file = configFileFor(scope, projectDir);
  const list = readList(file);
  if (!list.includes(source.spec)) {
    writeList(file, [...list, source.spec]);
    out.log(`Added ${pkg.plugin} (${source.spec}) with ${scope} scope`);
  } else out.log(`${source.spec} is already added with ${scope} scope`);
  if (scope === 'local') {
    const exclude = gitExcludeFile(projectDir)!;
    const text = readTextIfExists(exclude) ?? '';
    if (!text.split('\n').includes('/harnesspm.local.json')) writeIfChanged(exclude, `${text.replace(/\s*$/, '')}${text.trim() ? '\n' : ''}/harnesspm.local.json\n`);
  }
  sync(projectDir, out, { quiet: true });
  settingsAfterChange(out, options.hook !== false);
  printAddedRules(projectDir, source.spec, out);
  return 0;
}

export function remove(cwd: string, spec: string, out: Output, options: { local?: boolean } = {}): number {
  const projectDir = findProjectDir(cwd);
  const scope: Scope = options.local ? 'local' : 'user';
  const file = configFileFor(scope, projectDir);
  const list = readList(file);
  const target = parseSource(spec, cwd).spec;
  const next = list.filter((s) => s !== spec && s !== target);
  if (next.length === list.length) throw new HarnessError(`${spec} is not added with ${scope} scope`);
  writeList(file, next);
  out.log(`Removed ${spec} (${scope} scope)`);
  sync(projectDir, out, { quiet: true });
  settingsAfterChange(out, true);
  return 0;
}

export function update(cwd: string, out: Output): number {
  const projectDir = findProjectDir(cwd);
  const specs = [...readList(configFileFor('user', projectDir)), ...(gitExcludeFile(projectDir) ? readList(configFileFor('local', projectDir)) : [])];
  for (const spec of specs) out.log(updateSource(parseSource(spec)));
  return sync(projectDir, out);
}

/** Codex reads `AGENTS.md` files up to `project_doc_max_bytes`, 32 KiB by default, and cuts off the rest (spec 4.9). */
const CODEX_LIMIT = 32 * 1024;
const CODEX_OVER = "Codex's 32 KiB limit: Codex reads only the first 32 KiB";
const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

/**
 * Managed blocks that Codex misses, in full or in part (spec 4.9). Codex joins one file per folder, from its project
 * root, the git root, down to the folder it starts in: `AGENTS.override.md` when there is one, else `AGENTS.md`. Only
 * file bytes count. The root block at the very start is left out: the size warning for the root `AGENTS.md` covers it.
 */
function codexMisses(projectDirInput: string, plan: Plan): string[] {
  const committed = plan.committed;
  if (!committed) return [];
  // Workspace folders are real paths, so the root is one too.
  const projectDir = fs.realpathSync(projectDirInput);
  // harnesspm.json can sit below the git root. Codex counts the AGENTS.md files above it too.
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: projectDir, encoding: 'utf8' });
  const gitRoot = top.status === 0 && top.stdout.trim() !== '' ? fs.realpathSync(top.stdout.trim()) : projectDir;
  const inside = (dir: string): boolean => dir === gitRoot || dir.startsWith(gitRoot + path.sep);
  const planned = new Map<string, string | undefined>([[projectDir, committed.agentsMd], ...committed.workspaces.map((ws) => [ws.dir, ws.agentsMd] as const)]);
  const bytesIn = (dir: string): number => {
    const text = readTextIfExists(path.join(dir, 'AGENTS.override.md')) ?? (planned.has(dir) ? planned.get(dir) : readTextIfExists(path.join(dir, 'AGENTS.md')));
    return text !== undefined ? Buffer.byteLength(text) : 0;
  };
  const problems: string[] = [];
  for (const [dir, text] of planned) {
    const range = blockRange(text);
    if (text === undefined || range === undefined) continue;
    const rel = relPosix(projectDir, path.join(dir, 'AGENTS.md'));
    if (isFile(path.join(dir, 'AGENTS.override.md'))) {
      problems.push(`Codex never reads the harness block in ${rel}: it reads ${relPosix(projectDir, path.join(dir, 'AGENTS.override.md'))} there instead. ${STILL_HELP}`);
      continue;
    }
    let above = 0;
    for (let up = path.dirname(dir); dir !== gitRoot && inside(up); up = path.dirname(up)) {
      above += bytesIn(up);
      if (up === gitRoot) break;
    }
    const before = Buffer.byteLength(text.slice(0, range[0]));
    const start = above + before;
    const end = start + Buffer.byteLength(text.slice(range[0], range[1]));
    if (end <= CODEX_LIMIT || (dir === projectDir && start === 0)) continue;
    const steps = [
      ...(before > 0 ? ['move the block to the top of its file, where sync keeps it'] : []),
      ...(above > 0 ? ['shorten the AGENTS.md files above it'] : []),
      'move details into on-demand rules or docs',
    ].join(', or ');
    const where = 'of the AGENTS.md files that Codex joins there, past its 32 KiB limit';
    const what = start >= CODEX_LIMIT ? `Codex never reads the harness block in ${rel}: it starts at ${kib(start)} ${where}` : `Codex reads only part of the harness block in ${rel}: it ends at ${kib(end)} ${where}`;
    problems.push(`${what}. To fix it, ${steps}. ${STILL_HELP}`);
  }
  return problems;
}

/** What an agent can still do when Codex misses a block: the block names its packages, and `help` prints them (spec 4.9). */
const STILL_HELP = `Agents can still get what it holds with \`${NPX_ANY} help <package>\`.`;

/** Agents often read only the top of AGENTS.md, such as with `head -30` (research/agent-capabilities.md). */
const TOP_LINES = 30;

/** Committed blocks that start past the first 30 lines of their file, so a partial read misses the outside line (spec 4.6). */
function lateBlocks(projectDir: string, plan: Plan): string[] {
  const committed = plan.committed;
  if (!committed) return [];
  const files: [string, string | undefined][] = [[projectDir, committed.agentsMd], ...committed.workspaces.map((ws) => [ws.dir, ws.agentsMd] as [string, string | undefined])];
  const problems: string[] = [];
  for (const [dir, text] of files) {
    const range = blockRange(text);
    if (text === undefined || range === undefined) continue;
    const line = text.slice(0, range[0]).split('\n').length;
    if (line <= TOP_LINES) continue;
    const rel = relPosix(fs.realpathSync(projectDir), path.join(fs.realpathSync(dir), 'AGENTS.md'));
    problems.push(`The harness block in ${rel} starts at line ${line}. Agents that read only the first ${TOP_LINES} lines, such as with \`head -30\`, miss it. Move the block to the top of its file, where sync keeps it.`);
  }
  return problems;
}

/**
 * Whether a model run may write the repository's entries, because they are as a person reviewed them (spec 6.2,
 * rule 4). Undefined when there is nothing to hold, and in a Codex run, whose sandbox keeps `.codex/` read-only.
 */
function reviewedFor(projectDir: string, team: Resolution | undefined, plan: Plan): Reviewed | undefined {
  if (team === undefined || plan.committed === undefined || plan.exec.team === undefined || codexRun()) return undefined;
  if (plan.telemetryHeld === undefined && heldEntries('team', plan.exec.team, repoStateFile(projectDir)).length === 0) return undefined;
  return reviewedState(projectDir, team, plan.committed.lock);
}

/**
 * What a sync by the agent's model would leave pending and hold back now (spec 6.2, rule 4), and what any sync would
 * write because it is in the reviewed state. `status` and `doctor` show it; `sync` reports the same list from what it
 * wrote, so the count matches everywhere.
 */
function preview(projectDir: string, resolved: Resolved): { plan?: Plan; report: UserReport } {
  const plan = resolved.mode !== 'none' ? computePlan(resolved.team, resolved.full, { widen: false }) : undefined;
  const report: UserReport = { pending: [], held: [] };
  if (plan) {
    const stateFile = repoStateFile(projectDir);
    report.pending.push(...(plan.exec.team?.pending ?? []), ...plan.exec.added.pending);
    report.held.push(...(plan.telemetryHeld !== undefined ? [plan.telemetryHeld] : []));
    const team = plan.exec.team ? heldEntries('team', plan.exec.team, stateFile) : [];
    const reviewed = reviewedFor(projectDir, resolved.team, plan);
    if (reviewed?.ok === true && team.length > 0) report.unwritten = { entries: team, branch: reviewed.branch };
    else report.held.push(...team);
    if (reviewed?.ok === false && report.held.length > 0) report.why = reviewed.reason;
    report.held.push(...heldEntries('added', plan.exec.added, stateFile));
  }
  if (process.env['CI'] !== 'true') report.held.push(...userHeld(resolved.added));
  return { ...(plan ? { plan } : {}), report };
}

function describeAdded(h: AddedHarness): string {
  return `${h.pkg.plugin} (${h.source.spec}, ${h.scope})${h.entry ? ', with an entry for this repository' : ''}`;
}

export function status(cwd: string, out: Output): number {
  const projectDir = findProjectDir(cwd);
  const resolved = resolveAll(projectDir, { withAdded: true });
  const res = resolved.team ?? resolved.full;
  const deps = res.packages.filter((p) => p.layer === 'dependencies');
  const describe = (name: string, version: string): string => `${name} ${version}`;
  const tops = deps.filter((p) => p.direct);
  const parts = tops.map((p) => {
    const below = deps.filter((d) => p.closure.has(d.name)).map((d) => describe(d.name, d.version));
    return below.length > 0 ? `${describe(p.name, p.version)} → ${below.join(', ')}` : describe(p.name, p.version);
  });
  parts.push(...deps.filter((d) => !d.direct && !tops.some((t) => t.closure.has(d.name))).map((d) => describe(d.name, d.version)));
  out.log(`📦 dependencies  ${parts.length > 0 ? parts.join(' · ') : 'none'}`);

  const own = res.packages.find((p) => p.layer === 'project');
  const config = res.config;
  const counts = [
    config.exclude.length > 0 ? `${config.exclude.length} exclude` : '',
    Object.keys(config.replace).length > 0 ? `${Object.keys(config.replace).length} replace` : '',
    Object.keys(config.patch).length > 0 ? `${Object.keys(config.patch).length} patch` : '',
  ].filter(Boolean);
  const projectParts = isFile(path.join(projectDir, CONFIG_FILE)) ? [`${CONFIG_FILE}: ${counts.length > 0 ? counts.join(' · ') : 'no changes'}`] : ['does not use harnesspm'];
  if (own) projectParts.push(`harness/ (plugin ${own.plugin})`);
  out.log(`🏢 project       ${projectParts.join(' · ')}`);
  out.log(`➕ added         ${resolved.added.length > 0 ? resolved.added.map(describeAdded).join(' · ') : 'none'}`);

  const { plan, report } = preview(projectDir, resolved);
  printPending(out, report, projectDir);
  if (resolved.team) {
    const changes = resolved.team.rules.filter((r) => resolved.full.rules.find((f) => f.id === r.id)?.text !== r.text).map((r) => r.id);
    if (changes.length > 0) out.log(`✏️  changed here  ${changes.join(', ')} (by added harnesses; see CLAUDE.local.md)`);
    const agents = plan!.committed!.agentsMd;
    const bytes = Buffer.byteLength(agents);
    const claudeLines = agents.split('\n').length + (plan!.localMd ?? '').split('\n').length;
    out.log(`📏 always-on     Codex ${(bytes / 1024).toFixed(1)} KiB of 32 KiB · Claude Code ${claudeLines} lines`);
    if (bytes > CODEX_LIMIT) out.warn(`⚠️  AGENTS.md is over ${CODEX_OVER}. Move details into on-demand rules or docs.`);
    else if (bytes > 28 * 1024) out.warn("⚠️  AGENTS.md is close to Codex's 32 KiB limit. Move details into on-demand rules or docs.");
    for (const miss of [...lateBlocks(projectDir, plan!), ...codexMisses(projectDir, plan!)]) out.warn(`⚠️  ${miss}`);
  }
  const telemetry = readTelemetryState(projectDir);
  if (telemetry.config) {
    out.log(`📡 telemetry     ${telemetry.send !== undefined ? `${[...telemetry.events].join(', ')} → ${describeSend(telemetry.send)}` : telemetry.off}`);
  }
  const local = checkLocalFiles(projectDir, telemetryFiles(projectDir));
  if (local && local.problems.length > 0) out.log(`🩺 local files   ${plural(local.problems.length, 'problem')}. Run \`${syncCommand(projectDir).replace(/ sync$/, ' doctor')}\`.`);
  printWarnings(out, resolved.warnings);
  return 0;
}

/** The command that runs harnesspm here: the installed one in a project that uses it (spec 10). */
const syncCommand = (projectDir: string): string => `${isFile(path.join(projectDir, CONFIG_FILE)) ? NPX_LOCAL : NPX_ANY} sync`;

/** A telemetry file inside the project, which harnesspm keeps out of git (spec 14.1). */
function telemetryFiles(projectDir: string): string[] {
  const send = readTelemetryState(projectDir).config?.send;
  if (send === undefined || typeof send === 'string') return [];
  const rel = relPosix(projectDir, path.resolve(projectDir, send.file));
  return rel.startsWith('../') || path.isAbsolute(rel) ? [] : [rel];
}

const linkPointsTo = (link: string, target: string): boolean => {
  try {
    return fs.lstatSync(link).isSymbolicLink() && path.resolve(path.dirname(link), fs.readlinkSync(link)) === path.resolve(target);
  } catch {
    return false;
  }
};

/**
 * `harnesspm doctor`: whether this repository is ready for harnesses, its own and a person's (spec 10.1).
 * It changes nothing. Exits 1 when a check fails; warnings do not fail.
 */
export function doctor(cwd: string, out: Output): number {
  const projectDir = findProjectDir(cwd);
  const usesHarnesspm = isFile(path.join(projectDir, CONFIG_FILE));
  const sync = syncCommand(projectDir);
  const groups: [string, Finding[]][] = [];

  // Per-machine files never reach a commit.
  const local = checkLocalFiles(projectDir, telemetryFiles(projectDir), sync);
  groups.push([
    '🔒 Local files',
    local === undefined
      ? [{ level: 'warn', text: 'Not a git repository: nothing keeps per-machine files out of commits, and harnesses added with --local cannot be used here.' }]
      : local.problems.length > 0
        ? local.problems
        : [{ level: 'ok', text: local.checked > 0 ? `${plural(local.checked, 'per-machine file')}: ignored by git and not tracked` : 'No per-machine files yet' }],
  ]);

  // A person can add a harness of their own here.
  const own: Finding[] = [];
  const exclude = gitExcludeFile(projectDir);
  if (exclude !== undefined) {
    const shown = relPosix(projectDir, exclude);
    own.push(excludeWritable(exclude) ? { level: 'ok', text: `${shown} can be written, so harnesspm keeps per-machine files out of git` } : { level: 'fail', text: `${shown} cannot be written, so harnesspm cannot keep per-machine files out of git. Fix the permissions of that file.` });
  }
  const addedWarnings: string[] = [];
  const added = process.env['CI'] === 'true' ? [] : loadAdded(exclude !== undefined ? projectDir : undefined, addedWarnings);
  for (const warning of addedWarnings) own.push({ level: 'fail', text: warning });
  if (added.length > 0) own.push({ level: 'ok', text: `Added: ${added.map(describeAdded).join(' · ')}` });
  else if (addedWarnings.length === 0) own.push({ level: 'info', text: `No harness added yet. Add one with \`${NPX_ANY} add <source>\`.` });
  groups.push(['➕ Harnesses of your own', own]);

  // Outputs are in place.
  const outputs: Finding[] = [];
  const resolved = resolveAll(projectDir, { withAdded: true });
  const { plan, report } = preview(projectDir, resolved);
  if (!usesHarnesspm) outputs.push({ level: 'info', text: `This repository does not use harnesspm (no ${CONFIG_FILE}), so only added harnesses apply.` });
  else if (!resolved.team) outputs.push({ level: 'warn', text: `The dependencies are not installed. Install them, then run \`${sync}\`.` });
  else {
    const forCheck = resolveAll(projectDir, { withAdded: false });
    const problems = checkPlan(projectDir, computePlan(forCheck.team, forCheck.full));
    for (const p of problems) outputs.push({ level: 'fail', text: /Run `/.test(p) ? p : `${p}. Run \`${sync}\` and commit the result.` });
    if (problems.length === 0) outputs.push({ level: 'ok', text: 'Committed outputs are up to date' });
  }
  if (plan) {
    const total = plan.links.size + plan.generated.size;
    let stale = 0;
    for (const [link, target] of plan.links) if (!linkPointsTo(link, target)) stale++;
    for (const [file, content] of plan.generated) if (readTextIfExists(file) !== content) stale++;
    if (stale > 0) outputs.push({ level: 'warn', text: `${plural(stale, 'per-machine output')} missing or out of date. Run \`${sync}\`.` });
    else if (total > 0) outputs.push({ level: 'ok', text: `${plural(total, 'per-machine output')} in place` });
    if (!plan.codexOurs) outputs.push({ level: 'warn', text: '.codex/ belongs to the repository, so harnesspm writes nothing there and Codex misses some units.' });
    const pkgJson = readJsonIfExists(path.join(projectDir, 'package.json'));
    for (const name of HOOK_SCRIPTS) {
      const script = isRecord(pkgJson) && isRecord(pkgJson['scripts']) ? pkgJson['scripts'][name] : undefined;
      if (upgradedHook(script) !== undefined) outputs.push({ level: 'warn', text: `The "${name}" script runs \`harnesspm sync\` also when harnesspm is not installed, so an install without dev dependencies, such as \`npm ci --omit=dev\`, fails. Run \`${NPX_LOCAL} init\` to update it.` });
    }
    const bytes = plan.committed !== undefined ? Buffer.byteLength(plan.committed.agentsMd) : 0;
    if (bytes > CODEX_LIMIT) outputs.push({ level: 'warn', text: `AGENTS.md is ${kib(bytes)}, over ${CODEX_OVER}. Move details into on-demand rules or docs.` });
    for (const miss of [...lateBlocks(projectDir, plan), ...codexMisses(projectDir, plan)]) outputs.push({ level: 'warn', text: miss });
  }
  if (outputs.length > 0) groups.push(['📦 Outputs', outputs]);

  // Trust: pending entries are not errors (spec 10.4).
  const trust: Finding[] = [];
  // Each pending entry already says how to turn it on: trust the package, or approve a pinned version.
  for (const p of new Set(report.pending)) trust.push({ level: 'warn', text: `Off: ${p}` });
  if (report.unwritten) trust.push({ level: 'warn', text: `${unwrittenList(report.unwritten)} are not written yet. Run \`${sync}\`.` });
  if (report.held.length > 0) trust.push({ level: 'warn', text: `${heldList(report)}. ${grantStep(projectDir, `Run \`${NPX_ANY} sync\` in your own terminal.`)}` });
  const telemetry = readTelemetryState(projectDir);
  // A held handler is in the list above, as `sync` lists it.
  const heldHandler = plan?.telemetryHeld !== undefined;
  if (telemetry.config && telemetry.send === undefined && !heldHandler) trust.push({ level: telemetry.off?.startsWith('held') ? 'warn' : 'info', text: `Telemetry ${telemetry.off}` });
  if (trust.length === 0 && plan) trust.push({ level: 'ok', text: 'Nothing waits for trust' });
  if (trust.length > 0) groups.push(['🛡️  Trust', trust]);

  for (const [title, findings] of groups) {
    out.log(title);
    for (const finding of findings) out.log(formatFinding(finding));
  }
  const failed = groups.flatMap(([, findings]) => findings).filter((f) => f.level === 'fail').length;
  out.log('');
  out.log(failed > 0 ? `❌ ${plural(failed, 'problem')}. Each line above says how to fix it.` : '✅ Ready. Nothing to fix.');
  return failed > 0 ? 1 : 0;
}

export function why(cwd: string, id: string, out: Output): number {
  const projectDir = findProjectDir(cwd);
  const { full: res } = resolveAll(projectDir, { withAdded: true });
  const row = (label: string, value: string): void => out.log(`${label.padEnd(11)} ${value}`);
  const rel = (file: string): string => {
    for (const pkg of res.packages) {
      if (pkg.layer === 'dependencies' && file.startsWith(pkg.dir + path.sep)) {
        return path.posix.join(STATE_DIR.split(path.sep).join('/'), 'pkgs', pkg.name, relPosix(pkg.dir, file));
      }
    }
    return file.startsWith(res.projectDir + path.sep) ? relPosix(res.projectDir, file) : file;
  };
  const excluded = res.excludedUnits.find((u) => u.id === id);
  const rule = res.rules.find((r) => r.id === id);
  const skill = res.skills.find((s) => s.id === id);
  const docs = res.docs.find((d) => d.id === id);
  const exec: FinalScript | FinalHook | FinalMcp | FinalAgent | FinalPermissions | undefined = [
    ...res.scripts,
    ...res.hooks,
    ...res.mcp,
    ...res.agents,
    ...res.permissions,
  ].find((u) => u.id === id);
  const pkg = rule?.pkg ?? skill?.pkg ?? docs?.pkg ?? exec?.pkg;
  if (!pkg) {
    if (excluded) {
      row('excluded', `by ${excluded.by}`);
      return 0;
    }
    const plugin = id.split(':')[0];
    const all = [res.rules, res.skills, res.docs, res.scripts, res.hooks, res.mcp, res.agents, res.permissions].flatMap((units) => units.map((u) => u.id));
    const near = all.filter((x) => x.startsWith(`${plugin}:`)).slice(0, 8);
    throw new HarnessError(`No unit ${id}.${near.length > 0 ? ` Units of ${plugin}: ${near.join(', ')}` : ''}`);
  }
  if (pkg.layer !== 'added') {
    sendEvent(readTelemetryState(res.projectDir), eventContext(res), { type: 'why', ...commandCaller(), unit: id, package: pkg.name, version: pkg.version });
  }
  if (pkg.layer === 'project') row('owner', `project ${pkg.name} (harness/)`);
  else if (pkg.layer === 'added') row('owner', `added ${pkg.added!.source.spec} (${pkg.scope} scope${pkg.entry ? ', entry for this repository' : ''})`);
  else row('owner', `dependency ${pkg.name} ${pkg.version}${pkg.via !== undefined ? ` (via ${pkg.via})` : ''}`);
  const source = rule?.source ?? (skill ? path.join(skill.dir, 'SKILL.md') : docs ? docs.dir : execSource(exec!));
  row('source', rel(source));
  if (exec?.kind === 'scripts') row('run', `${toolCommand(res.projectDir)} run ${pkg.plugin}:${exec.name}`);
  // Deny and ask rules only restrict, so they need no trust (spec 6.1).
  if (exec && exec.kind !== 'permissions' && pkg.layer === 'dependencies') {
    const trust = res.config.trust[pkg.name];
    row(
      'trust',
      trust === true
        ? 'yes'
        : trust === 'pin'
          ? 'pinned: active in the version approved in the lock'
          : `no: it stays off. A person turns it on with "${pkg.name}": true in "trust" in ${CONFIG_FILE}.`,
    );
  }
  if (rule?.replacedBy) row('replaced', `by ${rule.replacedBy.by}: ${rel(rule.replacedBy.file!)}`);
  if (rule && rule.original !== rule.source) row('original', rel(rule.original));
  for (const p of rule?.patches ?? []) row('patch', `${p.patch} (from ${p.by})`);
  if (pkg.layer === 'added') {
    const rules = ['AGENTS.md', 'CONTRIBUTING.md'].map((f) => path.join(pkg.added!.source.dir, f)).filter((f) => fs.existsSync(f));
    if (rules.length > 0) row('rules', rules.join(', '));
  }
  if (pkg.repository !== undefined) row('repository', pkg.repository);
  if (pkg.layer === 'project') row('editable', 'yes. Edit the source, then run `npx harnesspm sync`.');
  else if (pkg.layer === 'added') {
    row('editable', pkg.added!.source.editable ? "yes. Edit the source, then save it the way that harness's rules say." : 'no: it comes from npm. Change it in its own repository.');
  } else row('editable', `no. Add a \`patch\`, \`replace\` or \`exclude\` in ${CONFIG_FILE}, or propose the change upstream.`);
  return 0;
}

/** The file that defines an executable unit: a script or agent file, or the package's JSON for hooks, MCP servers and permissions. */
function execSource(unit: FinalScript | FinalHook | FinalMcp | FinalAgent | FinalPermissions): string {
  if (unit.kind === 'scripts' || unit.kind === 'agents') return unit.file;
  if (unit.kind === 'mcp') return path.join(unit.pkg.harnessDir, 'mcp.json');
  return path.join(unit.pkg.harnessDir, NS, unit.kind === 'hooks' ? 'hooks.json' : 'permissions.json');
}

/** Whether the caller's own folder, where harnesspm started, is inside `projectDir`. */
function callerInside(projectDir: string): boolean {
  const caller = realpath(process.cwd());
  const dir = realpath(projectDir);
  return caller === dir || caller.startsWith(dir + path.sep);
}

/** The project's folder as the caller names it, for `-C` and `cd`. */
const fromCaller = (projectDir: string): string => shellWord(path.relative(process.cwd(), projectDir) || '.');

/** The command that runs the project's tools from where harnesspm started: with `-C` from outside it (spec 10.1). */
export function toolCommand(projectDir: string): string {
  return callerInside(projectDir) ? NPX_ANY : `${NPX_ANY} -C ${fromCaller(projectDir)}`;
}

/** The project's install, from the caller's folder. */
function installCommand(projectDir: string): string {
  const lock = LOCKFILES.find((file) => isFile(path.join(projectDir, file)));
  const install = lock !== undefined ? INSTALLS[lock]! : 'npm install';
  return callerInside(projectDir) ? install : `cd ${fromCaller(projectDir)} && ${install}`;
}

interface ToolResolution {
  res: Resolution;
  /** False when the project uses harnesspm and its dependencies are not installed. */
  installed: boolean;
  /** Without an install: locked harness packages that are not fetched either. */
  missing: string[];
  /** Without an install: whether the project has a lock to fetch from. */
  locked: boolean;
}

/**
 * The project's units for `run`, `mcp` and `help` (spec 10.1). A project without an install uses the harness packages
 * that `fetch` downloaded. With `fetch`, the packages that are missing are downloaded first.
 */
function resolveTools(projectDir: string, options: { fetch?: Output } = {}): ToolResolution {
  const resolved = resolveAll(projectDir, { withAdded: true });
  if (resolved.team || !isFile(path.join(projectDir, CONFIG_FILE))) return { res: resolved.full, installed: true, missing: [], locked: true };
  let where = locateLocked(projectDir);
  if (where === undefined) return { res: resolved.full, installed: false, missing: [], locked: false };
  if (where.missing.length > 0 && options.fetch) {
    const out = options.fetch;
    out.warn(`harnesspm: ${relPosix(process.cwd(), projectDir) || '.'} has no install, so harnesspm fetches its harness packages first. Fetching runs no package code.`);
    try {
      fetch(projectDir, { log: out.warn, warn: out.warn });
    } catch (error) {
      if (!(error instanceof HarnessError)) throw error;
      out.warn(`⚠️  ${error.message}`);
    }
    where = locateLocked(projectDir)!;
  }
  const located = where.located;
  const res = resolve(projectDir, { added: resolved.added, locate: (name) => located.get(name) });
  return { res, installed: false, missing: where.missing, locked: true };
}

/** Why a project without an install has no unit `ref`, or undefined when that is not the reason. */
function notAvailable(projectDir: string, tools: ToolResolution, what: string): string | undefined {
  if (tools.installed || (tools.locked && tools.missing.length === 0)) return undefined;
  const fetchStep = tools.locked ? `Run \`${toolCommand(projectDir)} fetch\` to use the ${what} that need nothing else, or install the project with` : 'Install the project with';
  return `${relPosix(process.cwd(), projectDir) || 'This project'} has no install and no fetched harness packages, so its ${what} are not available yet. ${fetchStep} \`${installCommand(projectDir)}\`.`;
}

export function run(cwd: string, ref: string, args: string[], agent: string | undefined): Promise<number> {
  const projectDir = findProjectDir(cwd);
  const tools = resolveTools(projectDir);
  if (!tools.res.scripts.some((s) => `${s.pkg.plugin}:${s.name}` === ref)) {
    const reason = notAvailable(projectDir, tools, 'scripts');
    if (reason !== undefined) throw new HarnessError(reason);
  }
  return runScript(tools.res, ref, args, agent, tools.installed ? {} : { install: installCommand(projectDir) });
}

export function mcp(cwd: string, ref: string, agent: string | undefined): number {
  const projectDir = findProjectDir(cwd);
  const tools = resolveTools(projectDir);
  if (!tools.res.mcp.some((s) => `${s.pkg.plugin}:${s.name}` === ref)) {
    const reason = notAvailable(projectDir, tools, 'MCP servers');
    if (reason !== undefined) throw new HarnessError(reason);
  }
  return runMcp(tools.res, ref, agent);
}

/** What `help` shows of a project: its units, and paths and commands as the caller types them (spec 10.1). */
interface HelpView {
  projectDir: string;
  tools: ToolResolution;
  res: Resolution;
  /** The command that runs the project's tools from the caller's folder, `-C` included. */
  command: string;
  /** The project's folder from the caller's, when the caller is outside it. */
  base?: string;
  trusted(pkg: ResolvedPackage): boolean;
  paths: PathFor;
  /** A file of a package, as the caller can open it. */
  file(file: string): string;
}

/**
 * The project for `help`. Without an install it reads the fetched packages, and fetches them first when there are
 * none. Undefined when the project does not use harnesspm.
 */
function helpView(cwd: string, out: Output): HelpView | undefined {
  const projectDir = findProjectDir(cwd);
  if (!isFile(path.join(projectDir, CONFIG_FILE))) return undefined;
  const tools = resolveTools(projectDir, { fetch: out });
  const res = tools.res;
  const lock = readLock(projectDir);
  const { paths: projectPaths, display } = pathTools(res, () => path.join(projectDir, STATE_DIR), new Map(), []);
  // Paths in the managed block are relative to the project. From outside it, they start at the caller's folder.
  const base = callerInside(projectDir) ? undefined : path.relative(process.cwd(), projectDir);
  const shown = (p: string): string => (base === undefined || path.isAbsolute(p) ? p : path.posix.join(base.split(path.sep).join('/'), p));
  // A stable path under node_modules/.harnesspm exists after a sync or a fetch. Else the file's own path.
  const existing = (p: string, file: string): string => (path.isAbsolute(p) || fs.existsSync(path.join(projectDir, p)) ? p : relPosix(projectDir, file));
  return {
    projectDir,
    tools,
    res,
    command: toolCommand(projectDir),
    ...(base !== undefined ? { base } : {}),
    trusted: (pkg) => trustOf(pkg, res, lock).trusted,
    paths: {
      rule: (rule) => shown(existing(projectPaths.rule(rule), rule.source)),
      docsIndex: (pkg) => {
        const index = projectPaths.docsIndex(pkg);
        return index === undefined ? undefined : shown(index);
      },
    },
    file: (file) => shown(existing(display(file), file)),
  };
}

/** The lines above every part of `help` about the project: its name, where paths start, and whether it is installed. */
function helpIntro(view: HelpView, out: Output): void {
  const { projectDir, tools, res, base } = view;
  out.log(`This project: ${res.projectName}${base !== undefined ? ` (${fromCaller(projectDir)})` : ''}`);
  if (base !== undefined) out.log('Paths start at the current folder. The tools run here too, with -C.');
  if (!tools.installed) out.log(tools.missing.length > 0 ? `⚠️  No install and no fetched harness packages: ${notAvailable(projectDir, tools, 'tools')}` : `No install: tools run from the fetched harness packages. A tool that needs another package says so; install the project with \`${installCommand(projectDir)}\`.`);
}

const count = (n: number, word: string): string => (n === 1 ? `1 ${word}` : `${n} ${word}s`);

/**
 * The project's part of `help` (spec 10.1): one line per package, across workspaces, with what it covers and the
 * `help <package>` command that prints the rest.
 */
export function projectHelp(cwd: string, out: Output, named: boolean): number {
  const view = helpView(cwd, out);
  if (view === undefined) {
    if (named) out.log(`\n${fromCaller(findProjectDir(cwd))} does not use harnesspm: it has no ${CONFIG_FILE}.`);
    return 0;
  }
  const { res, command } = view;
  out.log('');
  helpIntro(view, out);
  out.log('');
  const lines = res.packages
    .filter((p) => p.layer !== 'added')
    .map((pkg) => {
      const rules = res.rules.filter((r) => r.pkg === pkg);
      const always = rules.filter((r) => r.activation === 'always');
      const covers = pkg.description ?? always.map((r) => r.title).join(', ');
      const parts = [
        rules.length > 0 ? count(rules.length, 'rule') : '',
        res.docs.some((d) => d.pkg === pkg) ? 'docs' : '',
        count(res.scripts.filter((s) => s.pkg === pkg && s.description !== undefined).length, 'tool'),
        count(res.mcp.filter((m) => m.pkg === pkg).length, 'MCP server'),
        count(res.skills.filter((k) => k.pkg === pkg).length, 'skill'),
        count(res.hooks.filter((h) => h.pkg === pkg).length, 'hook'),
      ].filter((part) => part !== '' && !part.startsWith('0 '));
      const name = `${pkg.name}${pkg.via !== undefined ? ` (via ${pkg.via})` : pkg.layer === 'project' ? ' (this project)' : ''}`;
      return `- ${name}${covers !== '' ? ` — ${covers}` : ''}. ${parts.length > 0 ? `${parts.join(', ')}: ` : ''}\`${command} help ${helpTarget(pkg)}\``;
    });
  out.log(lines.length > 0 ? lines.join('\n') : 'No harness units yet.');
  if (lines.length > 0) out.log(`\nA tool's options: \`${command} help <tool>\`. Run a tool: \`${command} run <tool> [args]\`.`);
  return 0;
}

/** How a rule becomes active, in words (spec 2.5). */
function activationLine(rule: FinalRule, file: string): string {
  if (rule.activation === 'always') return 'Always on.';
  if (rule.activation === 'file') return `When editing ${(rule.paths ?? []).map((p) => `\`${p.replace(/^\/(?!\/)/, '')}\``).join(', ')}${rule.description !== undefined ? ` — ${rule.description}` : ''}. File: ${file}`;
  return `On demand: ${rule.description}. File: ${file}`;
}

/** Who changed a rule's text: replacements and patches, as `why` lists them. */
function changedBy(rule: FinalRule): string | undefined {
  const by = [...new Set([rule.replacedBy?.by, ...rule.patches.map((p) => p.by)].filter((b): b is string => b !== undefined))];
  return by.length > 0 ? `Changed by ${by.join(', ')}: this is the text agents get here.` : undefined;
}

function ruleHelp(view: HelpView, rule: FinalRule, level: number): string {
  const head = `${'#'.repeat(level)} ${rule.title} (${rule.id})`;
  const about = [activationLine(rule, view.paths.rule(rule)), changedBy(rule)].filter((l) => l !== undefined).join(' ');
  const body = demoteHeadings(ruleBodyWithoutTitle(rule), level - 1);
  return [head, about, ...(body !== '' ? [body] : [])].join('\n\n');
}

function trustNote(pkg: ResolvedPackage): string {
  return `Not trusted in this project, so they stay off and \`run\` refuses them. A person turns them on with "${pkg.name}": true in "trust" in ${CONFIG_FILE}.`;
}

function toolLines(view: HelpView, script: FinalScript): string[] {
  const ref = `${script.pkg.plugin}:${script.name}`;
  const lines = [`- \`${view.command} run ${ref}${script.usage !== undefined && !script.usage.includes('\n') ? ` ${script.usage}` : ' [args]'}\`${script.description !== undefined ? ` — ${script.description}` : ''} (${script.id})`];
  if (script.usage !== undefined && script.usage.includes('\n')) lines.push(...script.usage.split('\n').map((l) => `  ${l}`));
  return lines;
}

function hookLine(hook: FinalHook): string {
  const on = (Object.entries(hook.matchers) as [string, string | undefined][]).map(([agent, matcher]) => `${agent === 'claude' ? 'Claude Code' : 'Codex'}${matcher !== undefined && matcher !== '' && matcher !== '*' ? ` on \`${matcher}\`` : ''}`);
  return `- ${hook.event}, ${on.join(' and ')}: runs \`${hook.pkg.plugin}:${hook.run}\` (${hook.id})`;
}

function mcpLine(view: HelpView, server: FinalMcp): string {
  return server.config['type'] === 'stdio' ? `- \`${view.command} mcp ${server.pkg.plugin}:${server.name}\` (${server.id})` : `- ${String(server.config['url'])} (${server.id})`;
}

/** Everything a package contributes, with the project's patches applied (spec 10.1, `help <package>`). */
function packageHelp(view: HelpView, pkg: ResolvedPackage): string {
  const { res } = view;
  const parts: string[] = [];
  const where = pkg.layer === 'project' ? 'this project' : pkg.layer === 'added' ? `added ${pkg.added?.source.spec ?? pkg.plugin}` : `${pkg.version}${pkg.via !== undefined ? `, via ${pkg.via}` : ''}`;
  parts.push(`# ${pkg.name} (${where}), plugin ${pkg.plugin}${pkg.description !== undefined ? `\n\n${pkg.description}` : ''}`);
  const trusted = view.trusted(pkg);
  const rules = res.rules.filter((r) => r.pkg === pkg);
  if (rules.length > 0) parts.push('## Rules', ...rules.map((r) => ruleHelp(view, r, 3)));
  const index = view.paths.docsIndex(pkg);
  if (index !== undefined) parts.push('## Docs', `- ${index} (${pkg.plugin}:docs)`);
  const scripts = res.scripts.filter((s) => s.pkg === pkg && s.description !== undefined);
  if (scripts.length > 0) parts.push('## Tools', [...(trusted ? [] : [`⚠️  ${trustNote(pkg)}`]), ...scripts.flatMap((s) => toolLines(view, s))].join('\n'));
  const servers = res.mcp.filter((m) => m.pkg === pkg);
  if (servers.length > 0) parts.push('## MCP servers', [...(trusted ? [] : [`⚠️  ${trustNote(pkg)}`]), ...servers.map((m) => mcpLine(view, m))].join('\n'));
  const skills = res.skills.filter((k) => k.pkg === pkg);
  if (skills.length > 0) {
    const line = (skill: FinalSkill): string => {
      const file = path.join(skill.dir, 'SKILL.md');
      const description = tryFrontmatter(readTextIfExists(file) ?? '', file).data['description'];
      return `- ${skill.name}: read ${view.file(file)} (${skill.id})${typeof description === 'string' ? `\n  ${description}` : ''}`;
    };
    parts.push('## Skills', skills.map(line).join('\n'));
  }
  const hooks = res.hooks.filter((h) => h.pkg === pkg);
  if (hooks.length > 0) parts.push('## Hooks', [...(trusted ? [] : [`⚠️  ${trustNote(pkg)}`]), ...hooks.map(hookLine)].join('\n'));
  if (parts.length === 1) parts.push('No harness units.');
  return parts.join('\n\n');
}

/** One tool: its description, usage and the command that runs it. It never runs the script (spec 10.1, `help <tool>`). */
function scriptHelp(view: HelpView, script: FinalScript): string {
  const ref = `${script.pkg.plugin}:${script.name}`;
  const lines = [`${ref} (${script.id}), from ${script.pkg.name}`];
  if (script.description !== undefined) lines.push('', script.description);
  else lines.push('', 'No description: hooks and MCP servers use it, agents do not run it themselves.');
  lines.push('');
  if (script.usage !== undefined) lines.push(`Usage: ${script.usage.split('\n').join('\n       ')}`);
  else lines.push(`Usage: none declared. Its package can add "usage" next to "description" in its manifest. harnesspm does not run the script to ask.`);
  lines.push(`Run:   ${view.command} run ${ref} [args]`);
  if (!view.trusted(script.pkg)) lines.push('', `⚠️  ${trustNote(script.pkg)}`);
  return lines.join('\n');
}

/**
 * `help <target>`: a package or plugin, a rule ID, or a tool by `<plugin>:<script>` or its ID (spec 10.1). It works
 * without an install, like `help`, and sends a `help` event (spec 14.2).
 */
export function targetHelp(cwd: string, target: string, out: Output): number {
  const view = helpView(cwd, out);
  if (view === undefined) throw new HarnessError(`No command "${target}", and ${fromCaller(findProjectDir(cwd))} does not use harnesspm, so it has no packages, rules or tools. Run \`harnesspm help\`.`);
  const { res } = view;
  const pkg = res.packages.find((p) => p.name === target || p.plugin === target);
  const rule = pkg === undefined ? res.rules.find((r) => r.id === target) : undefined;
  const script = pkg === undefined && rule === undefined ? res.scripts.find((s) => `${s.pkg.plugin}:${s.name}` === target || s.id === target) : undefined;
  const owner = pkg ?? rule?.pkg ?? script?.pkg;
  if (owner === undefined) {
    const reason = notAvailable(view.projectDir, view.tools, 'harness packages');
    if (reason !== undefined) throw new HarnessError(reason);
    const names = res.packages.map(helpTarget).join(', ');
    throw new HarnessError(`No command, package, rule or tool "${target}".${names !== '' ? ` Packages: ${names}.` : ''} \`${view.command} help\` lists them.`);
  }
  helpIntro(view, out);
  out.log('');
  out.log(pkg !== undefined ? packageHelp(view, pkg) : rule !== undefined ? ruleHelp(view, rule, 1) : scriptHelp(view, script!));
  // Units of added harnesses belong to a person: their use never reaches the team's handler (spec 14.2, rule 2).
  if (owner.layer !== 'added') {
    const repository = readIndex(res.projectDir)?.repository;
    const ctx = { ...eventContext(res), ...(repository !== undefined ? { repository } : {}) };
    const unit = rule?.id ?? script?.id;
    sendEvent(readTelemetryState(res.projectDir), ctx, { type: 'help', ...commandCaller(), ...(unit !== undefined ? { unit } : {}), package: owner.name, version: owner.version }, callerInside(view.projectDir) ? process.cwd() : view.projectDir);
  }
  return 0;
}

/** Approves new versions of "pin" packages and writes what a model run left pending (spec 6.2). */
export function approve(cwd: string, name: string | undefined, out: Output): number {
  if (caller() === 'model') throw new HarnessError('`harnesspm approve` is for a person. Ask the person to run it in their own terminal.');
  const projectDir = findProjectDir(cwd);
  const resolved = resolveAll(projectDir, { withAdded: false });
  if (resolved.team) {
    const lock = readLock(projectDir) ?? buildLock(resolved.team, undefined);
    let approved = 0;
    for (const pkg of resolved.team.packages) {
      if (resolved.team.config.trust[pkg.name] !== 'pin' || (name !== undefined && pkg.name !== name)) continue;
      const entry = lock.packages[pkg.name];
      if (entry && entry.approved !== pkg.version) {
        entry.version = pkg.version;
        entry.approved = pkg.version;
        approved++;
        out.log(`✅ approved ${pkg.name} ${pkg.version}`);
      }
    }
    if (name !== undefined && approved === 0 && resolved.team.config.trust[name] !== 'pin') throw new HarnessError(`${name} is not a "pin" package in ${CONFIG_FILE}`);
    if (approved > 0) writeIfChanged(path.join(projectDir, LOCK_FILE), serializeLock(lock));
  }
  return sync(projectDir, out, { write: true });
}

/** What to do after `new`. `why` and `sync` reach the project's own harness only where the project uses harnesspm. */
function nextAfterNew(projectDir: string, added: boolean): string {
  const npx = dependsOnHarnesspm(readJsonIfExists(path.join(projectDir, 'package.json'))) ? NPX_LOCAL : NPX_ANY;
  if (added) return `Next: edit it, run \`${npx} sync\`, then save the change the way that harness's own AGENTS.md or CONTRIBUTING.md says.`;
  if (isFile(path.join(projectDir, CONFIG_FILE))) return `Next: edit it, then run \`${npx} sync\` and \`${npx} check\`.`;
  return `Next: edit it, then run \`${npx} check\`. To see the harness in this repository's AGENTS.md too, run \`${npx} init\`.`;
}

export function newUnit(cwd: string, kind: string, name: string, options: { to?: string; entry?: boolean }, out: Output): number {
  const projectDir = findProjectDir(cwd);
  const show = (file: string): string => (file.startsWith(projectDir + path.sep) ? relPosix(projectDir, file) : file);
  if (kind === 'patch') {
    const { full } = resolveAll(projectDir, { withAdded: true });
    const result = createPatch(projectDir, full, name, options);
    out.log(`Wrote ${show(result.file)}, registered in ${show(result.registeredIn)}.`);
    out.log('Keep only the sections you change and edit them. Delete the others. To drop a section, list its heading in `remove:` frontmatter.');
  } else {
    if (!(KINDS as readonly string[]).includes(kind)) throw new HarnessError(`Unknown kind "${kind}". Use one of: ${KINDS.join(', ')}, patch.`);
    const target = resolveTarget(projectDir, options);
    const files = [...new Set([...target.written, ...createUnit(target, kind as Kind, name)])];
    out.log(`Wrote in ${target.label}:`);
    for (const file of files) out.log(`  ${show(file)}`);
    out.log(nextAfterNew(projectDir, options.to !== undefined));
  }
  sync(projectDir, out, { quiet: true, write: true });
  return 0;
}

export function fetch(cwd: string, out: Output): number {
  const projectDir = findProjectDir(cwd);
  const report = fetchLocked(projectDir);
  printWarnings(out, report.warnings);
  out.log(`harnesspm: fetched ${plural(report.fetched.length, 'package')}${report.fetched.length > 0 ? ` (${report.fetched.join(', ')})` : ''}, reused ${report.reused.length}.`);
  return 0;
}

export function check(target: string, out: Output): number {
  const result = checkHarness(target);
  printWarnings(out, result.warnings);
  for (const e of result.errors) out.log(`❌ ${e}`);
  out.log(`📏 always-on text of ${result.plugin}: ${(result.alwaysOnBytes / 1024).toFixed(1)} KiB`);
  if (result.errors.length > 0) return 1;
  out.log('✅ harness is valid');
  return 0;
}
