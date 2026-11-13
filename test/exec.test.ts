import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { homeOf, installPackage, PLUGIN_SCHEMA, project, read, run, runWith, skill, writeFiles } from './helpers.ts';

const PROBE = `const out = { args: process.argv.slice(2), root: process.env.PLUGIN_ROOT, data: process.env.PLUGIN_DATA, agent: process.env.HARNESSPM_AGENT, project: process.env.HARNESSPM_PROJECT_DIR };
console.log(JSON.stringify(out));
const i = process.argv.indexOf('--exit');
process.exit(i > 0 ? Number(process.argv[i + 1]) : 0);
`;

function kitFiles(version = '1.0.0'): Parameters<typeof installPackage>[2] {
  return {
    plugin: 'kit',
    version,
    ext: {
      scripts: {
        probe: { file: './dev.harnesspm/scripts/probe.mjs', description: 'Print what the runner passes', allow: true },
        'check-styles': { file: './dev.harnesspm/scripts/check.mjs' },
        docs: { file: './dev.harnesspm/scripts/probe.mjs' },
      },
    },
    harness: {
      'dev.harnesspm/scripts/probe.mjs': PROBE,
      'dev.harnesspm/scripts/check.mjs': 'console.log("checked");\n',
      'dev.harnesspm/hooks.json': JSON.stringify({
        hooks: {
          PostToolUse: [{ id: 'check-styles', matcher: { claude: 'Edit|Write', codex: 'apply_patch' }, run: 'check-styles', timeout: 30 }],
          Notification: [{ id: 'notify', run: 'check-styles' }],
        },
      }),
      'mcp.json': JSON.stringify({
        mcpServers: {
          docs: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/dev.harnesspm/scripts/probe.mjs'] },
          figma: { type: 'streamable-http', url: 'https://example.com/mcp' },
        },
      }),
      'dev.harnesspm/permissions.json': JSON.stringify({ deny: [['git', 'push', '--force']], ask: [['npm', 'publish']] }),
      'dev.harnesspm/agents/kit-reviewer.md': '---\nname: kit-reviewer\ndescription: Reviews kit usage. Use for UI pull requests.\nclaude: { tools: "Read, Grep", permissionMode: "acceptEdits" }\ncodex: { model_reasoning_effort: "medium", sandbox_mode: "danger-full-access" }\n---\n\nReview like an owner.\n',
      'skills/kit-review/SKILL.md': skill('kit-review'),
      'dev.harnesspm/rules/usage.md': '# Usage\n\nUse the kit.\n',
    },
  };
}

function app(trust?: true | 'pin'): string {
  const dir = project({ '@acme/kit': '1' });
  installPackage(dir, '@acme/kit', kitFiles());
  if (trust !== undefined) writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': trust } }) });
  return dir;
}

const json = (file: string): Record<string, any> => JSON.parse(fs.readFileSync(file, 'utf8'));
const claudeJson = (dir: string): Record<string, any> => json(path.join(homeOf(dir), '.claude.json'));

function tomlOk(file: string): void {
  const check = spawnSync('python3', ['-c', 'import sys, tomllib; tomllib.load(open(sys.argv[1], "rb"))', file], { encoding: 'utf8' });
  if (check.error) return; // No python3 here: skip the TOML parse.
  assert.equal(check.status, 0, `${file} is valid TOML: ${check.stderr}`);
}

