import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { normalizeRemote } from '../src/added.ts';
import { caller, HOOK_RUN } from '../src/util.ts';
import { homeOf, installPackage, isLink, PLUGIN_SCHEMA, project, read, run, runInput, runWith, skill, writeFiles } from './helpers.ts';

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
  const mine = harness('andrew', {
    'dev.harnesspm/rules/workflow.md': '# Workflow\n\nUse conventional commits.\n',
    'dev.harnesspm/rules/notes.md': '---\ndescription: Notes about my projects\n---\n\n# Notes\n\nText.\n',
    'skills/andrew-release/SKILL.md': skill('andrew-release'),
  });
  const result = run(dir, 'add', mine);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Added andrew \(.*\) with user scope/);
  assert.match(result.stdout, /Rules from .*, to follow from now on in this session:[\s\S]*### Workflow \(andrew:rules\/workflow\)\n\nUse conventional commits\./);

  assert.deepEqual(JSON.parse(fs.readFileSync(home(dir, '.harnesspm/config.json'), 'utf8')).harnesses, [mine]);
  for (const file of ['.claude/CLAUDE.md', '.codex/AGENTS.md']) {
    const text = fs.readFileSync(home(dir, file), 'utf8');
    assert.match(text, /## andrew \(.*, user scope\)\n\n### Workflow \(andrew:rules\/workflow\)/);
    assert.match(text, new RegExp(`- Notes about my projects: read ${mine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/harness/dev\\.harnesspm/rules/notes\\.md \\(andrew:rules/notes\\)`));
  }
  assert.ok(isLink(homeOf(dir), '.claude/skills/andrew-release'));
  assert.equal(fs.realpathSync(home(dir, '.claude/skills/andrew-release')), fs.realpathSync(path.join(mine, 'harness/skills/andrew-release')));
  assert.ok(fs.existsSync(home(dir, '.agents/skills/andrew-release/SKILL.md')));

  const settings = JSON.parse(fs.readFileSync(home(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, 'npx -y @tenphi/harnesspm update --hook');
  assert.deepEqual(settings.permissions.additionalDirectories, [mine]);
  assert.equal(JSON.parse(fs.readFileSync(home(dir, '.codex/hooks.json'), 'utf8')).hooks.SessionStart[0].hooks[0].command, 'npx -y @tenphi/harnesspm update --hook');

  // Nothing of the added harness enters the repository: its own units are user-level.
  assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.local.md')));
  assert.doesNotMatch(read(dir, 'AGENTS.md'), /andrew/);
});

test('stacked harnesses apply in order, and a later one wins on a skill name', () => {
  const dir = appWithTeamHarness();
  const team = harness('frontend', { 'dev.harnesspm/rules/reviews.md': '# Reviews\n\nTwo approvals.\n', 'skills/shared-deploy/SKILL.md': skill('shared-deploy', 'Team version. Use when deploying.') });
  const mine = harness('andrew', { 'dev.harnesspm/rules/workflow.md': '# Workflow\n\nSmall commits.\n', 'skills/shared-deploy/SKILL.md': skill('shared-deploy', 'My version. Use when deploying.') });
  run(dir, 'add', team);
  const result = run(dir, 'add', mine);
  assert.match(result.stderr, /skill "shared-deploy" comes from .* and .*; using/);
  const text = fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8');
  assert.ok(text.indexOf('## frontend') < text.indexOf('## andrew'), 'the team harness comes first');
  assert.match(fs.readFileSync(home(dir, '.claude/skills/shared-deploy/SKILL.md'), 'utf8'), /My version/);
});

test('S10: a project entry applies in its repository, over SSH or HTTPS remotes', () => {
  for (const remote of ['git@github.com:acme/app.git', 'https://github.com/acme/app.git']) {
    const dir = appWithTeamHarness(remote);
    const mine = harness(
      'andrew',
      {
        'dev.harnesspm/rules/workflow.md': '# Workflow\n\nSmall commits.\n',
        'projects/app/dev.harnesspm/rules/local-setup.md': '# Local setup\n\nStaging is at https://staging.example.com.\n',
        'projects/app/skills/andrew-app-seed/SKILL.md': skill('andrew-app-seed'),
      },
      { projects: { 'github.com/acme/app': './projects/app' } },
    );
    run(dir, 'add', mine);
    const local = read(dir, 'CLAUDE.local.md');
    assert.match(local, /## andrew: entry for this repository \(.*\)\n\n### Local setup \(andrew:rules\/local-setup\)\n\nStaging is at/);
    assert.doesNotMatch(local, /Small commits/, 'the harness itself stays user-level');
    assert.match(read(dir, '.codex/config.toml'), /^# Generated by `harnesspm sync`[^\n]*\ndeveloper_instructions = """\n## andrew: entry for this repository/);
    assert.ok(isLink(dir, '.claude/skills/andrew-app-seed'));
    const exclude = read(dir, '.git/info/exclude');
    for (const entry of ['/CLAUDE.local.md', '/.codex/config.toml', '/.claude/skills/andrew-app-seed']) assert.ok(exclude.includes(`${entry}\n`), entry);
    assert.match(run(dir, 'why', 'andrew:rules/local-setup').stdout, /owner +added .* \(user scope, entry for this repository\)/);
  }
});

test('an entry changes team units on this machine only; committed files stay the same', () => {
  const dir = appWithTeamHarness();
  run(dir, 'sync');
  const before = { agents: read(dir, 'AGENTS.md'), lock: read(dir, 'harnesspm.lock.json') };
  const mine = harness(
    'andrew',
    {
      'projects/app/plugin.json': JSON.stringify({ name: 'andrew', extensions: { 'dev.harnesspm': { exclude: ['kit:rules/legacy', 'kit:skills/kit-review'], patch: { 'kit:rules/forms': './forms.patch.md' } } } }),
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
  assert.match(local, /### Forms \(kit:rules\/forms, changed by .* on this machine; follow this text\)[\s\S]*Show them in a toast\./);
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

test('local scope in a project below the git root: its per-machine files stay out of git', () => {
  const repo = project({}, {}, false);
  const dir = path.join(repo, 'app');
  writeFiles(dir, { 'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }), 'harnesspm.json': '{}\n' });
  const notes = harness('notes', { 'dev.harnesspm/rules/context.md': '# Context\n\nThis app talks to the billing API.\n' });
  assert.equal(run(dir, 'add', notes, '--local').status, 0);
  assert.match(read(repo, '.git/info/exclude'), /^\/app\/harnesspm\.local\.json$/m);
  assert.doesNotMatch(read(repo, '.git/info/exclude'), /^\/harnesspm\.local\.json$/m);
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repo, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(status, /CLAUDE\.local\.md|harnesspm\.local\.json|\.codex/);
});

test('a repository without harnesspm gets only the outputs of added harnesses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-plain-'));
  homeOf(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/tool.git'], { cwd: dir });
  writeFiles(dir, { 'AGENTS.md': '# Tool\n\nUse make.\n' });
  const mine = harness('andrew', { 'projects/tool/dev.harnesspm/rules/tool.md': '# Tool notes\n\nRun make test.\n' }, { projects: { 'github.com/acme/tool': './projects/tool' } });
  run(dir, 'add', mine);
  const local = read(dir, 'CLAUDE.local.md');
  assert.ok(local.startsWith('@AGENTS.md\n'), 'keeps Claude Code reading AGENTS.md');
  assert.match(local, /### Tool notes \(andrew:rules\/tool\)/);
  assert.equal(read(dir, 'AGENTS.md'), '# Tool\n\nUse make.\n');
  for (const file of ['CLAUDE.md', 'harnesspm.lock.json', 'node_modules']) assert.ok(!fs.existsSync(path.join(dir, file)), file);
  assert.match(run(path.join(dir), 'sync').stdout, /Added harnesses only/);
});

test('before the dependencies are installed, sync leaves the committed block alone', () => {
  const dir = appWithTeamHarness();
  run(dir, 'sync');
  const agents = read(dir, 'AGENTS.md');
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
  const mine = harness('andrew', { 'projects/app/dev.harnesspm/rules/x.md': '# X\n\nY.\n' }, { projects: { 'github.com/acme/app': './projects/app' } });
  const result = run(dir, 'add', mine);
  assert.match(result.stderr, /the dependencies are not installed, so the committed outputs are left as they are/);
  assert.equal(read(dir, 'AGENTS.md'), agents);
  assert.match(read(dir, 'CLAUDE.local.md'), /### X \(andrew:rules\/x\)/);
});

test('rule 4: when the model runs add, the hook and write access stay pending', () => {
  const dir = appWithTeamHarness();
  const mine = harness('andrew', { 'dev.harnesspm/rules/workflow.md': '# Workflow\n\nSmall commits.\n' });
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
  const mine = harness('andrew', { 'dev.harnesspm/rules/workflow.md': '# Workflow\n\nSmall commits.\n', 'skills/andrew-release/SKILL.md': skill('andrew-release') }, { projects: { 'github.com/acme/app': './projects/app' } });
  writeFiles(mine, { 'harness/projects/app/dev.harnesspm/rules/x.md': '# X\n\nY.\n' });
  run(dir, 'add', mine);
  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.local.md')));
  const result = run(dir, 'remove', mine);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), '# My own notes\n');
  assert.ok(!fs.existsSync(home(dir, '.claude/skills/andrew-release')));
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
  assert.match(run(dir, 'update').stdout, /: updated [0-9a-f]{7,} → [0-9a-f]{7,}\n/);
  assert.match(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), /One approval is enough/);
  assert.match(run(dir, 'update').stdout, /: already up to date at [0-9a-f]{7,}\n/);

  // A local edit in the working copy is never overwritten.
  const copy = fs.readdirSync(home(dir, '.harnesspm/harnesses')).map((d) => home(dir, `.harnesspm/harnesses/${d}`))[0]!;
  writeFiles(copy, { 'harness/dev.harnesspm/rules/reviews.md': '# Reviews\n\nMy edit.\n' });
  assert.match(run(dir, 'update').stdout, /skipped, the working copy has uncommitted changes/);
  assert.match(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), /My edit\./, 'sync shows the edit at once');
});

/** A git harness with one rule, added to a fresh app through a bare remote. Returns the app, the bare remote and a runner as the SessionStart hook. */
function appWithGitHarness(): { dir: string; bare: string; hook: (...args: string[]) => ReturnType<typeof run> } {
  const upstream = harness('team', { 'dev.harnesspm/rules/reviews.md': '# Reviews\n\nTwo approvals.\n' });
  const git = (cwd: string, ...args: string[]): void => void spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd });
  git(upstream, 'init', '-q', '-b', 'main');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-q', '-m', 'init');
  const bare = `${upstream}.git`;
  spawnSync('git', ['clone', '-q', '--bare', upstream, bare]);
  const dir = appWithTeamHarness();
  assert.equal(run(dir, 'add', `git:${bare}`).status, 0);
  const payload = JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: 's', cwd: dir });
  return { dir, bare, hook: (...args) => runInput(dir, { AI_AGENT: 'claude-code_2-1-0_harness', CLAUDECODE: '1' }, payload, ...args) };
}

test('the SessionStart hook updates: a fetch that fails warns, and the session starts with what is on the machine', () => {
  const { dir, bare, hook } = appWithGitHarness();
  fs.renameSync(bare, `${bare}.gone`);
  const result = hook('update');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /: pull failed, kept [0-9a-f]{7,}: /);
  assert.match(fs.readFileSync(home(dir, '.claude/CLAUDE.md'), 'utf8'), /Two approvals/, 'the outputs stay');

  // A working copy that is gone and cannot be cloned again: a warning, not a failure.
  fs.rmSync(home(dir, '.harnesspm/harnesses'), { recursive: true, force: true });
  const again = hook('update');
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stderr, /git clone .* failed: .*Kept what is on this machine\./s);
  const copies = home(dir, '.harnesspm/harnesses');
  assert.deepEqual(fs.existsSync(copies) ? fs.readdirSync(copies) : [], [], 'no half-cloned folder is left behind');
});

test('the hook of an older harnesspm, `sync` (0.14) or `update` without --hook (0.15), becomes `update --hook` at the next sync by a person or a hook', () => {
  for (const old of ['npx -y @tenphi/harnesspm sync', 'npx -y @tenphi/harnesspm update']) {
    const { dir, hook } = appWithGitHarness();
    const files = [home(dir, '.claude/settings.json'), home(dir, '.codex/hooks.json')];
    const commandIn = (file: string): string => JSON.parse(fs.readFileSync(file, 'utf8')).hooks.SessionStart[0].hooks[0].command;
    const mine = { hooks: [{ type: 'command', command: 'echo mine' }] };
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      data.hooks.SessionStart[0].hooks[0].command = old;
      data.hooks.SessionStart.push(mine);
      data.env = { KEEP: '1' };
      fs.writeFileSync(file, JSON.stringify(data));
    }

    // The agent's model never changes it.
    assert.equal(runWith(dir, { AI_AGENT: 'claude-code_2-1-0_agent' }, 'sync').status, 0);
    for (const file of files) assert.equal(commandIn(file), old);

    assert.equal(hook('sync').status, 0);
    for (const file of files) {
      assert.equal(commandIn(file), 'npx -y @tenphi/harnesspm update --hook', old);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(data.hooks.SessionStart.length, 2, 'replaced in place, not added');
      assert.deepEqual(data.hooks.SessionStart[1], mine, "the person's own hook stays");
      assert.deepEqual(data.env, { KEEP: '1' });
    }
    assert.equal(JSON.parse(fs.readFileSync(files[0]!, 'utf8')).hooks.SessionStart[0].hooks[0].timeout, 120);
    // Idempotent: the next run changes nothing.
    const before = files.map((file) => fs.readFileSync(file, 'utf8'));
    assert.equal(run(dir, 'sync').status, 0);
    assert.deepEqual(files.map((file) => fs.readFileSync(file, 'utf8')), before);
  }
});

