import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { homeOf, installCli, installPackage, project, read, run, runInput, runNode, runWith, skill, writeFiles } from './helpers.ts';

const MODEL = { AI_AGENT: 'claude-code_2-1-323_agent', CLAUDECODE: '1' };
const EVENTS = '.harnesspm/events.jsonl';
const SECRET = 'SECRET-CONTENT-7f3a';

function kit(dir: string): void {
  installPackage(dir, '@acme/kit', {
    plugin: 'kit',
    version: '2.1.0',
    ext: {
      docs: '../docs',
      scripts: {
        probe: { file: './dev.harnesspm/scripts/probe.mjs', description: 'Print a word', allow: true },
        lint: { file: './dev.harnesspm/scripts/probe.mjs', description: 'Exit with a code', answers: [1, 2] },
        killed: { file: './dev.harnesspm/scripts/killed.mjs', description: 'End by a signal' },
      },
    },
    harness: {
      'dev.harnesspm/scripts/probe.mjs': 'console.log("probed"); process.exit(Number(process.argv[2] ?? 0));\n',
      'dev.harnesspm/scripts/killed.mjs': 'process.kill(process.pid, "SIGKILL");\n',
      'dev.harnesspm/rules/usage.md': '# Usage\n\nUse the kit.\n',
      'dev.harnesspm/rules/forms.md': '---\npaths: ["**/*.tsx"]\n---\n\n# Forms\n\nUse Form.\n',
      'skills/kit-review/SKILL.md': skill('kit-review'),
      'mcp.json': JSON.stringify({ mcpServers: { docs: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/dev.harnesspm/scripts/probe.mjs'] } } }),
    },
    files: { 'docs/button.md': '# Button\n\nA button.\n', 'docs/guides/forms.md': '# Forms guide\n' },
  });
}

/** A project that depends on @acme/kit and trusts it, with the given telemetry. */
function app(telemetry?: unknown): string {
  const dir = project({ '@acme/kit': '2' });
  kit(dir);
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, ...(telemetry !== undefined ? { telemetry } : {}) }) });
  return dir;
}

const json = (file: string): Record<string, any> => JSON.parse(fs.readFileSync(file, 'utf8'));
const settings = (dir: string): Record<string, any> => {
  const file = path.join(dir, '.claude/settings.local.json');
  return fs.existsSync(file) ? json(file) : {};
};
const events = (dir: string, file = EVENTS): Record<string, any>[] =>
  fs.existsSync(path.join(dir, file)) ? read(dir, file).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

/** Waits for a file that a detached process writes. */
function waitFor(file: string, ms = 8000): string {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() !== '') return fs.readFileSync(file, 'utf8');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  assert.fail(`${file} was not written in ${ms} ms`);
}

test('telemetry config: send is required, events are checked, the lock records the handler', () => {
  const cases: [unknown, RegExp][] = [
    [{}, /"telemetry" needs "send"/],
    [{ send: { file: 'a', other: 1 } }, /"telemetry" needs "send"/],
    [{ send: 'x', events: ['run', 'clicks'] }, /unknown event "clicks"/],
    [{ send: 'x', events: 'some' }, /"events" must be "all" or a list/],
    [{ send: 'x', sample: 0.5 }, /unknown field "sample"/],
  ];
  for (const [telemetry, message] of cases) {
    const result = run(app(telemetry), 'sync');
    assert.equal(result.status, 1, JSON.stringify(telemetry));
    assert.match(result.stderr, message);
  }
  const dir = app({ send: { file: EVENTS } });
  assert.equal(run(dir, 'sync').status, 0);
  assert.deepEqual(json(path.join(dir, 'harnesspm.lock.json')).telemetry, { send: { file: EVENTS } });
  assert.match(run(dir, 'status').stdout, /📡 telemetry +run, mcp, sync, why, help, read, skill, session → file \.harnesspm\/events\.jsonl/);
  const plain = app();
  assert.equal(run(plain, 'sync').status, 0);
  assert.equal(json(path.join(plain, 'harnesspm.lock.json')).telemetry, undefined, 'no telemetry, no lock entry');
});

