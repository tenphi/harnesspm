import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { findWorkspaces } from '../src/workspaces.ts';
import { installPackage, isLink, PLUGIN_SCHEMA, project, read, run, skill, writeFiles } from './helpers.ts';

const rule = (title: string, text: string): string => `# ${title}\n\n${text}\n`;

/** mono/ with packages/web (frontend), packages/api (backend) and packages/ui (a workspace with its own harness). */
function mono(): string {
  const dir = project({}, { name: 'mono', private: true, workspaces: ['packages/*'] });
  writeFiles(dir, {
    'packages/web/package.json': JSON.stringify({ name: '@acme/web', dependencies: { '@acme/lint': '1', '@cube-dev/ui-kit': '1', '@tenphi/tasty': '3', '@acme/ui': '*' } }),
    'packages/api/package.json': JSON.stringify({ name: '@acme/api', dependencies: { '@acme/lint': '1', '@acme/server-kit': '1', '@tenphi/tasty': '2' } }),
    'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '0.1.0', dependencies: { '@acme/lint': '1' } }),
    'packages/ui/harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'ui' }),
    'packages/ui/harness/dev.harnesspm/rules/tokens.md': rule('Tokens', 'UI uses design tokens.'),
  });
  installPackage(dir, '@acme/lint', { plugin: 'lint', harness: { 'dev.harnesspm/rules/style.md': rule('Style', 'Shared lint style.') } });
  installPackage(dir, '@cube-dev/ui-kit', {
    plugin: 'uikit',
    harness: {
      'dev.harnesspm/rules/forms.md': '---\ndescription: Forms\npaths: ["**/*.tsx"]\n---\n\n# Forms\n\nControllers.\n',
      'skills/uikit-review/SKILL.md': skill('uikit-review'),
    },
  });
  installPackage(dir, '@acme/server-kit', { plugin: 'server', harness: { 'dev.harnesspm/rules/handlers.md': rule('Handlers', 'Validate input.'), 'skills/server-deploy/SKILL.md': skill('server-deploy') } });
  installPackage(dir, '@tenphi/tasty', { plugin: 'tasty', version: '2.0.0', harness: { 'dev.harnesspm/rules/v.md': rule('Version', 'Tasty two.') } });
  installPackage(path.join(dir, 'packages/web'), '@tenphi/tasty', { plugin: 'tasty', version: '3.0.0', harness: { 'dev.harnesspm/rules/v.md': rule('Version', 'Tasty three.') } });
  // npm links workspaces into the root node_modules.
  fs.symlinkSync('../../packages/ui', path.join(dir, 'node_modules/@acme/ui'));
  return dir;
}

