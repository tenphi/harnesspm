// Scripts, hooks, MCP servers, permissions (spec chapter 5) and sub-agents (spec 2.6).
import * as path from 'node:path';
import { parseFrontmatter } from './frontmatter.ts';
import { NS, type HarnessPackage } from './manifest.ts';
import { isFile, isRecord, listDir, readJson, readText } from './util.ts';

export interface ScriptUnit {
  kind: 'scripts';
  id: string;
  name: string;
  file: string;
  description?: string;
  allow: boolean;
  pkg: HarnessPackage;
}

export type Agent = 'claude' | 'codex';
export const AGENTS: Agent[] = ['claude', 'codex'];

/** Events both agents support (spec 5.2). */
export const PORTABLE_EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PreCompact', 'PostCompact', 'SubagentStart', 'SubagentStop', 'Stop'];
/** Events only one agent supports. Others are dropped with a warning. */
const AGENT_EVENTS: Record<Agent, string[]> = {
  claude: [...PORTABLE_EVENTS, 'Notification'],
  codex: PORTABLE_EVENTS,
};

export interface HookUnit {
  kind: 'hooks';
  id: string;
  name: string;
  event: string;
  /** Matcher per agent. A missing agent means the hook is not written for it. Undefined value: every tool. */
  matchers: Partial<Record<Agent, string | undefined>>;
  run: string;
  timeout?: number;
  pkg: HarnessPackage;
}

export interface McpUnit {
  kind: 'mcp';
  id: string;
  name: string;
  config: Record<string, unknown>;
  pkg: HarnessPackage;
}

export interface PermissionsUnit {
  kind: 'permissions';
  id: string;
  deny: string[][];
  ask: string[][];
  pkg: HarnessPackage;
}

export interface AgentUnit {
  kind: 'agents';
  id: string;
  name: string;
  description: string;
  body: string;
  claude: Record<string, unknown>;
  codex: Record<string, unknown>;
  file: string;
  pkg: HarnessPackage;
}

export interface ExecUnits {
  scripts: ScriptUnit[];
  hooks: HookUnit[];
  mcp: McpUnit[];
  permissions?: PermissionsUnit;
  agents: AgentUnit[];
}

function commandLists(value: unknown, field: string, problems: string[]): string[][] {
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((v) => Array.isArray(v) && v.length > 0 && v.every((w) => typeof w === 'string'))) return value as string[][];
  problems.push(`permissions.json: "${field}" must be a list of command prefixes, such as [["git", "push", "--force"]]`);
  return [];
}

