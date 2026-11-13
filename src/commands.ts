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
import { applyPlan, checkPlan, computePlan, repoStateFile, STATE_DIR, type Plan } from './outputs.ts';
import { fetchLocked } from './fetch.ts';
import { createPatch, createUnit, KINDS, resolveTarget, type Kind } from './new.ts';
import { runMcp, runScript } from './run.ts';
import { alwaysOnText, withClaudeImport } from './render.ts';
import { resolve, resolvePackageDir, type FinalAgent, type FinalHook, type FinalMcp, type FinalPermissions, type FinalScript, type Resolution } from './resolve.ts';
import { commandCaller, describeSend, readTelemetryState, sendEvent, type EventContext } from './telemetry.ts';
import { writeUserOutputs, writeUserSettings, type UserReport } from './user-outputs.ts';
import { HarnessError, NPX_ANY, NPX_LOCAL, gitExcludeFile, isDir, isFile, isRecord, readJson, readJsonIfExists, readTextIfExists, relPosix, writeIfChanged } from './util.ts';
import { spawnSync } from 'node:child_process';

export interface Output {
  log(line: string): void;
  warn(line: string): void;
}

const printWarnings = (out: Output, warnings: string[]): void => {
  for (const w of [...new Set(warnings)]) out.warn(`⚠️  ${w}`);
};

const plural = (count: number, word: string, many = `${word}s`): string => `${count} ${count === 1 ? word : many}`;