test('a script run sends a run event to a file handler, without its arguments', () => {
  const dir = app({ events: ['run', 'mcp', 'sync', 'why'], send: { file: EVENTS } });
  assert.equal(run(dir, 'sync').status, 0);
  const sync = events(dir).find((e) => e.type === 'sync')!;
  assert.deepEqual(sync.packages, [{ name: '@acme/kit', version: '2.1.0' }]);
  assert.ok(sync.added.includes('kit:scripts/probe') && sync.added.includes('kit:docs'), 'the first sync adds every unit');
  assert.deepEqual(sync.pending, []);

  const ran = run(dir, 'run', 'kit:probe', '--', '3', `--token=${SECRET}`);
  assert.equal(ran.status, 3, 'telemetry never changes the exit code');
  const event = events(dir).find((e) => e.type === 'run')!;
  assert.equal(event.schema, 'harnesspm.event/1');
  assert.equal(event.project, 'app');
  assert.equal(event.workspace, '.');
  assert.match(event.harnesspm, /^\d+\.\d+\.\d+/);
  assert.equal(event.caller, 'person');
  assert.equal(event.agent, undefined);
  assert.equal(event.unit, 'kit:scripts/probe');
  assert.equal(event.package, '@acme/kit');
  assert.equal(event.version, '2.1.0');
  assert.equal(event.exit, 3);
  assert.equal(event.outcome, 'failed', 'a script without answers fails on any non-zero exit');
  assert.equal(event.outside, undefined, 'inside the project, no outside field');
  assert.equal(typeof event.duration, 'number');
  assert.ok(!read(dir, EVENTS).includes(SECRET), 'no arguments in events');
  assert.ok(read(dir, '.git/info/exclude').includes(`/${EVENTS}\n`), 'a handler file in the project stays out of git');

  // An agent's run, a hook's run, and why.
  runWith(dir, { ...MODEL, CLAUDE_CODE_SESSION_ID: 'sess-1' }, 'run', 'kit:probe');
  runWith(dir, {}, 'run', '--agent', 'codex', 'kit:probe');
  run(dir, 'why', 'kit:rules/usage');
  runWith(dir, { AI_AGENT: 'claude-code_2-1-323_harness', CLAUDECODE: '1' }, 'mcp', '--agent', 'claude', 'kit:docs');
  const [, , agentRun, hookRun, why, mcp] = events(dir);
  assert.deepEqual([agentRun!.caller, agentRun!.agent, agentRun!.session], ['agent', 'claude', 'sess-1']);
  assert.deepEqual([hookRun!.caller, hookRun!.agent], ['hook', 'codex']);
  assert.deepEqual([why!.type, why!.unit, why!.package, why!.outside], ['why', 'kit:rules/usage', '@acme/kit', undefined]);
  assert.equal(agentRun!.outcome, 'ok');
  assert.deepEqual([mcp!.type, mcp!.unit, mcp!.caller, mcp!.agent], ['mcp', 'kit:mcp/docs', 'hook', 'claude']);
});

