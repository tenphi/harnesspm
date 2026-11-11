// harnesspm new: units from templates, and patches (spec 10.2).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadAdded, remoteKey } from './added.ts';
import { CONFIG_FILE } from './config.ts';
import { NS, PLUGIN_SCHEMA } from './manifest.ts';
import { headings } from './sections.ts';
import { parseFrontmatter } from './frontmatter.ts';
import type { Resolution } from './resolve.ts';
import { HarnessError, ensureDir, exists, isFile, isRecord, readJson, readJsonIfExists, relPosix } from './util.ts';

export const KINDS = ['rule', 'skill', 'agent', 'script', 'hook', 'mcp'] as const;
export type Kind = (typeof KINDS)[number];

export interface Target {
  /** The folder with the layout of harness/: a harness/ folder or a project entry. */
  dir: string;
  plugin: string;
  /** The manifest that declares scripts, patches and project entries for this target. */
  manifest: string;
  entry: boolean;
  label: string;
}

const MCP_TEMPLATE = `// A minimal MCP server over stdio. Replace the tool with your own.
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') {
      send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'NAME', version: '0.1.0' } } });
    } else if (message.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'hello', description: 'Says hello', inputSchema: { type: 'object', properties: {} } }] } });
    } else if (message.method === 'tools/call') {
      send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'Hello from NAME' }] } });
    } else if (message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
    }
  }
});
`;

const title = (name: string): string => name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function writeNew(file: string, content: string): void {
  if (exists(file)) throw new HarnessError(`${file} already exists`);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}

