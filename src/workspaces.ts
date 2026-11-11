// Workspaces of a monorepo (spec 3.6): package.json "workspaces" or pnpm-workspace.yaml.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import { isFile, isRecord, readJsonIfExists, readTextIfExists } from './util.ts';

function patternsOf(projectDir: string): string[] {
  const pkg = readJsonIfExists(path.join(projectDir, 'package.json'));
  const field = isRecord(pkg) ? pkg['workspaces'] : undefined;
  const fromPackage = Array.isArray(field) ? field : isRecord(field) && Array.isArray(field['packages']) ? field['packages'] : [];
  const pnpmText = readTextIfExists(path.join(projectDir, 'pnpm-workspace.yaml'));
  const pnpm = pnpmText !== undefined ? (parse(pnpmText) as unknown) : undefined;
  const fromPnpm = isRecord(pnpm) && Array.isArray(pnpm['packages']) ? pnpm['packages'] : [];
  return [...fromPackage, ...fromPnpm].filter((p): p is string => typeof p === 'string');
}

function segmentRegex(segment: string): RegExp {
  return new RegExp(`^${segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
}

/** Folders that match a pattern such as `packages/*` or `apps/**`. */
function expand(root: string, pattern: string): string[] {
  const segments = pattern.replace(/^\.\//, '').replace(/\/$/, '').split('/').filter(Boolean);
  const found: string[] = [];
  const walk = (dir: string, index: number): void => {
    if (index === segments.length) {
      found.push(dir);
      return;
    }
    const segment = segments[index]!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = entries.filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'));
    if (segment === '**') {
      walk(dir, index + 1);
      for (const entry of dirs) walk(path.join(dir, entry.name), index);
      return;
    }
    const regex = segmentRegex(segment);
    for (const entry of dirs) if (regex.test(entry.name)) walk(path.join(dir, entry.name), index + 1);
  };
  walk(root, 0);
  return found;
}

/** Absolute folders of the workspaces, sorted, without the root. Empty for a single package. */
export function findWorkspaces(projectDir: string): string[] {
  const patterns = patternsOf(projectDir);
  const include = new Set<string>();
  for (const pattern of patterns.filter((p) => !p.startsWith('!'))) for (const dir of expand(projectDir, pattern)) include.add(dir);
  for (const pattern of patterns.filter((p) => p.startsWith('!'))) for (const dir of expand(projectDir, pattern.slice(1))) include.delete(dir);
  return [...include].filter((dir) => dir !== projectDir && isFile(path.join(dir, 'package.json'))).sort();
}
