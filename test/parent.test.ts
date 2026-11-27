// A session that starts in a folder above projects, such as a cloud session with several repositories (spec 4.10, S20).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homeOf, installCli, installPackage, read, run, runInput, runWith, writeFiles } from './helpers.ts';

const MODEL = { AI_AGENT: 'claude-code_2-1-323_agent', CLAUDECODE: '1' };
const HOOK = { AI_AGENT: 'claude-code_2-1-323_harness', CLAUDECODE: '1' };
const EVENTS = '.harnesspm/events.jsonl';
const NPX = 'npx -y @harnesspm/cli';

function kit(dir: string): void {
  installPackage(dir, '@acme/kit', {
    plugin: 'kit',
    version: '2.1.0',
    ext: { scripts: { 'check-styles': { file: './dev.harnesspm/scripts/check.mjs' } } },
    harness: {
      'dev.harnesspm/scripts/check.mjs': 'console.log(`checked in ${process.cwd()}`);\n',
      'dev.harnesspm/rules/usage.md': '# Usage\n\nUse the kit.\n',
      'dev.harnesspm/hooks.json': JSON.stringify({ hooks: { PostToolUse: [{ id: 'check-styles', matcher: { claude: 'Edit|Write', codex: 'apply_patch' }, run: 'check-styles', timeout: 30 }] } }),
    },
  });
}

/**
 * A folder that is not a git repository, with `app` (installed, trusts @acme/kit, events to a file), `lib` (a project
 * that is not installed) and `notes` (no harnesspm), the way a cloud session or a person's folder of clones holds them.
 */
function folder(prefix = 'harnesspm-parent-'): { root: string; app: string; lib: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  homeOf(root);
  const app = project(root, 'app');
  const lib = path.join(root, 'lib');
  writeFiles(lib, { 'package.json': JSON.stringify({ name: 'lib', devDependencies: { '@acme/other': '1' } }), 'harnesspm.json': '{}\n' });
  writeFiles(root, { 'notes/README.md': '# Notes\n' });
  spawnSync('git', ['init', '-q'], { cwd: lib });
  return { root, app, lib };
}

