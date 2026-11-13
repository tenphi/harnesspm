// Executable outputs (spec 4.3, 4.4, 5.2–5.4) with trust (spec 6.2) and ownership of shared files (spec 4.7).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { stringify } from 'yaml';
import { AGENTS, WIDENING_AGENT_KEYS, type Agent } from './exec-units.ts';
import type { Lock } from './lock.ts';
import { tomlString } from './render.ts';
import type { Resolution, ResolvedPackage } from './resolve.ts';
import { ensureDir, isFile, isRecord, readJsonIfExists, readTextIfExists, writeIfChanged } from './util.ts';

export type Group = 'team' | 'added';

export interface TrustState {
  trusted: boolean;
  reason?: string;
}

/** Trust of a package's executable units (spec 6.2). The project and added harnesses are trusted. */
export function trustOf(pkg: ResolvedPackage, res: Resolution, lock: Lock | undefined): TrustState {
  if (pkg.layer !== 'dependencies') return { trusted: true };
  const value = res.config.trust[pkg.name];
  if (value === true) return { trusted: true };
  if (value === 'pin') {
    const approved = lock?.packages[pkg.name]?.approved;
    if (approved === undefined || approved === pkg.version) return { trusted: true };
    return { trusted: false, reason: `version ${pkg.version} is not approved (approved: ${approved}); run \`npx harnesspm approve ${pkg.name}\`` };
  }
  return { trusted: false, reason: `not trusted; add it to "trust" in harnesspm.json` };
}

export interface HookEntry {
  event: string;
  matcher?: string;
  command: string;
  timeout?: number;
  /** Runs in the background: the agent does not wait for it (spec 14.4). */
  async?: boolean;
}

export interface ExecEntries {
  claude: { allow: string[]; deny: string[]; ask: string[]; hooks: HookEntry[]; mcp: Record<string, Record<string, unknown>> };
  codex: { hooks: HookEntry[]; rules: string[]; mcp: Record<string, Record<string, unknown>> };
  /** Sub-agent files: absolute path → content. */
  agentFiles: Map<string, string>;
  /** Executable units that are not written because their package is not trusted. */
  pending: string[];
  warnings: string[];
}

export function emptyEntries(): ExecEntries {
  return { claude: { allow: [], deny: [], ask: [], hooks: [], mcp: {} }, codex: { hooks: [], rules: [], mcp: {} }, agentFiles: new Map(), pending: [], warnings: [] };
}

function tomlValue(value: unknown): string | undefined {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const items = value.map(tomlValue);
    return items.every((i) => i !== undefined) ? `[${items.join(', ')}]` : undefined;
  }
  if (isRecord(value)) {
    const items = Object.entries(value).map(([k, v]) => [k, tomlValue(v)] as const);
    return items.every(([, v]) => v !== undefined) ? `{ ${items.map(([k, v]) => `${JSON.stringify(k)} = ${v}`).join(', ')} }` : undefined;
  }
  return undefined;
}

