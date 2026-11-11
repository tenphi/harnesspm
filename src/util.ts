import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** An error that the CLI prints without a stack trace. */
export class HarnessError extends Error {}

export function exists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function readTextIfExists(file: string): string | undefined {
  return isFile(file) ? readText(file) : undefined;
}

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    throw new HarnessError(`Cannot read ${file}: ${(error as Error).message}`);
  }
}

export function readJsonIfExists(file: string): unknown {
  return isFile(file) ? readJson(file) : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hash(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** A forward-slash path, for outputs that must be the same on every machine. */
export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function relPosix(from: string, to: string): string {
  return toPosix(path.relative(from, to)) || '.';
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Writes a file only when its content changes. Returns true when it wrote. */
export function writeIfChanged(file: string, content: string): boolean {
  if (readTextIfExists(file) === content) return false;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
  return true;
}

/** Creates or updates a relative symbolic link. Returns true when it changed the link. */
export function linkIfChanged(linkPath: string, target: string): boolean {
  const relTarget = path.relative(path.dirname(linkPath), target) || '.';
  try {
    if (fs.lstatSync(linkPath).isSymbolicLink() && fs.readlinkSync(linkPath) === relTarget) return false;
    fs.rmSync(linkPath, { recursive: false, force: true });
  } catch {
    // The link does not exist yet.
  }
  ensureDir(path.dirname(linkPath));
  fs.symlinkSync(relTarget, linkPath, 'dir');
  return true;
}

export function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function realpath(p: string): string {
  return fs.realpathSync(p);
}

/** Compares versions like 1.2.10 and 1.10.0 by their numeric parts. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/);
  const pb = b.split(/[.+-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== '') {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** The file that holds this clone's git excludes, or undefined outside a git repository. */
export function gitExcludeFile(projectDir: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: projectDir, encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  const p = result.stdout.trim();
  return path.isAbsolute(p) ? p : path.join(projectDir, p);
}

export function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}
