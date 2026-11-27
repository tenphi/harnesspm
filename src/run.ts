// harnesspm run and harnesspm mcp (spec 5.1, 5.3).
import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { harnesspmHome } from './added.ts';
import { trustOf } from './exec-outputs.ts';
import { readLock } from './lock.ts';
import type { Resolution, ResolvedPackage } from './resolve.ts';
import { commandCaller, outsideField, readIndex, readTelemetryState, runOutcome, sendEvent, type EventType } from './telemetry.ts';
import { HarnessError, NPX_ANY, agentOf, ensureDir, isFile } from './util.ts';

/** Thrown when the runner refuses a script. The CLI exits with code 2 (spec 10.4). */
export class Refused extends HarnessError {}

function parseRef(ref: string): { plugin: string; name: string } {
  const index = ref.indexOf(':');
  if (index <= 0 || index === ref.length - 1) throw new HarnessError(`Use <plugin>:<name>, not "${ref}"`);
  return { plugin: ref.slice(0, index), name: ref.slice(index + 1) };
}

/** Checks trust and the installed version (spec 5.1, step 2). */
function checkPackage(pkg: ResolvedPackage, res: Resolution, what: string): void {
  const lock = readLock(res.projectDir);
  const trust = trustOf(pkg, res, lock);
  if (!trust.trusted) throw new Refused(`${what} of ${pkg.name} is refused: ${trust.reason}`);
  if (pkg.layer === 'dependencies') {
    const locked = lock?.packages[pkg.name]?.version;
    // Either side can be stale. A cached environment's install can be older than the lock, and a sync there would
    // write the lock down to it, so the refusal names both remedies (spec 5.1).
    if (locked !== pkg.version) {
      throw new Refused(
        `${what} is refused: ${pkg.name} ${pkg.version} is installed, but the lock has ${locked ?? 'no entry'}: reinstall the project's dependencies when the install is out of date, or run \`${NPX_ANY} sync\` when the lock is.`,
      );
    }
  }
}

function environment(pkg: ResolvedPackage, res: Resolution, agent: string | undefined): NodeJS.ProcessEnv {
  const data = path.join(harnesspmHome(), 'data', pkg.plugin);
  ensureDir(data);
  return {
    ...process.env,
    PLUGIN_ROOT: pkg.harnessDir,
    PLUGIN_DATA: data,
    HARNESSPM_PROJECT_DIR: res.projectDir,
    HARNESSPM_AGENT: agent ?? agentOf() ?? '',
  };
}

/** A `run` or `mcp` event for a unit of the dependency or project layer (spec 14.2). Units of added harnesses stay private. */
function unitEvent(res: Resolution, type: EventType, unit: { id: string; pkg: ResolvedPackage }, agent: string | undefined, extra: Record<string, unknown> = {}): void {
  if (unit.pkg.layer === 'added') return;
  // The index that `sync` writes has the remote, so the event does not ask git.
  const repository = readIndex(res.projectDir)?.repository;
  const ctx = { projectDir: res.projectDir, project: res.projectName, ...(repository !== undefined ? { repository } : {}), workspaces: res.workspaces.map((ws) => ws.key) };
  sendEvent(readTelemetryState(res.projectDir), ctx, { type, ...commandCaller(agent), unit: unit.id, package: unit.pkg.name, version: unit.pkg.version, ...outsideField(res.projectDir), ...extra });
}

function interpreter(file: string): [string, string[]] {
  if (/\.(m|c)?js$/.test(file)) return [process.execPath, [file]];
  if (file.endsWith('.sh')) return ['sh', [file]];
  return [file, []];
}

/** Node.js's error codes for an import or require that finds no module. */
const MISSING_MODULE = /\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)\b/;

/**
 * Where a script's dependencies come from. A project without an install runs scripts from fetched packages, which have
 * no dependencies of their own; `install` is then the command that installs the project.
 */
