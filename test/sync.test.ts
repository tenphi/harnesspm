import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { installPackage, isLink, PLUGIN_SCHEMA, project, read, run, runWith, skill, writeFiles } from './helpers.ts';

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
  assert.ok(agents.indexOf('## @tenphi/tasty (via @cube-dev/ui-kit)\n') < agents.indexOf('## @cube-dev/ui-kit\n'), 'upstream first');
  // Compact: one line per always-on rule, and `help <package>` prints its text (spec 4.6).
  assert.match(agents, /<!-- BEGIN:harnesspm[^\n]*-->\n\n- Every package of this harness: `npx -y @tenphi\/harnesspm help`\.[^\n]*\n- Run a tool: `npx -y @tenphi\/harnesspm run <tool> \[args\]`\. Its options: `npx -y @tenphi\/harnesspm help <tool>`\.\n- From outside this folder, add `-C <path to this folder>`[^\n]*\n\n## @tenphi\/tasty/);
  assert.match(agents, /^- Always-on rule: Style values\. Read it with `help @tenphi\/tasty` \(tasty:rules\/style-values\)$/m);
  assert.doesNotMatch(agents, /Never put dynamic values into styles/, 'the rule text is not inlined');
  assert.match(run(dir, 'help', '@tenphi/tasty').stdout, /### Style values \(tasty:rules\/style-values\)\n\nAlways on\.\n\nNever put dynamic values into styles\./);
  assert.match(agents, /- When editing `\*\*\/\*\.tsx`, read node_modules\/\.harnesspm\/pkgs\/@tenphi\/tasty\/harness\/dev\.harnesspm\/rules\/state-maps\.md — How to write state maps \(tasty:rules\/state-maps\)/);
  assert.match(agents, /- Legacy tokens, for old code: read node_modules\/\.harnesspm\/pkgs\/@tenphi\/tasty\/harness\/dev\.harnesspm\/rules\/legacy\.md \(tasty:rules\/legacy\)/);
  // A dependency's docs are copied, so that search tools find them (spec 4.3, note 8).
  assert.match(agents, /- Docs: node_modules\/\.harnesspm\/docs\/uikit\/llms\.txt \(uikit:docs\)/);
  assert.match(read(dir, 'node_modules/.harnesspm/docs/uikit/llms.txt'), /- \[Button\]\(node_modules\/\.harnesspm\/docs\/uikit\/button\.md\): The Button component/);
  assert.match(read(dir, 'node_modules/.harnesspm/docs/uikit/llms.txt'), /- \[Forms guide\]\(node_modules\/\.harnesspm\/docs\/uikit\/forms\.mdx\): How forms work/, '.mdx pages, titled by their frontmatter');
  assert.match(read(dir, 'node_modules/.harnesspm/docs/uikit/button.md'), /The Button component/);
  assert.match(read(dir, '.git/info/exclude'), /^\/\.rgignore$/m, 'the .rgignore stays out of git');
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

test('a version bump that keeps the harness the same changes only the lock', () => {
  const dir = chain();
  assert.equal(run(dir, 'sync').status, 0);
  const before = read(dir, 'AGENTS.md');
  assert.doesNotMatch(before, /3\.17\.1|0\.206\.1/, 'no versions in the block');

  installPackage(path.join(dir, 'node_modules/@cube-dev/ui-kit'), '@tenphi/tasty', { plugin: 'tasty', version: '3.18.0', harness: TASTY_RULES, repository: 'https://github.com/tenphi/tasty' });
  assert.notEqual(run(dir, 'sync', '--check').status, 0, 'the lock records the version');
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(dir, 'AGENTS.md'), before);
  assert.equal(JSON.parse(read(dir, 'harnesspm.lock.json')).packages['@tenphi/tasty'].version, '3.18.0');
});

test('S5: an upgrade shows up in the committed files, and --check fails until sync', () => {
  const dir = chain();
  run(dir, 'sync');
  const before = read(dir, 'AGENTS.md');
  // A new text: the lock's unit hash changes. The block names the rule's sections only, so it stays the same.
  writeFiles(dir, { 'node_modules/@cube-dev/ui-kit/node_modules/@tenphi/tasty/harness/dev.harnesspm/rules/style-values.md': '# Style values\n\nUse tokens only.\n' });
  let check = run(dir, 'sync', '--check');
  assert.equal(check.status, 1);
  assert.match(check.stdout, /harnesspm\.lock\.json is out of date/);
  run(dir, 'sync');
  assert.equal(read(dir, 'AGENTS.md'), before);
  assert.match(run(dir, 'help', 'tasty:rules/style-values').stdout, /Use tokens only\./);
  // A new section: the block's summary changes too.
  writeFiles(dir, { 'node_modules/@cube-dev/ui-kit/node_modules/@tenphi/tasty/harness/dev.harnesspm/rules/style-values.md': '# Style values\n\n## Tokens only\n\nUse tokens only.\n' });
  check = run(dir, 'sync', '--check');
  assert.match(check.stdout, /AGENTS\.md: the harnesspm block is out of date/);
  run(dir, 'sync');
  assert.match(read(dir, 'AGENTS.md'), /- Always-on rule: Style values — Tokens only\. Read it with `help @tenphi\/tasty` \(tasty:rules\/style-values\)/);
});

test('with CI=true, sync leaves committed outputs to --check and still writes per-machine ones; --write writes them', () => {
  const dir = chain();
  run(dir, 'sync');
  const committed = ['AGENTS.md', 'CLAUDE.md', 'harnesspm.lock.json'].map((file) => [file, read(dir, file)] as const);
  // A pull request upgrades a package and forgets to sync. The install's sync runs in CI.
  writeFiles(dir, { 'node_modules/@cube-dev/ui-kit/node_modules/@tenphi/tasty/harness/dev.harnesspm/rules/style-values.md': '# Style values\n\n## Tokens only\n\nUse tokens only.\n' });
  fs.rmSync(path.join(dir, 'node_modules/.harnesspm'), { recursive: true });
  fs.rmSync(path.join(dir, '.claude'), { recursive: true });
  const ci = runWith(dir, { CI: 'true' }, 'sync');
  assert.equal(ci.status, 0, ci.stderr);
  assert.match(ci.stdout, /^CI: committed outputs left as they are; `npx harnesspm sync --check` compares them, `sync --write` writes them\.$/m);
  for (const [file, text] of committed) assert.equal(read(dir, file), text, `${file} is left as it is`);
  assert.ok(isLink(dir, 'node_modules/.harnesspm/pkgs/@tenphi/tasty'), 'stable package paths');
  assert.ok(fs.existsSync(path.join(dir, 'node_modules/.harnesspm/docs/uikit/button.md')), 'docs copies');
  assert.ok(isLink(dir, '.claude/skills/uikit-review'), 'skill links');
  const check = runWith(dir, { CI: 'true' }, 'sync', '--check');
  assert.equal(check.status, 1, 'the missed sync still fails the check');
  assert.match(check.stdout, /AGENTS\.md: the harnesspm block is out of date/);

  // A job that commits the result, such as a release, writes them.
  const write = runWith(dir, { CI: 'true' }, 'sync', '--write');
  assert.equal(write.status, 0, write.stderr);
  assert.doesNotMatch(write.stdout, /^CI:/m);
  assert.match(read(dir, 'AGENTS.md'), /Style values — Tokens only\./);
  assert.equal(runWith(dir, { CI: 'true' }, 'sync', '--check').status, 0);
  assert.match(run(dir, 'sync', '--check', '--write').stderr, /Use either --check or --write/);
});

test('a nested AGENTS.md that git tracks gets a CLAUDE.md that imports it, since the root CLAUDE.md silences it', () => {
  const dir = chain();
  run(dir, 'sync');
  writeFiles(dir, {
    'src/button/AGENTS.md': '# Button\n\nKeep it small.\n',
    'src/form/AGENTS.md': '# Form\n\nUse the controller.\n',
    'src/form/CLAUDE.md': 'Form notes.\n',
    'src/menu/AGENTS.md': '# Menu\n\nKeyboard first.\n',
    'src/menu/.claude/CLAUDE.md': '@../AGENTS.md\n',
    'src/draft/AGENTS.md': '# Draft\n\nNot committed.\n',
    'vendor/node_modules/x/AGENTS.md': '# Vendored\n',
  });
  spawnSync('git', ['add', '-f', 'src/button', 'src/form', 'src/menu', 'vendor'], { cwd: dir });

  const check = run(dir, 'sync', '--check');
  assert.equal(check.status, 1);
  assert.match(check.stdout, /src\/button\/CLAUDE\.md: the @AGENTS\.md line is missing, so Claude Code does not read src\/button\/AGENTS\.md/);
  assert.match(check.stdout, /src\/form\/CLAUDE\.md: the @AGENTS\.md line is missing/);
  assert.doesNotMatch(check.stdout, /src\/menu|src\/draft|vendor/);
  assert.match(run(dir, 'doctor').stdout, /📦 Outputs\n {2}❌ src\/button\/CLAUDE\.md: the @AGENTS\.md line is missing/);

  // CI leaves them to --check, like every committed output.
  runWith(dir, { CI: 'true' }, 'sync');
  assert.ok(!fs.existsSync(path.join(dir, 'src/button/CLAUDE.md')));

  run(dir, 'sync');
  assert.equal(read(dir, 'src/button/CLAUDE.md'), '@AGENTS.md\n');
  assert.equal(read(dir, 'src/form/CLAUDE.md'), '@AGENTS.md\n\nForm notes.\n');
  assert.ok(!fs.existsSync(path.join(dir, 'src/menu/CLAUDE.md')), 'its .claude/CLAUDE.md imports it already');
  assert.ok(!fs.existsSync(path.join(dir, 'src/draft/CLAUDE.md')), 'not tracked');
  assert.ok(!fs.existsSync(path.join(dir, 'vendor/node_modules/x/CLAUDE.md')), 'inside node_modules');
  assert.equal(read(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  assert.equal(run(dir, 'sync', '--check').status, 0);
  assert.match(run(dir, 'sync').stdout, /Nothing changed/);
});

test('the block has a blank line after BEGIN and before END, so Prettier leaves it alone; the old form still passes --check', () => {
  const dir = chain();
  writeFiles(dir, { 'AGENTS.md': '# Team\n' });
  run(dir, 'sync');
  const agents = read(dir, 'AGENTS.md');
  assert.match(agents, /<!-- BEGIN:harnesspm[^\n]*-->\n\n- Every package of this harness: [^]*\n\n## @tenphi\/tasty/);
  assert.match(agents, /\(uikit:docs\)\n\n<!-- END:harnesspm -->\n/);

  // A block that harnesspm 0.3 wrote, without the blank lines, is up to date until the next sync rewrites it once.
  const old = agents.replace(/(<!-- BEGIN:harnesspm[^\n]*-->)\n\n/, '$1\n').replace(/\n\n(<!-- END:harnesspm -->)/, '\n$1');
  writeFiles(dir, { 'AGENTS.md': old });
  assert.equal(run(dir, 'sync', '--check').status, 0, 'no false failure on the old form');
  assert.match(run(dir, 'sync').stdout, /Updated 1 file/);
  assert.equal(read(dir, 'AGENTS.md'), agents);
  assert.match(run(dir, 'sync').stdout, /Nothing changed/);

  // A block that a person wrapped in prettier-ignore comments keeps them.
  const wrapped = `# Team\n\n<!-- prettier-ignore-start -->\n${old.slice(old.indexOf('<!-- BEGIN'))}<!-- prettier-ignore-end -->\n`;
  writeFiles(dir, { 'AGENTS.md': wrapped });
  assert.equal(run(dir, 'sync', '--check').status, 0);
  run(dir, 'sync');
  assert.match(read(dir, 'AGENTS.md'), /^# Team\n\n<!-- prettier-ignore-start -->\n<!-- BEGIN:harnesspm[^\n]*-->\n\n[^]*\n\n<!-- END:harnesspm -->\n<!-- prettier-ignore-end -->\n$/);
  assert.equal(run(dir, 'sync', '--check').status, 0);
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
  assert.match(agents, /- Always-on rule: Forms\. Read it with `help @cube-dev\/ui-kit` \(uikit:rules\/forms\)/);
  assert.match(run(dir, 'help', '@cube-dev/ui-kit').stdout, /### Forms \(uikit:rules\/forms\)\n\nAlways on\. Changed by harnesspm\.json: this is the text agents get here\.\n\nUse our own form wrapper\./);
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
  assert.match(run(dir, 'help', 'tasty:rules/style-values').stdout, /Use tokens\.\n\nUI Kit adds: use #tokens\.\n\nThe app adds: no inline styles\./, 'lower layer first');
  assert.doesNotMatch(agents, /tasty:rules\/legacy/);

  // A replace from the project drops the middle package's patch, with a warning.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ replace: { 'tasty:rules/style-values': './agents/sv.md' } }), 'agents/sv.md': '# Style values\n\nOurs.\n' });
  const result = run(dir, 'sync');
  assert.match(result.stderr, /the patch of tasty:rules\/style-values is dropped, because harnesspm\.json replaces the rule/);
  assert.match(run(dir, 'help', '@tenphi/tasty').stdout, /### Style values \(tasty:rules\/style-values\)\n\nAlways on\. Changed by harnesspm\.json: this is the text agents get here\.\n\nOurs\.\n/);
});

test('a middle package replaces an upstream skill with a folder of its own, which keeps the skill\'s ID and place', () => {
  const dir = chain();
  const tasty = path.join(dir, 'node_modules/@cube-dev/ui-kit/node_modules/@tenphi/tasty');
  writeFiles(tasty, { 'harness/skills/tasty-theme/SKILL.md': skill('tasty-theme', 'Change the theme where glaze() is called. Use when testing.') });
  const uikit = path.join(dir, 'node_modules/@cube-dev/ui-kit');
  const manifest = JSON.parse(read(uikit, 'harness/plugin.json'));
  manifest.extensions['dev.harnesspm'].replace = { 'tasty:skills/tasty-theme': './skills/tasty-theme' };
  writeFiles(uikit, {
    'harness/plugin.json': JSON.stringify(manifest),
    'harness/skills/tasty-theme/SKILL.md': skill('tasty-theme', 'Change the theme in the UI Kit palette. Use when testing.'),
    'harness/skills/tasty-theme/palette.md': '# Palette\n',
  });
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /works on|comes from/, 'no warning: the replacement is not a skill of its own');
  assert.match(read(dir, '.claude/skills/tasty-theme/SKILL.md'), /in the UI Kit palette/);
  assert.match(read(dir, '.agents/skills/tasty-theme/palette.md'), /# Palette/, "the replacement's other files come along");
  const lock = JSON.parse(read(dir, 'harnesspm.lock.json'));
  assert.ok(lock.units['tasty:skills/tasty-theme'], 'the unit keeps its ID');
  assert.equal(lock.units['uikit:skills/tasty-theme'], undefined);
  const why = run(dir, 'why', 'tasty:skills/tasty-theme').stdout;
  assert.match(why, /source +node_modules\/\.harnesspm\/pkgs\/@cube-dev\/ui-kit\/harness\/skills\/tasty-theme\/SKILL\.md/);
  assert.match(why, /replaced +by @cube-dev\/ui-kit: node_modules\/\.harnesspm\/pkgs\/@cube-dev\/ui-kit\/harness\/skills\/tasty-theme/);
  assert.match(why, /original +node_modules\/\.harnesspm\/pkgs\/@tenphi\/tasty\/harness\/skills\/tasty-theme\/SKILL\.md/);
  assert.match(run(dir, 'help', '@tenphi/tasty').stdout, /- tasty-theme: read node_modules\/\.harnesspm\/pkgs\/@cube-dev\/ui-kit\/harness\/skills\/tasty-theme\/SKILL\.md \(tasty:skills\/tasty-theme\)/);

  // The project replaces it again, and its own folder wins; a folder without SKILL.md is skipped with a warning.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ replace: { 'tasty:skills/tasty-theme': './agents/tasty-theme', 'uikit:skills/uikit-review': './agents/nothing' } }), 'agents/tasty-theme/SKILL.md': skill('tasty-theme', 'Ours. Use when testing.') });
  const again = run(dir, 'sync');
  assert.match(again.stderr, /harnesspm\.json: replace needs a skill folder with a SKILL\.md: agents\/nothing/);
  assert.match(read(dir, '.claude/skills/tasty-theme/SKILL.md'), /Ours\./);
  assert.match(read(dir, '.claude/skills/uikit-review/SKILL.md'), /name: uikit-review/, 'a replacement that is not there leaves the skill as it is');
});

test('replace works on rules and skills; for other units it warns and points to exclude', () => {
  const dir = chain();
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ replace: { 'uikit:docs': './agents/docs' }, patch: { 'uikit:skills/uikit-review': './agents/review.patch.md' } }), 'agents/docs/index.md': '# Docs\n', 'agents/review.patch.md': '## Steps\n' });
  const result = run(dir, 'sync');
  assert.match(result.stderr, /harnesspm\.json: replace works on rules and skills only: uikit:docs\. Exclude it and add a unit of your own instead\./);
  assert.match(result.stderr, /harnesspm\.json: patch works on rules only: uikit:skills\/uikit-review/);
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

test('a docs page with invalid frontmatter does not fail sync: it is listed without it, with a warning', () => {
  const dir = project({ '@acme/ui': '^1.0.0' });
  installPackage(dir, '@acme/ui', {
    plugin: 'acme-ui',
    ext: { docs: '../docs' },
    files: {
      // An unquoted colon in a value is not valid YAML.
      'docs/button.md': '---\ndescription: The Button component: types and sizes\n---\n\n# Button\n\nText.\n',
      'docs/tokens.md': '---\ndescription: Every color token\n---\n\n# Tokens\n\nText.\n',
    },
  });
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /⚠️ {2}Invalid frontmatter in node_modules\/\.harnesspm\/pkgs\/@acme\/ui\/docs\/button\.md: .+\. The docs index lists the page by its heading or file name\./);
  assert.equal(result.stderr.match(/Invalid frontmatter/g)?.length, 1, 'one warning for the page');
  const index = read(dir, 'node_modules/.harnesspm/docs/acme-ui/llms.txt');
  assert.match(index, /^- \[Button\]\(node_modules\/\.harnesspm\/docs\/acme-ui\/button\.md\)$/m);
  assert.match(index, /- \[Tokens\]\(node_modules\/\.harnesspm\/docs\/acme-ui\/tokens\.md\): Every color token/);
  assert.equal(run(dir, 'sync', '--check').status, 0);
});

const BUTTON_PAGE = '# Button\n\nThe primary action. See [the intro](../../README.md#setup), [the index](../llms.txt) and [the site](https://example.com/).\n\n```md\n[the intro](../../README.md)\n```\n';

test("S21: every dependency's docs are copied where search finds them, and nothing new reaches git", (t) => {
  const dir = project({ '@acme/ui': '^1.0.0', '@acme/lib': '^1.0.0' });
  writeFiles(dir, { '.gitignore': 'node_modules\n' });
  installPackage(dir, '@acme/ui', {
    plugin: 'acme-ui',
    ext: { docs: '../docs' },
    files: {
      'docs/llms.txt': '# UI\n\n- [Button](guides/button.md)\n- [Overview](../README.md)\n',
      'docs/guides/button.md': BUTTON_PAGE,
      'docs/logo.png': 'not a page',
      'README.md': '# Intro\n',
    },
  });
  fs.symlinkSync(path.join('..', 'README.md'), path.join(dir, 'node_modules/@acme/ui/docs/intro.md'));
  // A workspace package: node_modules links to the repository's own folder. It is copied too, so the committed
  // pointer does not depend on whether a package manager links or copies it.
  writeFiles(dir, {
    'packages/lib/package.json': JSON.stringify({ name: '@acme/lib', version: '1.0.0', files: ['harness', 'docs'] }),
    'packages/lib/harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'lib', extensions: { 'dev.harnesspm': { docs: '../docs' } } }),
    'packages/lib/docs/start.md': '# Start\n\nText.\n',
  });
  fs.symlinkSync(path.join('..', '..', 'packages', 'lib'), path.join(dir, 'node_modules', '@acme', 'lib'));

  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  const agents = read(dir, 'AGENTS.md');
  const copies = 'node_modules/.harnesspm/docs';
  assert.match(agents, /- Docs: node_modules\/\.harnesspm\/docs\/acme-ui\/llms\.txt \(acme-ui:docs\)/, "the package's own index, copied");
  assert.equal(read(dir, `${copies}/acme-ui/llms.txt`), '# UI\n\n- [Button](guides/button.md)\n- [Overview](../../pkgs/@acme/ui/README.md)\n', 'its links stay relative');
  // A link that leaves the docs folder points at the installed package; one inside it, a URL and a code sample stay.
  const button = read(dir, `${copies}/acme-ui/guides/button.md`);
  assert.equal(button, BUTTON_PAGE.replace('](../../README.md#setup)', '](../../../pkgs/@acme/ui/README.md#setup)'));
  assert.equal(read(dir, 'node_modules/@acme/ui/docs/guides/button.md'), BUTTON_PAGE, 'the package keeps its own link');
  assert.equal(fs.readFileSync(path.join(dir, copies, 'acme-ui/guides', '../../../pkgs/@acme/ui/README.md'), 'utf8'), '# Intro\n', 'the link leads to the README');
  assert.equal(read(dir, `${copies}/acme-ui/intro.md`), '# Intro\n', 'a linked page too');
  assert.ok(!fs.existsSync(path.join(dir, `${copies}/acme-ui/logo.png`)), 'pages only');
  assert.match(agents, /- Docs: node_modules\/\.harnesspm\/docs\/lib\/llms\.txt \(lib:docs\)/);
  assert.match(read(dir, `${copies}/lib/llms.txt`), /- \[Start\]\(node_modules\/\.harnesspm\/docs\/lib\/start\.md\)/);
  assert.match(read(dir, '.rgignore'), /^# Generated by `harnesspm sync`\. Do not edit\.\n[^\n]*\n!\/node_modules\/\n\/node_modules\/\*\n!\/node_modules\/\.harnesspm\/\n\/node_modules\/\.harnesspm\/\*\n!\/node_modules\/\.harnesspm\/docs\/\n$/);
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(status, /node_modules|\.rgignore/, 'git ignores the copies and the .rgignore');
  assert.equal(run(dir, 'sync', '--check').status, 0);
  assert.match(run(dir, 'help', '@acme/ui').stdout, /## Docs\n\n- node_modules\/\.harnesspm\/docs\/acme-ui\/llms\.txt \(acme-ui:docs\)/);

  // ripgrep, which the agents' search tools run, skips what git ignores and hidden folders: the .rgignore lets it in.
  const rg = spawnSync('rg', ['-l', 'primary action', '.'], { cwd: dir, encoding: 'utf8' });
  if (rg.error) t.diagnostic('rg is not installed, so the search itself is not checked');
  else assert.equal(rg.stdout, './node_modules/.harnesspm/docs/acme-ui/guides/button.md\n', 'ripgrep finds the copy, and nothing else in node_modules');

  // A .rgignore of the repository's own is left as it is, with a warning until it has the lines.
  writeFiles(dir, { '.rgignore': 'dist\n' });
  spawnSync('git', ['add', '.rgignore'], { cwd: dir });
  const own = run(dir, 'sync');
  assert.match(own.stderr, /\.rgignore is not harnesspm's, so search tools skip the docs copies in node_modules\/\.harnesspm\/docs\/\. To let them in, add these lines to it, in this order: !\/node_modules\/, \/node_modules\/\*, !\/node_modules\/\.harnesspm\/, \/node_modules\/\.harnesspm\/\*, !\/node_modules\/\.harnesspm\/docs\//);
  assert.equal(read(dir, '.rgignore'), 'dist\n');
  assert.doesNotMatch(read(dir, '.git/info/exclude'), /^\/\.rgignore$/m, "and is not listed as harnesspm's");
  writeFiles(dir, { '.rgignore': 'dist\n!/node_modules/\n/node_modules/*\n!/node_modules/.harnesspm/\n/node_modules/.harnesspm/*\n!/node_modules/.harnesspm/docs/\n' });
  assert.doesNotMatch(run(dir, 'sync').stderr, /\.rgignore/, 'no warning once it has them');
  spawnSync('git', ['rm', '-q', '--cached', '.rgignore'], { cwd: dir });
  fs.rmSync(path.join(dir, '.rgignore'));

  // Without docs, the copies and harnesspm's .rgignore go away.
  run(dir, 'sync');
  assert.ok(fs.existsSync(path.join(dir, '.rgignore')));
  for (const name of ['@acme/ui', '@acme/lib']) fs.rmSync(path.join(dir, 'node_modules', name), { recursive: true });
  writeFiles(dir, { 'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }) });
  assert.equal(run(dir, 'sync').status, 0);
  assert.ok(!fs.existsSync(path.join(dir, copies)), 'no copies');
  assert.ok(!fs.existsSync(path.join(dir, '.rgignore')));
  assert.doesNotMatch(read(dir, '.git/info/exclude'), /\.rgignore/);
});

test('one version per package: a direct dependency wins over a nested copy', () => {
  const dir = chain();
  const pkg = JSON.parse(read(dir, 'package.json'));
  pkg.devDependencies['@tenphi/tasty'] = '^2.0.0';
  writeFiles(dir, { 'package.json': JSON.stringify(pkg) });
  installPackage(dir, '@tenphi/tasty', { plugin: 'tasty', version: '2.0.0', harness: { 'dev.harnesspm/rules/old.md': '# Old\n\nVersion two.\n' } });
  const result = run(dir, 'sync');
  assert.match(result.stderr, /@tenphi\/tasty: found versions .*using 2\.0\.0/);
  assert.match(read(dir, 'AGENTS.md'), /## @tenphi\/tasty\n\n- Always-on rule: Old\. Read it with `help @tenphi\/tasty` \(tasty:rules\/old\)/);
  assert.match(run(dir, 'help', 'tasty:rules/old').stdout, /Version two\./);
  assert.equal(JSON.parse(read(dir, 'harnesspm.lock.json')).packages['@tenphi/tasty'].version, '2.0.0');
});

test('the same plugin name in two packages stops sync', () => {
  const dir = project({ a: '1', b: '1' });
  installPackage(dir, 'a', { plugin: 'same' });
  installPackage(dir, 'b', { plugin: 'same' });
  const result = run(dir, 'sync');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a and b both use the plugin name "same"/);
});

test('a missing extends warns, unless it is an optional peer', () => {
  const dir = project({ '@cube-dev/ui-kit': '1' });
  const uikit = installPackage(dir, '@cube-dev/ui-kit', { plugin: 'uikit', ext: { extends: ['@tenphi/eslint-plugin-tasty', '@tenphi/glaze'] } });
  const pkgFile = path.join(uikit, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  // The lint plugin is an optional peer; Glaze is a plain extends that is missing.
  pkg.peerDependencies = { '@tenphi/eslint-plugin-tasty': '^1.0.0', '@tenphi/glaze': '^2.0.0' };
  pkg.peerDependenciesMeta = { '@tenphi/eslint-plugin-tasty': { optional: true } };
  fs.writeFileSync(pkgFile, JSON.stringify(pkg));
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /eslint-plugin-tasty/);
  assert.match(result.stderr, /@cube-dev\/ui-kit extends @tenphi\/glaze, which is not installed/);

  // Once it is installed, the optional peer's harness comes through as usual.
  installPackage(dir, '@tenphi/eslint-plugin-tasty', { plugin: 'tasty-lint', harness: { 'dev.harnesspm/rules/lint.md': '# Lint\n\nRun the linter.\n' } });
  assert.equal(run(dir, 'sync').status, 0);
  assert.match(read(dir, 'AGENTS.md'), /\(tasty-lint:rules\/lint\)/);
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
  assert.match(agents, /## app \(this project\)\n\n- Always-on rule: Release\. Read it with `help app` \(app:rules\/release\)/);
  assert.doesNotMatch(agents, /tasty:rules\/legacy/, "the project harness's exclude applies here too");
  assert.equal(fs.readlinkSync(path.join(dir, '.claude/skills/app-deploy')), '../../harness/skills/app-deploy');
  assert.match(run(dir, 'why', 'app:rules/release').stdout, /editable +yes/);
});

test("the lock leaves out the project's own version, so a release changes nothing", () => {
  const dir = project({}, { name: '@acme/app', version: '1.4.0' });
  writeFiles(dir, {
    'harness/plugin.json': JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'app' }),
    'harness/dev.harnesspm/rules/release.md': '# Release\n\nTag first.\n',
  });
  run(dir, 'sync');
  const lock = read(dir, 'harnesspm.lock.json');
  assert.deepEqual(JSON.parse(lock).packages['@acme/app'], { plugin: 'app', project: true });

  // A version PR raises the version: the committed files stay up to date.
  writeFiles(dir, { 'package.json': JSON.stringify({ name: '@acme/app', version: '1.5.0', devDependencies: {} }) });
  assert.equal(run(dir, 'sync', '--check').status, 0);
  assert.match(run(dir, 'sync').stdout, /Nothing changed/);
  assert.equal(read(dir, 'harnesspm.lock.json'), lock);

  // A lock that harnesspm 0.3 wrote, with the version, passes --check, and the next sync drops the version.
  const old = JSON.parse(lock);
  old.packages['@acme/app'] = { version: '1.4.0', plugin: 'app', project: true };
  writeFiles(dir, { 'harnesspm.lock.json': `${JSON.stringify(old, null, 2)}\n` });
  assert.equal(run(dir, 'sync', '--check').status, 0, 'no false failure on the old form');
  assert.match(run(dir, 'sync').stdout, /Updated 1 file/);
  assert.equal(read(dir, 'harnesspm.lock.json'), lock);
});

test('a docs hash covers llms.txt and the pages, so other files in the folder leave the lock as it is', () => {
  // A component library keeps its pages next to its source and points `docs` at that folder.
  const dir = project({}, { name: '@acme/ui', version: '1.0.0' });
  writeFiles(dir, {
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'ui', extensions: { 'dev.harnesspm': { docs: '../src' } } }),
    'src/Button/Button.docs.mdx': '# Button\n\nText.\n',
    'src/Button/Button.tsx': 'export const Button = 1;\n',
  });
  run(dir, 'sync');
  const lock = read(dir, 'harnesspm.lock.json');

  writeFiles(dir, { 'src/Button/Button.tsx': 'export const Button = 2;\n', 'src/Button/Button.test.tsx': 'test();\n' });
  assert.equal(run(dir, 'sync', '--check').status, 0, 'a source or test file is not a docs page');
  assert.equal(read(dir, 'harnesspm.lock.json'), lock);

  writeFiles(dir, { 'src/Button/Button.docs.mdx': '# Button\n\nNew text.\n' });
  assert.match(run(dir, 'sync', '--check').stdout, /harnesspm\.lock\.json is out of date/, 'a page is');
  run(dir, 'sync');
  const pages = read(dir, 'harnesspm.lock.json');

  writeFiles(dir, { 'src/llms.txt': '# UI\n\n- [Button](Button/Button.docs.mdx)\n' });
  assert.match(run(dir, 'sync', '--check').stdout, /harnesspm\.lock\.json is out of date/, 'and so is llms.txt');
  run(dir, 'sync');
  assert.notEqual(read(dir, 'harnesspm.lock.json'), pages);
});

test('docs leave out the pages git ignores, so a local plan file changes neither the lock nor the index', () => {
  // A dependency in the ignored node_modules still counts whole.
  const dir = project({ '@acme/colors': '^1.0.0' }, { name: '@acme/ui', version: '1.0.0' });
  installPackage(dir, '@acme/colors', { plugin: 'colors', ext: { docs: '../docs' }, files: { 'docs/red.md': '# Red\n' } });
  writeFiles(dir, {
    '.gitignore': 'node_modules\n*.plan.md\n',
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'ui', extensions: { 'dev.harnesspm': { docs: '../src' } } }),
    'src/Button/Button.docs.mdx': '# Button\n\nText.\n',
  });
  run(dir, 'sync');
  const lock = read(dir, 'harnesspm.lock.json');

  writeFiles(dir, { 'src/Button/Button.plan.md': '---\ndescription: a: b\n---\n\n# Plan\n' });
  assert.equal(run(dir, 'sync', '--check').status, 0, 'an ignored page is not in the lock');
  run(dir, 'sync');
  assert.equal(read(dir, 'harnesspm.lock.json'), lock);
  assert.doesNotMatch(read(dir, 'node_modules/.harnesspm/docs/ui/llms.txt'), /Plan/, 'nor in the index');
  assert.match(read(dir, 'node_modules/.harnesspm/docs/ui/llms.txt'), /\[Button\]/);
  assert.match(read(dir, 'node_modules/.harnesspm/docs/colors/llms.txt'), /\[Red\]\(node_modules\/\.harnesspm\/docs\/colors\/red\.md\)/, 'a dependency gets a copy');
  assert.equal(run(dir, 'check').status, 0, 'and check skips its invalid frontmatter');

  writeFiles(dir, { 'src/Button/Button.notes.md': '# Notes\n' });
  assert.match(run(dir, 'sync', '--check').stdout, /harnesspm\.lock\.json is out of date/, 'a new page counts before git add');
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

test('a project below the git root anchors its excludes at the git root, in a section of its own', () => {
  const repo = project({ '@acme/kit': '1' }, {}, false);
  const kit = { plugin: 'kit', harness: { 'skills/kit-review/SKILL.md': skill('kit-review'), 'dev.harnesspm/rules/forms.md': '---\npaths: ["**/*.tsx"]\n---\n\n# Forms\n\nUse the Form component.\n' } };
  installPackage(repo, '@acme/kit', kit);
  const dir = path.join(repo, 'docs-site');
  writeFiles(dir, { 'package.json': JSON.stringify({ name: 'site', version: '1.0.0', devDependencies: { '@acme/kit': '1' } }), 'harnesspm.json': '{}\n', 'harnesspm.local.json': '{}\n' });
  installPackage(dir, '@acme/kit', kit);
  writeFiles(repo, { '.gitignore': 'node_modules/\n' });
  const ignored = (rel: string): boolean => spawnSync('git', ['check-ignore', '-q', rel], { cwd: repo }).status === 0;

  // What 0.9 wrote for the subfolder project: the root's section, with paths from its own folder, and a link now gone.
  fs.mkdirSync(path.join(dir, '.claude/skills'), { recursive: true });
  fs.symlinkSync('../../node_modules/@acme/kit/harness/skills/kit-review', path.join(dir, '.claude/skills/kit-old'));
  writeFiles(repo, { '.git/info/exclude': '# git ls-files --others --exclude-from=.git/info/exclude\n\n# BEGIN harnesspm (generated by `harnesspm sync`; per-machine outputs)\n/.claude/skills/kit-old\n/node_modules/.harnesspm/\n# END harnesspm\n' });

  assert.equal(run(dir, 'sync').status, 0);
  let exclude = read(repo, '.git/info/exclude');
  assert.ok(exclude.startsWith('# git ls-files'), "a person's lines stay");
  assert.ok(!exclude.includes('# BEGIN harnesspm (generated'), "the root's section, which 0.9 wrote for this project, is gone");
  assert.ok(!fs.existsSync(path.join(dir, '.claude/skills/kit-old')), 'its link that this sync no longer writes is removed');
  assert.match(exclude, /^# BEGIN harnesspm in docs-site\/ \(generated by `harnesspm sync`; per-machine outputs\)\n/m);
  assert.match(exclude, /^# END harnesspm in docs-site\/$/m);
  assert.match(exclude, /^\/docs-site\/\.claude\/skills\/kit-review$/m);
  assert.match(exclude, /^\/docs-site\/harnesspm\.local\.json$/m);
  assert.doesNotMatch(exclude, /^\/\.claude\//m, 'no entry misses the project folder');
  for (const rel of ['.claude/skills/kit-review', '.agents/skills/kit-review', '.claude/rules/harnesspm/kit/forms.md', 'harnesspm.local.json']) {
    assert.ok(ignored(`docs-site/${rel}`), `git ignores docs-site/${rel}`);
  }
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repo, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(status, /docs-site\/\.(claude|agents)\//, 'git status shows no per-machine file');
  assert.equal(run(dir, 'doctor').status, 0, run(dir, 'doctor').stdout);
  assert.ok(fs.existsSync(path.join(repo, '.git/harnesspm/docs-site/state.json')), 'the project keeps its own state file');

  // A second project at the root keeps its own section: neither sync touches the other's entries.
  writeFiles(repo, { 'harnesspm.json': '{}\n' });
  assert.equal(run(repo, 'sync').status, 0);
  assert.equal(run(dir, 'sync').status, 0);
  exclude = read(repo, '.git/info/exclude');
  assert.match(exclude, /^# BEGIN harnesspm \(generated[^\n]*\n(?:\/[^\n]*\n)*\/\.claude\/skills\/kit-review\n/m);
  assert.match(exclude, /^\/docs-site\/\.claude\/skills\/kit-review$/m);
  assert.ok(ignored('.claude/skills/kit-review') && ignored('docs-site/.claude/skills/kit-review'));
  assert.ok(fs.existsSync(path.join(repo, '.git/harnesspm/state.json')) && fs.existsSync(path.join(repo, '.git/harnesspm/docs-site/state.json')));
  assert.match(run(dir, 'sync').stdout, /Nothing changed/);
  assert.match(run(repo, 'sync').stdout, /Nothing changed/);
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

/** Lists and installs harnesspm in the project, as `npm i -D @tenphi/harnesspm` does. */
function withHarnesspm(dir: string, field = 'devDependencies'): string {
  const pkg = JSON.parse(read(dir, 'package.json'));
  pkg[field] = { ...pkg[field], '@tenphi/harnesspm': '^1.0.0' };
  writeFiles(dir, {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    'node_modules/@tenphi/harnesspm/package.json': JSON.stringify({ name: '@tenphi/harnesspm', version: '1.0.0' }),
  });
  return dir;
}

/** The install hook that init writes (spec 10.1). */
const HOOK = `node -e "try{require.resolve('@tenphi/harnesspm/package.json');process.exit(1)}catch{}" || harnesspm sync`;

/** Runs a package.json script as npm does on Linux: with sh, from the project root, with node_modules/.bin on PATH. */
function runScript(dir: string, script: string): number {
  const env = { ...process.env, PATH: `${path.join(dir, 'node_modules', '.bin')}${path.delimiter}${process.env['PATH'] ?? ''}` };
  return spawnSync('sh', ['-c', script], { cwd: dir, env, encoding: 'utf8' }).status ?? -1;
}

/** A stand-in for the `harnesspm` command: it records each run in ran.txt and fails with code 3. */
function fakeCommand(dir: string): void {
  writeFiles(dir, { 'node_modules/.bin/harnesspm': '#!/bin/sh\necho "$@" >> ran.txt\nexit 3\n' });
  fs.chmodSync(path.join(dir, 'node_modules/.bin/harnesspm'), 0o755);
}

test('init sets up a project and is safe to run twice', () => {
  const dir = withHarnesspm(chain(false));
  writeFiles(dir, { 'package-lock.json': '{}\n' });
  const first = run(dir, 'init');
  assert.equal(first.status, 0, first.stderr);
  // The files that belong in git, and a word on the rest, so nobody works it out from `git status`.
  assert.match(first.stdout, /\nTo commit: AGENTS\.md, CLAUDE\.md, harnesspm\.json, harnesspm\.lock\.json, package\.json, package-lock\.json\nLinks and settings for this machine stay out of git: \.git\/info\/exclude lists them\.\n$/);
  const pkg = JSON.parse(read(dir, 'package.json'));
  assert.equal(pkg.scripts.prepare, HOOK);
  assert.equal(JSON.parse(read(dir, 'harnesspm.json')).$schema, 'https://unpkg.com/@tenphi/harnesspm/schema/harnesspm.schema.json');
  assert.match(read(dir, 'AGENTS.md'), /BEGIN:harnesspm/);
  run(dir, 'init');
  assert.equal(JSON.parse(read(dir, 'package.json')).scripts.prepare, HOOK);
});

test('init uses postinstall in a private package, and keeps an existing script', () => {
  const dir = withHarnesspm(project({}, { private: true, scripts: { postinstall: 'patch-package' } }, false));
  run(dir, 'init');
  assert.equal(JSON.parse(read(dir, 'package.json')).scripts.postinstall, `patch-package && (${HOOK})`);
  assert.equal(JSON.parse(read(dir, 'package.json')).scripts.prepare, undefined);
});

test('the install hook runs the sync when harnesspm is installed, and skips it without dev dependencies', () => {
  const dir = withHarnesspm(project({}, { private: true }, false));
  assert.equal(run(dir, 'init').status, 0);
  const hook = JSON.parse(read(dir, 'package.json')).scripts.postinstall;
  fakeCommand(dir);
  assert.equal(runScript(dir, hook), 3, 'a failing sync still fails the install');
  assert.equal(read(dir, 'ran.txt'), 'sync\n');
  // `npm ci --omit=dev` installs no dev dependency, so the package is missing.
  fs.rmSync(path.join(dir, 'node_modules/@tenphi'), { recursive: true });
  assert.equal(runScript(dir, hook), 0, 'the install goes on');
  assert.equal(read(dir, 'ran.txt'), 'sync\n', 'the sync did not run again');
});

test("next to an existing script, the install hook keeps that script's failure", () => {
  // Without parentheses, `a && b || c` runs c when a fails, and c's success hides a's failure.
  const dir = withHarnesspm(project({}, { private: true, scripts: { postinstall: 'node -e "process.exit(5)"' } }, false));
  run(dir, 'init');
  const hook = JSON.parse(read(dir, 'package.json')).scripts.postinstall;
  assert.equal(hook, `node -e "process.exit(5)" && (${HOOK})`);
  fakeCommand(dir);
  assert.equal(runScript(dir, hook), 5);
  fs.rmSync(path.join(dir, 'node_modules/@tenphi'), { recursive: true });
  assert.equal(runScript(dir, hook), 5);
  assert.ok(!fs.existsSync(path.join(dir, 'ran.txt')), 'the sync never ran');
});

test('init updates the install hook that it wrote before, and leaves a hand-written one', () => {
  const dir = withHarnesspm(project({}, { private: true, scripts: { prepare: 'harnesspm sync', postinstall: 'patch-package && harnesspm sync' } }, false));
  const result = run(dir, 'init');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Updated the "prepare" script: it now skips `harnesspm sync` when harnesspm is not installed, as in `npm ci --omit=dev`/);
  assert.match(result.stdout, /Updated the "postinstall" script/);
  const scripts = JSON.parse(read(dir, 'package.json')).scripts;
  assert.equal(scripts.prepare, HOOK);
  assert.equal(scripts.postinstall, `patch-package && (${HOOK})`);
  assert.doesNotMatch(run(dir, 'init').stdout, /Updated/, 'a second run changes nothing');

  const own = withHarnesspm(project({}, { private: true, scripts: { postinstall: 'npx harnesspm sync' } }, false));
  run(own, 'init');
  assert.equal(JSON.parse(read(own, 'package.json')).scripts.postinstall, 'npx harnesspm sync');
});

test('init stops when harnesspm is not a dependency of the project, and changes nothing', () => {
  // The script that init adds calls the `harnesspm` command: without the dependency, the next install would fail.
  const dir = project({}, { private: true }, false);
  const before = read(dir, 'package.json');
  const result = run(dir, 'init');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /@tenphi\/harnesspm is not a dependency of this project/);
  assert.match(result.stderr, /Run `npm i -D @tenphi\/harnesspm` first, then `npx harnesspm init`\./);
  assert.equal(read(dir, 'package.json'), before, 'no install script is added');
  for (const file of ['harnesspm.json', 'AGENTS.md', 'CLAUDE.md', 'harnesspm.lock.json']) assert.ok(!fs.existsSync(path.join(dir, file)), `${file} is not written`);

  // Listed in any of the fields that an install reads, it passes.
  assert.equal(run(withHarnesspm(project({}, { private: true }, false), 'dependencies'), 'init').status, 0);
  assert.equal(run(withHarnesspm(project({}, { private: true }, false), 'optionalDependencies'), 'init').status, 0);
  // harnesspm's own repository is the package, so it has no such dependency.
  const own = project({}, {}, false);
  writeFiles(own, { 'package.json': JSON.stringify({ name: '@tenphi/harnesspm', version: '1.0.0' }) });
  assert.equal(run(own, 'init').status, 0);
});

test('status names the layers and the always-on size', () => {
  const dir = chain();
  run(dir, 'sync');
  const result = run(dir, 'status');
  assert.match(result.stdout, /📦 dependencies  @cube-dev\/ui-kit 0\.206\.1 → @tenphi\/tasty 3\.17\.1/);
  assert.match(result.stdout, /📏 always-on     Codex \d+\.\d KiB of 32 KiB/);
});

test('a pattern anchored with / keeps the / for Claude Code, and the pointer line shows it from the root', () => {
  const dir = project({ '@tenphi/tasty': '^3.0.0' });
  installPackage(dir, '@tenphi/tasty', {
    plugin: 'tasty',
    version: '3.17.1',
    harness: { 'dev.harnesspm/rules/setup.md': '---\ndescription: How to configure Tasty\npaths: ["/src/tasty-setup.ts", "**/*.tsx"]\n---\n\n# Setup\n\nCall configure() once.\n' },
  });
  const result = run(dir, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.match(read(dir, 'AGENTS.md'), /- When editing `src\/tasty-setup\.ts`, `\*\*\/\*\.tsx`, read /);
  assert.match(read(dir, '.claude/rules/harnesspm/tasty/setup.md'), /paths: \["\/src\/tasty-setup\.ts", "\*\*\/\*\.tsx"\]/);
});

test("harnesspm's own file-scoped rules match only the project's files, not a dependency's", () => {
  // Claude Code matches a pattern without a leading / at any depth, node_modules too (spec 2.5).
  const rules = path.join(import.meta.dirname, '..', 'harness', 'dev.harnesspm', 'rules');
  for (const name of fs.readdirSync(rules)) {
    const paths = /^paths: (\[.*\])$/m.exec(fs.readFileSync(path.join(rules, name), 'utf8'))?.[1];
    if (paths === undefined) continue;
    for (const pattern of JSON.parse(paths) as string[]) assert.match(pattern, /^(\/|\*\*\/)/, `${name}: ${pattern}`);
  }
});
