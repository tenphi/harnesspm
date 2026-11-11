import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { installPackage, isLink, project, read, run, skill, writeFiles } from './helpers.ts';

const TASTY_RULES = {
  'dev.harnesspm/rules/style-values.md': '# Style values\n\nNever put dynamic values into styles. Use tokens.\n',
  'dev.harnesspm/rules/state-maps.md': '---\ndescription: How to write state maps\npaths: ["**/*.tsx"]\n---\n\n# State maps\n\n## One map\n\nPut every state in one map.\n\n## Order\n\nDefault first.\n',
  'dev.harnesspm/rules/legacy.md': '---\ndescription: Legacy tokens, for old code\n---\n\n# Legacy\n\nOld tokens.\n',
};

/** app → @cube-dev/ui-kit → @tenphi/tasty, with tasty nested inside ui-kit. */
function chain(usesHarnesspm = true): string {
  const dir = project({ '@cube-dev/ui-kit': '^1.0.0' }, {}, usesHarnesspm);
  const uikit = installPackage(dir, '@cube-dev/ui-kit', {
    plugin: 'uikit',
    version: '0.206.1',
    ext: { extends: ['@tenphi/tasty'], docs: '../docs' },
    harness: {
      'dev.harnesspm/rules/forms.md': '# Forms\n\nUse Form.useController.\n',
      'skills/uikit-review/SKILL.md': skill('uikit-review'),
    },
    files: {
      'docs/button.md': '---\ndescription: The Button component\n---\n\n# Button\n\nText.\n',
      'docs/forms.mdx': '---\ntitle: Forms guide\ndescription: How forms work\n---\n\nText without a heading.\n',
    },
    repository: 'https://github.com/cube-js/cube-ui-kit',
  });
  installPackage(uikit, '@tenphi/tasty', { plugin: 'tasty', version: '3.17.1', harness: TASTY_RULES, repository: 'https://github.com/tenphi/tasty' });
  return dir;
}

