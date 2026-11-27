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
const NPX = 'npx -y @tenphi/harnesspm';

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
  writeFiles(dir, { 'node_modules/@tenphi/harnesspm/package.json': JSON.stringify({ name: '@tenphi/harnesspm', version, bin: { harnesspm: 'dist/cli.js' } }) });
}

test('S20: sync in a folder above projects writes their hooks with -C, and a block that names each project', () => {
  const { root, app, lib } = folder();
  installCli(app);
  assert.equal(run(app, 'sync').status, 0);

  const result = run(root, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sessions that start here get the hooks of 2 repositories below: app, lib\. Updated/);

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
  writeFiles(app, { 'node_modules/@tenphi/harnesspm/dist/cli.js': `import(${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../src/cli.ts', import.meta.url))).href)});\n` });
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
  const cli = path.join(app, 'node_modules/@tenphi/harnesspm/dist/cli.js');
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
  assert.match(run(root, 'sync').stdout, /hooks of 3 repositories below: app, lib, web\. Updated/);
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
  assert.match(run(root, 'sync').stdout, /No hooks of repositories below this folder any more: removed what an earlier sync wrote for them/);
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

// ---------- the repositories' own hooks (spec 4.10) ----------

/** A hook script that logs who ran it and where, and blocks an edit of a file named "bad" when it lints. */
const LOG_HOOK = `import * as fs from 'node:fs';
import * as path from 'node:path';
const [label, log] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const file = payload.tool_input?.file_path ?? '';
fs.appendFileSync(log, [label, path.basename(process.env.CLAUDE_PROJECT_DIR), path.basename(process.cwd()), path.basename(payload.cwd)].join(' ') + '\\n');
if (label === 'lint' && file.includes('bad')) {
  console.error('lint failed in ' + path.basename(file));
  process.exit(2);
}
console.log(label + ' ok' + (file !== '' ? ' ' + path.relative(process.cwd(), file) : ''));
`;

const logHook = (label: string, log: string): string => `node "$CLAUDE_PROJECT_DIR/.claude/hooks/log.mjs" ${label} ${log}`;

/** A git repository without harnesspm, with hooks of its own: a session-start script, an edit lint and a background read hook. */
function tools(root: string, log: string): string {
  const dir = path.join(root, 'tools');
  writeFiles(dir, {
    '.claude/hooks/log.mjs': LOG_HOOK,
    '.claude/settings.json': JSON.stringify({ attribution: { commit: '' }, hooks: { SessionStart: [{ matcher: 'startup|resume', hooks: [{ type: 'command', command: logHook('start', log) }] }] } }),
    '.claude/settings.local.json': JSON.stringify({
      hooks: {
        PostToolUse: [
          { matcher: 'Edit|Write', hooks: [{ type: 'command', command: logHook('lint', log), timeout: 30 }] },
          { matcher: 'Read', hooks: [{ type: 'command', command: logHook('read', log), async: true }] },
        ],
      },
    }),
  });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

/** The folder of `folder()`, with `tools` and a hand-written SessionStart hook in the project `app`, both synced. */
function withOwnHooks(): { root: string; app: string; tools: string; log: string } {
  const { root, app } = folder();
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-log-')), 'hooks.log');
  writeFiles(app, { '.claude/hooks/log.mjs': LOG_HOOK, '.claude/settings.json': JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: logHook('start', log) }] }] } }) });
  installCli(app);
  run(app, 'sync');
  return { root, app, tools: tools(root, log), log };
}

/** The folder of the parent folder's records in the test's harnesspm home. */
const parentState = (root: string): string => {
  const parents = path.join(homeOf(root), '.harnesspm/state/parents');
  return path.join(parents, fs.readdirSync(parents).find((name) => name.startsWith(`${path.basename(root)}-`))!);
};
const optedIn = (root: string): boolean => fs.existsSync(path.join(homeOf(root), '.harnesspm/state/parents')) && fs.existsSync(path.join(parentState(root), 'person.json'));

const groupsOf = (dir: string, event: string): { matcher?: string; hooks: { command: string; timeout?: number; async?: boolean }[] }[] => settings(dir).hooks?.[event] ?? [];
const wrapped = (dir: string, event: string): string[] => commands(dir, event).filter((c) => c.includes('hook-wrapper.mjs'));
const logged = (log: string): string[] => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []);

/**
 * Runs the wrapped hooks that the folder's settings hold for an event, through `sh -c` in the folder, as Claude Code
 * does. `subject` picks the groups by matcher. The `-C` hooks are left out: this project's CLI predates them, so npx.
 */
