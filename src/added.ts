// Added harnesses: sources, scopes and project entries (spec chapter 7).
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { harnesspmHome } from './homes.ts';
import { loadHarnessPackage, NS, parseExtension, type HarnessPackage } from './manifest.ts';
import { HarnessError, NPX_ANY, ensureDir, isDir, isFile, isRecord, readJson, readJsonIfExists } from './util.ts';

export type Scope = 'user' | 'local';
export type SourceKind = 'git' | 'folder' | 'npm';

export const LOCAL_FILE = 'harnesspm.local.json';

export function userConfigFile(): string {
  return path.join(harnesspmHome(), 'config.json');
}

export function configFileFor(scope: Scope, projectDir: string): string {
  return scope === 'user' ? userConfigFile() : path.join(projectDir, LOCAL_FILE);
}

export function readList(file: string): string[] {
  const raw = readJsonIfExists(file);
  if (raw === undefined) return [];
  if (!isRecord(raw) || (raw['harnesses'] !== undefined && !Array.isArray(raw['harnesses']))) {
    throw new HarnessError(`${file}: "harnesses" must be an array of sources`);
  }
  return ((raw['harnesses'] as unknown[] | undefined) ?? []).filter((s): s is string => typeof s === 'string');
}

export function writeList(file: string, list: string[]): void {
  const raw = readJsonIfExists(file);
  const data = isRecord(raw) ? raw : {};
  data['harnesses'] = list;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export interface Source {
  /** As the person wrote it, normalized for folders to an absolute path. */
  spec: string;
  kind: SourceKind;
  /** Git URL or npm package name. */
  location: string;
  /** The harness package root on this machine. */
  dir: string;
  editable: boolean;
}

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

function slug(text: string): string {
  return text.replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '-');
}

export function parseSource(spec: string, cwd = process.cwd()): Source {
  if (spec.startsWith('github:')) {
    const repo = spec.slice('github:'.length).replace(/\.git$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new HarnessError(`Use github:<owner>/<repo>, not ${spec}`);
    return { spec, kind: 'git', location: `https://github.com/${repo}.git`, dir: path.join(harnesspmHome(), 'harnesses', slug(repo)), editable: true };
  }
  if (spec.startsWith('git:')) {
    const url = spec.slice('git:'.length);
    const parts = url.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).slice(-2);
    return { spec, kind: 'git', location: url, dir: path.join(harnesspmHome(), 'harnesses', slug(parts.join('/'))), editable: true };
  }
  if (spec.startsWith('npm:')) {
    const name = spec.slice('npm:'.length);
    return { spec, kind: 'npm', location: name, dir: path.join(harnesspmHome(), 'cache', slug(name.replace(/@[^@/]*$/, '')), 'package'), editable: false };
  }
  const dir = path.resolve(cwd, expandHome(spec));
  return { spec: dir, kind: 'folder', location: dir, dir, editable: true };
}

function run(cmd: string, args: string[], cwd?: string): { ok: boolean; out: string } {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

/** Puts the source on this machine. Returns a note for the person. */
export function fetchSource(source: Source): string | undefined {
  if (source.kind === 'folder') {
    if (!isDir(source.dir)) throw new HarnessError(`Folder not found: ${source.dir}`);
    return undefined;
  }
  if (source.kind === 'git') {
    if (isDir(path.join(source.dir, '.git'))) return undefined;
    ensureDir(path.dirname(source.dir));
    const result = run('git', ['clone', '--quiet', source.location, source.dir]);
    if (!result.ok) throw new HarnessError(`git clone ${source.location} failed: ${result.out}`);
    return `cloned ${source.location} into ${source.dir}`;
  }
  return fetchNpm(source);
}

function fetchNpm(source: Source): string {
  const cache = path.dirname(source.dir);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-npm-'));
  const packed = run('npm', ['pack', source.location, '--silent', '--pack-destination', tmp]);
  if (!packed.ok) throw new HarnessError(`npm pack ${source.location} failed: ${packed.out}`);
  const tarball = path.join(tmp, packed.out.split('\n').pop()!.trim());
  fs.rmSync(cache, { recursive: true, force: true });
  ensureDir(cache);
  const extracted = run('tar', ['-xzf', tarball, '-C', cache]);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!extracted.ok) throw new HarnessError(`Cannot unpack ${source.location}: ${extracted.out}`);
  return `fetched ${source.location} into ${cache}`;
}