test('a run event says what its exit code means: ok, answer or failed; a run that a signal ended fails', () => {
  const dir = app({ events: ['run'], send: { file: EVENTS } });
  assert.equal(run(dir, 'sync').status, 0);
  const outcomes: [string[], number, string][] = [
    [['kit:lint'], 0, 'ok'],
    [['kit:lint', '--', '1'], 1, 'answer'],
    [['kit:lint', '--', '2'], 2, 'answer'],
    [['kit:lint', '--', '3'], 3, 'failed'],
    [['kit:probe', '--', '1'], 1, 'failed'],
  ];
  for (const [args, exit] of outcomes) assert.equal(run(dir, 'run', ...args).status, exit, args.join(' '));
  // Ended by a signal: exit stays 1, as before, but it is never an answer, even with 1 in answers.
  const kitManifest = path.join(dir, 'node_modules/@acme/kit/harness/plugin.json');
  const manifest = json(kitManifest);
  manifest.extensions['dev.harnesspm'].scripts.killed.answers = [1];
  fs.writeFileSync(kitManifest, JSON.stringify(manifest));
  assert.equal(run(dir, 'sync').status, 0);
  assert.equal(run(dir, 'run', 'kit:killed').status, 1);
  const got = events(dir).map((e) => [e.unit, e.exit, e.outcome]);
  assert.deepEqual(got, [...outcomes.map(([args, exit, outcome]) => [`kit:scripts/${args[0]!.slice(4)}`, exit, outcome]), ['kit:scripts/killed', 1, 'failed']]);
});

test('a command handler gets each event as JSON on stdin, and the command does not wait for it', () => {
  const dir = app({ events: ['run'], send: 'node handler.mjs' });
  writeFiles(dir, { 'handler.mjs': "import * as fs from 'node:fs';\nlet s = '';\nfor await (const c of process.stdin) s += c;\nfs.appendFileSync('got.jsonl', s);\n" });
  assert.equal(run(dir, 'sync').status, 0);
  assert.equal(run(dir, 'run', 'kit:probe').status, 0);
  const got = JSON.parse(waitFor(path.join(dir, 'got.jsonl')).trim());
  assert.equal(got.type, 'run');
  assert.equal(got.unit, 'kit:scripts/probe');

  // A failing handler fails nothing: the problem goes into a per-machine log.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: { events: ['run'], send: 'exit 7' } }) });
  run(dir, 'sync');
  const ran = run(dir, 'run', 'kit:probe');
  assert.equal(ran.status, 0);
  assert.equal(ran.stderr, '');
  assert.match(waitFor(path.join(dir, 'node_modules/.harnesspm/telemetry.log')), /handler `exit 7` exited with 7/);
});

