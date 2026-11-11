// harnesspm.lock.json (spec 6.3). The lock holds no per-machine state.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Resolution } from './resolve.ts';
import { hash, isFile, isRecord, readJsonIfExists, readText, relPosix } from './util.ts';

export const LOCK_FILE = 'harnesspm.lock.json';

export interface LockPackage {
  version: string;
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

function packageLockEntry(projectDir: string, name: string): { resolved?: string; integrity?: string } {
  const lock = readJsonIfExists(path.join(projectDir, 'package-lock.json'));
  if (!isRecord(lock) || !isRecord(lock['packages'])) return {};
  const entry = lock['packages'][`node_modules/${name}`];
  if (!isRecord(entry)) return {};
  return {
    ...(typeof entry['resolved'] === 'string' ? { resolved: entry['resolved'] } : {}),
    ...(typeof entry['integrity'] === 'string' ? { integrity: entry['integrity'] } : {}),
  };
}

export function buildLock(res: Resolution, previous: Lock | undefined): Lock {
  const packages: Record<string, LockPackage> = {};
  for (const pkg of res.packages) {
    if (pkg.layer === 'project') {
      packages[pkg.name] = { version: pkg.version, plugin: pkg.plugin, project: true };
      continue;
    }
    const entry: LockPackage = { version: pkg.version, plugin: pkg.plugin, ...packageLockEntry(res.projectDir, pkg.name) };
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
  return { lockfileVersion: 1, packages: sortKeys(packages), units: sortKeys(units), patches: sortKeys(patches) };
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export function serializeLock(lock: Lock): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
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