test('S8 untrusted: only restrictions are written; scripts, hooks and MCP servers stay pending', () => {
  const dir = app();
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /⏳ pending: @acme\/kit: 3 scripts, 2 hooks, 2 MCP servers \(not trusted; add it to "trust" in harnesspm\.json\)/);
  const settings = json(path.join(dir, '.claude/settings.local.json'));
  assert.deepEqual(settings, { permissions: { deny: ['Bash(git push --force *)'], ask: ['Bash(npm publish *)'] } });
  assert.match(read(dir, '.codex/rules/harnesspm.rules'), /prefix_rule\(pattern = \["git","push","--force"\], decision = "forbidden"\)/);
  assert.ok(!fs.existsSync(path.join(homeOf(dir), '.claude.json')));
  assert.ok(!fs.existsSync(path.join(dir, '.codex/hooks.json')));
  const agent = read(dir, '.claude/agents/kit-reviewer.md');
  assert.match(agent, /tools: Read, Grep/);
  assert.doesNotMatch(agent, /permissionMode/, 'a widening key needs trust');
  assert.doesNotMatch(read(dir, '.codex/agents/kit-reviewer.toml'), /sandbox_mode/);
  assert.match(result.stderr, /"permissionMode" is left out, because @acme\/kit is not trusted/);
  assert.doesNotMatch(read(dir, 'AGENTS.md'), /Script:/, 'untrusted scripts are not listed');
  const refused = run(dir, 'run', 'kit:probe');
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /Script kit:probe of @acme\/kit is refused: not trusted/);
});

test('S8 trusted: hooks, MCP servers, permissions and sub-agents for both agents', () => {
  const dir = app(true);
  writeFiles(dir, { '.claude/settings.local.json': JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }) });
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /pending/);

  const settings = json(path.join(dir, '.claude/settings.local.json'));
  assert.deepEqual(settings.permissions.allow, ['Bash(ls)', 'Skill(kit-review)', 'Bash(npx harnesspm run kit:probe *)', 'mcp__kit-docs', 'mcp__kit-figma']);
  assert.deepEqual(settings.permissions.deny, ['Bash(git push --force *)']);
  assert.deepEqual(settings.hooks.PostToolUse, [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx harnesspm run --agent claude kit:check-styles', timeout: 30 }] }]);
  assert.equal(settings.hooks.Notification[0].hooks[0].command, 'npx harnesspm run --agent claude kit:check-styles');
  assert.deepEqual(settings.hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo mine' }] }], "the person's own hook stays");

  const servers = claudeJson(dir).projects[fs.realpathSync(dir)].mcpServers;
  assert.deepEqual(servers['kit-docs'], { type: 'stdio', command: 'npx', args: ['harnesspm', 'mcp', '--agent', 'claude', 'kit:docs'] });
  assert.deepEqual(servers['kit-figma'], { type: 'http', url: 'https://example.com/mcp' });

  const codexHooks = json(path.join(dir, '.codex/hooks.json'));
  assert.deepEqual(codexHooks.hooks.PostToolUse, [{ matcher: 'apply_patch', hooks: [{ type: 'command', command: 'npx harnesspm run --agent codex kit:check-styles', timeout: 30 }] }]);
  assert.equal(codexHooks.hooks.Notification, undefined, 'Codex has no Notification event');
  const rules = read(dir, '.codex/rules/harnesspm.rules');
  assert.match(rules, /prefix_rule\(pattern = \["npx","harnesspm","run","kit:probe"\], decision = "allow"\)/);
  assert.match(rules, /decision = "prompt"/);
  const codexConfig = read(dir, '.codex/config.toml');
  assert.match(codexConfig, /\[mcp_servers\."kit-docs"\]\ncommand = "npx"\nargs = \["harnesspm", "mcp", "--agent", "codex", "kit:docs"\]/);
  assert.match(codexConfig, /\[mcp_servers\."kit-figma"\]\nurl = "https:\/\/example\.com\/mcp"/);
  tomlOk(path.join(dir, '.codex/config.toml'));
  assert.match(read(dir, '.claude/agents/kit-reviewer.md'), /permissionMode: acceptEdits/);
  assert.match(read(dir, '.codex/agents/kit-reviewer.toml'), /sandbox_mode = "danger-full-access"\ndeveloper_instructions = """\nReview like an owner\.\n"""/);
  tomlOk(path.join(dir, '.codex/agents/kit-reviewer.toml'));
  assert.match(read(dir, 'AGENTS.md'), /- Script: `npx harnesspm run kit:probe` — Print what the runner passes \(kit:scripts\/probe\)/);

  const exclude = read(dir, '.git/info/exclude');
  for (const entry of ['/.claude/settings.local.json', '/.codex/hooks.json', '/.codex/config.toml', '/.codex/rules/harnesspm.rules', '/.claude/agents/kit-reviewer.md', '/.codex/agents/kit-reviewer.toml']) {
    assert.ok(exclude.includes(`${entry}\n`), entry);
  }
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout.split('\n').filter((l) => /\.claude|\.codex/.test(l)).length, 0);

  // The runner passes arguments and the environment, and returns the script's exit code.
  const ran = run(dir, 'run', 'kit:probe', '--', '--story', 'Button', '--exit', '3');
  assert.equal(ran.status, 3);
  const seen = JSON.parse(ran.stdout);
  assert.deepEqual(seen.args, ['--story', 'Button', '--exit', '3']);
  assert.equal(seen.root, fs.realpathSync(path.join(dir, 'node_modules/@acme/kit/harness')));
  assert.equal(seen.project, fs.realpathSync(dir));
  assert.ok(seen.data.endsWith(path.join('.harnesspm', 'data', 'kit')));
  assert.equal(JSON.parse(run(dir, 'run', '--agent', 'codex', 'kit:probe').stdout).agent, 'codex');

  // Trust taken away: harnesspm's entries go, the person's own stay.
  writeFiles(dir, { 'harnesspm.json': '{}' });
  run(dir, 'sync');
  const after = json(path.join(dir, '.claude/settings.local.json'));
  assert.deepEqual(after.permissions.allow, ['Bash(ls)']);
  assert.deepEqual(after.hooks, { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] });
  assert.ok(!fs.existsSync(path.join(dir, '.codex/hooks.json')));
  assert.ok(!fs.existsSync(path.join(homeOf(dir), '.claude.json')) || claudeJson(dir).projects === undefined);
  assert.ok(!fs.existsSync(path.join(dir, '.codex/config.toml')), 'a Codex config with nothing left goes away');
});