test('one hand-off with several events runs the command once for each, in one process', () => {
  const dir = project();
  writeFiles(dir, { 'handler.mjs': "import * as fs from 'node:fs';\nlet s = '';\nfor await (const c of process.stdin) s += c;\nfs.appendFileSync('got.jsonl', s);\n" });
  const deliver = path.join(import.meta.dirname, '..', 'src', 'deliver.ts');
  const lines = [JSON.stringify({ type: 'read', unit: 'kit:rules/a' }), JSON.stringify({ type: 'read', unit: 'kit:rules/b' })];
  const result = spawnSync(process.execPath, [deliver], { cwd: dir, env: { ...process.env, HARNESSPM_EVENT: lines.join('\n'), HARNESSPM_HANDLER: 'node handler.mjs' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(read(dir, 'got.jsonl').trim().split('\n'), lines);
});

test('a handler that exits without reading the event is logged with its exit code, not EPIPE', () => {
  // An event larger than a pipe buffer makes the race certain: the shell exits before the event is written.
  const dir = project();
  fs.mkdirSync(path.join(dir, 'node_modules', '.harnesspm'), { recursive: true });
  const deliver = path.join(import.meta.dirname, '..', 'src', 'deliver.ts');
  const result = spawnSync(process.execPath, [deliver], { cwd: dir, env: { ...process.env, HARNESSPM_EVENT: 'x'.repeat(90_000), HARNESSPM_HANDLER: 'exit 7' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const log = read(dir, 'node_modules/.harnesspm/telemetry.log');
  assert.match(log, /handler `exit 7` exited with 7/);
  assert.doesNotMatch(log, /EPIPE/);
});

test('events are off by default, with DO_NOT_TRACK=1, and with a local or user opt-out', () => {
  const none = app();
  run(none, 'sync');
  run(none, 'run', 'kit:probe');
  assert.ok(!fs.existsSync(path.join(none, EVENTS)), 'no telemetry without a config');

  const dir = app({ send: { file: EVENTS } });
  assert.equal(runWith(dir, { DO_NOT_TRACK: '1' }, 'sync').status, 0);
  runWith(dir, { DO_NOT_TRACK: '1' }, 'run', 'kit:probe');
  assert.deepEqual(events(dir), []);
  assert.equal(settings(dir).hooks, undefined, 'no agent hooks on a machine that opted out');
  assert.match(runWith(dir, { DO_NOT_TRACK: '1' }, 'status').stdout, /📡 telemetry +off on this machine: DO_NOT_TRACK is set/);

  writeFiles(dir, { 'harnesspm.local.json': JSON.stringify({ telemetry: false }) });
  run(dir, 'sync');
  run(dir, 'run', 'kit:probe');
  assert.deepEqual(events(dir), []);
  assert.match(run(dir, 'status').stdout, /off on this machine: "telemetry": false in harnesspm\.local\.json/);
  assert.ok(read(dir, '.git/info/exclude').includes('/harnesspm.local.json\n'), 'the opt-out file stays out of git');

  fs.rmSync(path.join(dir, 'harnesspm.local.json'));
  writeFiles(homeOf(dir), { '.harnesspm/config.json': JSON.stringify({ telemetry: false }) });
  run(dir, 'run', 'kit:probe');
  assert.deepEqual(events(dir), []);
  fs.rmSync(path.join(homeOf(dir), '.harnesspm/config.json'));
  run(dir, 'run', 'kit:probe');
  assert.deepEqual(events(dir).map((e) => e.type), ['run'], 'events flow again without the opt-out');
});

test('a handler that a person has not recorded is held; a model run does not record it', () => {
  const dir = app({ events: ['run'], send: { file: EVENTS } });
  run(dir, 'sync');
  const handler = { events: ['run'], send: 'node steal.mjs' };
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: handler }), 'steal.mjs': "import * as fs from 'node:fs';\nfs.writeFileSync('stolen', '1');\n" });

  const model = runWith(dir, MODEL, 'sync');
  assert.equal(model.status, 0, model.stderr);
  assert.match(model.stdout, /entr(?:y|ies) that an agent cannot grant \(.*telemetry handler: command `node steal\.mjs`/);
  assert.deepEqual(json(path.join(dir, 'harnesspm.lock.json')).telemetry, { send: { file: EVENTS } }, 'the lock keeps what a person recorded');
  run(dir, 'run', 'kit:probe');
  assert.match(run(dir, 'status').stdout, /📡 telemetry +held: the handler in harnesspm\.json is not the one a person's sync recorded/);
  assert.deepEqual(events(dir), [], 'the old file handler gets nothing either');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  assert.ok(!fs.existsSync(path.join(dir, 'stolen')), 'the held command never ran');
  assert.equal(run(dir, 'sync', '--check').status, 1, 'CI sees the lock is out of date');

  assert.equal(run(dir, 'sync').status, 0);
  assert.deepEqual(json(path.join(dir, 'harnesspm.lock.json')).telemetry, { send: 'node steal.mjs' });
  assert.equal(run(dir, 'sync', '--check').status, 0);

  // Removing telemetry needs no person.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true } }) });
  runWith(dir, MODEL, 'sync');
  assert.equal(json(path.join(dir, 'harnesspm.lock.json')).telemetry, undefined);
});

test('agent events: a person sync writes fast, async hooks; a model run holds them', () => {
  const dir = app({ send: { file: EVENTS } });
  const bin = `node ${installCli(dir)}`;

  const model = runWith(dir, MODEL, 'sync');
  assert.match(model.stdout, /entr(?:y|ies) that an agent cannot grant \(.*telemetry handler/);
  assert.equal(settings(dir).hooks, undefined);

  assert.equal(run(dir, 'sync').status, 0);
  const hooks = settings(dir).hooks;
  const handler = { type: 'command', command: `${bin} track --agent claude`, timeout: 10, async: true };
  assert.deepEqual(hooks.PostToolUse, [{ matcher: 'Read|Skill', hooks: [handler] }]);
  assert.deepEqual(hooks.InstructionsLoaded, [{ matcher: 'path_glob_match|nested_traversal|include', hooks: [handler] }]);
  assert.deepEqual(hooks.SessionStart, [{ hooks: [handler] }]);
  assert.deepEqual(json(path.join(dir, '.codex/hooks.json')).hooks, { SessionStart: [{ hooks: [{ ...handler, command: `${bin} track --agent codex` }] }] });
  assert.ok(fs.existsSync(path.join(dir, 'node_modules/.harnesspm/telemetry.json')));

  // Without agent events: no hooks and no index.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: { events: ['run', 'skill'], send: { file: EVENTS } } }) });
  run(dir, 'sync');
  assert.deepEqual(Object.keys(settings(dir).hooks), ['PostToolUse']);
  assert.equal(settings(dir).hooks.PostToolUse[0].matcher, 'Skill');
  assert.ok(!fs.existsSync(path.join(dir, '.codex/hooks.json')));
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: { events: ['run'], send: { file: EVENTS } } }) });
  run(dir, 'sync');
  assert.equal(settings(dir).hooks, undefined);
  assert.ok(!fs.existsSync(path.join(dir, 'node_modules/.harnesspm/telemetry.json')));
});

test('the hook maps Claude Code payloads to units, sends no contents, and exits 0 at once', () => {
  const dir = app({ send: { file: EVENTS } });
  assert.equal(run(dir, 'sync').status, 0);
  const root = fs.realpathSync(dir);
  const stable = path.join(root, 'node_modules/.harnesspm/pkgs/@acme/kit');
  const base = { session_id: 'sess-9', transcript_path: '/tmp/t.jsonl', cwd: root, permission_mode: 'acceptEdits' };
  const readOf = (file: string) => ({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: file }, tool_response: { type: 'text', file: { filePath: file, content: SECRET } }, tool_use_id: 'toolu_1' });
  const payloads: [Record<string, unknown>, Record<string, unknown> | undefined][] = [
    [readOf(path.join(stable, 'docs/guides/forms.md')), { type: 'read', unit: 'kit:docs', page: 'guides/forms.md', via: 'tool' }],
    [readOf(path.join(root, '.harnesspm/docs/kit/llms.txt')), { type: 'read', unit: 'kit:docs', page: 'llms.txt', via: 'tool' }],
    [readOf(path.join(root, '.harnesspm/docs/kit/guides/forms.md')), { type: 'read', unit: 'kit:docs', page: 'guides/forms.md', via: 'tool' }],
    [readOf(path.join(stable, 'harness/dev.harnesspm/rules/usage.md')), { type: 'read', unit: 'kit:rules/usage', via: 'tool' }],
    [readOf(path.join(root, 'node_modules/@acme/kit/harness/dev.harnesspm/rules/usage.md')), { type: 'read', unit: 'kit:rules/usage', via: 'tool' }],
    [readOf(path.join(root, '.claude/skills/kit-review/SKILL.md')), { type: 'read', unit: 'kit:skills/kit-review', via: 'tool' }],
    [{ ...base, hook_event_name: 'InstructionsLoaded', file_path: path.join(root, '.claude/rules/harnesspm/kit/forms.md'), load_reason: 'path_glob_match' }, { type: 'read', unit: 'kit:rules/forms', via: 'auto' }],
    [{ ...base, hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'kit-review', args: SECRET }, tool_response: { success: true } }, { type: 'skill', unit: 'kit:skills/kit-review' }],
    [{ ...base, hook_event_name: 'SessionStart', source: 'startup' }, { type: 'session', source: 'startup' }],
    [readOf(path.join(root, 'package.json')), undefined],
    [{ ...base, hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'unknown-skill' } }, undefined],
  ];
  for (const [payload, expected] of payloads) {
    const before = events(dir).length;
    const started = Date.now();
    const result = runInput(dir, { AI_AGENT: 'claude-code_2-1-323_harness', CLAUDECODE: '1' }, JSON.stringify(payload), 'track', '--agent', 'claude');
    assert.equal(result.status, 0);
    assert.equal(result.stdout + result.stderr, '', 'the hook prints nothing');
    assert.ok(Date.now() - started < 2000, 'the hook returns at once');
    const added = events(dir).slice(before);
    if (expected === undefined) {
      assert.deepEqual(added, [], JSON.stringify(payload));
      continue;
    }
    assert.equal(added.length, 1, JSON.stringify(payload));
    const { schema, time, harnesspm, ...event } = added[0]!;
    assert.equal(schema, 'harnesspm.event/1');
    assert.deepEqual(event, {
      type: expected['type'],
      project: 'app',
      workspace: '.',
      caller: 'agent',
      agent: 'claude',
      session: 'sess-9',
      ...(expected['type'] !== 'session' ? { package: '@acme/kit', version: '2.1.0' } : {}),
      ...expected,
    });
  }
  assert.ok(!read(dir, EVENTS).includes(SECRET), 'no file contents or skill arguments in events');
  assert.ok(!read(dir, EVENTS).includes(root), 'no absolute paths in events');

  // Bad input never fails the agent.
  for (const input of ['', 'not json', '[]']) assert.equal(runInput(dir, {}, input, 'track', '--agent', 'claude').status, 0);
});

