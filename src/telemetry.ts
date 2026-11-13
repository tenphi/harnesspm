// Telemetry (spec chapter 14): events about how a harness is used, sent to the project's handler.
// `harnesspm track` runs this module from agent hooks, so it imports only Node.js built-ins and light modules.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnesspmHome } from './homes.ts';
import { HarnessError, agentOf, caller, gitExcludeFile, isFile, isRecord, readTextIfExists, toPosix } from './util.ts';

export const EVENT_TYPES = ['run', 'mcp', 'sync', 'why', 'read', 'skill', 'session'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
/** Events that harnesspm's own agent hooks send (spec 14.4). */
export const AGENT_EVENTS: readonly EventType[] = ['read', 'skill', 'session'];
export const EVENT_SCHEMA = 'harnesspm.event/1';
/** Per-machine files, next to the stable package paths (spec 4.2). */
export const INDEX_FILE = path.join('node_modules', '.harnesspm', 'telemetry.json');
const LOG_FILE = path.join('node_modules', '.harnesspm', 'telemetry.log');
/** An event is passed to the delivering process in an environment variable, which has a size limit. */
const MAX_EVENT = 100_000;

/** A command that gets each event as JSON on stdin, or a file that gets one JSON line per event. */
export type Send = string | { file: string };

export interface TelemetryConfig {
  events: EventType[];
  send: Send;
}

/** Validates the `telemetry` field of harnesspm.json (spec 14.1). */
export function parseTelemetry(value: unknown): TelemetryConfig | undefined {
  if (value === undefined) return undefined;
  const where = 'harnesspm.json: "telemetry"';
  if (!isRecord(value)) throw new HarnessError(`${where} must be an object with "send"`);
  for (const key of Object.keys(value)) if (key !== 'events' && key !== 'send') throw new HarnessError(`${where} has an unknown field "${key}"`);
  const send = value['send'];
  let parsed: Send;
  if (typeof send === 'string' && send.trim() !== '') parsed = send;
  else if (isRecord(send) && Object.keys(send).length === 1 && typeof send['file'] === 'string' && send['file'] !== '') parsed = { file: send['file'] };
  else throw new HarnessError(`${where} needs "send": a command, or { "file": "<path>" }`);
  const raw = value['events'] ?? 'all';
  if (raw === 'all') return { events: [...EVENT_TYPES], send: parsed };
  if (!Array.isArray(raw) || !raw.every((e) => typeof e === 'string')) throw new HarnessError(`${where}: "events" must be "all" or a list of event types`);
  const unknown = raw.filter((e) => !(EVENT_TYPES as readonly string[]).includes(e));
  if (unknown.length > 0) throw new HarnessError(`${where}: unknown event "${unknown[0]}". Use "all" or some of: ${EVENT_TYPES.join(', ')}`);
  return { events: EVENT_TYPES.filter((e) => raw.includes(e)), send: parsed };
}

export const sameSend = (a: unknown, b: unknown): boolean => a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b);
export const describeSend = (send: Send): string => (typeof send === 'string' ? `command \`${send}\`` : `file ${send.file}`);

export interface TelemetryState {
  config?: TelemetryConfig;
  /** Where events go: the configured handler, when a person's sync recorded it and this machine did not opt out. */
  send?: Send;
  events: Set<EventType>;
  /** Why nothing is sent. */
  off?: string;
}

function flagOff(file: string): boolean {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isRecord(raw) && raw['telemetry'] === false;
  } catch {
    return false;
  }
}

/** A person's opt-out on this machine (spec 14.6), or undefined. */
export function optOut(projectDir: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const dnt = (env['DO_NOT_TRACK'] ?? '').trim().toLowerCase();
  if (dnt !== '' && dnt !== '0' && dnt !== 'false') return 'DO_NOT_TRACK is set';
  if (flagOff(path.join(projectDir, 'harnesspm.local.json'))) return '"telemetry": false in harnesspm.local.json';
  const user = path.join(harnesspmHome(), 'config.json');
  if (flagOff(user)) return `"telemetry": false in ${user}`;
  return undefined;
}