test('S3: sync writes the block, links and lock for a dependency chain', () => {
  const dir = chain();
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  const agents = read(dir, 'AGENTS.md');
  assert.ok(agents.indexOf('## @tenphi/tasty 3.17.1 (via @cube-dev/ui-kit)') < agents.indexOf('## @cube-dev/ui-kit 0.206.1'), 'upstream first');
  assert.match(agents, /### Style values \(tasty:rules\/style-values\)\n\nNever put dynamic values into styles\./);
  assert.match(agents, /- When editing `\*\*\/\*\.tsx`, read node_modules\/\.harnesspm\/pkgs\/@tenphi\/tasty\/harness\/dev\.harnesspm\/rules\/state-maps\.md — How to write state maps \(tasty:rules\/state-maps\)/);
  assert.match(agents, /- Legacy tokens, for old code: read node_modules\/\.harnesspm\/pkgs\/@tenphi\/tasty\/harness\/dev\.harnesspm\/rules\/legacy\.md \(tasty:rules\/legacy\)/);
  assert.match(agents, /- Docs: node_modules\/\.harnesspm\/docs\/uikit\/llms\.txt \(uikit:docs\)/);
  assert.match(read(dir, 'node_modules/.harnesspm/docs/uikit/llms.txt'), /- \[Button\]\(node_modules\/\.harnesspm\/pkgs\/@cube-dev\/ui-kit\/docs\/button\.md\): The Button component/);
  assert.match(read(dir, 'node_modules/.harnesspm/docs/uikit/llms.txt'), /- \[Forms guide\]\(node_modules\/\.harnesspm\/pkgs\/@cube-dev\/ui-kit\/docs\/forms\.mdx\): How forms work/, '.mdx pages, titled by their frontmatter');
  assert.equal(read(dir, 'CLAUDE.md'), '@AGENTS.md\n');

  assert.ok(isLink(dir, 'node_modules/.harnesspm/pkgs/@tenphi/tasty'));
  assert.ok(isLink(dir, '.claude/skills/uikit-review'));
  assert.ok(isLink(dir, '.agents/skills/uikit-review'));
  assert.match(read(dir, '.claude/skills/uikit-review/SKILL.md'), /name: uikit-review/, 'the link resolves');
  assert.ok(isLink(dir, '.claude/rules/harnesspm/tasty/state-maps.md'));
  assert.match(read(dir, '.claude/rules/harnesspm/tasty/state-maps.md'), /paths:/);

  const exclude = read(dir, '.git/info/exclude');
  for (const entry of ['/.claude/skills/uikit-review', '/.agents/skills/uikit-review', '/.claude/rules/harnesspm/tasty/state-maps.md', '/node_modules/.harnesspm/']) {
    assert.ok(exclude.includes(`${entry}\n`), `exclude has ${entry}`);
  }
  const status = fs.readFileSync(path.join(dir, '.git/info/exclude'), 'utf8');
  assert.ok(!status.includes('AGENTS.md'), 'committed outputs are not excluded');

  const lock = JSON.parse(read(dir, 'harnesspm.lock.json'));
  assert.equal(lock.packages['@tenphi/tasty'].version, '3.17.1');
  assert.equal(lock.units['tasty:rules/state-maps'].kind, 'rules');
  assert.equal(lock.units['uikit:skills/uikit-review'].kind, 'skills');

  assert.match(run(dir, 'sync').stdout, /Nothing changed/, 'a second sync is a no-op');
  assert.equal(run(dir, 'sync', '--check').status, 0);
});

test('S5: an upgrade shows up in the committed files, and --check fails until sync', () => {
  const dir = chain();
  run(dir, 'sync');
  writeFiles(dir, { 'node_modules/@cube-dev/ui-kit/node_modules/@tenphi/tasty/harness/dev.harnesspm/rules/style-values.md': '# Style values\n\nUse tokens only.\n' });
  const check = run(dir, 'sync', '--check');
  assert.equal(check.status, 1);
  assert.match(check.stdout, /AGENTS\.md: the harnesspm block is out of date/);
  assert.match(check.stdout, /harnesspm\.lock\.json is out of date/);
  run(dir, 'sync');
  assert.match(read(dir, 'AGENTS.md'), /Use tokens only\./);
});

test('text outside the block never changes', () => {
  const dir = chain();
  writeFiles(dir, { 'AGENTS.md': '# Team rules\n\nBe kind.\n', 'CLAUDE.md': 'Claude notes.\n' });
  run(dir, 'sync');
  const agents = read(dir, 'AGENTS.md');
  assert.ok(agents.startsWith('# Team rules\n\nBe kind.\n\n<!-- BEGIN:harnesspm'));
  assert.equal(read(dir, 'CLAUDE.md'), '@AGENTS.md\n\nClaude notes.\n');
  writeFiles(dir, { 'AGENTS.md': `${read(dir, 'AGENTS.md')}\n## After\n` });
  run(dir, 'sync');
  assert.match(read(dir, 'AGENTS.md'), /<!-- END:harnesspm -->\n\n## After\n$/);
});

test('S4: the project patches, replaces and excludes upstream units', () => {
  const dir = chain();
  writeFiles(dir, {
    'harnesspm.json': JSON.stringify({
      exclude: ['tasty:rules/legacy', 'uikit:skills/uikit-review'],
      replace: { 'uikit:rules/forms': './agents/forms.md' },
      patch: { 'tasty:rules/state-maps': './agents/state-maps.patch.md' },
    }),
    'agents/forms.md': '# Forms\n\nUse our own form wrapper.\n',
    'agents/state-maps.patch.md': '## Order\n\nAlphabetical.\n',
  });
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  const agents = read(dir, 'AGENTS.md');
  assert.doesNotMatch(agents, /tasty:rules\/legacy/);
  assert.match(agents, /### Forms \(uikit:rules\/forms\)\n\nUse our own form wrapper\./);
  assert.match(agents, /read node_modules\/\.harnesspm\/rules\/tasty\/state-maps\.md — How to write state maps \(tasty:rules\/state-maps\)/);
  const patched = read(dir, 'node_modules/.harnesspm/rules/tasty/state-maps.md');
  assert.match(patched, /## Order\n\nAlphabetical\./);
  assert.match(patched, /## One map\n\nPut every state in one map\./);
  assert.ok(!fs.existsSync(path.join(dir, '.claude/skills/uikit-review')), 'excluded skill is not linked');
  const lock = JSON.parse(read(dir, 'harnesspm.lock.json'));
  assert.ok(lock.patches['tasty:rules/state-maps']['agents/state-maps.patch.md']['Order']);

  const why = run(dir, 'why', 'tasty:rules/state-maps');
  assert.match(why.stdout, /owner +dependency @tenphi\/tasty 3\.17\.1 \(via @cube-dev\/ui-kit\)/);
  assert.match(why.stdout, /patch +agents\/state-maps\.patch\.md \(from harnesspm\.json\)/);
  assert.match(why.stdout, /repository +https:\/\/github\.com\/tenphi\/tasty/);
  assert.match(run(dir, 'why', 'tasty:rules/legacy').stdout, /excluded +by harnesspm\.json/);

  // Upstream changes a section the patch replaces: sync warns.
  writeFiles(dir, {
    'node_modules/@cube-dev/ui-kit/node_modules/@tenphi/tasty/harness/dev.harnesspm/rules/state-maps.md': TASTY_RULES['dev.harnesspm/rules/state-maps.md'].replace('Default first.', 'Default last.'),
  });
  assert.match(run(dir, 'sync').stderr, /upstream changed the section "Order" that agents\/state-maps\.patch\.md changes/);
});

test('S2: a middle package changes what it passes on, and the project builds on top', () => {
  const dir = chain();
  const uikit = path.join(dir, 'node_modules/@cube-dev/ui-kit');
  const manifest = JSON.parse(read(uikit, 'harness/plugin.json'));
  manifest.extensions['dev.harnesspm'].patch = { 'tasty:rules/style-values': './dev.harnesspm/style-values.patch.md' };
  manifest.extensions['dev.harnesspm'].exclude = ['tasty:rules/legacy'];
  writeFiles(uikit, {
    'harness/plugin.json': JSON.stringify(manifest),
    'harness/dev.harnesspm/style-values.patch.md': 'UI Kit adds: use #tokens.\n',
  });
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ patch: { 'tasty:rules/style-values': './agents/sv.patch.md' } }), 'agents/sv.patch.md': 'The app adds: no inline styles.\n' });
  run(dir, 'sync');
  const agents = read(dir, 'AGENTS.md');
  assert.match(agents, /Use tokens\.\n\nUI Kit adds: use #tokens\.\n\nThe app adds: no inline styles\./, 'lower layer first');
  assert.doesNotMatch(agents, /tasty:rules\/legacy/);

  // A replace from the project drops the middle package's patch, with a warning.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ replace: { 'tasty:rules/style-values': './agents/sv.md' } }), 'agents/sv.md': '# Style values\n\nOurs.\n' });
  const result = run(dir, 'sync');
  assert.match(result.stderr, /the patch of tasty:rules\/style-values is dropped, because harnesspm\.json replaces the rule/);
  assert.match(read(dir, 'AGENTS.md'), /### Style values \(tasty:rules\/style-values\)\n\nOurs\.\n/);
});

test('a package excluded by a middle package is dropped with what only it extends', () => {
  const dir = chain();
  const uikit = path.join(dir, 'node_modules/@cube-dev/ui-kit');
  const manifest = JSON.parse(read(uikit, 'harness/plugin.json'));
  manifest.extensions['dev.harnesspm'].exclude = ['@tenphi/tasty'];
  writeFiles(uikit, { 'harness/plugin.json': JSON.stringify(manifest) });
  run(dir, 'sync');
  assert.doesNotMatch(read(dir, 'AGENTS.md'), /@tenphi\/tasty/);
});

test('one version per package: a direct dependency wins over a nested copy', () => {
  const dir = chain();
  const pkg = JSON.parse(read(dir, 'package.json'));
  pkg.devDependencies['@tenphi/tasty'] = '^2.0.0';
  writeFiles(dir, { 'package.json': JSON.stringify(pkg) });
  installPackage(dir, '@tenphi/tasty', { plugin: 'tasty', version: '2.0.0', harness: { 'dev.harnesspm/rules/old.md': '# Old\n\nVersion two.\n' } });
  const result = run(dir, 'sync');
  assert.match(result.stderr, /@tenphi\/tasty: found versions .*using 2\.0\.0/);
  assert.match(read(dir, 'AGENTS.md'), /## @tenphi\/tasty 2\.0\.0\n/);
});

test('the same plugin name in two packages stops sync', () => {
  const dir = project({ a: '1', b: '1' });
  installPackage(dir, 'a', { plugin: 'same' });
  installPackage(dir, 'b', { plugin: 'same' });
  const result = run(dir, 'sync');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a and b both use the plugin name "same"/);
});

test('an extends cycle stops sync', () => {
  const dir = project({ a: '1' });
  installPackage(dir, 'a', { plugin: 'a', ext: { extends: ['b'] } });
  installPackage(dir, 'b', { plugin: 'b', ext: { extends: ['a'] } });
  const result = run(dir, 'sync');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /extends cycle/);
});

test("the project's own harness resolves like a package, then harnesspm.json applies", () => {
  const dir = project({ '@tenphi/tasty': '1' });
  installPackage(dir, '@tenphi/tasty', { plugin: 'tasty', version: '3.17.1', harness: TASTY_RULES });
  writeFiles(dir, {
    'harness/plugin.json': JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'app', extensions: { 'dev.harnesspm': { extends: ['@tenphi/tasty'], exclude: ['tasty:rules/legacy'] } } }),
    'harness/dev.harnesspm/rules/release.md': '# Release\n\nTag first.\n',
    'harness/skills/app-deploy/SKILL.md': skill('app-deploy'),
  });
  run(dir, 'sync');
  const agents = read(dir, 'AGENTS.md');
  assert.match(agents, /## app \(this project\)\n\n### Release \(app:rules\/release\)/);
  assert.doesNotMatch(agents, /tasty:rules\/legacy/, "the project harness's exclude applies here too");
  assert.equal(fs.readlinkSync(path.join(dir, '.claude/skills/app-deploy')), '../../harness/skills/app-deploy');
  assert.match(run(dir, 'why', 'app:rules/release').stdout, /editable +yes/);
});

test('one skills folder linked to the other gets each skill once', () => {
  const dir = chain();
  fs.mkdirSync(path.join(dir, '.claude/skills'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.agents'), { recursive: true });
  fs.symlinkSync('../.claude/skills', path.join(dir, '.agents/skills'));
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(isLink(dir, '.claude/skills/uikit-review'));
  assert.ok(!read(dir, '.git/info/exclude').includes('/.agents/skills/uikit-review'));
});

test('a skill that is gone is unlinked on the next sync; a person\'s own skill is kept', () => {
  const dir = chain();
  writeFiles(dir, { '.claude/skills/my-own/SKILL.md': skill('my-own') });
  run(dir, 'sync');
  fs.rmSync(path.join(dir, 'node_modules/@cube-dev/ui-kit/harness/skills'), { recursive: true });
  run(dir, 'sync');
  assert.ok(!fs.existsSync(path.join(dir, '.claude/skills/uikit-review')));
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/my-own/SKILL.md')));
  assert.ok(!read(dir, '.git/info/exclude').includes('uikit-review'));
});

test('skills with the same name: the later package wins, with a warning', () => {
  const dir = chain();
  writeFiles(dir, { 'node_modules/@cube-dev/ui-kit/node_modules/@tenphi/tasty/harness/skills/uikit-review/SKILL.md': skill('uikit-review', 'Tasty version. Use when testing.') });
  const result = run(dir, 'sync');
  assert.match(result.stderr, /skill "uikit-review" comes from @tenphi\/tasty and @cube-dev\/ui-kit; using @cube-dev\/ui-kit/);
});

test('an override of a unit that does not exist is a warning', () => {
  const dir = chain();
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ exclude: ['tasty:rules/renamed'] }) });
  assert.match(run(dir, 'sync').stderr, /exclude names tasty:rules\/renamed, which does not exist/);
});

