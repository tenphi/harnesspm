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
import { CONFIG_FILE, CONFIG_SCHEMA } from './config.ts';
import { loadHarnessPackage } from './manifest.ts';
import { heldEntries } from './exec-outputs.ts';
import { buildLock, LOCK_FILE, readLock, serializeLock } from './lock.ts';
import { applyPlan, checkPlan, computePlan, repoStateFile, STATE_DIR, type Plan } from './outputs.ts';
import { fetchLocked } from './fetch.ts';
import { createPatch, createUnit, KINDS, resolveTarget, type Kind } from './new.ts';
import { runMcp, runScript } from './run.ts';
import { alwaysOnText, withClaudeImport } from './render.ts';
import { resolve, resolvePackageDir, type Resolution } from './resolve.ts';
import { writeUserOutputs, writeUserSettings, type UserReport } from './user-outputs.ts';
import { HarnessError, gitExcludeFile, isDir, isFile, isRecord, readJson, readJsonIfExists, readTextIfExists, relPosix, writeIfChanged } from './util.ts';
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
    out.log('   Ask the person to run `npx harnesspm sync` or `npx harnesspm approve` in their own terminal.');
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
  if (mode !== 'none') {
    const plan = computePlan(resolved.team, full);
    warnings.push(...plan.warnings);
    const applied = applyPlan(projectDir, plan);
    changed.push(...applied.changed);
    report.held.push(...applied.held);
    report.pending.push(...(plan.exec.team?.pending ?? []), ...plan.exec.added.pending);
  }
  if (process.env['CI'] !== 'true') changed.push(...writeUserOutputs(resolved.added, warnings, report));
  printWarnings(out, warnings);
  printPending(out, report);
  if (options.quiet) return 0;
  const counts = `${plural(full.rules.length, 'rule')}, ${plural(full.skills.length, 'skill')}, ${plural(full.docs.length, 'doc')} from ${plural(full.packages.length, 'package')}`;
  const what = mode === 'none' ? 'Nothing to do in this folder' : mode === 'added-only' ? `Added harnesses only: ${counts}` : counts;
  out.log(changed.length > 0 ? `harnesspm: ${what}. Updated ${plural(changed.length, 'file')}.` : `harnesspm: ${what}. Nothing changed.`);
  return 0;
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
  printWarnings(out, resolved.warnings);
  return 0;
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
  const pkg = rule?.pkg ?? skill?.pkg ?? docs?.pkg;
  if (!pkg) {
    if (excluded) {
      row('excluded', `by ${excluded.by}`);
      return 0;
    }
    const plugin = id.split(':')[0];
    const near = [...res.rules.map((r) => r.id), ...res.skills.map((s) => s.id)].filter((x) => x.startsWith(`${plugin}:`)).slice(0, 5);
    throw new HarnessError(`No unit ${id}.${near.length > 0 ? ` Units of ${plugin}: ${near.join(', ')}` : ''}`);
  }
  if (pkg.layer === 'project') row('owner', `project ${pkg.name} (harness/)`);
  else if (pkg.layer === 'added') row('owner', `added ${pkg.added!.source.spec} (${pkg.scope} scope${pkg.entry ? ', entry for this repository' : ''})`);
  else row('owner', `dependency ${pkg.name} ${pkg.version}${pkg.via !== undefined ? ` (via ${pkg.via})` : ''}`);
  const source = rule?.source ?? (skill ? path.join(skill.dir, 'SKILL.md') : docs!.dir);
  row('source', rel(source));
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
