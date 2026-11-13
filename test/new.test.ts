import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { installPackage, PLUGIN_SCHEMA, project, read, run, writeFiles } from './helpers.ts';

const RULE = '---\ndescription: How to write state maps\npaths: ["**/*.tsx"]\n---\n\n# State maps\n\nIntro.\n\n## One map\n\nPut every state in one map.\n\n## Order\n\nDefault first.\n';

test('S1: new creates a harness with one rule, and every template is valid', () => {
  const dir = project({}, { name: '@acme/widgets', files: ['harness'] }, false);
  const first = run(dir, 'new', 'rule', 'usage');
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(read(dir, 'harness/plugin.json')), { $schema: PLUGIN_SCHEMA, name: 'widgets' });
  assert.match(read(dir, 'harness/dev.harnesspm/rules/usage.md'), /^# Usage\n/);
  for (const [kind, name] of [['skill', 'review'], ['agent', 'reviewer'], ['script', 'probe'], ['hook', 'fmt'], ['mcp', 'notes']] as const) {
    const result = run(dir, 'new', kind, name);
    assert.equal(result.status, 0, `${kind}: ${result.stderr}`);
  }
  assert.ok(fs.existsSync(path.join(dir, 'harness/skills/widgets-review/SKILL.md')), 'a skill name starts with the plugin name');
  const manifest = JSON.parse(read(dir, 'harness/plugin.json'));
  assert.deepEqual(Object.keys(manifest.extensions['dev.harnesspm'].scripts), ['probe', 'fmt']);
  assert.equal(JSON.parse(read(dir, 'harness/dev.harnesspm/hooks.json')).hooks.PostToolUse[0].run, 'fmt');
  assert.equal(JSON.parse(read(dir, 'harness/mcp.json')).mcpServers.notes.args[0], '${PLUGIN_ROOT}/dev.harnesspm/scripts/notes-mcp.mjs');
  const check = run(dir, 'check');
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.equal(run(dir, 'new', 'rule', 'usage').status, 1, 'never overwrites');
  assert.match(run(dir, 'new', 'widget', 'x').stderr, /Unknown kind "widget"/);

  // The generated MCP server answers.
  const reply = spawnSync(process.execPath, [path.join(dir, 'harness/dev.harnesspm/scripts/notes-mcp.mjs')], {
    input: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hello"}}\n',
    encoding: 'utf8',
  });
  assert.match(reply.stdout, /Hello from widgets-notes/);
});

test('S4: new patch copies the sections and registers the patch in harnesspm.json', () => {
  const dir = project({ '@tenphi/tasty': '1' });
  installPackage(dir, '@tenphi/tasty', { plugin: 'tasty', harness: { 'dev.harnesspm/rules/state-maps.md': RULE } });
  const result = run(dir, 'new', 'patch', 'tasty:rules/state-maps');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Wrote harnesspm\/patches\/tasty-state-maps\.patch\.md, registered in harnesspm\.json/);
  assert.equal(read(dir, 'harnesspm/patches/tasty-state-maps.patch.md'), '## One map\n\nPut every state in one map.\n\n## Order\n\nDefault first.\n');
  assert.deepEqual(JSON.parse(read(dir, 'harnesspm.json')).patch, { 'tasty:rules/state-maps': './harnesspm/patches/tasty-state-maps.patch.md' });
  writeFiles(dir, { 'harnesspm/patches/tasty-state-maps.patch.md': '## Order\n\nAlphabetical.\n' });
  run(dir, 'sync');
  assert.match(read(dir, 'node_modules/.harnesspm/rules/tasty/state-maps.md'), /## Order\n\nAlphabetical\./);
  assert.match(run(dir, 'new', 'patch', 'tasty:rules/nope').stderr, /No rule tasty:rules\/nope/);
  // A rule without sections below its title: the patch copies the whole rule, which then replaces it.
  installPackage(dir, '@acme/kit', { plugin: 'kit', harness: { 'dev.harnesspm/rules/word.md': '# Kit word\n\nWord of the kit: sienna-lark.\n' } });
  const pkg = JSON.parse(read(dir, 'package.json'));
  pkg.devDependencies['@acme/kit'] = '1';
  writeFiles(dir, { 'package.json': JSON.stringify(pkg) });
  run(dir, 'new', 'patch', 'kit:rules/word');
  assert.equal(read(dir, 'harnesspm/patches/kit-word.patch.md'), '# Kit word\n\nWord of the kit: sienna-lark.\n');
  assert.match(run(dir, 'new', '--help').stdout, /harnesspm new <kind> <name>/);
});

test("new patch goes into harness/plugin.json when the rule comes through the project's own extends", () => {
  const dir = project({ '@tenphi/tasty': '1' }, { name: '@cube-dev/ui-kit' });
  installPackage(dir, '@tenphi/tasty', { plugin: 'tasty', harness: { 'dev.harnesspm/rules/state-maps.md': RULE } });
  writeFiles(dir, { 'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'uikit', extensions: { 'dev.harnesspm': { extends: ['@tenphi/tasty'] } } }) });
  const result = run(dir, 'new', 'patch', 'tasty:rules/state-maps');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(read(dir, 'harness/plugin.json')).extensions['dev.harnesspm'].patch, { 'tasty:rules/state-maps': './dev.harnesspm/patches/tasty-state-maps.patch.md' });
  assert.ok(fs.existsSync(path.join(dir, 'harness/dev.harnesspm/patches/tasty-state-maps.patch.md')));
  assert.equal(JSON.parse(read(dir, 'harnesspm.json')).patch, undefined);
  assert.equal(run(dir, 'check').status, 0, 'the patch file is not discovered as a rule');
});

test('new --to writes into an added harness, and --entry into its entry for this repository', () => {
  const dir = project({});
  spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/app.git'], { cwd: dir });
  const mine = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-mine-'));
  writeFiles(mine, { 'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'alex' }) });
  run(dir, 'add', mine);
  const rule = run(dir, 'new', 'rule', 'workflow', '--to', 'alex');
  assert.equal(rule.status, 0, rule.stderr);
  assert.ok(fs.existsSync(path.join(mine, 'harness/dev.harnesspm/rules/workflow.md')));
  const entry = run(dir, 'new', 'rule', 'local-setup', '--to', 'alex', '--entry');
  assert.equal(entry.status, 0, entry.stderr);
  assert.deepEqual(JSON.parse(read(mine, 'harness/plugin.json')).extensions['dev.harnesspm'].projects, { 'github.com/acme/app': './projects/app' });
  assert.ok(fs.existsSync(path.join(mine, 'harness/projects/app/dev.harnesspm/rules/local-setup.md')));
  assert.match(read(dir, 'CLAUDE.local.md'), /### Local setup \(alex:rules\/local-setup\)/, 'sync ran');
  assert.match(run(dir, 'new', 'script', 'x', '--to', 'alex', '--entry').stderr, /A project entry holds rules, skills, sub-agents and docs/);
  assert.match(run(dir, 'new', 'rule', 'x', '--to', 'nobody').stderr, /No added harness with the plugin name "nobody"/);
});