export function tomlTables(prefix: string, tables: Record<string, Record<string, unknown>>): string {
  return Object.entries(tables)
    .map(([name, table]) => {
      const lines = Object.entries(table).flatMap(([k, v]) => {
        const value = tomlValue(v);
        return value === undefined ? [] : [`${k} = ${value}`];
      });
      return `[${prefix}.${JSON.stringify(name)}]\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

/** Words of a command prefix, for Claude Code's Bash rules. */
const bashRule = (words: string[]): string => `Bash(${words.join(' ')} *)`;
const codexRule = (words: string[], decision: string): string => `prefix_rule(pattern = ${JSON.stringify(words)}, decision = "${decision}")`;

/**
 * The entries that `packages` ask for. `npx` is the command prefix: `npx harnesspm` where the project
 * depends on harnesspm, `npx -y @tenphi/harnesspm` elsewhere. Allow rules use the same prefix as the commands.
 */
export function desiredEntries(
  res: Resolution,
  packages: Set<ResolvedPackage>,
  trust: (pkg: ResolvedPackage) => TrustState,
  where: { claudeAgents: string; codexAgents: string; npx: (pkg: ResolvedPackage) => string },
): ExecEntries {
  const entries = emptyEntries();
  const mine = <T extends { pkg: ResolvedPackage }>(units: T[]): T[] => units.filter((u) => packages.has(u.pkg));
  const pendingCounts = new Map<ResolvedPackage, Map<string, number>>();
  const pend = (pkg: ResolvedPackage, what: string): void => {
    const counts = pendingCounts.get(pkg) ?? new Map<string, number>();
    counts.set(what, (counts.get(what) ?? 0) + 1);
    pendingCounts.set(pkg, counts);
  };

  for (const skill of mine(res.skills)) if (trust(skill.pkg).trusted) entries.claude.allow.push(`Skill(${skill.name})`);
  for (const script of mine(res.scripts)) {
    if (!trust(script.pkg).trusted) {
      pend(script.pkg, 'script');
      continue;
    }
    if (!script.allow) continue;
    const words = [...where.npx(script.pkg).split(' '), 'run', `${script.pkg.plugin}:${script.name}`];
    // `Bash(<prefix> *)` also matches the command without arguments (observed with Claude Code 2.1.322).
    entries.claude.allow.push(bashRule(words));
    entries.codex.rules.push(codexRule(words, 'allow'));
  }
  for (const hook of mine(res.hooks)) {
    if (!trust(hook.pkg).trusted) {
      pend(hook.pkg, 'hook');
      continue;
    }
    for (const agent of AGENTS) {
      if (!(agent in hook.matchers)) continue;
      const matcher = hook.matchers[agent];
      const entry: HookEntry = {
        event: hook.event,
        ...(matcher !== undefined ? { matcher } : {}),
        command: `${where.npx(hook.pkg)} run --agent ${agent} ${hook.pkg.plugin}:${hook.run}`,
        ...(hook.timeout !== undefined ? { timeout: hook.timeout } : {}),
      };
      entries[agent].hooks.push(entry);
    }
  }
  for (const server of mine(res.mcp)) {
    if (!trust(server.pkg).trusted) {
      pend(server.pkg, 'MCP server');
      continue;
    }
    const name = `${server.pkg.plugin}-${server.name}`;
    const type = server.config['type'];
    for (const agent of AGENTS) {
      let config: Record<string, unknown> | undefined;
      if (type === 'stdio') {
        const [command, ...prefix] = where.npx(server.pkg).split(' ');
        config = { command, args: [...prefix, 'mcp', '--agent', agent, `${server.pkg.plugin}:${server.name}`] };
        if (agent === 'claude') config = { type: 'stdio', ...config };
      } else if (agent === 'claude') {
        config = { type: type === 'sse' ? 'sse' : 'http', url: server.config['url'], ...(isRecord(server.config['headers']) ? { headers: server.config['headers'] } : {}) };
      } else if (type === 'streamable-http') {
        config = { url: server.config['url'], ...(isRecord(server.config['headers']) ? { http_headers: server.config['headers'] } : {}) };
      } else entries.warnings.push(`${server.id}: Codex has no SSE transport, so the server is written for Claude Code only`);
      if (config) entries[agent].mcp[name] = config;
    }
    entries.claude.allow.push(`mcp__${name}`);
  }
  for (const perms of mine(res.permissions)) {
    for (const words of perms.deny) {
      entries.claude.deny.push(bashRule(words));
      entries.codex.rules.push(codexRule(words, 'forbidden'));
    }
    for (const words of perms.ask) {
      entries.claude.ask.push(bashRule(words));
      entries.codex.rules.push(codexRule(words, 'prompt'));
    }
  }

  // Sub-agents are text, but some agent-specific keys widen what the agent may do (spec 2.6).
  for (const agentUnit of mine(res.agents)) {
    const trusted = trust(agentUnit.pkg).trusted;
    const keys = (agent: Agent): Record<string, unknown> => {
      const source = agent === 'claude' ? agentUnit.claude : agentUnit.codex;
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(source)) {
        if (!trusted && WIDENING_AGENT_KEYS[agent].includes(key)) entries.warnings.push(`${agentUnit.id}: "${key}" is left out, because ${agentUnit.pkg.name} is not trusted`);
        else result[key] = value;
      }
      return result;
    };
    const note = `Generated by harnesspm from ${agentUnit.id}. To change it, run \`npx harnesspm why ${agentUnit.id}\`.`;
    const front = stringify({ name: agentUnit.name, description: agentUnit.description, ...keys('claude') }).trimEnd();
    entries.agentFiles.set(path.join(where.claudeAgents, `${agentUnit.name}.md`), `---\n${front}\n---\n\n<!-- ${note} -->\n\n${agentUnit.body}\n`);
    const codexKeys = Object.entries(keys('codex')).flatMap(([k, v]) => {
      const value = tomlValue(v);
      return value === undefined ? [] : [`${k} = ${value}`];
    });
    entries.agentFiles.set(
      path.join(where.codexAgents, `${agentUnit.name}.toml`),
      `# ${note}\nname = ${JSON.stringify(agentUnit.name)}\ndescription = ${JSON.stringify(agentUnit.description)}\n${codexKeys.map((l) => `${l}\n`).join('')}developer_instructions = ${tomlString(agentUnit.body)}\n`,
    );
  }

  for (const [pkg, counts] of pendingCounts) {
    const what = [...counts].map(([kind, n]) => `${n} ${kind}${n === 1 ? '' : 's'}`).join(', ');
    entries.pending.push(`${pkg.name}: ${what} (${trust(pkg).reason})`);
  }
  return entries;
}

// ---------- applying entries to shared files, with ownership ----------

interface Owned {
  claude: { allow: string[]; deny: string[]; ask: string[]; hooks: HookEntry[]; mcp: string[] };
  codex: { hooks: HookEntry[]; mcp: Record<string, Record<string, unknown>>; rules: string[] };
  agentFiles: string[];
}

const emptyOwned = (): Owned => ({ claude: { allow: [], deny: [], ask: [], hooks: [], mcp: [] }, codex: { hooks: [], mcp: {}, rules: [] }, agentFiles: [] });

type StateFile = Partial<Record<Group, Owned>>;

function readOwned(stateFile: string): StateFile {
  const raw = readJsonIfExists(stateFile);
  return isRecord(raw) && isRecord(raw['exec']) ? (raw['exec'] as StateFile) : {};
}

function writeOwned(stateFile: string, state: StateFile): void {
  const raw = readJsonIfExists(stateFile);
  const data = isRecord(raw) ? raw : {};
  data['exec'] = state;
  ensureDir(path.dirname(stateFile));
  writeIfChanged(stateFile, `${JSON.stringify(data, null, 2)}\n`);
}

const hookKey = (h: HookEntry): string => `${h.event}\u0000${h.matcher ?? ''}\u0000${h.command}`;

/** Keeps what a model run may keep: entries it already had. Returns the entries and what is held back. */
function limit<T>(wanted: T[], had: T[], key: (t: T) => string, widen: boolean): { kept: T[]; held: T[] } {
  if (widen) return { kept: wanted, held: [] };
  const before = new Set(had.map(key));
  return { kept: wanted.filter((w) => before.has(key(w))), held: wanted.filter((w) => !before.has(key(w))) };
}

type JsonHooks = Record<string, { matcher?: string; hooks?: { type?: string; command?: string; timeout?: number; async?: boolean }[] }[]>;

/** Replaces the owned hook entries in an agent's hooks object. */
function mergeHooks(hooks: JsonHooks, previous: HookEntry[], next: HookEntry[]): JsonHooks {
  const drop = new Set(previous.map(hookKey));
  const result: JsonHooks = {};
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !drop.has(hookKey({ event, ...(g.matcher !== undefined ? { matcher: g.matcher } : {}), command: h.command ?? '' }))) }))
      .filter((g) => g.hooks.length > 0);
    if (kept.length > 0) result[event] = kept;
  }
  for (const entry of next) {
    const list = (result[entry.event] ??= []);
    const handler = { type: 'command', command: entry.command, ...(entry.timeout !== undefined ? { timeout: entry.timeout } : {}), ...(entry.async ? { async: true } : {}) };
    list.push({ ...(entry.matcher !== undefined ? { matcher: entry.matcher } : {}), hooks: [handler] });
  }
  return result;
}

