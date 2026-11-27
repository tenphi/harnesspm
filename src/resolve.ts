// Resolution of the dependency and project layers (spec chapter 3).
import * as path from 'node:path';
import type { AddedHarness, Scope } from './added.ts';
import { CONFIG_FILE, emptyConfig, readConfig, type ProjectConfig } from './config.ts';
import {
  discoverUnits,
  loadHarnessPackage,
  ruleMeta,
  type DocsSource,
  type HarnessPackage,
  type RuleMeta,
  type RuleSource,
  type SkillSource,
} from './manifest.ts';
import { discoverExecUnits, type AgentUnit, type HookUnit, type McpUnit, type PermissionsUnit, type ScriptUnit } from './exec-units.ts';
import { applyPatch, type TouchedSection } from './sections.ts';
import { findWorkspaces } from './workspaces.ts';
import { HarnessError, OLD_PACKAGE_NAMES, PACKAGE_NAME, compareVersions, gitIgnoresDir, insideDir, isFile, isRecord, readJsonIfExists, readText, realpath, relPosix } from './util.ts';

export interface ResolvedPackage extends HarnessPackage {
  /** The package whose `extends` brought this one in, when it is not a direct dependency. */
  via?: string;
  direct: boolean;
  /** Names of the packages this one passes on through `extends`, transitively. */
  closure: Set<string>;
  /** For an added harness: its scope and source. */
  scope?: Scope;
  added?: AddedHarness;
  /** True for an added harness's entry for this repository. */
  entry?: boolean;
  /** Workspaces whose dependencies reach this package: "" for the repository root, else the workspace's path. */
  members: Set<string>;
}

export interface ResolveOptions {
  /** Added harnesses to put on top, in order. */
  added?: AddedHarness[];
  /** Resolve the dependency and project layers. False when they are not installed or not used. */
  team?: boolean;
  /** Where to find a package that is not installed, such as one `harnesspm fetch` downloaded. */
  locate?: (name: string) => string | undefined;
}

export interface Workspace {
  /** Path from the repository root, with forward slashes. */
  key: string;
  dir: string;
}

export interface Override {
  kind: 'exclude' | 'replace' | 'patch';
  target: string;
  /** Absolute path of the replacement or patch file. */
  file?: string;
  /** Who declared it: a package name or `harnesspm.json`. */
  by: string;
  /** The package that declared it. Undefined for `harnesspm.json`. */
  from?: ResolvedPackage;
  /** Lower numbers come from lower layers, or from packages further upstream. */
  order: number;
  scope: Set<string> | 'all';
}

export interface AppliedPatch {
  /** Patch file, relative to the project. */
  patch: string;
  by: string;
  sections: TouchedSection[];
}

export interface FinalRule extends RuleMeta {
  id: string;
  name: string;
  pkg: ResolvedPackage;
  /** The rule's own file. */
  original: string;
  /** The file the text comes from: the original or a replacement. */
  source: string;
  /** Final text, with frontmatter, after replace and patches. */
  text: string;
  replacedBy?: Override;
  patches: AppliedPatch[];
  /** Where this version of the rule applies. The empty key is the repository root. */
  members: Set<string>;
  /** More than one override sequence applies to this rule. */
  variant: boolean;
}

export interface FinalSkill extends SkillSource {
  pkg: ResolvedPackage;
  /** The skill's own folder. `dir` is the folder in use: this one, or a replacement. */
  original: string;
  replacedBy?: Override;
  replacementConflict?: string;
}

export function rulesById(rules: FinalRule[]): Map<string, FinalRule[]> {
  const groups = new Map<string, FinalRule[]>();
  for (const rule of rules) {
    const group = groups.get(rule.id) ?? [];
    group.push(rule);
    groups.set(rule.id, group);
  }
  return groups;
}

/** Inside a workspace, select its rules. At the root, include workspace-only rules in the repository overview. */
export function rulesForDirectory(res: Resolution, dir: string): FinalRule[] {
  const ws = res.workspaces.findLast((ws) => insideDir(ws.dir, dir));
  if (ws) return res.rules.filter((rule) => rule.members.has(ws.key));
  return [...rulesById(res.rules).values()].flatMap((variants) => {
    const root = variants.find((rule) => rule.members.has(''));
    return root ? [root] : variants;
  });
}