test("--hook makes a run a hook's, also where Codex marks no hook; a model run that passes it stays a model run", () => {
  assert.equal(caller({}), 'person');
  assert.equal(caller({ [HOOK_RUN]: '1' }), 'hook');
  assert.equal(caller({ [HOOK_RUN]: '1', CODEX_CI: '1' }), 'model');
  assert.equal(caller({ [HOOK_RUN]: '1', CODEX_TOOL_CALL_ID: 'call_1' }), 'model');
  assert.equal(caller({ [HOOK_RUN]: '1', AI_AGENT: 'claude-code_2-1-0_agent', CLAUDECODE: '1' }), 'model');
  assert.equal(caller({ [HOOK_RUN]: '1', CLAUDECODE: '1' }), 'model');
});

test('user-level pointers of a git source are absolute, so an agent opens them from any folder', () => {
  const upstream = harness('mine', {
    'dev.harnesspm/rules/notes.md': '---\ndescription: Notes about my projects\n---\n\n# Notes\n\nText.\n',
    'notes/repos.md': '# Repos\n\nHow they relate.\n',
  }, { docs: './notes' });
  const git = (cwd: string, ...args: string[]): void => void spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd });
  git(upstream, 'init', '-q', '-b', 'main');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-q', '-m', 'init');

  const dir = appWithTeamHarness();
  assert.equal(run(dir, 'add', `git:file://${upstream}`).status, 0);
  const copy = home(dir, '.harnesspm/harnesses');
  for (const file of ['.claude/CLAUDE.md', '.codex/AGENTS.md']) {
    const text = fs.readFileSync(home(dir, file), 'utf8');
    const pointers = [...text.matchAll(/: read (\S+) \(mine:rules\/notes\)|- Docs: (\S+) \(mine:docs\)/g)].map((m) => m[1] ?? m[2]!);
    assert.equal(pointers.length, 2, text);
    for (const pointer of pointers) {
      assert.ok(path.isAbsolute(pointer), `${file}: ${pointer} is not absolute`);
      assert.ok(fs.existsSync(pointer), `${file}: ${pointer} does not exist`);
    }
    assert.ok(pointers[0]!.startsWith(copy), `${file}: the rule is read from the working copy`);
  }
  // The generated docs index lists its pages in full too.
  const index = fs.readFileSync(home(dir, '.harnesspm/generated/user/docs/mine/llms.txt'), 'utf8');
  assert.match(index, new RegExp(`\\]\\(${copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^)]+/notes/repos\\.md\\)`));
});