test('"pin": a new version stays off until a person approves it', () => {
  const dir = app('pin');
  run(dir, 'sync');
  assert.equal(JSON.parse(read(dir, 'harnesspm.lock.json')).packages['@acme/kit'].approved, '1.0.0');
  assert.ok(json(path.join(dir, '.claude/settings.local.json')).hooks);

  installPackage(dir, '@acme/kit', kitFiles('1.1.0'));
  const synced = run(dir, 'sync');
  assert.match(synced.stdout, /pending: @acme\/kit: .*version 1\.1\.0 is not approved \(approved: 1\.0\.0\)/);
  assert.equal(json(path.join(dir, '.claude/settings.local.json')).hooks, undefined);
  const check = run(dir, 'sync', '--check');
  assert.equal(check.status, 1);
  assert.match(check.stdout, /@acme\/kit 1\.1\.0 is pinned and not approved/);
  assert.equal(run(dir, 'run', 'kit:probe').status, 2);

  const model = runWith(dir, { AI_AGENT: 'claude-code_2_agent' }, 'approve');
  assert.equal(model.status, 1);
  assert.match(model.stderr, /is for a person/);
  const approved = run(dir, 'approve', '@acme/kit');
  assert.equal(approved.status, 0, approved.stderr);
  assert.match(approved.stdout, /approved @acme\/kit 1\.1\.0/);
  assert.equal(JSON.parse(read(dir, 'harnesspm.lock.json')).packages['@acme/kit'].approved, '1.1.0');
  assert.ok(json(path.join(dir, '.claude/settings.local.json')).hooks);
  assert.equal(run(dir, 'sync', '--check').status, 0);
  assert.equal(run(dir, 'run', 'kit:probe').status, 0);
});

