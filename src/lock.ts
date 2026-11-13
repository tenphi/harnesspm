// harnesspm.lock.json (spec 6.3). The lock holds no per-machine state.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import type { Resolution } from './resolve.ts';
import type { Send } from './telemetry.ts';
import { hash, isFile, isRecord, readJsonIfExists, readText, readTextIfExists, relPosix } from './util.ts';

export const LOCK_FILE = 'harnesspm.lock.json';

export interface LockPackage {
  /** Left out for the project's own harness: a release would change it, and unit hashes already show every change. */
  version?: string;
  plugin: string;
  project?: true;
  resolved?: string;
  integrity?: string;
  approved?: string;
}

export interface Lock {
  lockfileVersion: 1;
  packages: Record<string, LockPackage>;
  units: Record<string, { kind: string; hash: string }>;
  /** Rule ID → patch file → section heading → hash of the section the patch changes. */
  patches: Record<string, Record<string, Record<string, string>>>;
  /** The telemetry handler that a person's sync recorded (spec 14.5). */
  telemetry?: { send: Send };
}

function hashDir(dir: string): string {
  const parts: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) parts.push(`${relPosix(dir, full)}\n${readText(full)}`);
    }
  };
  walk(dir);
  return hash(parts.join('\n\0\n'));
}

/** Where a package's tarball comes from, as the package manager's lockfile records it. */
export interface Origin {
  resolved?: string;
  integrity?: string;
}

const origin = (resolved: unknown, integrity: unknown): Origin => ({
  ...(typeof resolved === 'string' && resolved !== '' ? { resolved } : {}),
  ...(typeof integrity === 'string' && integrity !== '' ? { integrity } : {}),
});

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** package-lock.json (lockfile 2 and 3): `packages["…node_modules/<name>"]`. */
function fromPackageLock(text: string, name: string, version: string): Origin | undefined {
  const lock = JSON.parse(text) as unknown;
  if (!isRecord(lock) || !isRecord(lock['packages'])) return undefined;
  for (const [key, entry] of Object.entries(lock['packages'])) {
    if (!isRecord(entry) || entry['version'] !== version || (key !== `node_modules/${name}` && !key.endsWith(`/node_modules/${name}`))) continue;
    return origin(entry['resolved'], entry['integrity']);
  }
  return undefined;
}

/**
 * pnpm-lock.yaml (lockfile 6 and 9): `packages["<name>@<version>"].resolution`, with `integrity` and, outside the
 * registry, `tarball`. Only the entries of `name` are parsed, because a large lockfile takes long to parse whole.
 */