test("a workspace block that Claude Code loads sends a read event for each always-on rule in it", () => {
  const dir = project({}, { name: 'mono', private: true, workspaces: ['packages/*'] });
  writeFiles(dir, {
    'packages/web/package.json': JSON.stringify({ name: '@acme/web', dependencies: { '@acme/kit': '2' } }),
    'packages/api/package.json': JSON.stringify({ name: '@acme/api' }),
    'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: { send: { file: EVENTS } } }),
  });
  kit(dir);
  assert.equal(run(dir, 'sync').status, 0);
  const root = fs.realpathSync(dir);
  const web = path.join(root, 'packages/web');
  const base = { session_id: 'sess-2', cwd: root };
  const loaded = (file: string, reason: string, parent?: string) => ({ ...base, hook_event_name: 'InstructionsLoaded', file_path: file, load_reason: reason, ...(parent ? { parent_file_path: parent } : {}) });
  const track = (payload: Record<string, unknown>): Record<string, any>[] => {
    const before = events(dir).length;
    assert.equal(runInput(dir, { AI_AGENT: 'claude-code_2-1-326_harness', CLAUDECODE: '1' }, JSON.stringify(payload), 'track', '--agent', 'claude').status, 0);
    return events(dir).slice(before).map(({ schema, time, harnesspm, ...rest }) => rest);
  };

  // Claude Code loads the workspace's CLAUDE.md, then the AGENTS.md it imports: one event per always-on rule, not two.
  assert.deepEqual(track(loaded(path.join(web, 'CLAUDE.md'), 'nested_traversal')), []);
  assert.deepEqual(track(loaded(path.join(web, 'AGENTS.md'), 'include', path.join(web, 'CLAUDE.md'))), [
    { type: 'read', project: 'mono', workspace: '.', caller: 'agent', agent: 'claude', session: 'sess-2', unit: 'kit:rules/usage', package: '@acme/kit', version: '2.1.0', via: 'auto' },
  ]);
  // The file-scoped rule is only a pointer line in the block, and the root block is loaded in every session.
  assert.deepEqual(track(loaded(path.join(root, 'AGENTS.md'), 'include', path.join(root, 'CLAUDE.md'))), []);
  // A Read of the file, as the root's pointer asks, makes Claude Code load the folder's CLAUDE.md and its import, which
  // send the events above. The Read itself sends none, so each rule counts once.
  assert.deepEqual(track({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: path.join(web, 'AGENTS.md') } }), []);
});