function printPending(out: Output, report: UserReport): void {
  for (const line of [...new Set(report.pending)]) out.log(`⏳ pending: ${line}`);
  if (report.held.length > 0) {
    out.log(`⏳ held back: ${plural(report.held.length, 'entry', 'entries')} that an agent cannot grant (${report.held.slice(0, 3).join('; ')}${report.held.length > 3 ? '; …' : ''}).`);
    out.log(`   Ask the person to run \`${NPX_ANY} sync\` or \`${NPX_ANY} approve\` in their own terminal.`);
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

export function sync(cwd: string, out: Output, options: { check?: boolean; quiet?: boolean } = {}): number {
  const projectDir = findProjectDir(cwd);
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
  if (mode !== 'none') {
    const plan = computePlan(resolved.team, full, { widen: caller() !== 'model' });
    warnings.push(...plan.warnings);
    const applied = applyPlan(projectDir, plan);
    changed.push(...applied.changed);
    report.held.push(...(plan.telemetryHeld !== undefined ? [plan.telemetryHeld] : []), ...applied.held);
    report.pending.push(...(plan.exec.team?.pending ?? []), ...plan.exec.added.pending);
  }
  if (resolved.team) syncEvent(resolved.team, before, readLock(projectDir));
  if (process.env['CI'] !== 'true') changed.push(...writeUserOutputs(resolved.added, warnings, report));
  printWarnings(out, warnings);
  printPending(out, report);
  if (options.quiet) return 0;
  const counts = `${plural(full.rules.length, 'rule')}, ${plural(full.skills.length, 'skill')}, ${plural(full.docs.length, 'doc')} from ${plural(full.packages.length, 'package')}`;
  const what = mode === 'none' ? 'Nothing to do in this folder' : mode === 'added-only' ? `Added harnesses only: ${counts}` : counts;
  out.log(changed.length > 0 ? `harnesspm: ${what}. Updated ${plural(changed.length, 'file')}.` : `harnesspm: ${what}. Nothing changed.`);
  return 0;
}

/** Where events about a resolved project go (spec chapter 14). */
const eventContext = (res: Resolution): EventContext => ({ projectDir: res.projectDir, project: res.projectName, workspaces: res.workspaces.map((ws) => ws.key) });

/** The `sync` event: packages and the units that changed since the last lock (spec 14.2). */
function syncEvent(team: Resolution, before: Lock | undefined, after: Lock | undefined): void {
  const state = readTelemetryState(team.projectDir);
  if (!state.events.has('sync') || !after) return;
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

export function init(projectDir: string, out: Output): number {
  const pkgFile = path.join(projectDir, 'package.json');
  if (!isFile(pkgFile)) throw new HarnessError('No package.json here. Run `npm init` first.');
  const configFile = path.join(projectDir, CONFIG_FILE);
  if (!isFile(configFile)) {
    writeIfChanged(configFile, `${JSON.stringify({ $schema: CONFIG_SCHEMA }, null, 2)}\n`);
    out.log(`Created ${CONFIG_FILE}`);
  }
  const raw = readTextIfExists(pkgFile)!;
  const pkg = readJson(pkgFile);
  if (!isRecord(pkg)) throw new HarnessError('package.json must be a JSON object');
  // A private package is never installed by others, so `postinstall` is safe there, and Yarn 2+ runs only
  // `postinstall`. A published package uses `prepare`, which does not run when others install it.
  const scripts = isRecord(pkg['scripts']) ? pkg['scripts'] : {};
  const hookName = pkg['private'] === true ? 'postinstall' : 'prepare';
  const has = (name: string): boolean => typeof scripts[name] === 'string' && (scripts[name] as string).includes('harnesspm sync');
  if (!has('prepare') && !has('postinstall')) {
    const current = typeof scripts[hookName] === 'string' ? (scripts[hookName] as string) : undefined;
    scripts[hookName] = current === undefined ? 'harnesspm sync' : `${current} && harnesspm sync`;
    pkg['scripts'] = scripts;
    const indent = /^\{\r?\n(\s+)/.exec(raw)?.[1] ?? '  ';
    writeIfChanged(pkgFile, `${JSON.stringify(pkg, null, indent)}\n`);
    out.log(`Added \`harnesspm sync\` to the "${hookName}" script`);
  }
  const claudeFile = path.join(projectDir, 'CLAUDE.md');
  if (writeIfChanged(claudeFile, withClaudeImport(readTextIfExists(claudeFile)))) out.log('CLAUDE.md now imports AGENTS.md');
  return sync(projectDir, out);
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
    out.log('   Ask the person to run the same command in their own terminal.');
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

  const plan: Plan | undefined = resolved.mode !== 'none' ? computePlan(resolved.team, resolved.full) : undefined;
  if (plan) {
    const pending = [...(plan.exec.team?.pending ?? []), ...plan.exec.added.pending];
    const stateFile = repoStateFile(projectDir);
    const held = [...(plan.exec.team ? heldEntries('team', plan.exec.team, stateFile) : []), ...heldEntries('added', plan.exec.added, stateFile)];
    printPending(out, { pending, held });
  }
  if (resolved.team) {
    const changes = resolved.team.rules.filter((r) => resolved.full.rules.find((f) => f.id === r.id)?.text !== r.text).map((r) => r.id);
    if (changes.length > 0) out.log(`✏️  changed here  ${changes.join(', ')} (by added harnesses; see CLAUDE.local.md)`);
    const agents = plan!.committed!.agentsMd;
    const bytes = Buffer.byteLength(agents);
    const claudeLines = agents.split('\n').length + (plan!.localMd ?? '').split('\n').length;
    out.log(`📏 always-on     Codex ${(bytes / 1024).toFixed(1)} KiB of 32 KiB · Claude Code ${claudeLines} lines`);
    if (bytes > 28 * 1024) out.warn("⚠️  AGENTS.md is close to Codex's 32 KiB limit. Move details into on-demand rules or docs.");
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
  const plan = resolved.mode !== 'none' ? computePlan(resolved.team, resolved.full) : undefined;
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
  }
  if (outputs.length > 0) groups.push(['📦 Outputs', outputs]);

  // Trust: pending entries are not errors (spec 10.4).
  const trust: Finding[] = [];
  if (plan) {
    const pending = [...new Set([...(plan.exec.team?.pending ?? []), ...plan.exec.added.pending])];
    const stateFile = repoStateFile(projectDir);
    const held = [...(plan.exec.team ? heldEntries('team', plan.exec.team, stateFile) : []), ...heldEntries('added', plan.exec.added, stateFile)];
    for (const p of pending) trust.push({ level: 'warn', text: `Off until trusted: ${p}. To turn it on, add the package to "trust" in ${CONFIG_FILE}.` });
    if (held.length > 0) trust.push({ level: 'warn', text: `${plural(held.length, 'entry', 'entries')} that an agent could not grant (${held.slice(0, 3).join('; ')}${held.length > 3 ? '; …' : ''}). Run \`${NPX_ANY} sync\` in your own terminal.` });
  }
  const telemetry = readTelemetryState(projectDir);
  if (telemetry.config && telemetry.send === undefined) trust.push({ level: telemetry.off?.startsWith('held') ? 'warn' : 'info', text: `Telemetry ${telemetry.off}` });
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
  if (exec?.kind === 'scripts') row('run', `npx harnesspm run ${pkg.plugin}:${exec.name}`);
  // Deny and ask rules only restrict, so they need no trust (spec 6.1).
  if (exec && exec.kind !== 'permissions' && pkg.layer === 'dependencies') {
    const trust = res.config.trust[pkg.name];
    row(
      'trust',
      trust === true
        ? 'yes'
        : trust === 'pin'
          ? 'pinned: active in the version approved in the lock'
          : `no: it stays off. Add "${pkg.name}": true to "trust" in ${CONFIG_FILE} to turn it on.`,
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

export function run(cwd: string, ref: string, args: string[], agent: string | undefined): number {
  const projectDir = findProjectDir(cwd);
  return runScript(resolveAll(projectDir, { withAdded: true }).full, ref, args, agent);
}

export function mcp(cwd: string, ref: string, agent: string | undefined): number {
  const projectDir = findProjectDir(cwd);
  return runMcp(resolveAll(projectDir, { withAdded: true }).full, ref, agent);
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
  return sync(projectDir, out);
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
    const files = createUnit(target, kind as Kind, name);
    out.log(`Created in ${target.label}:`);
    for (const file of files) out.log(`  ${show(file)}`);
    out.log('Edit it, then save it the way that harness\'s owner wants (`npx harnesspm why <ID>` names the rules).');
  }
  sync(projectDir, out, { quiet: true });
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