/** `recorded` is the handler in the lock, which only a person's sync writes (spec 14.5). */
export function telemetryState(projectDir: string, config: TelemetryConfig | undefined, recorded: unknown): TelemetryState {
  if (!config) return { events: new Set(), off: 'not configured' };
  const opted = optOut(projectDir);
  if (opted !== undefined) return { config, events: new Set(), off: `off on this machine: ${opted}` };
  if (!sameSend(config.send, recorded)) {
    return { config, events: new Set(), off: `held: the handler in harnesspm.json is not the one a person's sync recorded in harnesspm.lock.json. A person runs \`npx harnesspm sync\`.` };
  }
  return { config, send: config.send, events: new Set(config.events) };
}

const readJsonQuietly = (file: string): unknown => {
  const text = readTextIfExists(file);
  return text === undefined ? undefined : JSON.parse(text);
};

/** The state from harnesspm.json and the lock on disk, without resolving the harness. */
export function readTelemetryState(projectDir: string): TelemetryState {
  try {
    const config = readJsonQuietly(path.join(projectDir, 'harnesspm.json'));
    const lock = readJsonQuietly(path.join(projectDir, 'harnesspm.lock.json'));
    const recorded = isRecord(lock) && isRecord(lock['telemetry']) ? lock['telemetry']['send'] : undefined;
    return telemetryState(projectDir, isRecord(config) ? parseTelemetry(config['telemetry']) : undefined, recorded);
  } catch (error) {
    return { events: new Set(), off: `invalid configuration: ${(error as Error).message}` };
  }
}

// ---------- events ----------

export interface EventContext {
  /** The project root, as a real path. */
  projectDir: string;
  project: string;
  /** Workspace folders from the root, with forward slashes. */
  workspaces: string[];
}

export type EventCaller = 'person' | 'agent' | 'hook' | 'ci';

export interface EventFields {
  type: EventType;
  caller: EventCaller;
  agent?: string | undefined;
  session?: string | undefined;
  unit?: string | undefined;
  package?: string | undefined;
  version?: string | undefined;
  [field: string]: unknown;
}

let version: string | undefined;
function harnesspmVersion(): string {
  if (version === undefined) {
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
      version = isRecord(raw) && typeof raw['version'] === 'string' ? raw['version'] : '';
    } catch {
      version = '';
    }
  }
  return version;
}

function workspaceOf(ctx: EventContext, cwd: string): string {
  let dir = cwd;
  try {
    dir = fs.realpathSync(cwd);
  } catch {
    // Keep the path as it is.
  }
  const rel = toPosix(path.relative(ctx.projectDir, dir));
  let best = '.';
  for (const key of ctx.workspaces) if ((rel === key || rel.startsWith(`${key}/`)) && (best === '.' || key.length > best.length)) best = key;
  return best;
}

/** Who runs a harnesspm command, for events. Hooks and MCP servers pass `--agent` (spec 5.1). */
export function commandCaller(agentFlag?: string, env: NodeJS.ProcessEnv = process.env): Pick<EventFields, 'caller' | 'agent' | 'session'> {
  const who = caller(env);
  const value: EventCaller = who === 'model' ? 'agent' : who === 'hook' || agentFlag !== undefined ? 'hook' : env['CI'] === 'true' ? 'ci' : 'person';
  const agent = agentFlag ?? agentOf(env);
  const session = env['CLAUDE_CODE_SESSION_ID'];
  return { caller: value, agent, session: agent !== undefined && session !== '' ? session : undefined };
}

/** One event (spec 14.2). Fields that are undefined are left out. */
export function makeEvent(ctx: EventContext, fields: EventFields, cwd = process.cwd()): Record<string, unknown> {
  const { type, ...rest } = fields;
  const event: Record<string, unknown> = { schema: EVENT_SCHEMA, type, time: new Date().toISOString(), project: ctx.project, workspace: workspaceOf(ctx, cwd), harnesspm: harnesspmVersion() };
  for (const [key, value] of Object.entries(rest)) if (value !== undefined) event[key] = value;
  return event;
}