/** An installed project below `root` that trusts @acme/kit, whose hook it gets, and writes its events to a file. */
function project(root: string, name: string): string {
  const dir = path.join(root, name);
  writeFiles(dir, {
    'package.json': JSON.stringify({ name, version: '1.0.0', devDependencies: { '@acme/kit': '2' } }),
    'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: { send: { file: EVENTS } } }),
    '.gitignore': 'node_modules/\n',
  });
  kit(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

const git = (dir: string, ...args: string[]): void => {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};

const json = (file: string): Record<string, any> => JSON.parse(fs.readFileSync(file, 'utf8'));
const settings = (dir: string): Record<string, any> => (fs.existsSync(path.join(dir, '.claude/settings.local.json')) ? json(path.join(dir, '.claude/settings.local.json')) : {});
const commands = (dir: string, event: string): string[] => (settings(dir).hooks?.[event] ?? []).flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
const events = (dir: string): Record<string, any>[] => (fs.existsSync(path.join(dir, EVENTS)) ? read(dir, EVENTS).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/** Sets the version of the harnesspm stand-in that `installCli` wrote. */
function cliVersion(dir: string, version: string): void {
  writeFiles(dir, { 'node_modules/@harnesspm/cli/package.json': JSON.stringify({ name: '@harnesspm/cli', version, bin: { harnesspm: 'dist/cli.js' } }) });
}

test('S20: sync in a folder above projects writes their hooks with -C, and a block that names each project', () => {
  const { root, app, lib } = folder();
  installCli(app);
  assert.equal(run(app, 'sync').status, 0);

  const result = run(root, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sessions that start here get the hooks of 2 projects below: app, lib\. Updated/);

  // The project's hooks and telemetry hooks, started for the project with -C. Its CLI predates parent hooks, so npx.
  const at = `${NPX} -C ${app}`;
  assert.deepEqual(commands(root, 'PostToolUse'), [`${at} run --agent claude kit:check-styles`, `${at} track --agent claude`]);
  assert.deepEqual(commands(root, 'SessionStart'), [`${at} track --agent claude`]);
  assert.deepEqual(commands(root, 'InstructionsLoaded'), [`${at} track --agent claude`]);
  assert.equal(settings(root).permissions, undefined, 'allow rules name commands that work in the project only');
  const codex = json(path.join(root, '.codex/hooks.json')).hooks;
  assert.deepEqual(Object.keys(codex).sort(), ['PostToolUse', 'SessionStart']);
  assert.equal(codex.PostToolUse[0].hooks[0].command, `${at} run --agent codex kit:check-styles`);

  // The block names every project below, the installed one and the one that is not, by absolute path.
  const agents = read(root, 'AGENTS.md');
  assert.match(agents, /<!-- BEGIN:harnesspm/);
  assert.ok(agents.includes(`- \`app\`: \`${app}\`. Rules: \`${path.join(app, 'AGENTS.md')}\`. Its harness: \`${NPX} -C ${app} help\`.`), agents);
  assert.ok(agents.includes(`- \`lib\`: \`${lib}\``), agents);
  assert.ok(!agents.includes('notes'), 'a folder without harnesspm.json is not a project');
  assert.equal(read(root, 'CLAUDE.md'), '@AGENTS.md\n');

  // The same sync again changes nothing, and text of the person's own stays.
  writeFiles(root, { 'AGENTS.md': `# My folder\n\n${agents}` });
  const again = run(root, 'sync');
  assert.match(again.stdout, /Nothing changed\./);
  assert.ok(read(root, 'AGENTS.md').startsWith('# My folder\n'));
});

test("S20: the hooks run the project's units from the folder above it", () => {
  const { root, app } = folder();
  installCli(app);
  run(app, 'sync');
  run(root, 'sync');
  const payload = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(app, 'src/a.tsx') }, cwd: root, session_id: 's' });
  const hook = runInput(root, HOOK, payload, '-C', app, 'run', '--agent', 'claude', 'kit:check-styles');
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(hook.stdout.trim(), `checked in ${app}`, 'a hook runs in its project, as in a session there');
  assert.equal(events(app).at(-1)?.outside, true);

  // An edit in another repository below the folder: the project's hook skips it, and sends nothing.
  const before = events(app).length;
  const sibling = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: 'lib/src/b.tsx' }, cwd: root, session_id: 's' });
  const skipped = runInput(root, HOOK, sibling, '-C', app, 'run', '--agent', 'claude', 'kit:check-styles');
  assert.deepEqual([skipped.status, skipped.stdout], [0, '']);
  assert.equal(events(app).length, before);

  // A tool that the agent runs with -C, not a hook, still runs in the agent's folder.
  assert.equal(run(root, '-C', app, 'run', 'kit:check-styles').stdout.trim(), `checked in ${root}`);
});

test('S20: the hook commands work through a shell, in a folder whose path has a space', () => {
  const { root, app } = folder('harnesspm parent-');
  // The installed CLI runs this checkout's harnesspm, and says it runs parent hooks.
  installCli(app);
  cliVersion(app, '0.11.0');
  writeFiles(app, { 'node_modules/@harnesspm/cli/dist/cli.js': `import(${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../src/cli.ts', import.meta.url))).href)});\n` });
  run(app, 'sync');
  assert.equal(run(root, 'sync').status, 0);
  const [command] = commands(root, 'PostToolUse');
  assert.ok(command?.includes(`'${app}'`), command);
  const payload = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(app, 'a.tsx') }, cwd: root, session_id: 's' });
  const env = { ...process.env, ...HOOK, HOME: homeOf(root), CI: '', DO_NOT_TRACK: '' };
  const hook = spawnSync('sh', ['-c', command!], { cwd: root, input: payload, encoding: 'utf8', env });
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(hook.stdout.trim(), `checked in ${app}`);
});

