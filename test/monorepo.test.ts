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

test('workspace rules use only their own patches and replacements, while skills keep the shared original', () => {
  const dir = project({}, { workspaces: ['packages/*'] });
  const ui = path.join(dir, 'packages/ui');
  writeFiles(dir, {
    'packages/ui/package.json': JSON.stringify({ dependencies: { theme: '1' } }),
    'packages/site/package.json': JSON.stringify({ dependencies: { site: '1' } }),
    'packages/shop/package.json': JSON.stringify({ dependencies: { shop: '1' } }),
    'packages/site/src/index.ts': '',
  });
  const fileRule = (text: string): string => `---\npaths: ['**/*.ts']\n---\n# Theme style\n\n## Colors\n\n${text}\n`;
  installPackage(dir, 'theme', {
    plugin: 'theme',
    harness: {
      'dev.harnesspm/rules/colors.md': rule('Theme colors', '## Palette\n\nOriginal palette.'),
      'dev.harnesspm/rules/style.md': fileRule('Original style.'),
      'dev.harnesspm/rules/shared.md': rule('Shared rule', 'Shared by all workspaces.'),
      'skills/theme-builder/SKILL.md': skill('theme-builder', 'Build an original theme.'),
    },
  });
  installPackage(dir, 'site', {
    plugin: 'site',
    ext: {
      extends: ['theme'],
      patch: { 'theme:rules/colors': './colors.patch.md', 'theme:rules/style': './style.patch.md' },
      replace: { 'theme:skills/theme-builder': './replacement' },
    },
    harness: {
      'colors.patch.md': '## Palette\n\nSite palette.\n\n## Site notes\n\nSite only.\n',
      'style.patch.md': '## Colors\n\nSite style.\n',
      'replacement/SKILL.md': skill('theme-builder', 'Build a site theme.'),
    },
  });
  installPackage(dir, 'shop', {
    plugin: 'shop',
    ext: { extends: ['theme'], replace: { 'theme:rules/colors': './colors.md' }, patch: { 'theme:rules/style': './style.patch.md' } },
    harness: {
      'colors.md': rule('Shop colors', 'Shop palette.'),
      'style.patch.md': '## Colors\n\nShop style.\n',
    },
  });

  const sync = run(dir, 'sync');
  assert.equal(sync.status, 0, sync.stdout + sync.stderr);
  assert.match(sync.stderr, /theme:skills\/theme-builder: Keeping the original skill.*site/);
  const root = read(dir, 'AGENTS.md');
  assert.match(root, /theme:rules\/shared/);
  assert.doesNotMatch(root, /theme:rules\/(colors|style)/);
  assert.match(read(dir, 'packages/ui/AGENTS.md'), /Theme colors — Palette/);
  assert.match(read(dir, 'packages/site/AGENTS.md'), /Theme colors — Palette, Site notes/);
  assert.match(read(dir, 'packages/shop/AGENTS.md'), /Always-on rule: Shop colors/);
  const styleFile = (workspace: string): string => {
    const block = read(dir, `packages/${workspace}/AGENTS.md`);
    const file = /, read (\S+) \(theme:rules\/style\)/.exec(block)?.[1];
    assert.ok(file, block);
    return path.relative(dir, path.resolve(dir, 'packages', workspace, file));
  };
  assert.match(read(dir, styleFile('ui')), /Original style\./);
  assert.match(read(dir, styleFile('site')), /Site style\./);
  assert.match(read(dir, styleFile('shop')), /Shop style\./);
  assert.notEqual(styleFile('site'), styleFile('shop'));
  assert.ok(!fs.existsSync(path.join(dir, '.claude/rules/harnesspm/theme/style.md')));
  for (const agent of ['.claude', '.agents']) assert.match(read(dir, `${agent}/skills/theme-builder/SKILL.md`), /Build an original theme/);
  const whySkill = run(dir, 'why', 'theme:skills/theme-builder');
  assert.match(whySkill.stdout, /source\s+.*\/theme\/harness\/skills\/theme-builder\/SKILL\.md/);
  assert.match(whySkill.stdout, /replacement\s+Keeping the original skill/);

  const uiHelp = run(ui, 'help', 'theme');
  assert.match(uiHelp.stdout, /Original palette\./);
  assert.doesNotMatch(uiHelp.stdout, /Changed by|Site palette|Shop palette/);
  const siteHelp = run(dir, '-C', 'packages/site/src', 'help', 'theme:rules/colors');
  assert.match(siteHelp.stdout, /Changed by site.*\n\n[^]*Site palette\./);
  assert.doesNotMatch(siteHelp.stdout, /Original palette|Shop palette/);
  assert.match(run(dir, '-C', 'packages/shop', 'why', 'theme:rules/colors').stdout, /replaced\s+by shop/);
  assert.match(run(dir, 'help', 'theme:rules/colors').stdout, /Applies in `packages\/site`\.[^]*Site palette\./);

  const before = JSON.parse(read(dir, 'harnesspm.lock.json'));
  writeFiles(dir, { 'node_modules/shop/harness/style.patch.md': '## Colors\n\nNew shop style.\n' });
  assert.equal(run(dir, 'sync', '--check').status, 1);
  assert.equal(run(dir, 'sync').status, 0);
  const after = JSON.parse(read(dir, 'harnesspm.lock.json'));
  assert.notEqual(before.units['theme:rules/style'].hash, after.units['theme:rules/style'].hash);
  assert.equal(run(dir, 'sync', '--check').status, 0);

  const overlay = project({}, {}, false);
  writeFiles(overlay, {
    'harness/plugin.json': JSON.stringify({
      name: 'overlay',
      extensions: { 'dev.harnesspm': { replace: { 'theme:rules/style': './style.md' } } },
    }),
    'harness/style.md': fileRule('Local style.'),
  });
  const added = run(dir, 'add', overlay, '--local');
  assert.equal(added.status, 0, added.stdout + added.stderr);
  assert.equal(run(dir, 'sync', '--check').status, 0);
  assert.match(read(dir, styleFile('site')), /Site style\./, 'the committed pointer keeps a readable team version');
  assert.match(read(dir, 'CLAUDE.local.md'), /Instead of the rule theme:rules\/style in AGENTS\.md in `packages\/shop`, `packages\/site`, `packages\/ui`, read .*style\.md/);
  assert.match(run(ui, 'help', 'theme:rules/style').stdout, /Local style\./);
  assert.equal(run(dir, 'remove', overlay, '--local').status, 0);

  // A project replacement is shared by every consumer, including workspaces that do not depend on site.
  writeFiles(dir, {
    'harnesspm.json': JSON.stringify({ replace: { 'theme:skills/theme-builder': './replacement' } }),
    'replacement/SKILL.md': skill('theme-builder', 'Build a project theme.'),
  });
  assert.doesNotMatch(run(dir, 'sync').stderr, /Keeping the original skill/);
  assert.match(read(dir, '.agents/skills/theme-builder/SKILL.md'), /Build a project theme/);
  assert.match(run(dir, 'why', 'theme:skills/theme-builder').stdout, /replaced\s+by harnesspm\.json/);

  writeFiles(dir, {
    'harnesspm.json': '{}',
    'packages/ui/package.json': JSON.stringify({ dependencies: { site: '1' } }),
    'packages/shop/package.json': JSON.stringify({ dependencies: { site: '1' } }),
  });
  const shared = run(dir, 'sync');
  assert.equal(shared.status, 0, shared.stdout + shared.stderr);
  assert.doesNotMatch(shared.stderr, /Keeping the original skill/);
  assert.match(read(dir, '.agents/skills/theme-builder/SKILL.md'), /Build a site theme/);
  assert.match(read(dir, 'AGENTS.md'), /theme:rules\/colors/);
  assert.ok(!fs.existsSync(path.join(dir, 'packages/site/AGENTS.md')));
});