/** Notes a delivery problem in a per-machine log. Never throws, never prints (spec 14.3). */
export function note(projectDir: string, message: string): void {
  try {
    const file = path.join(projectDir, LOG_FILE);
    if (!fs.existsSync(path.dirname(file))) return;
    if ((fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) > 256 * 1024) fs.rmSync(file);
    fs.appendFileSync(file, `${new Date().toISOString()} ${message.replace(/\s+/g, ' ').slice(0, 2000)}\n`);
  } catch {
    // Telemetry never fails a command.
  }
}

/** Adds a file inside the project to .git/info/exclude, once. */
function excludeFromGit(projectDir: string, file: string): void {
  const rel = path.relative(projectDir, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return;
  const exclude = gitExcludeFile(projectDir);
  if (!exclude) return;
  const entry = `/${toPosix(rel)}`;
  const text = readTextIfExists(exclude) ?? '';
  if (text.split('\n').includes(entry)) return;
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, `${text.replace(/\s*$/, '')}${text.trim() ? '\n' : ''}${entry}\n`);
}

const DELIVER = fileURLToPath(new URL(`./deliver${path.extname(fileURLToPath(import.meta.url))}`, import.meta.url));

/** Hands one event to the handler without waiting for it (spec 14.3). */
function deliver(projectDir: string, send: Send, event: Record<string, unknown>): void {
  const line = JSON.stringify(event);
  if (typeof send !== 'string') {
    const file = path.resolve(projectDir, send.file);
    const fresh = !fs.existsSync(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${line}\n`);
    if (fresh) excludeFromGit(projectDir, file);
    return;
  }
  if (line.length > MAX_EVENT) throw new Error(`a ${String(event['type'])} event of ${line.length} bytes is too large to send`);
  const child = spawn(process.execPath, [DELIVER], {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, HARNESSPM_EVENT: line, HARNESSPM_HANDLER: send },
  });
  child.on('error', (error) => note(projectDir, `handler: ${error.message}`));
  child.unref();
}

/** Sends one event when telemetry is on and wants this type. Never throws, never waits. */
export function sendEvent(state: TelemetryState, ctx: EventContext, fields: EventFields, cwd = process.cwd()): void {
  if (state.send === undefined || !state.events.has(fields.type)) return;
  try {
    deliver(ctx.projectDir, state.send, makeEvent(ctx, fields, cwd));
  } catch (error) {
    note(ctx.projectDir, `${fields.type} event: ${(error as Error).message}`);
  }
}

// ---------- agent events: the index and `harnesspm track` (spec 14.4) ----------

/** What the agent hooks need to map a file or skill to a unit. `sync` writes it on each machine. */
export interface TelemetryIndex {
  project: string;
  workspaces: string[];
  /** Plugin name → its package. */
  packages: Record<string, { package: string; version: string }>;
  /** Real path of a file → unit ID: rule files, generated rules, generated docs indexes. */
  files: Record<string, string>;
  /** Real path of a folder → unit ID: skill folders and docs folders. */
  dirs: Record<string, string>;
  /** Skill name → unit ID. */
  skills: Record<string, string>;
}

export function readIndex(projectDir: string): TelemetryIndex | undefined {
  const raw = readJsonQuietly(path.join(projectDir, INDEX_FILE));
  return isRecord(raw) && isRecord(raw['files']) && isRecord(raw['dirs']) && isRecord(raw['skills']) ? (raw as unknown as TelemetryIndex) : undefined;
}

/** The unit a file belongs to. A docs file also gets its page, relative to the docs folder. */
export function unitOfFile(index: TelemetryIndex, file: string, cwd: string): { unit: string; page?: string } | undefined {
  const abs = path.resolve(cwd, file);
  const candidates = [abs];
  try {
    const real = fs.realpathSync(abs);
    if (real !== abs) candidates.unshift(real);
  } catch {
    // A file that is gone can still match by its path.
  }
  for (const p of candidates) {
    const direct = index.files[p];
    if (direct !== undefined) return { unit: direct, ...(direct.endsWith(':docs') ? { page: path.basename(p) } : {}) };
    let best: string | undefined;
    for (const dir of Object.keys(index.dirs)) if (p.startsWith(dir + path.sep) && (best === undefined || dir.length > best.length)) best = dir;
    if (best !== undefined) {
      const unit = index.dirs[best]!;
      return { unit, ...(unit.endsWith(':docs') ? { page: toPosix(path.relative(best, p)) } : {}) };
    }
  }
  return undefined;
}

/** The event that an agent's hook payload stands for, without the common fields. */
export function agentEvent(payload: Record<string, unknown>, index: TelemetryIndex): { type: EventType; [field: string]: unknown } | undefined {
  const hook = payload['hook_event_name'];
  const cwd = typeof payload['cwd'] === 'string' ? payload['cwd'] : process.cwd();
  if (hook === 'SessionStart') return { type: 'session', source: typeof payload['source'] === 'string' ? payload['source'] : undefined };
  const input = isRecord(payload['tool_input']) ? payload['tool_input'] : {};
  let found: { unit: string; page?: string } | undefined;
  let type: EventType;
  let via: string | undefined;
  if (hook === 'PostToolUse' && payload['tool_name'] === 'Read' && typeof input['file_path'] === 'string') {
    [found, type, via] = [unitOfFile(index, input['file_path'], cwd), 'read', 'tool'];
  } else if (hook === 'InstructionsLoaded' && typeof payload['file_path'] === 'string') {
    [found, type, via] = [unitOfFile(index, payload['file_path'], cwd), 'read', 'auto'];
  } else if (hook === 'PostToolUse' && payload['tool_name'] === 'Skill' && typeof input['skill'] === 'string') {
    const unit = index.skills[input['skill']];
    [found, type] = [unit !== undefined ? { unit } : undefined, 'skill'];
  } else return undefined;
  if (!found) return undefined;
  const pkg = index.packages[found.unit.slice(0, found.unit.indexOf(':'))];
  return { type, unit: found.unit, package: pkg?.package, version: pkg?.version, page: found.page, via };
}

/** The nearest folder with harnesspm.json, as a real path. */
function configDir(cwd: string): string | undefined {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (isFile(path.join(dir, 'harnesspm.json'))) return fs.realpathSync(dir);
    if (path.dirname(dir) === dir) return undefined;
  }
}

/**
 * `harnesspm track --agent <agent>`: the command of harnesspm's agent hooks. It reads the hook's JSON
 * on stdin, maps it to an event, hands the event off and exits 0 at once. It never prints.
 */
export function track(args: string[]): number {
  let projectDir: string | undefined;
  try {
    const at = args.indexOf('--agent');
    const agent = at >= 0 ? args[at + 1] : undefined;
    const payload: unknown = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (!isRecord(payload)) return 0;
    const cwd = typeof payload['cwd'] === 'string' ? payload['cwd'] : process.cwd();
    projectDir = configDir(cwd);
    if (projectDir === undefined) return 0;
    const state = readTelemetryState(projectDir);
    if (state.send === undefined) return 0;
    const index = readIndex(projectDir);
    const found = index ? agentEvent(payload, index) : undefined;
    if (!index || !found || !state.events.has(found.type)) return 0;
    const { type, ...rest } = found;
    const session = typeof payload['session_id'] === 'string' ? payload['session_id'] : undefined;
    sendEvent(state, { projectDir, project: index.project, workspaces: index.workspaces }, { type, caller: 'agent', agent, session, ...rest }, cwd);
  } catch (error) {
    if (projectDir !== undefined) note(projectDir, `track: ${(error as Error).message}`);
  }
  return 0;
}