test('rule 4: a model run adds no allow rules, hooks or MCP servers, and keeps the ones a person granted', () => {
  const markers: Record<string, string>[] = [{ AI_AGENT: 'claude-code_2-1-322_agent', CLAUDECODE: '1' }, { CODEX_CI: '1', CODEX_TOOL_CALL_ID: 'call_1' }];
  for (const env of markers) {
    const dir = app(true);
    const model = runWith(dir, env, 'sync');
    assert.equal(model.status, 0, model.stderr);
    assert.match(model.stdout, /⏳ held back: \d+ entries that an agent cannot grant/);
    const settings = json(path.join(dir, '.claude/settings.local.json'));
    assert.deepEqual(Object.keys(settings.permissions).sort(), ['ask', 'deny'], 'restrictions are written');
    assert.equal(settings.hooks, undefined);
    assert.ok(!fs.existsSync(path.join(homeOf(dir), '.claude.json')));
    assert.match(run(dir, 'status').stdout, /held back/);

    run(dir, 'sync');
    const granted = json(path.join(dir, '.claude/settings.local.json'));
    assert.ok(granted.hooks.PostToolUse);
    runWith(dir, env, 'sync');
    assert.deepEqual(json(path.join(dir, '.claude/settings.local.json')), granted, 'a model run keeps what a person granted');
  }
});

test('outside a git repository, sync keeps its state in ~/.harnesspm and creates no .git folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-nogit-'));
  writeFiles(dir, {
    'package.json': JSON.stringify({ name: 'app', version: '1.0.0', devDependencies: { '@acme/kit': '1' } }),
    'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true } }),
  });
  installPackage(dir, '@acme/kit', kitFiles());
  assert.equal(run(dir, 'sync').status, 0);
  assert.ok(!fs.existsSync(path.join(dir, '.git')), 'no .git folder in a folder that is not a repository');
  assert.equal(fs.readdirSync(path.join(homeOf(dir), '.harnesspm', 'state')).length, 1);
  // The state is read back: the next sync replaces harnesspm's own hook instead of adding a second one.
  assert.equal(run(dir, 'sync').status, 0);
  assert.equal(json(path.join(dir, '.claude/settings.local.json')).hooks.PostToolUse.length, 1);
  assert.equal(run(dir, 'status').status, 0);
  assert.ok(!fs.existsSync(path.join(dir, '.git')));
});

test("exclude drops a package's hook, and a hook whose script is excluded", () => {
  const dir = app(true);
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, exclude: ['kit:hooks/notify', 'kit:scripts/check-styles', 'kit:mcp/figma'] }) });
  const result = run(dir, 'sync');
  assert.match(result.stderr, /kit:hooks\/check-styles is dropped: its script kit:check-styles is excluded or missing/);
  const settings = json(path.join(dir, '.claude/settings.local.json'));
  assert.equal(settings.hooks, undefined);
  assert.ok(!settings.permissions.allow.includes('mcp__kit-figma'));
});

test('the runner refuses a package whose installed version differs from the lock', () => {
  const dir = app(true);
  run(dir, 'sync');
  const pkgFile = path.join(dir, 'node_modules/@acme/kit/package.json');
  fs.writeFileSync(pkgFile, JSON.stringify({ name: '@acme/kit', version: '1.0.1' }));
  const refused = run(dir, 'run', 'kit:probe');
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /@acme\/kit 1\.0\.1 is installed, but the lock has 1\.0\.0\. Run `npx harnesspm sync`/);
});

