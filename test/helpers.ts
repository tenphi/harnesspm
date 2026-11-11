import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
export const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

export function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const homes = new Map<string, string>();

/** The home folder that the CLI sees for a project, so tests never touch the real one. */
export function homeOf(dir: string): string {
  for (const [project, home] of homes) if (dir === project || dir.startsWith(project + path.sep)) return home;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-home-'));
  homes.set(dir, home);
  return home;
}

/** A project folder with a git repository, a package.json and, unless `usesHarnesspm` is false, a harnesspm.json. */
export function project(deps: Record<string, string> = {}, extra: Record<string, unknown> = {}, usesHarnesspm = true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-test-'));
  homeOf(dir);
  writeFiles(dir, { 'package.json': `${JSON.stringify({ name: 'app', version: '1.0.0', devDependencies: deps, ...extra }, null, 2)}\n` });
  if (usesHarnesspm) writeFiles(dir, { 'harnesspm.json': '{}\n' });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

export interface PackageSpec {
  plugin: string;
  version?: string;
  ext?: Record<string, unknown>;
  /** Files inside harness/, such as "dev.harnesspm/rules/forms.md". */
  harness?: Record<string, string>;
  /** Other files in the package root, such as "docs/intro.md". */
  files?: Record<string, string>;
  repository?: string;
}

/** Writes an installed package into `<base>/node_modules/<name>`. */
export function installPackage(base: string, name: string, spec: PackageSpec): string {
  const dir = path.join(base, 'node_modules', name);
  const manifest: Record<string, unknown> = { $schema: PLUGIN_SCHEMA, name: spec.plugin };
  if (spec.ext) manifest['extensions'] = { 'dev.harnesspm': spec.ext };
  writeFiles(dir, {
    'package.json': JSON.stringify({ name, version: spec.version ?? '1.0.0', ...(spec.repository ? { repository: spec.repository } : {}) }),
    'harness/plugin.json': JSON.stringify(manifest, null, 2),
    ...Object.fromEntries(Object.entries(spec.harness ?? {}).map(([k, v]) => [`harness/${k}`, v])),
    ...(spec.files ?? {}),
  });
  return dir;
}

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI as a person, with its own home folder. */
export function run(cwd: string, ...args: string[]): RunResult {
  return runWith(cwd, {}, ...args);
}

export function runWith(cwd: string, env: Record<string, string>, ...args: string[]): RunResult {
  const home = homeOf(cwd);
  const clean: Record<string, string | undefined> = { ...process.env, CI: '', AI_AGENT: '', CLAUDECODE: '', HOME: home };
  for (const key of ['HARNESSPM_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME']) delete clean[key];
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...clean, ...env } });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

export function isLink(root: string, rel: string): boolean {
  try {
    return fs.lstatSync(path.join(root, rel)).isSymbolicLink();
  } catch {
    return false;
  }
}

export const skill = (name: string, description = `Does ${name}. Use when testing.`): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nSteps for ${name}.\n`;