function fire(root: string, event: string, subject: string, payload: Record<string, unknown>): { status: number | null; stdout: string; stderr: string }[] {
  const input = JSON.stringify({ hook_event_name: event, cwd: root, session_id: 's', ...payload });
  const env = { ...process.env, ...HOOK, HOME: homeOf(root), CLAUDE_PROJECT_DIR: root, CI: '', DO_NOT_TRACK: '' };
  return groupsOf(root, event)
    .filter((g) => g.matcher === undefined || g.matcher.split('|').includes(subject))
    .flatMap((g) => g.hooks.filter((h) => h.command.includes('hook-wrapper.mjs')))
    .map((h) => spawnSync('sh', ['-c', h.command], { cwd: root, input, encoding: 'utf8', env }));
}

test("S20: a sync in the folder also runs each repository's own hooks there, as in a session in the repository", () => {
  const { root, app, tools: dir, log } = withOwnHooks();
  const result = run(root, 'sync');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /get the hooks of 3 repositories below: app, lib, tools\. Updated/);

  // Each hook once: harnesspm's own with -C, the repositories' own through the wrapper, with event, matcher, timeout and async.
  const post = commands(root, 'PostToolUse');
  assert.equal(post.filter((c) => c.includes('kit:check-styles')).length, 1, post.join('\n'));
  assert.ok(post.every((c) => !c.includes('kit:check-styles') || c.includes(`-C ${app}`)));
  assert.equal(wrapped(root, 'PostToolUse').length, 2);
  const lint = groupsOf(root, 'PostToolUse').find((g) => g.hooks.some((h) => h.command.includes(' lint ')))!;
  assert.deepEqual([lint.matcher, lint.hooks[0]?.timeout, lint.hooks[0]?.async], ['Edit|Write', 30, undefined]);
  const background = groupsOf(root, 'PostToolUse').find((g) => g.hooks.some((h) => h.command.includes(' read ')))!;
  assert.deepEqual([background.matcher, background.hooks[0]?.async], ['Read', true]);
  assert.equal(wrapped(root, 'SessionStart').length, 2, 'the project\'s hand-written hook and the plain repository\'s');
  assert.equal(groupsOf(root, 'SessionStart').find((g) => g.hooks.some((h) => h.command.includes(dir)))?.matcher, 'startup|resume');
  assert.equal(settings(root).attribution, undefined, 'hooks only: other settings stay in the repository');
  assert.ok(fs.existsSync(path.join(homeOf(root), '.harnesspm/hook-wrapper.mjs')));

  // A session start runs both repositories' scripts, each in its repository with its CLAUDE_PROJECT_DIR and cwd.
  assert.deepEqual(fire(root, 'SessionStart', 'startup', { source: 'startup' }).map((r) => r.status), [0, 0]);
  assert.deepEqual(logged(log).sort(), ['start app app app', 'start tools tools tools']);

  // An edit in the repository runs its lint there, and a block passes back with exit 2.
  const bad = fire(root, 'PostToolUse', 'Edit', { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src/bad.ts') } });
  assert.deepEqual(bad.map((r) => [r.status, r.stderr.trim()]), [[2, 'lint failed in bad.ts']]);
  assert.equal(logged(log).at(-1), 'lint tools tools tools');
  const good = fire(root, 'PostToolUse', 'Write', { tool_name: 'Write', tool_input: { file_path: 'tools/src/good.ts' } });
  assert.deepEqual(good.map((r) => [r.status, r.stdout.trim()]), [[0, 'lint ok src/good.ts']], 'a path relative to the payload cwd names the same file');

  // A file of another repository, or outside every one, runs nothing of this one.
  const before = logged(log).length;
  for (const file of [path.join(app, 'src/bad.ts'), path.join(os.tmpdir(), 'bad.ts')]) {
    assert.deepEqual(fire(root, 'PostToolUse', 'Edit', { tool_name: 'Edit', tool_input: { file_path: file } }).map((r) => [r.status, r.stdout]), [[0, '']]);
  }
  assert.equal(logged(log).length, before);

  // The same sync again changes nothing.
  assert.match(run(root, 'sync').stdout, /Nothing changed\./);
});

test("S20: the repositories' hooks are what a person's sync saw: an agent's sync adds none, and keeps and removes as before", () => {
  const { root, tools: dir, log } = withOwnHooks();
  const model = runWith(root, MODEL, 'sync');
  assert.match(model.stdout, /held back: \d+ entries that an agent cannot grant/);
  assert.deepEqual(wrapped(root, 'SessionStart'), []);

  run(root, 'sync');
  const granted = settings(root);
  assert.equal(wrapped(root, 'SessionStart').length, 2);

  // A hook that appears in the repository later, such as one an agent writes, runs only after a person's sync.
  const local = json(path.join(dir, '.claude/settings.local.json'));
  local.hooks.Stop = [{ hooks: [{ type: 'command', command: logHook('stop', log) }] }];
  writeFiles(dir, { '.claude/settings.local.json': JSON.stringify(local) });
  assert.deepEqual(wrapped(root, 'Stop'), []);
  assert.match(runWith(root, MODEL, 'sync').stdout, /held back: 1 entry that an agent cannot grant \(Claude Code hook of tools: node "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/log\.mjs" stop /);
  assert.deepEqual(settings(root), granted, 'the agent keeps what a person granted');
  assert.equal(run(root, 'sync').status, 0);
  assert.equal(wrapped(root, 'Stop').length, 1);

  // A hook that leaves the repository leaves the folder with any sync.
  delete local.hooks.Stop;
  local.hooks.PostToolUse = local.hooks.PostToolUse.slice(1);
  writeFiles(dir, { '.claude/settings.local.json': JSON.stringify(local) });
  runWith(root, MODEL, 'sync');
  assert.deepEqual(wrapped(root, 'Stop'), []);
  assert.equal(wrapped(root, 'PostToolUse').length, 1);
});

test('S20: a repository that leaves takes its hooks along; a hook the wrapper cannot keep is named; without the wrapper a hook does nothing', () => {
  const { root, tools: dir, log } = withOwnHooks();
  const local = json(path.join(dir, '.claude/settings.local.json'));
  local.hooks.Stop = [{ hooks: [{ type: 'command', command: 'node', args: ['stop.mjs'] }, { type: 'http', url: 'https://example.com/hook' }] }];
  writeFiles(dir, { '.claude/settings.local.json': JSON.stringify(local) });
  const result = run(root, 'sync');
  assert.match(result.stderr, /tools: a Stop hook in \.claude\/settings\.local\.json does not run in sessions that start in the folder above, because of its "args": node/);
  assert.match(result.stderr, /tools: a Stop hook in \.claude\/settings\.local\.json does not run .*, because of its type "http"/);
  assert.equal(settings(root).hooks.Stop, undefined);

  // Without the wrapper file, such as after `rm -rf ~/.harnesspm`, a hook exits 0 and runs nothing.
  fs.rmSync(path.join(homeOf(root), '.harnesspm/hook-wrapper.mjs'));
  assert.deepEqual(fire(root, 'SessionStart', 'startup', { source: 'startup' }).map((r) => r.status), [0, 0]);
  assert.deepEqual(logged(log), []);
  run(root, 'sync');
  assert.ok(fs.existsSync(path.join(homeOf(root), '.harnesspm/hook-wrapper.mjs')), 'the next sync writes it again');

  fs.rmSync(dir, { recursive: true });
  assert.equal(run(root, 'sync').status, 0);
  assert.ok(!JSON.stringify(settings(root)).includes(dir));
  assert.equal(wrapped(root, 'SessionStart').length, 1, "the project's own hook stays");
});

test("S20, 13.14: a person's `add` in the folder writes it, and an entry's hooks run there only for files of their repository", () => {
  const { root } = folder();
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-log-')), 'hooks.log');
  const dir = tools(root, log);
  spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/tools.git'], { cwd: dir });
  // The repository's own harnesspm CLI runs this checkout, so the entry's hook starts without npx.
  writeFiles(dir, {
    'node_modules/@tenphi/harnesspm/package.json': JSON.stringify({ name: '@tenphi/harnesspm', version: '0.16.0', bin: { harnesspm: 'dist/cli.js' } }),
    'node_modules/@tenphi/harnesspm/dist/cli.js': `import(${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../src/cli.ts', import.meta.url))).href)});\n`,
  });
  const mine = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-mine-'));
  writeFiles(mine, {
    'harness/plugin.json': JSON.stringify({ name: 'mine', extensions: { 'dev.harnesspm': { projects: { 'github.com/acme/tools': './projects/tools' } } } }),
    'harness/projects/tools/plugin.json': JSON.stringify({ name: 'mine', extensions: { 'dev.harnesspm': { scripts: { guard: { file: './dev.harnesspm/scripts/guard.mjs' } } } } }),
    'harness/projects/tools/dev.harnesspm/scripts/guard.mjs':
      "import * as fs from 'node:fs';\nconst file = JSON.parse(fs.readFileSync(0, 'utf8')).tool_input?.file_path ?? '';\nif (file.includes('secret')) { console.error(`guarded ${file.split('/').pop()} in ${process.cwd().split('/').pop()}`); process.exit(2); }\n",
    'harness/projects/tools/dev.harnesspm/hooks.json': JSON.stringify({ hooks: { PostToolUse: [{ id: 'guard', matcher: { claude: 'Edit|Write' }, run: 'guard' }] } }),
  });

  const added = run(root, 'add', mine);
  assert.equal(added.status, 0, added.stderr);
  // The entry wrote its hook into the repository; the folder above runs it once, through the wrapper.
  assert.ok(commands(dir, 'PostToolUse').some((c) => c.endsWith('run --agent claude mine:guard')));
  const guard = wrapped(root, 'PostToolUse').filter((c) => c.includes('mine:guard'));
  assert.equal(guard.length, 1);

  const edit = (file: string) => fire(root, 'PostToolUse', 'Edit', { tool_name: 'Edit', tool_input: { file_path: file } }).filter((r) => r.status !== 0);
  assert.deepEqual(edit(path.join(dir, 'secret.ts')).map((r) => [r.status, r.stderr.trim()]), [[2, 'guarded secret.ts in tools']]);
  assert.deepEqual(edit(path.join(root, 'app', 'secret.ts')), [], 'a file of another repository');
});

test("S20: an agent's sync event names a repository's own hook it held back above the project without its command", () => {
  const { root, app } = withOwnHooks();
  run(root, 'sync');
  // Without the records of what a person wrote above the project, but with the folder's opt-in.
  for (const file of fs.readdirSync(parentState(root))) if (file !== 'person.json') fs.rmSync(path.join(parentState(root), file));
  assert.match(runWith(app, MODEL, 'sync').stdout, /held back: /);
  const sync = events(app).filter((e) => e.type === 'sync').at(-1)!;
  assert.ok(sync.held.includes('Claude Code hook of a repository'), JSON.stringify(sync.held));
  assert.ok(!JSON.stringify(sync).includes(root) && !JSON.stringify(sync).includes('log.mjs'), 'no local path, no command');
});

test("S20: a hook's sync in a folder no person synced copies no repository's own hooks and does not opt the folder in", () => {
  const { root, app } = folder();
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-log-')), 'hooks.log');
  tools(root, log);
  installCli(app);
  run(app, 'sync');
  // The SessionStart hook of an added harness runs in whatever folder a session starts in, such as ~/Downloads.
  const hook = runInput(root, HOOK, JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }), 'sync');
  assert.equal(hook.status, 0, hook.stderr);
  assert.doesNotMatch(hook.stdout, /held back/);
  assert.deepEqual(wrapped(root, 'SessionStart'), []);
  assert.deepEqual(wrapped(root, 'PostToolUse'), []);
  assert.ok(commands(root, 'PostToolUse').some((c) => c.includes('kit:check-styles')), "a project's harness is copied as before");
  assert.ok(!optedIn(root));
  assert.ok(!fs.existsSync(path.join(homeOf(root), '.harnesspm/hook-wrapper.mjs')));
});

