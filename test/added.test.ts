import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { normalizeRemote } from '../src/added.ts';
import { homeOf, installPackage, isLink, PLUGIN_SCHEMA, project, read, run, runWith, skill, writeFiles } from './helpers.ts';

/** A harness folder outside any project, such as a person's own or a team's. */
function harness(plugin: string, files: Record<string, string>, ext: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `harnesspm-${plugin}-`));
  writeFiles(dir, {
    'AGENTS.md': `# ${plugin}\n\nCommit and push to main.\n`,
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: plugin, extensions: { 'dev.harnesspm': ext } }),
    ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`harness/${k}`, v])),
  });
  return dir;
}

/** A project that depends on a package with one rule and one skill, with an origin remote. */
function appWithTeamHarness(remote = 'git@github.com:acme/app.git'): string {
  const dir = project({ '@acme/kit': '1' });
  installPackage(dir, '@acme/kit', {
    plugin: 'kit',
    harness: {
      'dev.harnesspm/rules/forms.md': '# Forms\n\n## Defaults\n\nOn the controller.\n\n## Errors\n\nShow them inline.\n',
      'dev.harnesspm/rules/legacy.md': '# Legacy\n\nOld rule.\n',
      'skills/kit-review/SKILL.md': skill('kit-review'),
    },
  });
  spawnSync('git', ['remote', 'add', 'origin', remote], { cwd: dir });
  return dir;
}

const home = (dir: string, rel: string): string => path.join(homeOf(dir), rel);

test('remote keys are the same for SSH and HTTPS', () => {
  assert.equal(normalizeRemote('git@github.com:acme/app.git'), 'github.com/acme/app');
  assert.equal(normalizeRemote('https://github.com/acme/app.git'), 'github.com/acme/app');
  assert.equal(normalizeRemote('ssh://git@gitlab.example.com:2222/team/app.git'), 'gitlab.example.com/team/app');
  assert.equal(normalizeRemote('https://user@bitbucket.org/team/app/'), 'bitbucket.org/team/app');
});