test('init sets up a project and is safe to run twice', () => {
  const dir = chain(false);
  const first = run(dir, 'init');
  assert.equal(first.status, 0, first.stderr);
  const pkg = JSON.parse(read(dir, 'package.json'));
  assert.equal(pkg.scripts.prepare, 'harnesspm sync');
  assert.equal(JSON.parse(read(dir, 'harnesspm.json')).$schema, 'https://unpkg.com/@tenphi/harnesspm/schema/harnesspm.schema.json');
  assert.match(read(dir, 'AGENTS.md'), /BEGIN:harnesspm/);
  run(dir, 'init');
  assert.equal(JSON.parse(read(dir, 'package.json')).scripts.prepare, 'harnesspm sync');
});

test('init uses postinstall in a private package, and keeps an existing script', () => {
  const dir = project({}, { private: true, scripts: { postinstall: 'patch-package' } }, false);
  run(dir, 'init');
  assert.equal(JSON.parse(read(dir, 'package.json')).scripts.postinstall, 'patch-package && harnesspm sync');
  assert.equal(JSON.parse(read(dir, 'package.json')).scripts.prepare, undefined);
});

test('status names the layers and the always-on size', () => {
  const dir = chain();
  run(dir, 'sync');
  const result = run(dir, 'status');
  assert.match(result.stdout, /📦 dependencies  @cube-dev\/ui-kit 0\.206\.1 → @tenphi\/tasty 3\.17\.1/);
  assert.match(result.stdout, /📏 always-on     Codex \d+\.\d KiB of 32 KiB/);
});