function fromPnpmLock(text: string, name: string, version: string): Origin | undefined {
  const entries = new RegExp(`^ {2}['"]?/?${escapeRegExp(name)}@([^\n]*?)['"]?:\n((?: {4}[^\n]*\n?)*)`, 'gm');
  for (const [, ref, body] of text.matchAll(entries)) {
    const entry = parse(body!.replace(/^ {4}/gm, '')) as unknown;
    if (!isRecord(entry) || !isRecord(entry['resolution'])) continue;
    // A peer suffix such as `(react@18.3.1)` follows the version. A `file:` entry keeps its version in `version`.
    const entryVersion = typeof entry['version'] === 'string' ? entry['version'] : ref!.replace(/\(.*$/, '');
    if (entryVersion !== version) continue;
    return origin(entry['resolution']['tarball'], entry['resolution']['integrity']);
  }
  return undefined;
}

/** Yarn 1 yarn.lock: blocks headed by one or more `"<name>@<range>"`, with `version`, `resolved` and `integrity`. */
function fromYarnLock(text: string, name: string, version: string): Origin | undefined {
  if (!text.includes('# yarn lockfile v1')) return undefined;
  for (const block of text.split(/\n\s*\n/)) {
    const [header, ...fields] = block.split('\n');
    if (header === undefined || !header.endsWith(':') || /^[\s#]/.test(header)) continue;
    const names = header.slice(0, -1).split(/,\s*/).map((spec) => spec.replace(/^"|"$/g, '')).map((spec) => spec.slice(0, spec.lastIndexOf('@')));
    if (!names.includes(name)) continue;
    const field = (key: string): string | undefined => {
      for (const line of fields) {
        const match = new RegExp(`^ {2}${key} "?([^"]*)"?$`).exec(line);
        if (match) return match[1];
      }
      return undefined;
    };
    if (field('version') !== version) continue;
    return origin(field('resolved')?.replace(/#.*$/, ''), field('integrity'));
  }
  return undefined;
}

/**
 * Looks up a package's tarball URL and integrity in the project's package-manager lockfiles: package-lock.json,
 * pnpm-lock.yaml or Yarn 1's yarn.lock (spec 6.3). Each file is read once, when it is first needed.
 */
export function packageManagerLock(projectDir: string): (name: string, version: string) => Origin {
  const readers: [string, typeof fromPackageLock][] = [
    ['package-lock.json', fromPackageLock],
    ['pnpm-lock.yaml', fromPnpmLock],
    ['yarn.lock', fromYarnLock],
  ];
  const texts = new Map<string, string | undefined>();
  return (name, version) => {
    for (const [file, read] of readers) {
      if (!texts.has(file)) texts.set(file, readTextIfExists(path.join(projectDir, file)));
      const text = texts.get(file);
      if (text === undefined) continue;
      try {
        const found = read(text, name, version);
        if (found !== undefined) return found;
      } catch {
        // A lockfile that does not parse gives nothing; fetch then says the download is not checked.
      }
    }
    return {};
  };
}

/** `telemetry` is the handler to record: harnesspm.json's for a person's sync, the previous one for a model run (spec 14.5). */
export function buildLock(res: Resolution, previous: Lock | undefined, telemetry?: Send): Lock {
  const packages: Record<string, LockPackage> = {};
  const lookup = packageManagerLock(res.projectDir);
  for (const pkg of res.packages) {
    if (pkg.layer === 'project') {
      packages[pkg.name] = { plugin: pkg.plugin, project: true };
      continue;
    }
    const entry: LockPackage = { version: pkg.version, plugin: pkg.plugin, ...lookup(pkg.name, pkg.version) };
    if (res.config.trust[pkg.name] === 'pin') {
      const approved = previous?.packages[pkg.name]?.approved;
      entry.approved = approved ?? pkg.version;
    }
    packages[pkg.name] = entry;
  }
  const units: Lock['units'] = {};
  for (const rule of res.rules) units[rule.id] = { kind: 'rules', hash: hash(rule.text) };
  for (const skill of res.skills) units[skill.id] = { kind: 'skills', hash: hashDir(skill.dir) };
  for (const docs of res.docs) units[docs.id] = { kind: 'docs', hash: hashDir(docs.dir) };
  for (const script of res.scripts) units[script.id] = { kind: 'scripts', hash: isFile(script.file) ? hash(readText(script.file)) : 'missing' };
  for (const hook of res.hooks) units[hook.id] = { kind: 'hooks', hash: hash(JSON.stringify([hook.event, hook.matchers, hook.run, hook.timeout ?? null])) };
  for (const server of res.mcp) units[server.id] = { kind: 'mcp', hash: hash(JSON.stringify(server.config)) };
  for (const perms of res.permissions) units[perms.id] = { kind: 'permissions', hash: hash(JSON.stringify([perms.deny, perms.ask])) };
  for (const agent of res.agents) units[agent.id] = { kind: 'agents', hash: hash(readText(agent.file)) };
  const patches: Lock['patches'] = {};
  for (const rule of res.rules) {
    for (const applied of rule.patches) {
      if (applied.sections.length === 0) continue;
      const byPatch = (patches[rule.id] ??= {});
      byPatch[applied.patch] = Object.fromEntries(applied.sections.map((s) => [s.heading, s.hash]));
    }
  }
  return { lockfileVersion: 1, packages: sortKeys(packages), units: sortKeys(units), patches: sortKeys(patches), ...(telemetry !== undefined ? { telemetry: { send: telemetry } } : {}) };
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export function serializeLock(lock: Lock): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

/**
 * Whether the lock text on disk records the same as `expected`. A lock that harnesspm 0.3 wrote, with the
 * project's own version, still counts as up to date; the next sync drops the version.
 */
export function sameLock(text: string | undefined, expected: string): boolean {
  if (text === expected) return true;
  try {
    const lock = JSON.parse(text ?? '') as unknown;
    if (!isRecord(lock) || !isRecord(lock['packages']) || `${JSON.stringify(lock, null, 2)}\n` !== text) return false;
    for (const entry of Object.values(lock['packages'])) if (isRecord(entry) && entry['project'] === true) delete entry['version'];
    return `${JSON.stringify(lock, null, 2)}\n` === expected;
  } catch {
    return false;
  }
}

export function readLock(projectDir: string): Lock | undefined {
  const raw = readJsonIfExists(path.join(projectDir, LOCK_FILE));
  if (!isRecord(raw) || raw['lockfileVersion'] !== 1) return undefined;
  return raw as unknown as Lock;
}

/** Warnings for upstream changes to sections that a patch replaces or removes (spec 3.4). */
export function patchDrift(previous: Lock | undefined, next: Lock): string[] {
  if (!previous) return [];
  const warnings: string[] = [];
  for (const [ruleId, byPatch] of Object.entries(next.patches)) {
    for (const [patch, sections] of Object.entries(byPatch)) {
      for (const [heading, sectionHash] of Object.entries(sections)) {
        const before = previous.patches[ruleId]?.[patch]?.[heading];
        if (before !== undefined && before !== sectionHash) {
          warnings.push(`${ruleId}: upstream changed the section "${heading}" that ${patch} changes. Check that the patch is still right.`);
        }
      }
    }
  }
  return warnings;
}