/** A folder that is not a git repository, as `/home/user` in a cloud session with several repositories. */
function above(): { root: string; repo: (name: string, remote: string) => string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-above-')));
  homeOf(root);
  const repo = (name: string, remote: string): string => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['remote', 'add', 'origin', remote], { cwd: dir });
    return dir;
  };
  return { root, repo };
}

test('S10 in a session with several repositories: a sync above them applies each one\'s entry, and leaves the repositories\' own outputs alone', () => {
  const { root, repo } = above();
  const cloud = repo('cloud', 'git@github.com:acme/cloud.git');
  const kit = repo('kit', 'https://github.com/acme/kit.git');
  writeFiles(kit, { 'package.json': JSON.stringify({ name: 'kit', devDependencies: { '@acme/kit': '1' } }), 'harnesspm.json': '{}\n', '.gitignore': 'node_modules/\n' });
  installPackage(kit, '@acme/kit', { plugin: 'kit', harness: { 'dev.harnesspm/rules/forms.md': '# Forms\n\nOn the controller.\n', 'skills/kit-review/SKILL.md': skill('kit-review') } });
  assert.equal(run(kit, 'sync').status, 0);
  assert.ok(isLink(kit, '.claude/skills/kit-review'));
  spawnSync('git', ['add', '-A'], { cwd: kit });
  spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'kit'], { cwd: kit });
  writeFiles(root, { 'notes/README.md': '# Notes\n' });
  const mine = harness('mine', {
    'projects/cloud/dev.harnesspm/rules/cloud-habits.md': '# Cloud habits\n\nUse my tenant.\n',
    'projects/cloud/skills/mine-deploy/SKILL.md': skill('mine-deploy'),
    'projects/kit/dev.harnesspm/rules/kit-habits.md': '# Kit habits\n\nProbe first.\n',
  }, { projects: { 'github.com/acme/cloud': './projects/cloud', 'github.com/acme/kit': './projects/kit' } });

  // A setup script adds the harness in the folder above the clones.
  const added = run(root, 'add', mine);
  assert.equal(added.status, 0, added.stderr);
  assert.match(read(cloud, 'CLAUDE.local.md'), /Use my tenant\./);
  assert.ok(isLink(cloud, '.claude/skills/mine-deploy'));
  assert.match(read(kit, 'CLAUDE.local.md'), /Probe first\./);
  assert.ok(!fs.existsSync(path.join(root, 'notes', 'CLAUDE.local.md')), 'a folder that is not a repository gets nothing');
  for (const dir of [cloud, kit]) assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout, '', `${dir}: per-machine files stay out of git`);

  // The SessionStart hook of the next session: the entries come back, and kit's committed block stays as it is, also
  // when a sync there would change it.
  fs.rmSync(path.join(cloud, 'CLAUDE.local.md'));
  installPackage(kit, '@acme/kit', { plugin: 'kit', harness: { 'dev.harnesspm/rules/forms.md': '# Form fields\n\nOn the controller.\n', 'skills/kit-review/SKILL.md': skill('kit-review') } });
  const block = read(kit, 'AGENTS.md');
  const hook = runInput(root, { AI_AGENT: 'claude-code_2-1-0_harness', CLAUDECODE: '1' }, JSON.stringify({ hook_event_name: 'SessionStart', cwd: root }), 'sync');
  assert.equal(hook.status, 0, hook.stderr);
  assert.match(hook.stdout, /Added harnesses in 2 repositories below: cloud, kit/);
  assert.match(read(cloud, 'CLAUDE.local.md'), /Use my tenant\./);
  assert.equal(read(kit, 'AGENTS.md'), block);
  assert.doesNotMatch(block, /Form fields/);
  // kit's own per-machine outputs belong to its install, which may run another harnesspm: they stay.
  assert.ok(isLink(kit, '.claude/skills/kit-review'));
  assert.match(read(kit, 'CLAUDE.local.md'), /Probe first\./);
});