test('S9: add with user scope writes user-level outputs, the hook and write access', () => {
  const dir = appWithTeamHarness();
  const mine = harness('alex', {
    'dev.harnesspm/rules/workflow.md': '# Workflow\n\nUse conventional commits.\n',
    'dev.harnesspm/rules/notes.md': '---\ndescription: Notes about my projects\n---\n\n# Notes\n\nText.\n',
    'skills/alex-release/SKILL.md': skill('alex-release'),
  });
  const result = run(dir, 'add', mine);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Added alex \(.*\) with user scope/);
  assert.match(result.stdout, /Rules from .*, to follow from now on in this session:[\s\S]*### Workflow \(alex:rules\/workflow\)\n\nUse conventional commits\./);

  assert.deepEqual(JSON.parse(fs.readFileSync(home(dir, '.harnesspm/config.json'), 'utf8')).harnesses, [mine]);
  for (const file of ['.claude/CLAUDE.md', '.codex/AGENTS.md']) {
    const text = fs.readFileSync(home(dir, file), 'utf8');
    assert.match(text, /## alex \(.*, user scope\)\n\n### Workflow \(alex:rules\/workflow\)/);
    assert.match(text, new RegExp(`- Notes about my projects: read ${mine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/harness/dev\\.harnesspm/rules/notes\\.md \\(alex:rules/notes\\)`));
  }
  assert.ok(isLink(homeOf(dir), '.claude/skills/alex-release'));
  assert.equal(fs.realpathSync(home(dir, '.claude/skills/alex-release')), fs.realpathSync(path.join(mine, 'harness/skills/alex-release')));
  assert.ok(fs.existsSync(home(dir, '.agents/skills/alex-release/SKILL.md')));

  const settings = JSON.parse(fs.readFileSync(home(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, 'npx -y @tenphi/harnesspm sync');
  assert.deepEqual(settings.permissions.additionalDirectories, [mine]);
  assert.equal(JSON.parse(fs.readFileSync(home(dir, '.codex/hooks.json'), 'utf8')).hooks.SessionStart[0].hooks[0].command, 'npx -y @tenphi/harnesspm sync');

  // Nothing of the added harness enters the repository: its own units are user-level.
  assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.local.md')));
  assert.doesNotMatch(read(dir, 'AGENTS.md'), /alex/);
});

test('stacked harnesses apply in order, and a later one wins on a skill name', () => {
  const dir = appWithTeamHarness();
  const team = harness('frontend', { 'dev.harnesspm/rules/reviews.md': '# Reviews\n\nTwo approvals.\n', 'skills/shared-deploy/SKILL.md': skill('shared-deploy', 'Team version. Use when deploying.') });
  const mine = harness('alex', { 'dev.harnesspm/rules/workflow.md': '# Workflow\n\nSmall commits.\n', 'skills/shared-deploy/SKILL.md': skill('shared-deploy', 'My version. Use when deploying.') });
  run(dir, 'add', team);
  const result = run(dir, 'add', mine);
  assert.match(result.stderr, /skill "shared-deploy" comes from .* and .*; using/);
  const text = fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8');
  assert.ok(text.indexOf('## frontend') < text.indexOf('## alex'), 'the team harness comes first');
  assert.match(fs.readFileSync(home(dir, '.claude/skills/shared-deploy/SKILL.md'), 'utf8'), /My version/);
});

test('S10: a project entry applies in its repository, over SSH or HTTPS remotes', () => {
  for (const remote of ['git@github.com:acme/app.git', 'https://github.com/acme/app.git']) {
    const dir = appWithTeamHarness(remote);
    const mine = harness(
      'alex',
      {
        'dev.harnesspm/rules/workflow.md': '# Workflow\n\nSmall commits.\n',
        'projects/app/dev.harnesspm/rules/local-setup.md': '# Local setup\n\nStaging is at https://staging.example.com.\n',
        'projects/app/skills/alex-app-seed/SKILL.md': skill('alex-app-seed'),
      },
      { projects: { 'github.com/acme/app': './projects/app' } },
    );
    run(dir, 'add', mine);
    const local = read(dir, 'CLAUDE.local.md');
    assert.match(local, /## alex: entry for this repository \(.*\)\n\n### Local setup \(alex:rules\/local-setup\)\n\nStaging is at/);
    assert.doesNotMatch(local, /Small commits/, 'the harness itself stays user-level');
    assert.match(read(dir, '.codex/config.toml'), /^# Generated by `harnesspm sync`[^\n]*\ndeveloper_instructions = """\n## alex: entry for this repository/);
    assert.ok(isLink(dir, '.claude/skills/alex-app-seed'));
    const exclude = read(dir, '.git/info/exclude');
    for (const entry of ['/CLAUDE.local.md', '/.codex/config.toml', '/.claude/skills/alex-app-seed']) assert.ok(exclude.includes(`${entry}\n`), entry);
    assert.match(run(dir, 'why', 'alex:rules/local-setup').stdout, /owner +added .* \(user scope, entry for this repository\)/);
  }
});

test('an entry changes team units on this machine only; committed files stay the same', () => {
  const dir = appWithTeamHarness();
  run(dir, 'sync');
  const before = { agents: read(dir, 'AGENTS.md'), lock: read(dir, 'harnesspm.lock.json') };
  const mine = harness(
    'alex',
    {
      'projects/app/plugin.json': JSON.stringify({ name: 'alex', extensions: { 'dev.harnesspm': { exclude: ['kit:rules/legacy', 'kit:skills/kit-review'], patch: { 'kit:rules/forms': './forms.patch.md' } } } }),
      'projects/app/forms.patch.md': '## Errors\n\nShow them in a toast.\n',
    },
    { projects: { 'github.com/acme/app': './projects/app' } },
  );
  run(dir, 'add', mine);
  assert.equal(read(dir, 'AGENTS.md'), before.agents, 'AGENTS.md does not change');
  assert.equal(read(dir, 'harnesspm.lock.json'), before.lock, 'the lock does not change');
  assert.equal(run(dir, 'sync', '--check').status, 0);
  const local = read(dir, 'CLAUDE.local.md');
  assert.match(local, /## Changes to this repository's rules/);
  assert.match(local, /### Forms \(kit:rules\/forms, changed by .*; use this text instead of the one in AGENTS\.md\)[\s\S]*Show them in a toast\./);
  assert.match(local, /- Ignore the rule kit:rules\/legacy in AGENTS\.md: .* turns it off on this machine\./);
  assert.ok(!fs.existsSync(path.join(dir, '.claude/skills/kit-review')), 'an excluded team skill is not linked');
  assert.match(run(dir, 'status').stdout, /✏️  changed here  kit:rules\/forms/);
});

test('local scope: the harness applies in one repository and is listed in harnesspm.local.json', () => {
  const dir = appWithTeamHarness();
  const notes = harness('notes', { 'dev.harnesspm/rules/context.md': '# Context\n\nThis app talks to the billing API.\n' });
  const result = run(dir, 'add', notes, '--local');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(read(dir, 'harnesspm.local.json')).harnesses, [notes]);
  assert.ok(read(dir, '.git/info/exclude').includes('/harnesspm.local.json\n'));
  assert.match(read(dir, 'CLAUDE.local.md'), /## notes \(.*, local scope\)\n\n### Context \(notes:rules\/context\)/);
  assert.ok(!fs.existsSync(home(dir, '.claude/CLAUDE.md')), 'nothing user-level');
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(status, /CLAUDE\.local\.md|harnesspm\.local\.json|\.codex/);
});

test('a repository without harnesspm gets only the outputs of added harnesses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-plain-'));
  homeOf(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/tool.git'], { cwd: dir });
  writeFiles(dir, { 'AGENTS.md': '# Tool\n\nUse make.\n' });
  const mine = harness('alex', { 'projects/tool/dev.harnesspm/rules/tool.md': '# Tool notes\n\nRun make test.\n' }, { projects: { 'github.com/acme/tool': './projects/tool' } });
  run(dir, 'add', mine);
  const local = read(dir, 'CLAUDE.local.md');
  assert.ok(local.startsWith('@AGENTS.md\n'), 'keeps Claude Code reading AGENTS.md');
  assert.match(local, /### Tool notes \(alex:rules\/tool\)/);
  assert.equal(read(dir, 'AGENTS.md'), '# Tool\n\nUse make.\n');
  for (const file of ['CLAUDE.md', 'harnesspm.lock.json', 'node_modules']) assert.ok(!fs.existsSync(path.join(dir, file)), file);
  assert.match(run(path.join(dir), 'sync').stdout, /Added harnesses only/);
});

test('before the dependencies are installed, sync leaves the committed block alone', () => {
  const dir = appWithTeamHarness();
  run(dir, 'sync');
  const agents = read(dir, 'AGENTS.md');
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
  const mine = harness('alex', { 'projects/app/dev.harnesspm/rules/x.md': '# X\n\nY.\n' }, { projects: { 'github.com/acme/app': './projects/app' } });
  const result = run(dir, 'add', mine);
  assert.match(result.stderr, /the dependencies are not installed, so the committed outputs are left as they are/);
  assert.equal(read(dir, 'AGENTS.md'), agents);
  assert.match(read(dir, 'CLAUDE.local.md'), /### X \(alex:rules\/x\)/);
});

test('rule 4: when the model runs add, the hook and write access stay pending', () => {
  const dir = appWithTeamHarness();
  const mine = harness('alex', { 'dev.harnesspm/rules/workflow.md': '# Workflow\n\nSmall commits.\n' });
  const result = runWith(dir, { AI_AGENT: 'claude-code_2-1-322_agent', CLAUDECODE: '1' }, 'add', mine);
  assert.match(result.stdout, /are pending: an agent cannot grant them/);
  assert.ok(!fs.existsSync(home(dir, '.claude/settings.json')));
  assert.match(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), /Small commits/, 'text outputs are written as usual');
  run(dir, 'add', mine);
  assert.ok(fs.existsSync(home(dir, '.claude/settings.json')), 'a person running it grants them');
  run(dir, 'remove', mine);
  assert.ok(!fs.existsSync(home(dir, '.claude/settings.json')), 'a settings file with only our entries goes away');
  assert.ok(!fs.existsSync(home(dir, '.codex/hooks.json')));
});

test('remove takes the harness, its outputs, the hook and write access away', () => {
  const dir = appWithTeamHarness();
  writeFiles(homeOf(dir), { '.claude/CLAUDE.md': '# My own notes\n', '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(ls)'], additionalDirectories: ['/opt/mine'] } }) });
  const mine = harness('alex', { 'dev.harnesspm/rules/workflow.md': '# Workflow\n\nSmall commits.\n', 'skills/alex-release/SKILL.md': skill('alex-release') }, { projects: { 'github.com/acme/app': './projects/app' } });
  writeFiles(mine, { 'harness/projects/app/dev.harnesspm/rules/x.md': '# X\n\nY.\n' });
  run(dir, 'add', mine);
  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.local.md')));
  const result = run(dir, 'remove', mine);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), '# My own notes\n');
  assert.ok(!fs.existsSync(home(dir, '.claude/skills/alex-release')));
  assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.local.md')));
  assert.ok(!fs.existsSync(path.join(dir, '.codex/config.toml')));
  const settings = JSON.parse(fs.readFileSync(home(dir, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(settings, { permissions: { allow: ['Bash(ls)'], additionalDirectories: ['/opt/mine'] } }, "the person's own settings stay");
  assert.ok(!read(dir, '.git/info/exclude').includes('CLAUDE.local.md'));
});

test('git sources: add clones, update pulls, and a working copy with local work is skipped', () => {
  const upstream = harness('team', { 'dev.harnesspm/rules/reviews.md': '# Reviews\n\nTwo approvals.\n' });
  const git = (cwd: string, ...args: string[]): string => spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' }).stdout;
  git(upstream, 'init', '-q', '-b', 'main');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-q', '-m', 'init');
  const bare = `${upstream}.git`;
  spawnSync('git', ['clone', '-q', '--bare', upstream, bare]);

  const dir = appWithTeamHarness();
  const added = run(dir, 'add', `git:${bare}`);
  assert.equal(added.status, 0, added.stderr);
  assert.match(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), /Two approvals/);
  assert.match(run(dir, 'why', 'team:rules/reviews').stdout, /rules +.*\.harnesspm\/harnesses\/.*AGENTS\.md/);

  // Upstream changes, update pulls it.
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-other-'));
  spawnSync('git', ['clone', '-q', bare, other]);
  writeFiles(other, { 'harness/dev.harnesspm/rules/reviews.md': '# Reviews\n\nOne approval is enough.\n' });
  git(other, 'commit', '-q', '-am', 'relax');
  git(other, 'push', '-q');
  assert.match(run(dir, 'update').stdout, /up to date/);
  assert.match(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), /One approval is enough/);

  // A local edit in the working copy is never overwritten.
  const copy = fs.readdirSync(home(dir, '.harnesspm/harnesses')).map((d) => home(dir, `.harnesspm/harnesses/${d}`))[0]!;
  writeFiles(copy, { 'harness/dev.harnesspm/rules/reviews.md': '# Reviews\n\nMy edit.\n' });
  assert.match(run(dir, 'update').stdout, /skipped, the working copy has uncommitted changes/);
  assert.match(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), /My edit\./, 'sync shows the edit at once');
});

test('CI ignores added harnesses', () => {
  const dir = appWithTeamHarness();
  const mine = harness('alex', { 'projects/app/dev.harnesspm/rules/x.md': '# X\n\nY.\n' }, { projects: { 'github.com/acme/app': './projects/app' } });
  run(dir, 'add', mine);
  fs.rmSync(path.join(dir, 'CLAUDE.local.md'));
  runWith(dir, { CI: 'true' }, 'sync');
  assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.local.md')));
});