test("S20: a project's own sync keeps its entries in a folder above it current, and never starts one there", () => {
  const { root, app, lib } = folder();
  installCli(app);
  run(app, 'sync');
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')), 'without a sync in the folder, a project writes nothing there');
  assert.ok(!fs.existsSync(path.join(root, '.claude')));

  run(root, 'sync');
  // After an upgrade to a harnesspm that runs parent hooks, the project's sync switches them to its installed CLI file.
  cliVersion(app, '0.11.0');
  const cli = path.join(app, 'node_modules/@harnesspm/cli/dist/cli.js');
  assert.equal(run(app, 'sync').status, 0);
  assert.deepEqual(commands(root, 'SessionStart'), [`node ${cli} -C ${app} track --agent claude`]);
  assert.deepEqual(commands(root, 'PostToolUse'), [`node ${cli} -C ${app} run --agent claude kit:check-styles`, `node ${cli} -C ${app} track --agent claude`]);

  // A hook that the package drops leaves the folder too; the telemetry hooks stay.
  fs.rmSync(path.join(app, 'node_modules/@acme/kit/harness/dev.harnesspm/hooks.json'));
  run(app, 'sync');
  assert.deepEqual(commands(root, 'PostToolUse'), [`node ${cli} -C ${app} track --agent claude`]);
  assert.match(read(root, 'AGENTS.md'), new RegExp(`\`lib\`: \`${lib}\``), 'the block still names every project');
});

test('S20: a folder inside a git repository, and a folder without projects below it, get no parent outputs', () => {
  const { root } = folder();
  spawnSync('git', ['init', '-q'], { cwd: root });
  assert.match(run(root, 'sync').stdout, /Nothing to do in this folder/);
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')));

  const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-empty-')));
  homeOf(empty);
  assert.match(run(empty, 'sync').stdout, /Nothing to do in this folder/);
  assert.deepEqual(fs.readdirSync(empty), []);
});

test("S20: the home folder is never a parent folder: its .claude/ and .codex/ are every session's user settings", () => {
  const { root, app } = folder();
  installCli(app);
  run(app, 'sync');
  const asHome = runWith(root, { HOME: root }, 'sync');
  assert.match(asHome.stdout, /Nothing to do in this folder/);
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')));
  assert.ok(!fs.existsSync(path.join(root, '.codex/hooks.json')));
});

