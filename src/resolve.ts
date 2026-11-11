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
import { HarnessError, compareVersions, isFile, isRecord, readJsonIfExists, readText, realpath, relPosix } from './util.ts';

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
}

export interface ResolveOptions {
  /** Added harnesses to put on top, in order. */
  added?: AddedHarness[];
  /** Resolve the dependency and project layers. False when they are not installed or not used. */
  team?: boolean;
}

export interface Override {
  kind: 'exclude' | 'replace' | 'patch';
  target: string;
  /** Absolute path of the replacement or patch file. */
  file?: string;
  /** Who declared it: a package name or `harnesspm.json`. */
  by: string;
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
}

export interface FinalSkill extends SkillSource {
  pkg: ResolvedPackage;
}

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
  const edges = new Map<string, Set<string>>();
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
  const visit = (pkg: HarnessPackage, depth: number, excluded: Map<string, string>, stack: string[]): void => {
    const childExcluded = new Map(excluded);
    for (const name of pkg.ext.exclude.filter((e) => !isUnitId(e))) childExcluded.set(name, pkg.name);
    for (const name of pkg.ext.extends) {
      const by = childExcluded.get(name);
      if (by !== undefined) {
        excludedPackages.push({ name, by });
        continue;
      }
      const dir = resolvePackageDir(name, pkg.dir);
      if (!dir) {
        warnings.push(`${pkg.name} extends ${name}, which is not installed`);
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
      visit(child, depth + 1, childExcluded, [...stack, dir]);
    }
  };

  const rootExcluded = new Map(config.exclude.filter((e) => !isUnitId(e)).map((name) => [name, CONFIG_FILE] as const));
  for (const name of team ? dependencyNames(pkgJson) : []) {
    if (rootExcluded.has(name)) {
      excludedPackages.push({ name, by: CONFIG_FILE });
      continue;
    }
    const dir = resolvePackageDir(name, projectDir);
    if (!dir) continue;
    const pkg = load(dir, 'dependencies');
    if (!pkg) continue;
    addOccurrence(name, { dir, depth: 0, direct: true });
    visit(pkg, 0, rootExcluded, [dir]);
  }

  const projectHarness = team ? loadHarnessPackage(projectDir, 'project') : undefined;
  if (projectHarness) {
    projectHarness.name = projectName;
    visit(projectHarness, 0, rootExcluded, [projectDir]);
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

  const packages: ResolvedPackage[] = order.map((name) => {
    const { pkg, occurrence } = chosen.get(name)!;
    return {
      ...pkg,
      direct: occurrence.direct,
      ...(occurrence.via !== undefined ? { via: occurrence.via } : {}),
      closure: closureOf(name),
    };
  });
  if (projectHarness) packages.push({ ...projectHarness, direct: true, closure: closureOf(projectName) });
  for (const added of options.added ?? []) {
    packages.push({ ...added.pkg, layer: 'added', direct: true, closure: new Set(), scope: added.scope, added });
    if (added.entry) packages.push({ ...added.entry, layer: 'added', direct: true, closure: new Set(), scope: added.scope, added, entry: true });
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
  const add = (by: string, scope: Override['scope'], exclude: string[], replace: Record<string, string>, patch: Record<string, string>, baseDir: string): void => {
    for (const target of exclude.filter(isUnitId)) overrides.push({ kind: 'exclude', target, by, order: overrides.length, scope });
    for (const [target, file] of Object.entries(replace)) overrides.push({ kind: 'replace', target, file: path.resolve(baseDir, file), by, order: overrides.length, scope });
    for (const [target, file] of Object.entries(patch)) overrides.push({ kind: 'patch', target, file: path.resolve(baseDir, file), by, order: overrides.length, scope });
  };
  for (const pkg of packages.filter((p) => p.layer !== 'added')) add(pkg.name, pkg.closure, pkg.ext.exclude, pkg.ext.replace, pkg.ext.patch, pkg.harnessDir);
  add(CONFIG_FILE, 'all', config.exclude, config.replace, config.patch, projectDir);
  // Added harnesses sit above everything, so their changes reach every unit below them.
  for (const pkg of packages.filter((p) => p.layer === 'added')) add(pkg.name, 'all', pkg.ext.exclude, pkg.ext.replace, pkg.ext.patch, pkg.harnessDir);

  const overrideFiles = new Set(overrides.flatMap((o) => (o.file !== undefined ? [o.file] : [])));
  const inScope = (o: Override, pkgName: string): boolean => o.scope === 'all' || o.scope.has(pkgName);

  const allRules: { source: RuleSource; pkg: ResolvedPackage }[] = [];
  const allSkills: FinalSkill[] = [];
  const allDocs: FinalDocs[] = [];
  const allScripts: FinalScript[] = [];
  const allHooks: FinalHook[] = [];
  const allMcp: FinalMcp[] = [];
  const allPermissions: FinalPermissions[] = [];
  const allAgents: FinalAgent[] = [];
  for (const pkg of packages) {
    const units = discoverUnits(pkg, overrideFiles);
    for (const source of units.rules) allRules.push({ source, pkg });
    for (const skill of units.skills) allSkills.push({ ...skill, pkg });
    if (units.docs) allDocs.push({ ...units.docs, pkg });
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
    if (owner === undefined) warnings.push(`${o.by}: ${o.kind} names ${o.target}, which does not exist. It may have been renamed upstream.`);
    else if (!inScope(o, owner)) warnings.push(`${o.by}: ${o.kind} names ${o.target}, which ${o.by} does not pass on`);
    else if (o.kind !== 'exclude' && !o.target.includes(':rules/')) warnings.push(`${o.by}: ${o.kind} works on rules only: ${o.target}`);
    if (o.file !== undefined && !isFile(o.file)) warnings.push(`${o.by}: ${o.kind} file not found: ${relPosix(projectDir, o.file)}`);
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
    const relevant = overrides.filter((o) => o.target === source.id && inScope(o, pkg.name) && (o.file === undefined || isFile(o.file)));
    const replace = relevant.filter((o) => o.kind === 'replace').at(-1);
    const from = replace?.file ?? source.file;
    let text = readText(from);
    const patches: AppliedPatch[] = [];
    for (const p of relevant.filter((o) => o.kind === 'patch')) {
      if (replace && p.order < replace.order) {
        warnings.push(`${p.by}: the patch of ${source.id} is dropped, because ${replace.by} replaces the rule`);
        continue;
      }
      const patchName = relPosix(projectDir, p.file!);
      const result = applyPatch(text, readText(p.file!), patchName);
      text = result.text;
      warnings.push(...result.warnings);
      patches.push({ patch: patchName, by: p.by, sections: result.touched });
    }
    rules.push({
      ...ruleMeta(text, source.name, from),
      id: source.id,
      name: source.name,
      pkg,
      original: source.file,
      source: from,
      text,
      ...(replace ? { replacedBy: replace } : {}),
      patches,
    });
  }

  // Skills: a later package wins on the same name, with a warning (spec 2.9).
  const skillsByName = new Map<string, FinalSkill>();
  for (const skill of allSkills) {
    const exclusion = excludedBy(skill.id, skill.pkg.name);
    if (exclusion) {
      excludedUnits.push({ id: skill.id, by: exclusion.by });
      continue;
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