function editManifest(file: string, edit: (ext: Record<string, unknown>) => void, plugin: string): void {
  const raw = readJsonIfExists(file);
  const manifest = isRecord(raw) ? raw : { $schema: PLUGIN_SCHEMA, name: plugin };
  const extensions = isRecord(manifest['extensions']) ? manifest['extensions'] : {};
  const ext = isRecord(extensions[NS]) ? extensions[NS] : {};
  edit(ext);
  extensions[NS] = ext;
  manifest['extensions'] = extensions;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function pluginNameFor(projectDir: string): string {
  const pkg = readJsonIfExists(path.join(projectDir, 'package.json'));
  const name = isRecord(pkg) && typeof pkg['name'] === 'string' ? pkg['name'] : path.basename(projectDir);
  return name.replace(/^@[^/]+\//, '').toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'project';
}

/** Where `new` writes: the project's harness/, an added harness (`--to`), or its entry (`--entry`). */
export function resolveTarget(projectDir: string, options: { to?: string; entry?: boolean }): Target {
  if (options.to === undefined) {
    if (options.entry) throw new HarnessError('--entry needs --to <plugin>');
    const dir = path.join(projectDir, 'harness');
    const manifest = path.join(dir, 'plugin.json');
    let plugin = pluginNameFor(projectDir);
    if (isFile(manifest)) {
      const raw = readJson(manifest);
      if (isRecord(raw) && typeof raw['name'] === 'string') plugin = raw['name'];
    } else {
      writeNew(manifest, `${JSON.stringify({ $schema: PLUGIN_SCHEMA, name: plugin }, null, 2)}\n`);
    }
    return { dir, plugin, manifest, entry: false, label: `the project harness (${relPosix(projectDir, dir)})` };
  }
  const warnings: string[] = [];
  const harness = loadAdded(projectDir, warnings).find((h) => h.pkg.plugin === options.to);
  if (!harness) throw new HarnessError(`No added harness with the plugin name "${options.to}". See \`npx harnesspm status\`.`);
  if (!harness.source.editable) throw new HarnessError(`${harness.source.spec} comes from npm and cannot be edited here. Change it in its own repository.`);
  const manifest = path.join(harness.pkg.harnessDir, 'plugin.json');
  if (!options.entry) return { dir: harness.pkg.harnessDir, plugin: harness.pkg.plugin, manifest, entry: false, label: `${harness.pkg.plugin} (${harness.source.dir})` };
  const key = remoteKey(projectDir);
  if (key === undefined) throw new HarnessError('--entry needs a repository with an "origin" remote');
  let rel = harness.pkg.ext.projects[key];
  if (rel === undefined) {
    rel = `./projects/${key.split('/').pop()}`;
    editManifest(manifest, (ext) => {
      const projects = isRecord(ext['projects']) ? ext['projects'] : {};
      projects[key] = rel;
      ext['projects'] = projects;
    }, harness.pkg.plugin);
  }
  const dir = path.resolve(harness.pkg.harnessDir, rel);
  ensureDir(dir);
  return { dir, plugin: harness.pkg.plugin, manifest: path.join(dir, 'plugin.json'), entry: true, label: `the entry of ${harness.pkg.plugin} for ${key} (${dir})` };
}

/** Creates a unit. Returns the files it wrote. */
export function createUnit(target: Target, kind: Kind, name: string): string[] {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new HarnessError('Use lowercase letters, digits and "-" in names');
  if (target.entry && (kind === 'script' || kind === 'hook' || kind === 'mcp')) {
    throw new HarnessError(`A project entry holds rules, skills, sub-agents and docs. Add the ${kind} to the harness itself (without --entry).`);
  }
  const files: string[] = [];
  const add = (file: string, content: string): void => {
    writeNew(file, content);
    files.push(file);
  };
  const scriptFile = (script: string): string => path.join(target.dir, NS, 'scripts', `${script}.mjs`);
  const declareScript = (script: string, description?: string): void => {
    editManifest(target.manifest, (ext) => {
      const scripts = isRecord(ext['scripts']) ? ext['scripts'] : {};
      if (scripts[script] !== undefined) throw new HarnessError(`The script "${script}" already exists`);
      scripts[script] = { file: `./${NS}/scripts/${script}.mjs`, ...(description !== undefined ? { description } : {}) };
      ext['scripts'] = scripts;
    }, target.plugin);
    files.push(target.manifest);
  };
  switch (kind) {
    case 'rule':
      add(path.join(target.dir, NS, 'rules', `${name}.md`), `# ${title(name)}\n\n- Write the rule here. Keep an always-on rule short: it is in every session.\n`);
      break;
    case 'skill': {
      const skill = name.startsWith(`${target.plugin}-`) ? name : `${target.plugin}-${name}`;
      add(path.join(target.dir, 'skills', skill, 'SKILL.md'), `---\nname: ${skill}\ndescription: What the skill does. Use when the user asks to … or mentions ….\n---\n\n# ${title(name)}\n\n1. First step.\n2. Next step.\n`);
      break;
    }
    case 'agent':
      add(path.join(target.dir, NS, 'agents', `${name}.md`), `---\nname: ${name}\ndescription: What the sub-agent does. Use when ….\n---\n\nInstructions for the sub-agent.\n`);
      break;
    case 'script':
      add(scriptFile(name), `// Run it with \`npx harnesspm run ${target.plugin}:${name} -- <args>\`.\n// PLUGIN_ROOT, PLUGIN_DATA, HARNESSPM_PROJECT_DIR and HARNESSPM_AGENT are set by the runner.\nconsole.log('${name}', process.argv.slice(2).join(' '));\n`);
      declareScript(name, `What ${name} does`);
      break;
    case 'hook': {
      add(scriptFile(name), `// A hook script: the agent's JSON event is on stdin. Exit 0 to continue, 2 to block (reason on stderr).\nimport { readFileSync } from 'node:fs';\nconst event = JSON.parse(readFileSync(0, 'utf8') || '{}');\nvoid event;\nprocess.exit(0);\n`);
      declareScript(name);
      const hooksFile = path.join(target.dir, NS, 'hooks.json');
      const raw = readJsonIfExists(hooksFile);
      const data = isRecord(raw) ? raw : {};
      const hooks = isRecord(data['hooks']) ? data['hooks'] : {};
      const list = Array.isArray(hooks['PostToolUse']) ? hooks['PostToolUse'] : [];
      list.push({ id: name, matcher: { claude: 'Edit|Write', codex: 'apply_patch' }, run: name, timeout: 30 });
      hooks['PostToolUse'] = list;
      data['hooks'] = hooks;
      fs.writeFileSync(hooksFile, `${JSON.stringify(data, null, 2)}\n`);
      files.push(hooksFile);
      break;
    }
    case 'mcp': {
      const script = `${name}-mcp`;
      add(scriptFile(script), MCP_TEMPLATE.replaceAll('NAME', `${target.plugin}-${name}`));
      const mcpFile = path.join(target.dir, 'mcp.json');
      const raw = readJsonIfExists(mcpFile);
      const data = isRecord(raw) ? raw : { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json' };
      const servers = isRecord(data['mcpServers']) ? data['mcpServers'] : {};
      if (servers[name] !== undefined) throw new HarnessError(`The MCP server "${name}" already exists`);
      servers[name] = { type: 'stdio', command: 'node', args: [`\${PLUGIN_ROOT}/${NS}/scripts/${script}.mjs`] };
      data['mcpServers'] = servers;
      fs.writeFileSync(mcpFile, `${JSON.stringify(data, null, 2)}\n`);
      files.push(mcpFile);
      break;
    }
  }
  return files;
}

/** The sections of a rule below its title: what a patch can replace. */
function patchTemplate(body: string): string {
  const lines = body.split('\n');
  const hs = headings(lines);
  const top = hs[0]?.level === 1 ? 1 : 0;
  const first = hs.find((h) => h.level > top);
  if (first) return `${lines.slice(first.line).join('\n').trim()}\n`;
  // Without sections below the title, the title's section is the whole rule: a patch of it replaces the rule.
  return hs[0] ? `${lines.slice(hs[0].line).join('\n').trim()}\n` : '';
}

/**
 * Writes a patch with a copy of the rule's sections and registers it (spec 10.2): in harness/plugin.json
 * when the rule reaches the project through its own harness's `extends`, otherwise in harnesspm.json;
 * with `--to`, in that added harness or its entry.
 */
export function createPatch(projectDir: string, res: Resolution, ruleId: string, options: { to?: string; entry?: boolean }): { file: string; registeredIn: string } {
  const rule = res.rules.find((r) => r.id === ruleId);
  if (!rule) throw new HarnessError(`No rule ${ruleId}. Find IDs in the AGENTS.md block or with \`npx harnesspm why <ID>\`.`);
  const fileName = `${ruleId.replace(':rules/', '-').replace(/[^a-z0-9.-]+/gi, '-')}.patch.md`;
  const body = parseFrontmatter(rule.text, rule.source).body;
  const content = patchTemplate(body) || `Text to add at the end of ${ruleId}.\n`;
  const register = (manifest: string, baseDir: string, file: string, plugin: string): { file: string; registeredIn: string } => {
    writeNew(file, content);
    editManifest(manifest, (ext) => {
      const patch = isRecord(ext['patch']) ? ext['patch'] : {};
      patch[ruleId] = `./${relPosix(baseDir, file)}`;
      ext['patch'] = patch;
    }, plugin);
    return { file, registeredIn: manifest };
  };
  if (options.to !== undefined) {
    const target = resolveTarget(projectDir, options);
    return register(target.manifest, target.dir, path.join(target.dir, NS, 'patches', fileName), target.plugin);
  }
  const own = res.packages.find((p) => p.layer === 'project');
  if (own && own.closure.has(rule.pkg.name)) {
    return register(path.join(own.harnessDir, 'plugin.json'), own.harnessDir, path.join(own.harnessDir, NS, 'patches', fileName), own.plugin);
  }
  const file = path.join(projectDir, 'harnesspm', 'patches', fileName);
  writeNew(file, content);
  const configFile = path.join(projectDir, CONFIG_FILE);
  const raw = readJsonIfExists(configFile);
  const config = isRecord(raw) ? raw : {};
  const patch = isRecord(config['patch']) ? config['patch'] : {};
  patch[ruleId] = `./${relPosix(projectDir, file)}`;
  config['patch'] = patch;
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  return { file, registeredIn: configFile };
}