export interface RunContext {
  install?: string;
  /** Where the script runs. Default: the caller's folder. */
  cwd?: string;
  /** stdin for the script, already read, such as a hook's JSON. Default: harnesspm's own stdin. */
  input?: Buffer;
}

export function runScript(res: Resolution, ref: string, args: string[], agent: string | undefined, context: RunContext = {}): Promise<number> {
  const { plugin, name } = parseRef(ref);
  const script = res.scripts.find((s) => s.pkg.plugin === plugin && s.name === name);
  if (!script) {
    const known = res.scripts.filter((s) => s.pkg.plugin === plugin).map((s) => `${plugin}:${s.name}`);
    throw new HarnessError(`No script ${ref}.${known.length > 0 ? ` Scripts of ${plugin}: ${known.join(', ')}` : ''}`);
  }
  checkPackage(script.pkg, res, `Script ${ref}`);
  if (!isFile(script.file)) throw new HarnessError(`Script ${ref}: ${script.file} does not exist`);
  const [command, prefix] = interpreter(script.file);
  const started = Date.now();
  // The script runs in the caller's folder, so file arguments stay valid, also with -C (spec 10.1); a hook from a parent
  // folder runs in its project (spec 4.10). stdout streams as it is. stderr passes through too, and its tail shows
  // whether a dependency was missing.
  const child = spawn(command, [...prefix, ...args], {
    stdio: [context.input !== undefined ? 'pipe' : 'inherit', 'inherit', 'pipe'],
    cwd: context.cwd ?? process.cwd(),
    env: environment(script.pkg, res, agent),
  });
  if (context.input !== undefined) {
    // A script that exits without reading its stdin closes the pipe: that is not an error.
    child.stdin?.on('error', () => {});
    child.stdin?.end(context.input);
  }
  let tail = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    tail = (tail + chunk.toString('utf8')).slice(-4096);
  });
  return new Promise((done, fail) => {
    let failed = false;
    child.on('error', (error) => {
      failed = true;
      fail(new HarnessError(`Script ${ref} could not start: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      if (failed) return;
      const status = code ?? (signal !== null ? 1 : 0);
      if (status !== 0 && context.install !== undefined && MISSING_MODULE.test(tail)) {
        process.stderr.write(`harnesspm: ${ref} needs a package that the project installs, and this project has no install. Install it with \`${context.install}\`, then run the script again.\n`);
      }
      // Never the arguments: they can hold anything (spec 14.2). A signal gives exit 1, as before, but never an answer.
      const outcome = runOutcome(status, script.answers, code === null && signal !== null);
      unitEvent(res, 'run', script, agent, { exit: status, outcome, duration: Date.now() - started });
      done(status);
    });
  });
}

export function runMcp(res: Resolution, ref: string, agent: string | undefined): number {
  const { plugin, name } = parseRef(ref);
  const server = res.mcp.find((s) => s.pkg.plugin === plugin && s.name === name);
  if (!server) throw new HarnessError(`No MCP server ${ref}`);
  checkPackage(server.pkg, res, `MCP server ${ref}`);
  if (server.config['type'] !== 'stdio') throw new HarnessError(`MCP server ${ref} is remote; agents connect to its URL directly`);
  const env = environment(server.pkg, res, agent);
  const expand = (value: string): string => value.replaceAll('${PLUGIN_ROOT}', env['PLUGIN_ROOT']!).replaceAll('${PLUGIN_DATA}', env['PLUGIN_DATA']!);
  const command = expand(String(server.config['command']));
  const args = Array.isArray(server.config['args']) ? server.config['args'].map((a) => expand(String(a))) : [];
  const extra = server.config['env'];
  if (extra !== null && typeof extra === 'object') for (const [k, v] of Object.entries(extra)) env[k] = expand(String(v));
  unitEvent(res, 'mcp', server, agent);
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw new HarnessError(`MCP server ${ref} could not start: ${result.error.message}`);
  return result.status ?? 1;
}
