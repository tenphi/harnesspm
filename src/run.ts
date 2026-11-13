// harnesspm run and harnesspm mcp (spec 5.1, 5.3).
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { harnesspmHome } from './added.ts';
import { trustOf } from './exec-outputs.ts';
import { readLock } from './lock.ts';
import type { Resolution, ResolvedPackage } from './resolve.ts';
import { commandCaller, readTelemetryState, sendEvent, type EventType } from './telemetry.ts';
import { HarnessError, agentOf, ensureDir, isFile } from './util.ts';

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
    if (locked !== pkg.version) throw new Refused(`${what} is refused: ${pkg.name} ${pkg.version} is installed, but the lock has ${locked ?? 'no entry'}. Run \`npx harnesspm sync\`.`);
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
  const ctx = { projectDir: res.projectDir, project: res.projectName, workspaces: res.workspaces.map((ws) => ws.key) };
  sendEvent(readTelemetryState(res.projectDir), ctx, { type, ...commandCaller(agent), unit: unit.id, package: unit.pkg.name, version: unit.pkg.version, ...extra });
}

function interpreter(file: string): [string, string[]] {
  if (/\.(m|c)?js$/.test(file)) return [process.execPath, [file]];
  if (file.endsWith('.sh')) return ['sh', [file]];
  return [file, []];
}

export function runScript(res: Resolution, ref: string, args: string[], agent: string | undefined): number {
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
  const result = spawnSync(command, [...prefix, ...args], { stdio: 'inherit', cwd: process.cwd(), env: environment(script.pkg, res, agent) });
  if (result.error) throw new HarnessError(`Script ${ref} could not start: ${result.error.message}`);
  const status = result.status ?? 1;
  // Never the arguments: they can hold anything (spec 14.2).
  unitEvent(res, 'run', script, agent, { exit: status, duration: Date.now() - started });
  return status;
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