test('a folder above git repositories stays as before without added harnesses, and with CI=true', () => {
  const { root, repo } = above();
  const cloud = repo('cloud', 'git@github.com:acme/cloud.git');
  assert.match(run(root, 'sync').stdout, /Nothing to do in this folder\. Nothing changed\./);
  assert.ok(!fs.existsSync(path.join(cloud, 'CLAUDE.local.md')));

  const mine = harness('mine', { 'projects/cloud/dev.harnesspm/rules/cloud-habits.md': '# Cloud habits\n\nUse my tenant.\n' }, { projects: { 'github.com/acme/cloud': './projects/cloud' } });
  assert.equal(run(root, 'add', mine).status, 0);
  fs.rmSync(path.join(cloud, 'CLAUDE.local.md'));
  assert.equal(runWith(root, { CI: 'true' }, 'sync').status, 0);
  assert.ok(!fs.existsSync(path.join(cloud, 'CLAUDE.local.md')), 'CI ignores added harnesses');
});

test('CI ignores added harnesses', () => {
  const dir = appWithTeamHarness();
  const mine = harness('andrew', { 'projects/app/dev.harnesspm/rules/x.md': '# X\n\nY.\n' }, { projects: { 'github.com/acme/app': './projects/app' } });
  run(dir, 'add', mine);
  fs.rmSync(path.join(dir, 'CLAUDE.local.md'));
  runWith(dir, { CI: 'true' }, 'sync');
  assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.local.md')));
});