/** Brings a source up to date. Never changes a working copy with local work (spec 8.7). */
export function updateSource(source: Source): string {
  if (source.kind === 'folder') return `${source.spec}: a folder, used as it is`;
  if (source.kind === 'npm') return fetchNpm(source);
  if (!isDir(path.join(source.dir, '.git'))) {
    fetchSource(source);
    return `${source.spec}: cloned`;
  }
  const dirty = run('git', ['status', '--porcelain'], source.dir);
  if (dirty.out !== '') return `${source.spec}: skipped, the working copy has uncommitted changes`;
  const ahead = run('git', ['rev-list', '--count', '@{upstream}..HEAD'], source.dir);
  if (ahead.ok && ahead.out !== '0') return `${source.spec}: skipped, the working copy has ${ahead.out} unpushed commits`;
  const pulled = run('git', ['pull', '--quiet', '--ff-only'], source.dir);
  return pulled.ok ? `${source.spec}: up to date` : `${source.spec}: pull failed: ${pulled.out}`;
}

/** `<host>/<path>` of a repository's `origin` remote, without `.git`, for SSH and HTTPS URLs. */
export function remoteKey(projectDir: string): string | undefined {
  const result = run('git', ['remote', 'get-url', 'origin'], projectDir);
  if (!result.ok || result.out === '') return undefined;
  return normalizeRemote(result.out);
}

export function normalizeRemote(url: string): string {
  let rest = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const scp = /^[^@/]+@([^:/]+):(.+)$/.exec(rest);
  if (scp) return `${scp[1]}/${scp[2]!.replace(/^\/+/, '')}`;
  rest = rest.replace(/^[a-z+]+:\/\//i, '').replace(/^[^@/]+@/, '');
  const [hostPort, ...segments] = rest.split('/');
  return [hostPort!.replace(/:\d+$/, ''), ...segments].join('/');
}

export interface AddedHarness {
  source: Source;
  scope: Scope;
  pkg: HarnessPackage;
  /** This harness's entry for the current repository, as a package with the harness's plugin name. */
  entry?: HarnessPackage;
}

function loadEntry(pkg: HarnessPackage, key: string | undefined): HarnessPackage | undefined {
  if (key === undefined) return undefined;
  const rel = pkg.ext.projects[key];
  if (rel === undefined) return undefined;
  const dir = path.resolve(pkg.harnessDir, rel);
  if (!isDir(dir)) return undefined;
  // An entry has the layout of harness/. Its optional plugin.json uses the harness's name and holds overrides.
  const manifest = path.join(dir, 'plugin.json');
  const raw = isFile(manifest) ? readJson(manifest) : {};
  const data = isRecord(raw) ? raw : {};
  if (data['name'] !== undefined && data['name'] !== pkg.plugin) {
    throw new HarnessError(`${manifest}: "name" must be "${pkg.plugin}", the name of its harness`);
  }
  const problems: string[] = [];
  const ext = parseExtension(data, problems);
  return { ...pkg, name: `${pkg.name} (entry ${key})`, dir, harnessDir: dir, ext: { ...ext, projects: {} }, problems };
}

/** Added harnesses in order: user scope first, then local scope, each as listed. */
export function loadAdded(projectDir: string | undefined, warnings: string[]): AddedHarness[] {
  const result: AddedHarness[] = [];
  const key = projectDir !== undefined ? remoteKey(projectDir) : undefined;
  const scopes: Scope[] = projectDir !== undefined ? ['user', 'local'] : ['user'];
  for (const scope of scopes) {
    for (const spec of readList(configFileFor(scope, projectDir ?? ''))) {
      const source = parseSource(spec);
      if (!isFile(path.join(source.dir, 'harness', 'plugin.json'))) {
        warnings.push(`${spec} is not on this machine yet. Run \`${NPX_ANY} update\`.`);
        continue;
      }
      const pkg = loadHarnessPackage(source.dir, 'added')!;
      if (pkg.name === path.basename(source.dir)) pkg.name = spec;
      const entry = loadEntry(pkg, key);
      result.push({ source, scope, pkg, ...(entry ? { entry } : {}) });
    }
  }
  return result;
}

// Moved to light modules, so `harnesspm track` can load them without the rest (spec 14.4).
export { harnesspmHome } from './homes.ts';
export { caller, type Caller } from './util.ts';

export const RULES_DIR = path.join(NS, 'rules');
