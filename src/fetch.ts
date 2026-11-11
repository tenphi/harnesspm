// harnesspm fetch: the harness packages in the lock, without an install (spec 4.2, 13.6).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readLock } from './lock.ts';
import { computePlan, STATE_DIR } from './outputs.ts';
import { extractBlock } from './render.ts';
import { resolve, resolvePackageDir } from './resolve.ts';
import { HarnessError, ensureDir, isRecord, linkIfChanged, readJsonIfExists, readTextIfExists, writeIfChanged } from './util.ts';

export interface FetchReport {
  fetched: string[];
  reused: string[];
  warnings: string[];
}

function sri(file: string, algorithm: string): string {
  return `${algorithm}-${createHash(algorithm).update(fs.readFileSync(file)).digest('base64')}`;
}

function installedVersion(dir: string): string | undefined {
  const pkg = readJsonIfExists(path.join(dir, 'package.json'));
  return isRecord(pkg) && typeof pkg['version'] === 'string' ? pkg['version'] : undefined;
}

/** Downloads one package with npm, checks its integrity and unpacks it. Never runs its code. */
function download(projectDir: string, name: string, spec: string, integrity: string | undefined, target: string): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-fetch-'));
  try {
    const packSpec = spec.startsWith('file:') ? path.resolve(projectDir, spec.slice('file:'.length)) : spec;
    const packed = spawnSync('npm', ['pack', packSpec, '--silent', '--ignore-scripts', '--pack-destination', tmp], { cwd: projectDir, encoding: 'utf8' });
    if (packed.status !== 0) throw new HarnessError(`Cannot download ${name} (${spec}): ${packed.stderr.trim()}`);
    const tarball = path.join(tmp, packed.stdout.trim().split('\n').pop()!.trim());
    if (integrity !== undefined) {
      const algorithm = integrity.split('-')[0]!;
      const actual = sri(tarball, algorithm);
      if (actual !== integrity) throw new HarnessError(`${name}: the downloaded tarball does not match the integrity in the lock`);
    }
    const unpacked = path.join(tmp, 'unpacked');
    ensureDir(unpacked);
    const tar = spawnSync('tar', ['-xzf', tarball, '-C', unpacked], { encoding: 'utf8' });
    if (tar.status !== 0) throw new HarnessError(`Cannot unpack ${name}: ${tar.stderr.trim()}`);
    fs.rmSync(target, { recursive: true, force: true });
    ensureDir(path.dirname(target));
    fs.renameSync(path.join(unpacked, 'package'), target);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function fetchLocked(projectDir: string): FetchReport {
  const lock = readLock(projectDir);
  if (!lock) throw new HarnessError('No harnesspm.lock.json here. Run `npx harnesspm sync` where the dependencies are installed, and commit the lock.');
  const report: FetchReport = { fetched: [], reused: [], warnings: [] };
  const located = new Map<string, string>();
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (entry.project) continue;
    const installed = resolvePackageDir(name, projectDir);
    if (installed && installedVersion(installed) === entry.version) {
      located.set(name, installed);
      report.reused.push(name);
      continue;
    }
    const target = path.join(projectDir, STATE_DIR, 'fetched', name);
    if (installedVersion(target) !== entry.version) {
      const spec = entry.resolved ?? `${name}@${entry.version}`;
      if (entry.integrity === undefined) report.warnings.push(`${name}: the lock has no integrity, so the download is not checked`);
      download(projectDir, name, spec, entry.integrity, target);
      report.fetched.push(`${name} ${entry.version}`);
    } else report.reused.push(name);
    located.set(name, target);
  }

  // Stable paths and generated files (docs indexes, patched rules), so the committed pointers work.
  const team = resolve(projectDir, { locate: (name) => located.get(name) });
  report.warnings.push(...team.warnings);
  const plan = computePlan(team, team);
  const agents = readTextIfExists(path.join(projectDir, 'AGENTS.md'));
  if (extractBlock(agents) !== extractBlock(plan.committed!.agentsMd)) report.warnings.push('AGENTS.md does not match the packages in the lock. Run `npx harnesspm sync` where the dependencies are installed.');
  // Only files under node_modules/.harnesspm: a job without an install needs no agent settings.
  const state = path.join(projectDir, STATE_DIR) + path.sep;
  for (const root of plan.generatedRoots) if (root.startsWith(state)) fs.rmSync(root, { recursive: true, force: true });
  for (const [file, content] of plan.generated) if (file.startsWith(state)) writeIfChanged(file, content);
  for (const [link, target] of plan.links) if (link.startsWith(path.join(state, 'pkgs') + path.sep)) linkIfChanged(link, target);
  return report;
}