test('events name the repository by its origin remote; a sync in CI sends no sync event', () => {
  const dir = app({ send: { file: EVENTS } });
  spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/app.git'], { cwd: dir });
  assert.equal(run(dir, 'sync').status, 0);
  assert.equal(events(dir).at(-1)!.repository, 'github.com/acme/app');
  assert.equal(JSON.parse(read(dir, 'node_modules/.harnesspm/telemetry.json')).repository, 'github.com/acme/app', 'hooks read it from the index');
  run(dir, 'run', 'kit:probe');
  assert.equal(events(dir).at(-1)!.repository, 'github.com/acme/app');
  runInput(dir, {}, JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: 's', cwd: fs.realpathSync(dir) }), 'track', '--agent', 'claude');
  assert.deepEqual([events(dir).at(-1)!.type, events(dir).at(-1)!.repository], ['session', 'github.com/acme/app']);

  // Every CI job runs an install, and so a sync: none of them sends a sync event.
  const before = events(dir).length;
  assert.equal(runWith(dir, { CI: 'true' }, 'sync').status, 0);
  assert.equal(events(dir).length, before);
  const ci = runWith(dir, { CI: 'true' }, 'run', 'kit:probe');
  assert.equal(ci.status, 0);
  assert.equal(events(dir).at(-1)!.caller, 'ci', 'other events from CI are still sent');
});