test("S20: a person's sync opts the folder in and copies the repositories' own hooks", () => {
  const { root, tools: dir } = withOwnHooks();
  assert.ok(!optedIn(root));
  assert.equal(run(root, 'sync').status, 0);
  assert.ok(optedIn(root));
  assert.equal(wrapped(root, 'SessionStart').length, 2);
  assert.ok(wrapped(root, 'PostToolUse').every((c) => c.includes(dir)));
});

test("S20: in a folder a person opted into, a hook's sync copies a repository's hook that appeared later", () => {
  const { root, tools: dir, log } = withOwnHooks();
  run(root, 'sync');
  const local = json(path.join(dir, '.claude/settings.local.json'));
  local.hooks.Stop = [{ hooks: [{ type: 'command', command: logHook('stop', log) }] }];
  writeFiles(dir, { '.claude/settings.local.json': JSON.stringify(local) });
  const hook = runInput(root, HOOK, JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }), 'sync');
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(wrapped(root, 'Stop').length, 1, 'as in a session inside the repository, from the next session');
});

test("S20: an agent's sync never opts a folder in and adds no repository's own hook", () => {
  const { root } = withOwnHooks();
  const model = runWith(root, MODEL, 'sync');
  assert.equal(model.status, 0);
  assert.doesNotMatch(model.stdout, /Claude Code hook of tools/, 'nothing to hold without an opt-in');
  assert.ok(!optedIn(root));
  assert.deepEqual(wrapped(root, 'SessionStart'), []);
  assert.deepEqual(wrapped(root, 'PostToolUse'), []);
});

test("S20: `update --hook` in a folder no person synced copies no repository's own hooks and does not opt it in, with no agent marks at all", () => {
  const { root } = withOwnHooks();
  // As Codex runs the user-level session hook: no AI_AGENT, no CLAUDECODE, no Codex marks.
  const hook = runInput(root, {}, JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }), 'update', '--hook');
  assert.equal(hook.status, 0, hook.stderr);
  assert.ok(!optedIn(root));
  assert.deepEqual(wrapped(root, 'SessionStart'), []);
  assert.deepEqual(wrapped(root, 'PostToolUse'), []);
  // The same run without --hook is a person's: it opts the folder in.
  assert.equal(runInput(root, {}, '', 'update').status, 0);
  assert.ok(optedIn(root));
  assert.equal(wrapped(root, 'SessionStart').length, 2);
});