/** Finds the executable units and sub-agents of a package. Problems are what `harnesspm check` reports. */
export function discoverExecUnits(pkg: HarnessPackage, problems: string[]): ExecUnits {
  const scripts: ScriptUnit[] = Object.entries(pkg.ext.scripts).map(([name, def]) => ({
    kind: 'scripts',
    id: `${pkg.plugin}:scripts/${name}`,
    name,
    file: path.resolve(pkg.harnessDir, def.file),
    ...(def.description !== undefined ? { description: def.description } : {}),
    allow: def.allow === true,
    pkg,
  }));

  const hooks: HookUnit[] = [];
  const hooksFile = path.join(pkg.harnessDir, NS, 'hooks.json');
  if (isFile(hooksFile)) {
    const raw = readJson(hooksFile);
    const byEvent = isRecord(raw) && isRecord(raw['hooks']) ? raw['hooks'] : {};
    for (const [event, list] of Object.entries(byEvent)) {
      if (!Array.isArray(list)) {
        problems.push(`hooks.json: "${event}" must be a list`);
        continue;
      }
      for (const def of list) {
        if (!isRecord(def) || typeof def['id'] !== 'string' || typeof def['run'] !== 'string') {
          problems.push(`hooks.json: every ${event} hook needs "id" and "run"`);
          continue;
        }
        if (pkg.ext.scripts[def['run']] === undefined) problems.push(`hooks.json: hook "${def['id']}" runs "${def['run']}", which is not in "scripts"`);
        const matcher = def['matcher'];
        let matchers: HookUnit['matchers'];
        if (matcher === undefined || typeof matcher === 'string') matchers = { claude: matcher, codex: matcher };
        else if (isRecord(matcher)) {
          matchers = {};
          for (const agent of AGENTS) if (typeof matcher[agent] === 'string') matchers[agent] = matcher[agent] as string;
          for (const key of Object.keys(matcher)) if (!AGENTS.includes(key as Agent)) problems.push(`hooks.json: hook "${def['id']}" has an unknown agent "${key}" in "matcher"`);
        } else {
          problems.push(`hooks.json: hook "${def['id']}": "matcher" must be a string or an object`);
          continue;
        }
        for (const agent of AGENTS) if (agent in matchers && !AGENT_EVENTS[agent].includes(event)) delete matchers[agent];
        if (Object.keys(matchers).length === 0) problems.push(`hooks.json: hook "${def['id']}" uses ${event}, which no agent it names supports`);
        hooks.push({
          kind: 'hooks',
          id: `${pkg.plugin}:hooks/${def['id']}`,
          name: def['id'],
          event,
          matchers,
          run: def['run'],
          ...(typeof def['timeout'] === 'number' ? { timeout: def['timeout'] } : {}),
          pkg,
        });
      }
    }
  }

  const mcp: McpUnit[] = [];
  const mcpFile = path.join(pkg.harnessDir, 'mcp.json');
  if (isFile(mcpFile)) {
    const raw = readJson(mcpFile);
    const servers = isRecord(raw) && isRecord(raw['mcpServers']) ? raw['mcpServers'] : {};
    for (const [name, config] of Object.entries(servers)) {
      if (!isRecord(config)) {
        problems.push(`mcp.json: server "${name}" must be an object`);
        continue;
      }
      const type = config['type'] ?? 'stdio';
      if (type === 'stdio' && typeof config['command'] !== 'string') problems.push(`mcp.json: stdio server "${name}" needs a "command"`);
      if ((type === 'streamable-http' || type === 'sse') && typeof config['url'] !== 'string') problems.push(`mcp.json: server "${name}" needs a "url"`);
      if (!['stdio', 'streamable-http', 'sse'].includes(String(type))) problems.push(`mcp.json: server "${name}" has an unknown type "${String(type)}"`);
      mcp.push({ kind: 'mcp', id: `${pkg.plugin}:mcp/${name}`, name, config: { ...config, type }, pkg });
    }
  }

  let permissions: PermissionsUnit | undefined;
  const permFile = path.join(pkg.harnessDir, NS, 'permissions.json');
  if (isFile(permFile)) {
    const raw = readJson(permFile);
    const data = isRecord(raw) ? raw : {};
    for (const key of Object.keys(data)) {
      if (key === 'allow') problems.push('permissions.json: "allow" is not supported. Set "allow": true on a script instead (spec 5.4).');
      else if (key !== 'deny' && key !== 'ask') problems.push(`permissions.json: unknown field "${key}"`);
    }
    permissions = { kind: 'permissions', id: `${pkg.plugin}:permissions`, deny: commandLists(data['deny'], 'deny', problems), ask: commandLists(data['ask'], 'ask', problems), pkg };
  }

  const agentsDir = path.join(pkg.harnessDir, NS, 'agents');
  const agents: AgentUnit[] = [];
  for (const file of listDir(agentsDir).filter((f) => f.endsWith('.md'))) {
    const full = path.join(agentsDir, file);
    const { data, body } = parseFrontmatter(readText(full), full);
    const name = typeof data['name'] === 'string' ? data['name'] : file.slice(0, -3);
    if (typeof data['description'] !== 'string') problems.push(`agents/${file}: needs a "description"`);
    agents.push({
      kind: 'agents',
      id: `${pkg.plugin}:agents/${name}`,
      name,
      description: typeof data['description'] === 'string' ? data['description'] : '',
      body: body.trim(),
      claude: isRecord(data['claude']) ? data['claude'] : {},
      codex: isRecord(data['codex']) ? data['codex'] : {},
      file: full,
      pkg,
    });
  }
  return { scripts, hooks, mcp, ...(permissions ? { permissions } : {}), agents };
}

/** Sub-agent keys that widen what the agent may do. Written only for trusted owners. */
export const WIDENING_AGENT_KEYS: Record<Agent, string[]> = {
  claude: ['permissionMode'],
  codex: ['sandbox_mode', 'approval_policy'],
};
