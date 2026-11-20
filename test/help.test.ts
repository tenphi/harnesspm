// `help <package>`, `help <rule ID>` and `help <tool>`, and the `usage` field of a script (spec 5.1, 10.1).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installPackage, PLUGIN_SCHEMA, project, read, run, skill, writeFiles } from './helpers.ts';

/** An app on @acme/kit, which has a rule with sections, a tool with a usage, a hook and a skill. Not trusted. */
function app(): string {
  const dir = project({ '@acme/kit': '1' });
  installPackage(dir, '@acme/kit', {
    plugin: 'kit',
    version: '1.2.0',
    ext: {
      scripts: {
        tokens: { file: './dev.harnesspm/scripts/tokens.mjs', description: 'Find a token', usage: '<part of a name> [--json]', allow: true },
        fmt: { file: './dev.harnesspm/scripts/fmt.mjs' },
      },
    },
    harness: {
      'dev.harnesspm/rules/usage.md': '# Kit\n\n## Components\n\nUse kit components.\n\n### Buttons\n\nOne primary button.\n\n## Colors\n\nUse tokens.\n',
      'dev.harnesspm/scripts/tokens.mjs': 'console.log("tokens");\n',
      'dev.harnesspm/scripts/fmt.mjs': 'process.exit(0);\n',
      'dev.harnesspm/hooks.json': JSON.stringify({ hooks: { PostToolUse: [{ id: 'fmt', matcher: { claude: 'Edit|Write', codex: 'apply_patch' }, run: 'fmt' }] } }),
      'skills/kit-review/SKILL.md': skill('kit-review'),
    },
  });
  return dir;
}

test('the block summarizes an always-on rule by its sections; help <package> prints it in full with every unit', () => {
  const dir = app();
  assert.equal(run(dir, 'sync').status, 0);
  const agents = read(dir, 'AGENTS.md');
  assert.match(agents, /^- Always-on rule: Kit — Components, Buttons, Colors\. Read it with `help @acme\/kit` \(kit:rules\/usage\)$/m);
  // An untrusted package's tools stay out of the block, as before.
  assert.doesNotMatch(agents, /Tool:/);

  const help = run(dir, 'help', '@acme/kit');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /### Kit \(kit:rules\/usage\)\n\nAlways on\.\n\n#### Components\n\nUse kit components\.\n\n##### Buttons\n\nOne primary button\.\n\n#### Colors\n\nUse tokens\.\n/);
  assert.match(help.stdout, /## Tools\n\n⚠️ {2}Not trusted in this project, so they stay off and `run` refuses them\. A person turns them on with "@acme\/kit": true in "trust" in harnesspm\.json\.\n- `npx -y @tenphi\/harnesspm run kit:tokens <part of a name> \[--json\]` — Find a token \(kit:scripts\/tokens\)\n/);
  assert.doesNotMatch(help.stdout, /kit:fmt` —/, 'a script without a description is not a tool');
  assert.match(help.stdout, /## Hooks\n\n⚠️ {2}Not trusted[^\n]*\n- PostToolUse, Claude Code on `Edit\|Write` and Codex on `apply_patch`: runs `kit:fmt` \(kit:hooks\/fmt\)\n/);
  assert.match(help.stdout, /## Skills\n\n- kit-review: read node_modules\/\.harnesspm\/pkgs\/@acme\/kit\/harness\/skills\/kit-review\/SKILL\.md \(kit:skills\/kit-review\)/);

  const tool = run(dir, 'help', 'kit:tokens');
  assert.equal(tool.status, 0, tool.stderr);
  assert.match(tool.stdout, /Usage: <part of a name> \[--json\]\nRun: {3}npx -y @tenphi\/harnesspm run kit:tokens \[args\]\n\n⚠️ {2}Not trusted/);
  const hookScript = run(dir, 'help', 'kit:fmt').stdout;
  assert.match(hookScript, /No description: hooks and MCP servers use it, agents do not run it themselves\./);

  // Trusted, the tool line in the block and in help lose the warning.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true } }) });
  assert.equal(run(dir, 'sync').status, 0);
  assert.match(read(dir, 'AGENTS.md'), /^- Tool: `kit:tokens` — Find a token \(kit:scripts\/tokens\)$/m);
  assert.doesNotMatch(run(dir, 'help', '@acme/kit').stdout, /Not trusted/);
});

test('a rule with no sections is summarized by its title alone; a command name still gets its own help', () => {
  const dir = project({ '@acme/kit': '1' });
  installPackage(dir, '@acme/kit', { plugin: 'kit', harness: { 'dev.harnesspm/rules/short.md': '# Short\n\nOne line.\n' } });
  assert.equal(run(dir, 'sync').status, 0);
  assert.match(read(dir, 'AGENTS.md'), /^- Always-on rule: Short\. Read it with `help @acme\/kit` \(kit:rules\/short\)$/m);
  assert.match(run(dir, 'help', 'sync').stdout, /^ {2}harnesspm sync/);
  assert.match(run(dir, 'help', 'kit:rules/short').stdout, /# Short \(kit:rules\/short\)\n\nAlways on\.\n\nOne line\.\n$/);
});

test('help outside a project that uses harnesspm says so', () => {
  const dir = project({}, {}, false);
  const result = run(dir, 'help', '@acme/kit');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No command "@acme\/kit", and \. does not use harnesspm/);
});

test('a script declares its usage; check rejects one that is not a string; new script writes one', () => {
  const dir = project({}, { name: '@acme/widgets', files: ['harness'] }, false);
  writeFiles(dir, {
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'widgets', extensions: { 'dev.harnesspm': { scripts: { probe: { file: './dev.harnesspm/scripts/probe.mjs', description: 'Probe', usage: ['--story'] } } } } }),
    'harness/dev.harnesspm/scripts/probe.mjs': '\n',
  });
  const check = run(dir, 'check');
  assert.equal(check.status, 1);
  assert.match(check.stdout, /script "probe": "usage" must be a string/);

  writeFiles(dir, { 'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'widgets' }) });
  assert.equal(run(dir, 'new', 'script', 'echo').status, 0);
  const manifest = JSON.parse(read(dir, 'harness/plugin.json'));
  assert.deepEqual(manifest.extensions['dev.harnesspm'].scripts.echo, { file: './dev.harnesspm/scripts/echo.mjs', description: 'What echo does', usage: '[<words>...]' });
  assert.match(read(dir, 'harness/dev.harnesspm/scripts/echo.mjs'), /`help widgets:echo` prints its "usage"/);
  assert.equal(run(dir, 'check').status, 0);
});