test("S20: an agent's sync in the folder writes the block, and holds hooks that a person has not written there", () => {
  const { root, app } = folder();
  installCli(app);
  run(app, 'sync');
  const model = runWith(root, MODEL, 'sync');
  assert.equal(model.status, 0);
  assert.match(model.stdout, /held back: .*kit:check-styles/);
  assert.equal(settings(root).hooks, undefined);
  assert.match(read(root, 'AGENTS.md'), /`app`/, 'the block grants nothing, so an agent writes it');

  // After a person's sync, an agent's sync keeps what is there.
  run(root, 'sync');
  const before = settings(root);
  assert.doesNotMatch(runWith(root, MODEL, 'sync').stdout, /held back/);
  assert.deepEqual(settings(root), before);

  // The agent clones a repository whose default branch records its hooks. Its install writes them in the clone, as a
  // reviewed state allows, but never in the person's folder above it.
  const cloned = project(root, 'cloned');
  installCli(cloned);
  runWith(cloned, MODEL, 'sync');
  git(cloned, 'add', '-A');
  git(cloned, 'commit', '-qm', 'Add the kit');
  git(cloned, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(cloned, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const install = runWith(cloned, MODEL, 'sync');
  assert.match(install.stdout, /held back: .*-C .*cloned run --agent claude kit:check-styles/);
  assert.ok(commands(cloned, 'PostToolUse').some((c) => c.endsWith('run --agent claude kit:check-styles')), 'the reviewed state writes the clone\'s own hooks');
  assert.ok(!JSON.stringify(settings(root)).includes(cloned), 'nothing of the clone in the parent folder');
  assert.match(read(root, 'AGENTS.md'), /`cloned`/, 'the block names it: a pointer grants nothing');
});

test("S20: an agent's sync event names the hooks it held back above the project, without the project's path", () => {
  const { root, app } = folder();
  installCli(app);
  run(app, 'sync');
  run(root, 'sync');
  // Without the record of what a person wrote above the project, the agent's sync may not write it again.
  fs.rmSync(path.join(homeOf(root), '.harnesspm/state/parents'), { recursive: true, force: true });
  assert.match(runWith(app, MODEL, 'sync').stdout, /held back: .*-C /);
  const sync = events(app).filter((e) => e.type === 'sync').at(-1)!;
  assert.ok(sync.held.includes('Claude Code hook: harnesspm run --agent claude kit:check-styles'), JSON.stringify(sync.held));
  assert.ok(!JSON.stringify(sync).includes(root), 'no local path');
});

test('S20: projects that leave the folder leave nothing behind, and a second project keeps the first one\'s entries in place', () => {
  const { root, app, lib } = folder();
  const web = project(root, 'web');
  for (const dir of [app, web]) {
    installCli(dir);
    run(dir, 'sync');
  }
  assert.match(run(root, 'sync').stdout, /hooks of 3 projects below: app, lib, web\. Updated/);
  const both = read(root, '.claude/settings.local.json');
  assert.ok(both.includes(`-C ${app} `) && both.includes(`-C ${web} `));
  // Idempotent: the projects do not move each other's entries, neither in a sync here nor in a project's own.
  assert.match(run(root, 'sync').stdout, /Nothing changed\./);
  run(app, 'sync');
  run(web, 'sync');
  assert.equal(read(root, '.claude/settings.local.json'), both);

  // A project that leaves: its hooks go with the next sync here, and the block no longer names it.
  fs.rmSync(path.join(web, 'harnesspm.json'));
  run(root, 'sync');
  assert.ok(!read(root, '.claude/settings.local.json').includes(`-C ${web} `));
  assert.doesNotMatch(read(root, 'AGENTS.md'), /`web`/);

  // When no project is left, nothing of harnesspm is: hooks, block and import, unless the person wrote text of their own.
  fs.rmSync(app, { recursive: true });
  fs.rmSync(lib, { recursive: true });
  assert.match(run(root, 'sync').stdout, /No projects below this folder any more: removed what an earlier sync wrote for them/);
  for (const file of ['AGENTS.md', 'CLAUDE.md', '.claude', '.codex']) assert.ok(!fs.existsSync(path.join(root, file)), file);
  assert.match(run(root, 'sync').stdout, /Nothing to do in this folder/);
});

test('S20: with CI=true, a sync in the folder writes the hooks too: they are per machine', () => {
  const { root, app } = folder();
  installCli(app);
  run(app, 'sync');
  assert.equal(runWith(root, { CI: 'true' }, 'sync').status, 0);
  assert.ok(commands(root, 'SessionStart').length > 0);
});

test('S20: a hook in the folder above sends the events of its project, marked outside, with the session that commands see', () => {
  const { root, app } = folder();
  installCli(app);
  run(app, 'sync');
  run(root, 'sync');
  const usage = path.join(app, 'node_modules/.harnesspm/pkgs/@acme/kit/harness/dev.harnesspm/rules/usage.md');
  const start = { hook_event_name: 'SessionStart', source: 'startup', cwd: root, session_id: 'from-payload' };
  const readUsage = { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: usage }, cwd: root, session_id: 'from-payload' };

  for (const payload of [start, readUsage]) assert.equal(runInput(root, { ...HOOK, CLAUDE_CODE_SESSION_ID: 'from-env' }, JSON.stringify(payload), '-C', app, 'track', '--agent', 'claude').status, 0);
  const [session, readEvent] = events(app).slice(-2);
  assert.deepEqual([session?.type, session?.session, session?.outside, session?.project], ['session', 'from-env', true, 'app']);
  assert.deepEqual([readEvent?.type, readEvent?.unit, readEvent?.outside], ['read', 'kit:rules/usage', true]);

  // Without the variable the payload's ID stays; inside the project an event has no `outside`.
  runInput(root, HOOK, JSON.stringify(start), '-C', app, 'track', '--agent', 'claude');
  assert.equal(events(app).at(-1)?.session, 'from-payload');
  runInput(app, { ...HOOK, CLAUDE_CODE_SESSION_ID: 'from-env' }, JSON.stringify({ ...start, cwd: app }), 'track', '--agent', 'claude');
  assert.deepEqual([events(app).at(-1)?.session, events(app).at(-1)?.outside], ['from-env', undefined]);
  // Codex sessions keep the payload's ID.
  runInput(app, { CLAUDE_CODE_SESSION_ID: 'from-env' }, JSON.stringify({ ...start, cwd: app }), 'track', '--agent', 'codex');
  assert.equal(events(app).at(-1)?.session, 'from-payload');
});