test('added harnesses: executables at user level, and the runner finds their scripts', () => {
  const dir = project({});
  const mine = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-mine-'));
  writeFiles(mine, {
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'me', extensions: { 'dev.harnesspm': { scripts: { probe: { file: './dev.harnesspm/scripts/probe.mjs', description: 'Mine', allow: true } } } } }),
    'harness/dev.harnesspm/scripts/probe.mjs': PROBE,
    'harness/dev.harnesspm/hooks.json': JSON.stringify({ hooks: { Stop: [{ id: 'done', run: 'probe' }] } }),
    'harness/mcp.json': JSON.stringify({ mcpServers: { notes: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/dev.harnesspm/scripts/probe.mjs'] } } }),
  });
  writeFiles(homeOf(dir), { '.codex/config.toml': 'model = "gpt-5"\n' });
  const added = run(dir, 'add', mine);
  assert.equal(added.status, 0, added.stderr);
  const home = homeOf(dir);
  const settings = json(path.join(home, '.claude/settings.json'));
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'npx -y @tenphi/harnesspm run --agent claude me:probe');
  // The allow rule has the same prefix as the command the block names.
  assert.ok(settings.permissions.allow.includes('Bash(npx -y @tenphi/harnesspm run me:probe *)'));
  assert.ok(settings.permissions.allow.includes('mcp__me-notes'));
  assert.deepEqual(json(path.join(home, '.claude.json')).mcpServers['me-notes'], { type: 'stdio', command: 'npx', args: ['-y', '@tenphi/harnesspm', 'mcp', '--agent', 'claude', 'me:notes'] });
  const codexConfig = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
  assert.ok(codexConfig.startsWith('model = "gpt-5"\n\n# BEGIN harnesspm'));
  tomlOk(path.join(home, '.codex/config.toml'));
  assert.match(fs.readFileSync(path.join(home, '.claude/CLAUDE.md'), 'utf8'), /- Script: `npx -y @tenphi\/harnesspm run me:probe` — Mine \(me:scripts\/probe\)/);

  const ran = run(dir, 'run', 'me:probe', '--', 'x');
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(JSON.parse(ran.stdout).args, ['x']);

  run(dir, 'remove', mine);
  assert.equal(fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8'), 'model = "gpt-5"\n');
  assert.ok(!fs.existsSync(path.join(home, '.claude.json')) || json(path.join(home, '.claude.json')).mcpServers === undefined);
  assert.ok(!fs.existsSync(path.join(home, '.claude/settings.json')));
});

test('check reports problems in executable units', () => {
  const dir = project({}, { files: ['harness'] });
  writeFiles(dir, {
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'lib', extensions: { 'dev.harnesspm': { scripts: { a: { file: './dev.harnesspm/scripts/a.mjs' } } } } }),
    'harness/dev.harnesspm/scripts/a.mjs': '',
    'harness/dev.harnesspm/hooks.json': JSON.stringify({ hooks: { PreToolUse: [{ id: 'x', run: 'missing' }] } }),
    'harness/dev.harnesspm/permissions.json': JSON.stringify({ allow: [['rm']] }),
    'harness/mcp.json': JSON.stringify({ mcpServers: { s: { type: 'stdio' } } }),
  });
  const result = run(dir, 'check');
  assert.equal(result.status, 1);
  const text = result.stdout + result.stderr;
  assert.match(text, /hook "x" runs "missing", which is not in "scripts"/);
  assert.match(text, /"allow" is not supported/);
  assert.match(text, /stdio server "s" needs a "command"/);
});

test('why explains scripts, hooks, MCP servers, sub-agents and permissions, with their trust', () => {
  const dir = app();
  const why = (id: string): string => {
    const result = run(dir, 'why', id);
    assert.equal(result.status, 0, `${id}: ${result.stderr}`);
    return result.stdout;
  };

  const script = why('kit:scripts/probe');
  assert.match(script, /owner +dependency @acme\/kit 1\.0\.0/);
  assert.match(script, /source +node_modules\/\.harnesspm\/pkgs\/@acme\/kit\/harness\/dev\.harnesspm\/scripts\/probe\.mjs/);
  assert.match(script, /run +npx harnesspm run kit:probe/);
  assert.match(script, /trust +no: it stays off\. Add "@acme\/kit": true to "trust" in harnesspm\.json/);
  assert.match(why('kit:hooks/check-styles'), /source +.*\/harness\/dev\.harnesspm\/hooks\.json/);
  assert.match(why('kit:mcp/docs'), /source +.*\/harness\/mcp\.json/);
  assert.match(why('kit:agents/kit-reviewer'), /source +.*\/harness\/dev\.harnesspm\/agents\/kit-reviewer\.md/);
  const permissions = why('kit:permissions');
  assert.match(permissions, /source +.*\/harness\/dev\.harnesspm\/permissions\.json/);
  assert.doesNotMatch(permissions, /trust/, 'deny and ask rules need no trust');

  assert.match(run(app(true), 'why', 'kit:scripts/probe').stdout, /trust +yes/);
  assert.match(run(app('pin'), 'why', 'kit:scripts/probe').stdout, /trust +pinned/);
  assert.match(run(dir, 'why', 'kit:scripts/nope').stderr, /No unit kit:scripts\/nope\. Units of kit: .*kit:scripts\/probe/);
});