test('S7: each workspace gets its own block; what every workspace shares is written once, at the root', () => {
  const dir = mono();
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /@tenphi\/tasty: found versions .*using 3\.0\.0/, 'one version per repository');

  const root = read(dir, 'AGENTS.md');
  assert.match(root, /- Always-on rule: Style\. Read it with `help @acme\/lint` \(lint:rules\/style\)/, 'shared by every workspace');
  assert.doesNotMatch(root, /uikit|server:|ui:rules/);
  // An agent that works through the shell never loads a workspace's block, so the always-on root names them (#23).
  assert.match(root, /<!-- BEGIN:harnesspm[^\n]*\n\n- Every package of this harness: [^]*\n\n## Workspaces\n\nThese folders have harness rules of their own in their `AGENTS\.md`: `packages\/api`, `packages\/ui`, `packages\/web`\. Read a folder's `AGENTS\.md` before you change files in it\.\n\n## @acme\/lint/);

  const web = read(dir, 'packages/web/AGENTS.md');
  assert.match(web, /## @cube-dev\/ui-kit\n/);
  assert.match(web, /read \.\.\/\.\.\/node_modules\/\.harnesspm\/pkgs\/@cube-dev\/ui-kit\/harness\/dev\.harnesspm\/rules\/forms\.md/, 'paths are relative to the workspace');
  assert.match(web, /^- Every package of this harness: /m, 'each block starts with the commands');
  assert.match(web, /- Always-on rule: Tokens\. Read it with `help @acme\/ui` \(ui:rules\/tokens\)/, 'a workspace dependency brings its harness');
  assert.match(web, /- Always-on rule: Version\. Read it with `help @tenphi\/tasty` \(tasty:rules\/v\)/);
  assert.match(run(dir, 'help', '@tenphi/tasty').stdout, /Tasty three\./, 'help reads the version the repository resolves');
  assert.doesNotMatch(web, /server:|lint:/);
  assert.equal(read(dir, 'packages/web/CLAUDE.md'), '@AGENTS.md\n');

  const api = read(dir, 'packages/api/AGENTS.md');
  assert.match(api, /- Always-on rule: Handlers\. Read it with `help @acme\/server-kit` \(server:rules\/handlers\)/);
  assert.doesNotMatch(api, /uikit|ui:rules/);
  assert.match(read(dir, 'packages/ui/AGENTS.md'), /## @acme\/ui \(this project\)\n\n- Always-on rule: Tokens\. Read it with `help @acme\/ui` \(ui:rules\/tokens\)/, "a workspace's own harness");

  // Skills and executable units are written at the root.
  assert.ok(isLink(dir, '.claude/skills/uikit-review'));
  assert.ok(isLink(dir, '.claude/skills/server-deploy'));
  assert.ok(!fs.existsSync(path.join(dir, 'packages/web/.claude')));

  assert.equal(run(dir, 'sync', '--check').status, 0);
  // Once committed, a workspace's AGENTS.md is also a nested one that git tracks: still one import.
  spawnSync('git', ['add', 'packages'], { cwd: dir });
  assert.match(run(dir, 'sync').stdout, /Nothing changed/);
  assert.equal(read(dir, 'packages/web/CLAUDE.md'), '@AGENTS.md\n');
  writeFiles(dir, { 'node_modules/@acme/server-kit/harness/dev.harnesspm/rules/handlers.md': rule('Handlers', '## Input\n\nValidate all input.') });
  const check = run(dir, 'sync', '--check');
  assert.equal(check.status, 1);
  assert.match(check.stdout, /packages\/api\/AGENTS\.md: the harnesspm block is out of date/);

  // sync works from inside a workspace.
  assert.equal(run(path.join(dir, 'packages/api'), 'sync').status, 0);
  assert.match(read(dir, 'packages/api/AGENTS.md'), /- Always-on rule: Handlers — Input\./);
  assert.match(run(path.join(dir, 'packages/api'), 'help', 'server:rules/handlers').stdout, /Validate all input\./, 'help works from inside a workspace');

  // A workspace that no longer has units loses its block; a file that held only the block goes away.
  writeFiles(dir, { 'packages/api/package.json': JSON.stringify({ name: '@acme/api', dependencies: { '@acme/lint': '1' } }) });
  run(dir, 'sync');
  assert.ok(!fs.existsSync(path.join(dir, 'packages/api/AGENTS.md')));
  assert.ok(!fs.existsSync(path.join(dir, '.claude/skills/server-deploy')));
  assert.match(read(dir, 'AGENTS.md'), /in their `AGENTS\.md`: `packages\/ui`, `packages\/web`\./, 'the root names only workspaces with a block');
});

test('a workspace that another workspace depends on is the project\'s own code, so it is trusted', () => {
  const dir = mono();
  writeFiles(dir, {
    'packages/ui/harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'ui', extensions: { 'dev.harnesspm': { scripts: { tokens: { file: './dev.harnesspm/scripts/tokens.mjs', description: 'List tokens', allow: true } } } } }),
    'packages/ui/harness/dev.harnesspm/scripts/tokens.mjs': 'console.log("tokens");\n',
  });
  const result = run(dir, 'sync');
  assert.doesNotMatch(result.stdout, /pending: @acme\/ui/);
  assert.match(read(dir, 'packages/web/AGENTS.md'), /- Tool: `ui:tokens` — List tokens/);
  assert.equal(run(dir, 'run', 'ui:tokens').stdout.trim(), 'tokens');
});

test('a workspace harness whose docs folder a build writes and git ignores: sync gives the same lock and blocks before and after the build', () => {
  const dir = mono();
  writeFiles(dir, {
    'packages/ui/harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'ui', extensions: { 'dev.harnesspm': { docs: '../docs' } } }),
    '.gitignore': 'node_modules/\n/packages/ui/docs/\n',
  });
  assert.equal(run(dir, 'sync').status, 0);
  const before = { lock: read(dir, 'harnesspm.lock.json'), web: read(dir, 'packages/web/AGENTS.md') };
  assert.doesNotMatch(before.lock, /ui:docs/);

  // The build writes the docs. sync --check still passes, and nothing changes.
  writeFiles(dir, { 'packages/ui/docs/button.md': '# Button\n', 'packages/ui/docs/forms.md': '# Forms\n' });
  const check = run(dir, 'sync', '--check');
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(run(dir, 'sync').stdout, /Nothing changed/);
  assert.equal(read(dir, 'harnesspm.lock.json'), before.lock);
  assert.equal(read(dir, 'packages/web/AGENTS.md'), before.web);
  assert.doesNotMatch(before.web, /ui:docs/);

  // An exclude from before this fix stays quiet, built or not.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ exclude: ['ui:docs'] }) });
  assert.doesNotMatch(run(dir, 'sync').stderr, /ui:docs/);
  fs.rmSync(path.join(dir, 'packages/ui/docs'), { recursive: true });
  assert.doesNotMatch(run(dir, 'sync').stderr, /ui:docs/);

  // A docs folder that git keeps is a unit, as before.
  writeFiles(dir, { '.gitignore': 'node_modules/\n', 'harnesspm.json': '{}\n', 'packages/ui/docs/button.md': '# Button\n' });
  assert.equal(run(dir, 'sync').status, 0);
  assert.match(read(dir, 'harnesspm.lock.json'), /"ui:docs"/);
});

test('pnpm-workspace.yaml and negated patterns', () => {
  const dir = project({}, { name: 'mono' });
  writeFiles(dir, {
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/**'\n  - '!packages/legacy'\n",
    'apps/site/package.json': '{}',
    'packages/a/package.json': '{}',
    'packages/group/b/package.json': '{}',
    'packages/legacy/package.json': '{}',
    'packages/notes/README.md': '',
  });
  const found = findWorkspaces(dir).map((d) => path.relative(dir, d));
  assert.deepEqual(found, ['apps/site', 'packages/a', 'packages/group/b']);
});