test("an agent's sync event names what it held back and why; events from a linked worktree say so", () => {
  const dir = app({ events: ['sync'], send: { file: EVENTS } });
  assert.equal(run(dir, 'sync').status, 0);
  const person = events(dir).at(-1)!;
  assert.equal(person.type, 'sync');
  assert.deepEqual([person.held, person.reason, person.worktree], [undefined, undefined, undefined]);

  // Agent events need hooks, which the agent's model cannot add (spec 6.2, rule 4).
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: { events: ['sync', 'session'], send: { file: EVENTS } } }) });
  const model = runWith(dir, MODEL, 'sync');
  assert.match(model.stdout, /entr(?:y|ies) that an agent cannot grant/);
  const held = events(dir).at(-1)!;
  assert.equal(held.caller, 'agent');
  assert.deepEqual(held.held, ['Claude Code hook: harnesspm track --agent claude', 'Codex hook: harnesspm track --agent codex']);
  assert.match(held.reason, /origin\/HEAD is not set/);

  // A session in a linked worktree, such as the desktop app's, runs the hooks of the main checkout with its own cwd.
  assert.equal(run(dir, 'sync').status, 0);
  const git = (...args: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(git('commit', '-q', '--allow-empty', '-m', 'init').status, 0);
  assert.equal(git('worktree', 'add', '-q', '-b', 'feature', '.claude/worktrees/feature').status, 0);
  writeFiles(dir, { 'vendor/lib/.git': 'gitdir: ../../.git/modules/lib\n' });
  const session = (cwd: string) => {
    runInput(dir, {}, JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: 's', cwd: fs.realpathSync(path.join(dir, cwd)) }), 'track', '--agent', 'claude');
    const event = events(dir).at(-1)!;
    assert.equal(event.type, 'session');
    return event.worktree;
  };
  assert.equal(session('.claude/worktrees/feature'), true);
  assert.equal(session('.'), undefined, 'the main checkout');
  assert.equal(session('vendor/lib'), undefined, 'a submodule');
});