export const describeMembers = (members: Set<string>): string =>
  [...members].map((key) => key === '' ? 'repository root' : `\`${key}\``).join(', ');

/** Changes to the team's rule text on this machine, with the affected members of each version. */
export function localRuleChanges(team: Resolution, full: Resolution): { id: string; changed?: FinalRule; members: Set<string> }[] {
  const fullRules = rulesById(full.rules);
  return [...rulesById(team.rules)].flatMap(([id, previous]) => {
    const current = fullRules.get(id);
    if (!current) return [{ id, members: new Set(previous.flatMap((rule) => [...rule.members])) }];
    return current.flatMap((changed) => {
      const members = new Set(previous
        .filter((rule) => rule.text !== changed.text)
        .flatMap((rule) => [...rule.members].filter((key) => changed.members.has(key))));
      return members.size > 0 ? [{ id, changed, members }] : [];
    });
  });
}

/** Units that `replace` works on, and what a replacement is: a rule's file, or a skill's folder with its SKILL.md (spec 3.4). */
const replaceable = (id: string): 'rule' | 'skill' | undefined => (id.includes(':rules/') ? 'rule' : id.includes(':skills/') ? 'skill' : undefined);
const replacementExists = (id: string, file: string): boolean => (replaceable(id) === 'skill' ? isFile(path.join(file, 'SKILL.md')) : isFile(file));

/**
 * The package whose files a skill uses: the one whose `replace` put them in the skill's place, else its own. Trust
 * follows these files (spec 6.1). Undefined when `harnesspm.json` replaced the skill with a file of the project.
 */
export const skillAuthor = (skill: FinalSkill): ResolvedPackage | undefined => (skill.replacedBy ? skill.replacedBy.from : skill.pkg);

export interface FinalDocs extends DocsSource {
  pkg: ResolvedPackage;
}

type WithPkg<T> = Omit<T, 'pkg'> & { pkg: ResolvedPackage };
export type FinalScript = WithPkg<ScriptUnit>;
export type FinalHook = WithPkg<HookUnit>;
export type FinalMcp = WithPkg<McpUnit>;
export type FinalPermissions = WithPkg<PermissionsUnit>;
export type FinalAgent = WithPkg<AgentUnit>;

export interface Resolution {
  projectDir: string;
  projectName: string;
  /** The workspaces of a monorepo, without the root. Empty for a single package. */
  workspaces: Workspace[];
  config: ProjectConfig;
  /** Dependency layer upstream first, then the project's own harness. */
  packages: ResolvedPackage[];
  rules: FinalRule[];
  skills: FinalSkill[];
  docs: FinalDocs[];
  scripts: FinalScript[];
  hooks: FinalHook[];
  mcp: FinalMcp[];
  permissions: FinalPermissions[];
  agents: FinalAgent[];
  overrides: Override[];
  excludedUnits: { id: string; by: string }[];
  excludedPackages: { name: string; by: string }[];
  warnings: string[];
}

/** Finds `<name>` in node_modules from `fromDir` upward, the way Node.js does. */
export function resolvePackageDir(name: string, fromDir: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name, 'package.json');
    if (isFile(candidate)) return realpath(path.dirname(candidate));
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function dependencyNames(pkgJson: Record<string, unknown>): string[] {
  const names = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = pkgJson[field];
    if (isRecord(deps)) for (const name of Object.keys(deps)) names.add(name);
  }
  return [...names].sort();
}

const isUnitId = (entry: string): boolean => entry.includes(':');

/** True when `name` is in `peerDependencies` of the package at `dir` and marked optional in `peerDependenciesMeta`. */
function isOptionalPeer(dir: string, name: string): boolean {
  const raw = readJsonIfExists(path.join(dir, 'package.json'));
  if (!isRecord(raw) || !isRecord(raw['peerDependencies']) || raw['peerDependencies'][name] === undefined) return false;
  const meta = isRecord(raw['peerDependenciesMeta']) ? raw['peerDependenciesMeta'][name] : undefined;
  return isRecord(meta) && meta['optional'] === true;
}

interface Occurrence {
  dir: string;
  depth: number;
  direct: boolean;
  via?: string;
}