function editJson(file: string, edit: (data: Record<string, unknown>) => void): boolean {
  const raw = readJsonIfExists(file);
  const data = isRecord(raw) ? raw : {};
  const before = JSON.stringify(data);
  edit(data);
  if (JSON.stringify(data) === before) return false;
  if (Object.keys(data).length === 0) {
    fs.rmSync(file, { force: true });
    return true;
  }
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return true;
}

function setList(holder: Record<string, unknown>, key: string, previous: string[], next: string[]): void {
  const current = Array.isArray(holder[key]) ? (holder[key] as unknown[]).filter((v): v is string => typeof v === 'string') : [];
  const kept = current.filter((v) => !previous.includes(v));
  const result = [...kept, ...next.filter((v) => !kept.includes(v))];
  if (result.length > 0) holder[key] = result;
  else delete holder[key];
}

export interface Targets {
  claudeSettings: string;
  /** ~/.claude.json and, for local scope, the project key inside it. */
  claudeJson: string;
  claudeProject?: string;
  codexHooks: string;
  codexRules: string;
  stateFile: string;
  /** False when the repository tracks that agent's files, so harnesspm leaves them alone. */
  writeClaude?: boolean;
  writeCodex?: boolean;
}

export interface Applied {
  changed: string[];
  /** Entries a model run could not add (spec 6.2, rule 4). */
  held: string[];
  /** Codex MCP servers owned by every group, for the caller to write into a Codex config. */
  codexMcp: Record<string, Record<string, unknown>>;
  /** Files the outputs wrote, for .git/info/exclude. */
  files: string[];
}