test('workspace overrides follow local extends even when another workspace picks the package version', () => {
  const dir = project({ theme: '1' }, { workspaces: ['packages/**'] });
  writeFiles(dir, {
    'packages/site/package.json': JSON.stringify({ dependencies: { site: '2' } }),
    'packages/site/demo/package.json': JSON.stringify({ dependencies: { site: '1', theme: '1' } }),
  });
  installPackage(dir, 'theme', {
    plugin: 'theme',
    harness: { 'dev.harnesspm/rules/colors.md': rule('Original colors', '## Palette\n\nOriginal palette.') },
  });
  installPackage(dir, 'site', {
    plugin: 'site',
    version: '2.0.0',
    ext: { extends: ['theme'], replace: { 'theme:rules/colors': './colors.md' } },
    harness: { 'colors.md': rule('Site colors', '## Palette\n\nSite palette.') },
  });
  installPackage(path.join(dir, 'packages/site/demo'), 'site', { plugin: 'site', version: '1.0.0' });

  const sync = run(dir, 'sync');
  assert.equal(sync.status, 0, sync.stdout + sync.stderr);
  assert.match(sync.stderr, /site: found versions .*using 2\.0\.0/);
  assert.doesNotMatch(read(dir, 'AGENTS.md'), /theme:rules\/colors/);
  const site = read(dir, 'packages/site/AGENTS.md');
  assert.match(site, /For files in a nested workspace, follow the harness rules for that workspace/);
  assert.match(site, /Always-on rule: Site colors/);
  assert.match(read(dir, 'packages/site/demo/AGENTS.md'), /Always-on rule: Original colors/);
  assert.match(run(dir, 'help', 'theme:rules/colors').stdout, /Original palette\./);
  assert.match(run(dir, '-C', 'packages/site/demo', 'help', 'theme:rules/colors').stdout, /Original palette\./);

  // The root patch applies in both workspaces and must detect drift in either upstream section.
  writeFiles(dir, {
    'harnesspm.json': JSON.stringify({ patch: { 'theme:rules/colors': './colors.patch.md' } }),
    'colors.patch.md': '## Palette\n\nProject palette.\n',
  });
  assert.equal(run(dir, 'sync').status, 0);
  for (const workspace of ['packages/site', 'packages/site/demo']) {
    assert.match(run(dir, '-C', workspace, 'help', 'theme:rules/colors').stdout, /Project palette\./);
  }
  writeFiles(dir, { 'node_modules/site/harness/colors.md': rule('Site colors', '## Palette\n\nNew site palette.') });
  const drift = run(dir, 'sync');
  assert.equal(drift.status, 0, drift.stdout + drift.stderr);
  assert.match(drift.stderr, /theme:rules\/colors: upstream changed the section "Palette" that colors\.patch\.md changes/);
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