export function resolve(projectDirInput: string, options: ResolveOptions = {}): Resolution {
  const projectDir = realpath(projectDirInput);
  const team = options.team ?? true;
  const warnings: string[] = [];
  const config = team ? readConfig(projectDir) : emptyConfig();
  warnings.push(...config.warnings);
  const pkgJsonRaw = readJsonIfExists(path.join(projectDir, 'package.json'));
  const pkgJson = isRecord(pkgJsonRaw) ? pkgJsonRaw : {};
  const projectName = typeof pkgJson['name'] === 'string' ? pkgJson['name'] : path.basename(projectDir);

  const cache = new Map<string, HarnessPackage | null>();
  const load = (dir: string, layer: HarnessPackage['layer']): HarnessPackage | undefined => {
    if (!cache.has(dir)) cache.set(dir, loadHarnessPackage(dir, layer) ?? null);
    return cache.get(dir) ?? undefined;
  };

  const occurrences = new Map<string, Occurrence[]>();
  const members = new Map<string, Set<string>>();
  const addMember = (name: string, key: string): void => {
    const set = members.get(name) ?? new Set<string>();
    set.add(key);
    members.set(name, set);
  };
  const edges = new Map<string, Set<string>>();
  const workspaceClosures = new Map<string, Map<string, Set<string>>>();
  const excludedPackages: { name: string; by: string }[] = [];
  const addOccurrence = (name: string, occurrence: Occurrence): void => {
    const list = occurrences.get(name) ?? [];
    list.push(occurrence);
    occurrences.set(name, list);
  };
  const addEdge = (from: string, to: string): void => {
    const set = edges.get(from) ?? new Set<string>();
    set.add(to);
    edges.set(from, set);
  };

  /** `excluded` maps a package name to whoever excluded it on this path. */
  const visit = (pkg: HarnessPackage, depth: number, excluded: Map<string, string>, stack: string[], root: string): Set<string> => {
    const childExcluded = new Map(excluded);
    const reached = new Set<string>();
    for (const name of pkg.ext.exclude.filter((e) => !isUnitId(e))) childExcluded.set(name, pkg.name);
    for (const name of pkg.ext.extends) {
      const by = childExcluded.get(name);
      if (by !== undefined) {
        excludedPackages.push({ name, by });
        continue;
      }
      const dir = resolvePackageDir(name, pkg.dir) ?? options.locate?.(name);
      if (!dir) {
        // An optional peer that the project did not install is skipped quietly (spec 3.3).
        if (!isOptionalPeer(pkg.dir, name)) warnings.push(`${pkg.name} extends ${name}, which is not installed`);
        continue;
      }
      if (stack.includes(dir)) {
        throw new HarnessError(`extends cycle: ${[...stack.map((d) => cache.get(d)?.name ?? d), name].join(' → ')}`);
      }
      const child = load(dir, 'dependencies');
      if (!child) {
        warnings.push(`${pkg.name} extends ${name}, which has no harness/ folder`);
        continue;
      }
      addEdge(pkg.name, name);
      addOccurrence(name, { dir, depth: depth + 1, direct: false, via: pkg.name });
      addMember(name, root);
      reached.add(name);
      for (const descendant of visit(child, depth + 1, childExcluded, [...stack, dir], root)) reached.add(descendant);
    }
    const closures = workspaceClosures.get(root) ?? new Map<string, Set<string>>();
    const closure = closures.get(pkg.name) ?? new Set<string>();
    for (const name of reached) closure.add(name);
    closures.set(pkg.name, closure);
    workspaceClosures.set(root, closures);
    return reached;
  };

  // Each workspace is resolved on its own dependencies, from its own folder (spec 3.6).
  const workspaces: Workspace[] = team ? findWorkspaces(projectDir).map((dir) => ({ key: relPosix(projectDir, dir), dir: realpath(dir) })) : [];
  const roots = [{ key: '', dir: projectDir, deps: dependencyNames(pkgJson) }, ...workspaces.map((ws) => {
    const raw = readJsonIfExists(path.join(ws.dir, 'package.json'));
    return { key: ws.key, dir: ws.dir, deps: dependencyNames(isRecord(raw) ? raw : {}) };
  })];
  const rootExcluded = new Map(config.exclude.filter((e) => !isUnitId(e)).map((name) => [name, CONFIG_FILE] as const));
  for (const root of team ? roots : []) {
    for (const name of root.deps) {
      if (rootExcluded.has(name)) {
        excludedPackages.push({ name, by: CONFIG_FILE });
        continue;
      }
      const dir = resolvePackageDir(name, root.dir) ?? options.locate?.(name);
      if (!dir) continue;
      const pkg = load(dir, 'dependencies');
      if (!pkg) continue;
      addOccurrence(name, { dir, depth: 0, direct: true });
      addMember(name, root.key);
      visit(pkg, 0, rootExcluded, [dir], root.key);
    }
  }

  const projectHarness = team ? loadHarnessPackage(projectDir, 'project') : undefined;
  if (projectHarness) {
    projectHarness.name = projectName;
    visit(projectHarness, 0, rootExcluded, [projectDir], '');
  }
  // A workspace's own harness belongs to that workspace, unless another workspace already reaches it as a dependency.
  const workspaceHarnesses: { pkg: HarnessPackage; key: string }[] = [];
  for (const ws of workspaces) {
    const harness = loadHarnessPackage(ws.dir, 'project');
    if (!harness) continue;
    workspaceHarnesses.push({ pkg: harness, key: ws.key });
    visit(harness, 0, rootExcluded, [ws.dir], ws.key);
  }

  // One version per package in a repository (spec 3.5).
  const chosen = new Map<string, { pkg: HarnessPackage; occurrence: Occurrence }>();
  for (const [name, list] of occurrences) {
    const sorted = [...list].sort((a, b) => {
      if (a.direct !== b.direct) return a.direct ? -1 : 1;
      if (a.depth !== b.depth) return a.depth - b.depth;
      return compareVersions(load(b.dir, 'dependencies')!.version, load(a.dir, 'dependencies')!.version);
    });
    const first = sorted[0]!;
    const versions = [...new Set(list.map((o) => load(o.dir, 'dependencies')!.version))];
    if (new Set(list.map((o) => o.dir)).size > 1 && versions.length > 1) {
      warnings.push(`${name}: found versions ${versions.join(', ')}; using ${load(first.dir, 'dependencies')!.version}`);
    }
    chosen.set(name, { pkg: load(first.dir, 'dependencies')!, occurrence: first });
  }

  const closureOf = (name: string): Set<string> => {
    const result = new Set<string>();
    const stack = [...(edges.get(name) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (result.has(next) || !chosen.has(next)) continue;
      result.add(next);
      stack.push(...(edges.get(next) ?? []));
    }
    return result;
  };

  // Upstream first: a package comes after the packages it extends. Unrelated packages by name.
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (name: string): void => {
    if (seen.has(name) || !chosen.has(name)) return;
    seen.add(name);
    for (const child of [...(edges.get(name) ?? [])].sort()) walk(child);
    order.push(name);
  };
  for (const [name, { occurrence }] of [...chosen].sort(([a], [b]) => a.localeCompare(b))) if (occurrence.direct) walk(name);
  for (const child of [...(edges.get(projectName) ?? [])].sort()) walk(child);
  for (const name of [...chosen.keys()].sort()) walk(name);

  const workspaceDirs = new Map(workspaces.map((ws) => [ws.dir, ws.key]));
  const packages: ResolvedPackage[] = order.map((name) => {
    const { pkg, occurrence } = chosen.get(name)!;
    const own = workspaceDirs.get(pkg.dir);
    const set = new Set(members.get(name) ?? []);
    if (own !== undefined) set.add(own);
    return {
      ...pkg,
      // A workspace that another workspace depends on is still this repository's own code.
      ...(own !== undefined ? { layer: 'project' as const } : {}),
      direct: occurrence.direct,
      ...(occurrence.via !== undefined ? { via: occurrence.via } : {}),
      closure: closureOf(name),
      members: set,
    };
  });
  if (projectHarness) packages.push({ ...projectHarness, direct: true, closure: closureOf(projectName), members: new Set(['']) });
  for (const { pkg, key } of workspaceHarnesses) {
    if (packages.some((p) => p.dir === pkg.dir)) continue;
    packages.push({ ...pkg, direct: true, closure: closureOf(pkg.name), members: new Set([key]) });
  }
  const everywhere = new Set(['', ...workspaces.map((ws) => ws.key)]);
  for (const added of options.added ?? []) {
    packages.push({ ...added.pkg, layer: 'added', direct: true, closure: new Set(), scope: added.scope, added, members: everywhere });
    if (added.entry) packages.push({ ...added.entry, layer: 'added', direct: true, closure: new Set(), scope: added.scope, added, entry: true, members: everywhere });
  }

  // While a project moves from an earlier name of harnesspm, both copies may be installed. They ship the same harness, so
  // the current one wins (spec 10.1).
  if (packages.some((p) => p.name === PACKAGE_NAME)) {
    for (let i = packages.length - 1; i >= 0; i--) if (OLD_PACKAGE_NAMES.includes(packages[i]!.name) && packages[i]!.layer !== 'added') packages.splice(i, 1);
  }

  // Plugin names must be unique (spec 2.9). An entry shares its harness's name.
  const byPlugin = new Map<string, string>();
  for (const pkg of packages) {
    if (pkg.entry) continue;
    const other = byPlugin.get(pkg.plugin);
    if (other !== undefined) {
      throw new HarnessError(`${other} and ${pkg.name} both use the plugin name "${pkg.plugin}". Exclude one of them in ${CONFIG_FILE}.`);
    }
    byPlugin.set(pkg.plugin, pkg.name);
  }
  for (const pkg of packages) for (const problem of pkg.problems) warnings.push(`${pkg.name}: ${problem}`);

  // Overrides, lowest first: upstream packages, then downstream ones, then the project's harness, then harnesspm.json.
  const overrides: Override[] = [];
  const add = (from: ResolvedPackage | undefined, scope: Override['scope'], ext: Pick<ProjectConfig, 'exclude' | 'replace' | 'patch'>, baseDir: string): void => {
    const by = from?.name ?? CONFIG_FILE;
    const base = { by, ...(from ? { from } : {}), scope };
    for (const target of ext.exclude.filter(isUnitId)) overrides.push({ kind: 'exclude', target, ...base, order: overrides.length });
    for (const [target, file] of Object.entries(ext.replace)) overrides.push({ kind: 'replace', target, file: path.resolve(baseDir, file), ...base, order: overrides.length });
    for (const [target, file] of Object.entries(ext.patch)) overrides.push({ kind: 'patch', target, file: path.resolve(baseDir, file), ...base, order: overrides.length });
  };
  for (const pkg of packages.filter((p) => p.layer !== 'added')) add(pkg, pkg.closure, pkg.ext, pkg.harnessDir);
  add(undefined, 'all', config, projectDir);
  // Added harnesses sit above everything, so their changes reach every unit below them.
  for (const pkg of packages.filter((p) => p.layer === 'added')) add(pkg, 'all', pkg.ext, pkg.harnessDir);

  const overrideFiles = new Set(overrides.flatMap((o) => (o.file !== undefined ? [o.file] : [])));
  const inScope = (o: Override, pkgName: string): boolean => o.scope === 'all' || o.scope.has(pkgName);
  const appliesIn = (o: Override, key: string, owner: string): boolean =>
    o.scope === 'all' || o.from?.dir === projectDir || workspaceClosures.get(key)?.get(o.by)?.has(owner) === true;

  const allRules: { source: RuleSource; pkg: ResolvedPackage }[] = [];
  const allSkills: FinalSkill[] = [];
  const allDocs: FinalDocs[] = [];
  const allScripts: FinalScript[] = [];
  const allHooks: FinalHook[] = [];
  const allMcp: FinalMcp[] = [];
  const allPermissions: FinalPermissions[] = [];
  const allAgents: FinalAgent[] = [];
  // Docs of the project layer that a build writes: git ignores the folder, or it is not built yet (spec 2.7, rule 6).
  const builtDocs = new Set<string>();
  for (const pkg of packages) {
    const units = discoverUnits(pkg, overrideFiles);
    for (const source of units.rules) allRules.push({ source, pkg });
    for (const skill of units.skills) allSkills.push({ ...skill, pkg, original: skill.dir });
    const built = pkg.layer === 'project' && pkg.ext.docs !== undefined && (!units.docs || (gitIgnoresDir(units.docs.dir) && !gitIgnoresDir(pkg.dir)));
    if (built) builtDocs.add(`${pkg.plugin}:docs`);
    else if (units.docs) allDocs.push({ ...units.docs, pkg });
    const problems: string[] = [];
    const exec = discoverExecUnits(pkg, problems);
    for (const problem of problems) warnings.push(`${pkg.name}: ${problem}`);
    allScripts.push(...exec.scripts.map((u) => ({ ...u, pkg })));
    allHooks.push(...exec.hooks.map((u) => ({ ...u, pkg })));
    allMcp.push(...exec.mcp.map((u) => ({ ...u, pkg })));
    if (exec.permissions) allPermissions.push({ ...exec.permissions, pkg });
    allAgents.push(...exec.agents.map((u) => ({ ...u, pkg })));
  }

  const knownIds = new Map<string, string>();
  for (const { source, pkg } of allRules) knownIds.set(source.id, pkg.name);
  for (const skill of allSkills) knownIds.set(skill.id, skill.pkg.name);
  for (const docs of allDocs) knownIds.set(docs.id, docs.pkg.name);
  for (const unit of [...allScripts, ...allHooks, ...allMcp, ...allPermissions, ...allAgents]) knownIds.set(unit.id, unit.pkg.name);
  const addedNames = new Set(packages.filter((p) => p.layer === 'added').map((p) => p.name));
  for (const o of overrides) {
    const owner = knownIds.get(o.target);
    // Without the team layers, an added harness's change to a team unit has nothing to point at yet.
    if (owner === undefined && !team && addedNames.has(o.by)) continue;
    // Built docs of the project layer are never a unit, built or not, so excluding them changes nothing.
    if (owner === undefined && o.kind === 'exclude' && builtDocs.has(o.target)) continue;
    if (owner === undefined) warnings.push(`${o.by}: ${o.kind} names ${o.target}, which does not exist. It may have been renamed upstream.`);
    else if (!inScope(o, owner)) warnings.push(`${o.by}: ${o.kind} names ${o.target}, which ${o.by} does not pass on`);
    else if (o.kind === 'patch' && replaceable(o.target) !== 'rule') warnings.push(`${o.by}: patch works on rules only: ${o.target}`);
    else if (o.kind === 'replace' && replaceable(o.target) === undefined) warnings.push(`${o.by}: replace works on rules and skills only: ${o.target}. Exclude it and add a unit of your own instead.`);
    if (o.file !== undefined && !(o.kind === 'replace' ? replacementExists(o.target, o.file) : isFile(o.file))) {
      const skillFolder = o.kind === 'replace' && replaceable(o.target) === 'skill';
      warnings.push(`${o.by}: ${skillFolder ? 'replace needs a skill folder with a SKILL.md' : `${o.kind} file not found`}: ${relPosix(projectDir, o.file)}`);
    }
  }

  const excludedUnits: { id: string; by: string }[] = [];
  const excludedBy = (id: string, pkgName: string): Override | undefined =>
    overrides.find((o) => o.kind === 'exclude' && o.target === id && inScope(o, pkgName));

  // An entry's unit wins over a unit with the same ID in its own harness (spec 7.2).
  const entryIds = new Set(allRules.filter((r) => r.pkg.entry).map((r) => r.source.id));
  const rules: FinalRule[] = [];
  for (const { source, pkg } of allRules) {
    if (!pkg.entry && pkg.layer === 'added' && entryIds.has(source.id)) continue;
    const exclusion = excludedBy(source.id, pkg.name);
    if (exclusion) {
      excludedUnits.push({ id: source.id, by: exclusion.by });
      continue;
    }
    const relevant = overrides.filter((o) => o.kind !== 'exclude' && o.target === source.id && inScope(o, pkg.name) && isFile(o.file!));
    const variants = new Map<string, { members: Set<string>; replace?: Override; patches: Override[] }>();
    // Workspaces also inherit root rules. Apply only the overrides available in each workspace.
    for (const key of pkg.members.has('') ? everywhere : pkg.members) {
      const applicable = relevant.filter((o) => appliesIn(o, key, pkg.name));
      const replace = applicable.findLast((o) => o.kind === 'replace');
      const patches = applicable.filter((o) => {
        if (o.kind !== 'patch') return false;
        if (!replace || o.order > replace.order) return true;
        warnings.push(`${o.by}: the patch of ${source.id} is dropped, because ${replace.by} replaces the rule`);
        return false;
      });
      const signature = JSON.stringify([replace?.order, ...patches.map((o) => o.order)]);
      const variant = variants.get(signature) ?? { members: new Set<string>(), replace, patches };
      variant.members.add(key);
      variants.set(signature, variant);
    }
    for (const variant of variants.values()) {
      rules.push(resolveRule(source, pkg, variant.replace, variant.patches, variant.members, variants.size > 1));
    }
  }

  function resolveRule(source: RuleSource, pkg: ResolvedPackage, replace: Override | undefined, patchOverrides: Override[], members: Set<string>, variant: boolean): FinalRule {
    const from = replace?.file ?? source.file;
    let text = readText(from);
    const patches: AppliedPatch[] = [];
    for (const p of patchOverrides) {
      const patchName = relPosix(projectDir, p.file!);
      const result = applyPatch(text, readText(p.file!), patchName);
      text = result.text;
      warnings.push(...result.warnings);
      patches.push({ patch: patchName, by: p.by, sections: result.touched });
    }
    return {
      ...ruleMeta(text, source.name, from),
      id: source.id,
      name: source.name,
      pkg,
      original: source.file,
      source: from,
      text,
      ...(replace ? { replacedBy: replace } : {}),
      patches,
      members,
      variant,
    };
  }

  // Skills: a later package wins on the same name, with a warning (spec 2.9). The highest `replace` gives the folder.
  const skillsByName = new Map<string, FinalSkill>();
  for (const found of allSkills) {
    const exclusion = excludedBy(found.id, found.pkg.name);
    if (exclusion) {
      excludedUnits.push({ id: found.id, by: exclusion.by });
      continue;
    }
    const replacements = overrides.filter((o) => o.kind === 'replace' && o.target === found.id && inScope(o, found.pkg.name) && replacementExists(o.target, o.file!));
    const winners = new Map<Override | undefined, Set<string>>();
    for (const key of found.pkg.members) {
      const replace = replacements.findLast((o) => appliesIn(o, key, found.pkg.name));
      const keys = winners.get(replace) ?? new Set<string>();
      keys.add(key);
      winners.set(replace, keys);
    }
    let skill = found;
    if (winners.size > 1) {
      const details = [...winners].map(([replace, keys]) => `${replace ? `The replacement from ${replace.by}` : 'The original'} applies in ${describeMembers(keys)}.`);
      const replacementConflict = ['Keeping the original skill because its consumers resolve different versions.', ...details].join(' ');
      warnings.push(`${found.id}: ${replacementConflict}`);
      skill = { ...found, replacementConflict };
    } else {
      const replace = winners.keys().next().value;
      if (replace) skill = { ...found, dir: replace.file!, replacedBy: replace };
    }
    const previous = skillsByName.get(skill.name);
    if (previous && !(skill.pkg.entry && previous.pkg.plugin === skill.pkg.plugin)) warnings.push(`skill "${skill.name}" comes from ${previous.pkg.name} and ${skill.pkg.name}; using ${skill.pkg.name}`);
    skillsByName.set(skill.name, skill);
  }

  const docs: FinalDocs[] = [];
  for (const unit of allDocs) {
    const exclusion = excludedBy(unit.id, unit.pkg.name);
    if (exclusion) excludedUnits.push({ id: unit.id, by: exclusion.by });
    else docs.push(unit);
  }

  const keep = <T extends { id: string; pkg: ResolvedPackage }>(units: T[]): T[] =>
    units.filter((unit) => {
      const exclusion = excludedBy(unit.id, unit.pkg.name);
      if (exclusion) excludedUnits.push({ id: unit.id, by: exclusion.by });
      return !exclusion;
    });
  const scripts = keep(allScripts);
  const hooks = keep(allHooks).filter((hook) => {
    const ok = scripts.some((s) => s.pkg === hook.pkg && s.name === hook.run);
    if (!ok) warnings.push(`${hook.id} is dropped: its script ${hook.pkg.plugin}:${hook.run} is excluded or missing`);
    return ok;
  });
  const agentsByName = new Map<string, FinalAgent>();
  for (const agent of keep(allAgents)) {
    const previous = agentsByName.get(agent.name);
    if (previous && !(agent.pkg.entry && previous.pkg.plugin === agent.pkg.plugin)) warnings.push(`sub-agent "${agent.name}" comes from ${previous.pkg.name} and ${agent.pkg.name}; using ${agent.pkg.name}`);
    agentsByName.set(agent.name, agent);
  }

  return {
    projectDir,
    projectName,
    workspaces,
    config,
    packages,
    rules,
    skills: [...skillsByName.values()],
    docs,
    scripts,
    hooks,
    mcp: keep(allMcp),
    permissions: keep(allPermissions),
    agents: [...agentsByName.values()],
    overrides,
    excludedUnits,
    excludedPackages,
    warnings,
  };
}