/** Widening entries that `entries` asks for but harnesspm does not own yet, without writing anything. */
export function heldEntries(group: Group, entries: ExecEntries, stateFile: string): string[] {
  const prev = readOwned(stateFile)[group] ?? emptyOwned();
  const missing = <T>(wanted: T[], had: T[], key: (t: T) => string): T[] => limit(wanted, had, key, false).held;
  return [
    ...missing(entries.claude.allow, prev.claude.allow, (s) => s).map((a) => `allow ${a}`),
    ...missing(entries.claude.hooks, prev.claude.hooks, hookKey).map((h) => `Claude Code hook: ${h.command}`),
    ...missing(Object.keys(entries.claude.mcp), prev.claude.mcp, (s) => s).map((n) => `Claude Code MCP server ${n}`),
    ...missing(entries.codex.hooks, prev.codex.hooks, hookKey).map((h) => `Codex hook: ${h.command}`),
    ...missing(Object.keys(entries.codex.mcp), Object.keys(prev.codex.mcp), (s) => s).map((n) => `Codex MCP server ${n}`),
  ];
}

export function applyEntries(group: Group, entries: ExecEntries, targets: Targets, widen: boolean): Applied {
  const state = readOwned(targets.stateFile);
  const prev = state[group] ?? emptyOwned();
  const writeClaude = targets.writeClaude !== false;
  const writeCodex = targets.writeCodex !== false;
  const changed: string[] = [];
  const held: string[] = [];
  const files: string[] = [];

  const allow = limit(entries.claude.allow, prev.claude.allow, (s) => s, widen);
  const claudeHooks = limit(entries.claude.hooks, prev.claude.hooks, hookKey, widen);
  const claudeMcpNames = limit(Object.keys(entries.claude.mcp), prev.claude.mcp, (s) => s, widen);
  const codexHooks = limit(entries.codex.hooks, prev.codex.hooks, hookKey, widen);
  const codexMcpNames = limit(Object.keys(entries.codex.mcp), Object.keys(prev.codex.mcp), (s) => s, widen);
  const allowRules = entries.codex.rules.filter((r) => r.includes('decision = "allow"'));
  const codexAllow = limit(allowRules, prev.codex.rules.filter((r) => r.includes('decision = "allow"')), (s) => s, widen);
  // A model run never removes a restriction either.
  const keepRestrictions = (next: string[], before: string[]): string[] => (widen ? next : [...new Set([...next, ...before])]);
  const deny = keepRestrictions(entries.claude.deny, prev.claude.deny);
  const ask = keepRestrictions(entries.claude.ask, prev.claude.ask);
  const codexRestrict = keepRestrictions(entries.codex.rules.filter((r) => !r.includes('decision = "allow"')), prev.codex.rules.filter((r) => !r.includes('decision = "allow"')));
  held.push(...allow.held.map((a) => `allow ${a}`), ...claudeHooks.held.map((h) => `Claude Code hook: ${h.command}`), ...claudeMcpNames.held.map((n) => `Claude Code MCP server ${n}`));
  held.push(...codexHooks.held.map((h) => `Codex hook: ${h.command}`), ...codexMcpNames.held.map((n) => `Codex MCP server ${n}`), ...codexAllow.held.map((r) => `Codex rule ${r}`));

  // Claude Code settings: permissions and hooks.
  if (
    writeClaude &&
    editJson(targets.claudeSettings, (data) => {
      const permissions = isRecord(data['permissions']) ? data['permissions'] : {};
      setList(permissions, 'allow', prev.claude.allow, allow.kept);
      setList(permissions, 'deny', prev.claude.deny, deny);
      setList(permissions, 'ask', prev.claude.ask, ask);
      if (Object.keys(permissions).length > 0) data['permissions'] = permissions;
      else delete data['permissions'];
      const hooks = mergeHooks(isRecord(data['hooks']) ? (data['hooks'] as JsonHooks) : {}, prev.claude.hooks, claudeHooks.kept);
      if (Object.keys(hooks).length > 0) data['hooks'] = hooks;
      else delete data['hooks'];
    })
  ) changed.push(targets.claudeSettings);
  if (isFile(targets.claudeSettings)) files.push(targets.claudeSettings);

  // Claude Code MCP servers: ~/.claude.json, at user scope or in the project's local scope.
  const claudeMcp = Object.fromEntries(claudeMcpNames.kept.map((n) => [n, entries.claude.mcp[n]!]));
  if (writeClaude && (Object.keys(claudeMcp).length > 0 || prev.claude.mcp.length > 0)) {
    if (
      editJson(targets.claudeJson, (data) => {
        let holder: Record<string, unknown> = data;
        if (targets.claudeProject !== undefined) {
          const projects = isRecord(data['projects']) ? data['projects'] : {};
          holder = isRecord(projects[targets.claudeProject]) ? (projects[targets.claudeProject] as Record<string, unknown>) : {};
          projects[targets.claudeProject] = holder;
          data['projects'] = projects;
        }
        const servers = isRecord(holder['mcpServers']) ? holder['mcpServers'] : {};
        for (const name of prev.claude.mcp) delete servers[name];
        Object.assign(servers, claudeMcp);
        if (Object.keys(servers).length > 0) holder['mcpServers'] = servers;
        else delete holder['mcpServers'];
        if (targets.claudeProject !== undefined && Object.keys(holder).length === 0) delete (data['projects'] as Record<string, unknown>)[targets.claudeProject];
        if (isRecord(data['projects']) && Object.keys(data['projects']).length === 0) delete data['projects'];
      })
    ) changed.push(targets.claudeJson);
  }

  // Codex hooks.json, owned entries only.
  if (writeCodex && (codexHooks.kept.length > 0 || prev.codex.hooks.length > 0)) {
    if (
      editJson(targets.codexHooks, (data) => {
        const hooks = mergeHooks(isRecord(data['hooks']) ? (data['hooks'] as JsonHooks) : {}, prev.codex.hooks, codexHooks.kept);
        if (Object.keys(hooks).length > 0) data['hooks'] = hooks;
        else delete data['hooks'];
      })
    ) changed.push(targets.codexHooks);
    if (isFile(targets.codexHooks)) files.push(targets.codexHooks);
  }

  const codexMcp = Object.fromEntries(codexMcpNames.kept.map((n) => [n, entries.codex.mcp[n]!]));
  const nextOwned: Owned = {
    claude: writeClaude ? { allow: allow.kept, deny, ask, hooks: claudeHooks.kept, mcp: claudeMcpNames.kept } : prev.claude,
    codex: writeCodex ? { hooks: codexHooks.kept, mcp: codexMcp, rules: [...codexAllow.kept, ...codexRestrict] } : prev.codex,
    agentFiles: [...entries.agentFiles.keys()].sort(),
  };

  // Codex rules: one file that all groups share.
  const nextState: StateFile = { ...state, [group]: nextOwned };
  const allRules = [...new Set(Object.values(nextState).flatMap((o) => o?.codex.rules ?? []))];
  if (!writeCodex) {
    // The repository owns its Codex files.
  } else if (allRules.length > 0) {
    if (writeIfChanged(targets.codexRules, `# Generated by \`harnesspm sync\`. Do not edit.\n${allRules.join('\n')}\n`)) changed.push(targets.codexRules);
    files.push(targets.codexRules);
  } else if (isFile(targets.codexRules)) {
    fs.rmSync(targets.codexRules);
    changed.push(targets.codexRules);
  }

  // Sub-agent files.
  for (const [file, content] of entries.agentFiles) {
    if (!writeCodex && file.endsWith('.toml')) continue;
    if (writeIfChanged(file, content)) changed.push(file);
    files.push(file);
  }
  for (const old of prev.agentFiles) {
    if (!entries.agentFiles.has(old) && isFile(old) && (readTextIfExists(old) ?? '').includes('Generated by harnesspm from')) {
      fs.rmSync(old);
      changed.push(old);
    }
  }

  writeOwned(targets.stateFile, nextState);
  const allCodexMcp = Object.assign({}, ...Object.values(nextState).map((o) => o?.codex.mcp ?? {})) as Record<string, Record<string, unknown>>;
  return { changed, held, codexMcp: allCodexMcp, files };
}