test("a project's own tool reports its runs through @harnesspm/cli/telemetry, with the same switch and opt-outs", () => {
  const dir = app({ events: ['run'], send: { file: EVENTS } });
  assert.equal(run(dir, 'sync').status, 0);
  const api = pathToFileURL(path.join(import.meta.dirname, '..', 'src', 'telemetry-api.ts')).href;
  writeFiles(dir, {
    'scripts/probe.mjs': [
      `import { reportRun } from ${JSON.stringify(api)};`,
      `reportRun({ unit: 'kit:scripts/probe', fields: { mode: 'fast', unit: 'other', caller: 'person', outcome: 'ok', outside: false }, duration: 12.4, exit: 0 });`,
      `reportRun({ unit: 'kit:scripts/lint', exit: 1, answers: [1] });`,
      `reportRun({ unit: 'kit:scripts/lint', exit: 2, answers: [1] });`,
      `reportRun({ unit: 'kit:scripts/lint', exit: 1, fields: { outcome: 'ok' } });`,
      `reportRun({ unit: 'not a unit' });`,
      `console.log('done');`,
    ].join('\n'),
  });
  const tool = (env: Record<string, string> = {}) => runNode(path.join(dir, 'scripts'), env, undefined, path.join(dir, 'scripts/probe.mjs'));
  const first = tool();
  assert.deepEqual([first.status, first.stdout, first.stderr], [0, 'done\n', ''], 'it never prints or throws');
  const [event, answer, failed, own] = events(dir);
  const { schema, time, harnesspm, ...fields } = event!;
  assert.equal(schema, 'harnesspm.event/1');
  assert.deepEqual(fields, { type: 'run', project: 'app', workspace: '.', caller: 'person', unit: 'kit:scripts/probe', mode: 'fast', exit: 0, outcome: 'ok', duration: 12 }, 'its own fields never replace common ones');
  assert.deepEqual([answer!.exit, answer!.outcome], [1, 'answer']);
  assert.deepEqual([failed!.exit, failed!.outcome], [2, 'failed']);
  assert.deepEqual([own!.exit, own!.outcome], [1, 'failed'], 'a tool cannot set its own outcome');

  // Started from a folder outside the project, with the project's folder as cwd: the event says outside.
  const outsideTool = path.join(dir, 'scripts/outside.mjs');
  fs.writeFileSync(outsideTool, `import { reportRun } from ${JSON.stringify(api)};\nreportRun({ unit: 'kit:scripts/probe', cwd: ${JSON.stringify(dir)}, exit: 0 });\n`);
  const elsewhere = fs.mkdtempSync(path.join(path.dirname(dir), 'elsewhere-'));
  runNode(elsewhere, {}, undefined, outsideTool);
  assert.deepEqual([events(dir).at(-1)!.outside, events(dir).at(-1)!.workspace], [true, '.']);
  assert.equal(event!.outside, undefined, 'inside the project, no outside field');
  assert.match(read(dir, 'node_modules/.harnesspm/telemetry.log'), /reportRun: "not a unit" is not a unit ID/);

  tool(MODEL);
  assert.deepEqual([events(dir).at(-1)!.caller, events(dir).at(-1)!.agent], ['agent', 'claude']);
  const count = events(dir).length;
  tool({ DO_NOT_TRACK: '1' });
  assert.equal(events(dir).length, count, 'DO_NOT_TRACK stops it');
  // A handler that a person has not recorded is held for the tool too.
  writeFiles(dir, { 'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: { events: ['run'], send: { file: 'other.jsonl' } } }) });
  tool();
  assert.equal(events(dir).length, count);
  assert.deepEqual(events(dir, 'other.jsonl'), []);
});

test('package.json exports the telemetry entry and package.json, and nothing else', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  assert.deepEqual(pkg.exports, { './telemetry': { types: './dist/telemetry-api.d.ts', default: './dist/telemetry-api.js' }, './package.json': './package.json' });
  assert.ok(fs.existsSync(path.join(import.meta.dirname, '..', 'src', 'telemetry-api.ts')), 'the build writes dist/telemetry-api.js from it');
});
