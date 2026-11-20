// An agent in another folder, such as a repository that cloned the project: -C, help, and tools without an install (spec 10.1).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { homeOf, installPackage, PLUGIN_SCHEMA, read, run, runWith, skill, writeFiles } from './helpers.ts';

const MODEL = { AI_AGENT: 'claude-code_2-1-323_agent', CLAUDECODE: '1' };
const EVENTS = '.harnesspm/events.jsonl';
const COMMANDS = [
  '- Every package of this harness: `npx -y @tenphi/harnesspm help`. A package\'s rules and tools in full: `npx -y @tenphi/harnesspm help <package>`.',
  '- Run a tool: `npx -y @tenphi/harnesspm run <tool> [args]`. Its options: `npx -y @tenphi/harnesspm help <tool>`.',
  '- From outside this folder, add `-C <path to this folder>` before `help` or `run`.',
].join('\n');

const WHERE = 'console.log(JSON.stringify({ cwd: process.cwd(), project: process.env.HARNESSPM_PROJECT_DIR, args: process.argv.slice(2) }));\n';
// A script that imports a package its own dependencies would bring: a fetched copy has none.
const NEEDS = "import 'acme-missing-dependency';\nconsole.log('never');\n";

function kitFiles(): Parameters<typeof installPackage>[2] {
  return {
    plugin: 'kit',
    version: '2.1.0',
    ext: {
      docs: '../docs',
      scripts: {
        where: { file: './dev.harnesspm/scripts/where.mjs', description: 'Print where it runs', usage: '<file>\nPrints the folder it runs in, the project and its arguments.', allow: true },
        needs: { file: './dev.harnesspm/scripts/needs.mjs', description: 'Needs a dependency', allow: true },
      },
    },
    harness: {
      'dev.harnesspm/scripts/where.mjs': WHERE,
      'dev.harnesspm/scripts/needs.mjs': NEEDS,
      'dev.harnesspm/rules/usage.md': '# Usage\n\nUse the kit.\n',
      'dev.harnesspm/rules/forms.md': '---\ndescription: Forms\npaths: ["**/*.tsx"]\n---\n\n# Forms\n\nUse Form.\n',
      'skills/kit-review/SKILL.md': skill('kit-review'),
      'mcp.json': JSON.stringify({ mcpServers: { docs: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/dev.harnesspm/scripts/where.mjs'] } } }),
    },
    files: { 'docs/button.md': '# Button\n\nA button.\n' },
  };
}

/** A session folder with a clone of the project in `work/app`, which trusts @acme/kit and writes events to a file. */
function session(): { root: string; app: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-session-')));
  homeOf(root);
  const app = path.join(root, 'work', 'app');
  writeFiles(app, {
    'package.json': `${JSON.stringify({ name: 'app', version: '1.0.0', devDependencies: { '@acme/kit': '2' } }, null, 2)}\n`,
    'harnesspm.json': JSON.stringify({ trust: { '@acme/kit': true }, telemetry: { send: { file: EVENTS } } }),
  });
  spawnSync('git', ['init', '-q'], { cwd: app });
  return { root, app };
}

const events = (dir: string): Record<string, any>[] => read(dir, EVENTS).trim().split('\n').map((line) => JSON.parse(line));

test('S18: -C runs the project\'s help and tools from the session folder, in the caller\'s folder, with the project\'s telemetry', () => {
  const { root, app } = session();
  installPackage(app, '@acme/kit', kitFiles());
  assert.equal(run(app, 'sync').status, 0);

  const help = run(root, '-C', 'work/app', 'help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^harnesspm — the harness package manager/);
  assert.match(help.stdout, /\nThis project: app \(work\/app\)\n/);
  // One line per package, with what it covers and the command that prints the rest.
  assert.match(help.stdout, /\n- @acme\/kit — Usage\. 2 rules, docs, 2 tools, 1 MCP server, 1 skill: `npx -y @tenphi\/harnesspm -C work\/app help @acme\/kit`\n/);
  assert.match(help.stdout, /A tool's options: `npx -y @tenphi\/harnesspm -C work\/app help <tool>`\. Run a tool: `npx -y @tenphi\/harnesspm -C work\/app run <tool> \[args\]`\./);

  // `help <package>`: everything the package contributes, with commands and paths from the caller's folder.
  const pkg = run(root, '-C', 'work/app', 'help', '@acme/kit');
  assert.equal(pkg.status, 0, pkg.stderr);
  assert.match(pkg.stdout, /^This project: app \(work\/app\)\n/);
  assert.match(pkg.stdout, /\n# @acme\/kit \(2\.1\.0\), plugin kit\n/);
  assert.match(pkg.stdout, /\n### Usage \(kit:rules\/usage\)\n\nAlways on\.\n\nUse the kit\.\n/);
  assert.match(pkg.stdout, /\n### Forms \(kit:rules\/forms\)\n\nWhen editing `\*\*\/\*\.tsx` — Forms\. File: work\/app\/\S+forms\.md\n\nUse Form\.\n/);
  assert.match(pkg.stdout, /## Docs\n\n- work\/app\/node_modules\/\.harnesspm\/docs\/kit\/llms\.txt \(kit:docs\)/);
  assert.match(pkg.stdout, /## Tools\n\n- `npx -y @tenphi\/harnesspm -C work\/app run kit:where \[args\]` — Print where it runs \(kit:scripts\/where\)/);
  assert.match(pkg.stdout, /## MCP servers\n\n- `npx -y @tenphi\/harnesspm -C work\/app mcp kit:docs` \(kit:mcp\/docs\)/);
  assert.match(pkg.stdout, /## Skills\n\n- kit-review: read work\/app\/\S+\/skills\/kit-review\/SKILL\.md \(kit:skills\/kit-review\)\n {2}Does kit-review\. Use when testing\./);
  // Paths start at the caller's folder, so the agent can read them from there.
  for (const [, file] of pkg.stdout.matchAll(/(?:read|File:|-) (work\/app\/[^\s)]+)/g)) assert.ok(fs.existsSync(path.join(root, file!)), `${file} exists`);
  assert.equal(run(root, '-C', 'work/app', 'help', 'kit').stdout, pkg.stdout, 'the plugin name works too');

  // `help <rule ID>` and `help <tool>`.
  const rule = run(root, '-C', 'work/app', 'help', 'kit:rules/forms').stdout;
  assert.match(rule, /\n# Forms \(kit:rules\/forms\)\n\nWhen editing `\*\*\/\*\.tsx` — Forms\. File: work\/app\/\S+forms\.md\n\nUse Form\.\n$/);
  const tool = run(root, '-C', 'work/app', 'help', 'kit:where').stdout;
  assert.match(tool, /\nkit:where \(kit:scripts\/where\), from @acme\/kit\n\nPrint where it runs\n\nUsage: <file>\n {7}Prints the folder it runs in, the project and its arguments\.\nRun: {3}npx -y @tenphi\/harnesspm -C work\/app run kit:where \[args\]\n$/);
  assert.equal(run(root, '-C', 'work/app', 'help', 'kit:scripts/where').stdout, tool, 'the tool ID works too');
  assert.match(run(root, '-C', 'work/app', 'help', 'kit:needs').stdout, /Usage: none declared\./);
  // `help` with a target is a telemetry event of the named project (spec 14.2).
  const helps = events(app).filter((e) => e.type === 'help');
  assert.deepEqual(helps.map((e) => [e['unit'], e['package'], e['version']]), [
    [undefined, '@acme/kit', '2.1.0'],
    [undefined, '@acme/kit', '2.1.0'],
    ['kit:rules/forms', '@acme/kit', '2.1.0'],
    ['kit:scripts/where', '@acme/kit', '2.1.0'],
    ['kit:scripts/where', '@acme/kit', '2.1.0'],
    ['kit:scripts/needs', '@acme/kit', '2.1.0'],
  ]);
  assert.ok(helps.every((e) => e['workspace'] === '.' && e['caller'] === 'person' && e['outside'] === true), 'help from outside the project says so');
  const nope = run(root, '-C', 'work/app', 'help', 'kit:nope');
  assert.equal(nope.status, 1);
  assert.match(nope.stderr, /No command, package, rule or tool "kit:nope"\. Packages: @acme\/kit\. `npx -y @tenphi\/harnesspm -C work\/app help` lists them\./);

  // Inside the project, the same commands without -C.
  const inside = run(app, 'help').stdout;
  assert.match(inside, /\nThis project: app\n/);
  assert.match(inside, /: `npx -y @tenphi\/harnesspm help @acme\/kit`/);
  const insidePkg = run(app, 'help', '@acme/kit').stdout;
  assert.equal(events(app).filter((e) => e.type === 'help').at(-1)!['outside'], undefined, 'help inside the project has no outside field');
  assert.match(insidePkg, /- `npx -y @tenphi\/harnesspm run kit:where \[args\]`/);
  assert.match(insidePkg, /File: node_modules\/\.harnesspm\/\S+forms\.md/);

  // The script runs in the caller's folder, so file arguments stay valid. HARNESSPM_PROJECT_DIR is the named project.
  const ran = run(root, '-C', 'work/app', 'run', 'kit:where', '--', 'notes.txt');
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(JSON.parse(ran.stdout), { cwd: root, project: app, args: ['notes.txt'] });
  const event = events(app).find((e) => e.type === 'run')!;
  assert.equal(event['unit'], 'kit:scripts/where');
  assert.equal(event['project'], 'app', "the run event goes to the named project's handler");
  assert.deepEqual([event['outside'], event['workspace'], event['outcome']], [true, '.', 'ok'], 'a run from outside: outside, and the root workspace');
  assert.ok(!fs.existsSync(path.join(root, EVENTS)));

  // Other commands take -C too.
  assert.match(run(root, '-C', 'work/app', 'why', 'kit:scripts/where').stdout, /run +npx -y @tenphi\/harnesspm -C work\/app run kit:where/);
  assert.deepEqual([events(app).at(-1)!.type, events(app).at(-1)!['outside']], ['why', true]);
  run(app, 'why', 'kit:scripts/where');
  run(app, 'run', 'kit:where');
  assert.deepEqual(events(app).slice(-2).map((e) => [e.type, e['outside']]), [['why', undefined], ['run', undefined]], 'inside the project, no outside field');
  assert.match(run(root, '-C', 'work/app', 'status').stdout, /📦 dependencies {2}@acme\/kit 2\.1\.0/);
  assert.equal(run(root, '-C', 'work/app', 'doctor').status, 0);
  const missing = run(root, '-C', 'work/nope', 'help');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /-C work\/nope: no such folder/);
  assert.match(run(root, '-C', 'work', 'help').stdout, /\nwork does not use harnesspm: it has no harnesspm\.json\.\n/);
});

test('S18: without an install, run says what is missing, and runs scripts from the fetched packages', () => {
  const { root, app } = session();
  const kit = installPackage(app, '@acme/kit', kitFiles());
  assert.equal(run(app, 'sync').status, 0);
  writeFiles(app, { 'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: {} }) });
  // A fresh clone: the lock, no node_modules.
  const copy = path.join(os.tmpdir(), `harnesspm-kit-${process.pid}-${Date.now()}`);
  fs.cpSync(kit, copy, { recursive: true });
  fs.rmSync(path.join(app, 'node_modules'), { recursive: true });

  for (const ref of ['kit:where', 'kit:nope']) {
    const ran = run(root, '-C', 'work/app', 'run', ref);
    assert.equal(ran.status, 1);
    assert.doesNotMatch(ran.stderr, /No script/);
    assert.match(ran.stderr, /work\/app has no install and no fetched harness packages, so its scripts are not available yet\. Run `npx -y @tenphi\/harnesspm -C work\/app fetch` to use the scripts that need nothing else, or install the project with `cd work\/app && npm ci`\./);
  }
  const inside = run(app, 'run', 'kit:where');
  assert.match(inside.stderr, /has no install and no fetched harness packages[^\n]*`npx -y @tenphi\/harnesspm fetch`[^\n]*`npm ci`\./);
  assert.doesNotMatch(inside.stderr, /No script/);

  // What `fetch` leaves: the package in the locked version, without its dependencies.
  fs.cpSync(copy, path.join(app, 'node_modules/.harnesspm/fetched/@acme/kit'), { recursive: true });
  const ran = run(root, '-C', 'work/app', 'run', 'kit:where', '--', 'x');
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(JSON.parse(ran.stdout).args, ['x']);
  assert.equal(events(app).filter((e) => e.type === 'run').length, 1);

  const needs = run(root, '-C', 'work/app', 'run', 'kit:needs');
  assert.notEqual(needs.status, 0);
  assert.match(needs.stderr, /ERR_MODULE_NOT_FOUND/, "Node's own error passes through");
  assert.match(needs.stderr, /harnesspm: kit:needs needs a package that the project installs, and this project has no install\. Install it with `cd work\/app && npm ci`, then run the script again\.\n$/);

  // Once the packages are there, a unit that does not exist is the real reason.
  assert.match(run(root, '-C', 'work/app', 'run', 'kit:nope').stderr, /No script kit:nope\. Scripts of kit: kit:where, kit:needs/);

  const help = run(root, '-C', 'work/app', 'help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /No install: tools run from the fetched harness packages\./);
  assert.match(help.stdout, /- @acme\/kit — Usage\. 2 rules, docs, 2 tools, 1 MCP server, 1 skill: `npx -y @tenphi\/harnesspm -C work\/app help @acme\/kit`/);
  const pkg = run(root, '-C', 'work/app', 'help', '@acme/kit').stdout;
  assert.match(pkg, /No install: tools run from the fetched harness packages\./);
  assert.match(pkg, /- `npx -y @tenphi\/harnesspm -C work\/app run kit:where \[args\]`/);
  assert.match(pkg, /Use the kit\./);
  assert.match(pkg, /read work\/app\/node_modules\/\.harnesspm\/fetched\/@acme\/kit\/harness\/skills\/kit-review\/SKILL\.md/);
  assert.match(run(root, '-C', 'work/app', 'help', 'kit:where').stdout, /Usage: <file>/, 'help <tool> never runs the script, so it needs no install');
});

function npm(cwd: string, home: string, ...args: string[]): string {
  const result = spawnSync('npm', [...args, '--no-audit', '--no-fund', '--silent'], { cwd, encoding: 'utf8', env: { ...process.env, HOME: home, npm_config_cache: path.join(home, '.npm') } });
  assert.equal(result.status, 0, `npm ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

test('S18: help fetches the harness packages first when the project has no install and nothing fetched', () => {
  const { root, app } = session();
  const home = homeOf(root);
  const source = path.join(root, 'kit-src');
  const files = kitFiles();
  writeFiles(source, {
    'package.json': JSON.stringify({ name: '@acme/kit', version: '2.1.0', files: ['harness', 'docs'] }),
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'kit', extensions: { 'dev.harnesspm': files.ext } }),
    ...Object.fromEntries(Object.entries(files.harness!).map(([k, v]) => [`harness/${k}`, v])),
    ...files.files,
  });
  const tarball = path.join(root, npm(source, home, 'pack', '--pack-destination', root));
  writeFiles(app, { 'package.json': JSON.stringify({ name: 'app', version: '1.0.0', devDependencies: { '@acme/kit': `file:${tarball}` } }) });
  npm(app, home, 'install', '--ignore-scripts');
  assert.equal(run(app, 'sync').status, 0);
  fs.rmSync(path.join(app, 'node_modules'), { recursive: true });

  const help = run(root, '-C', 'work/app', 'help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stderr, /work\/app has no install, so harnesspm fetches its harness packages first\. Fetching runs no package code\./);
  assert.match(help.stderr, /fetched 1 package \(@acme\/kit 2\.1\.0\)/);
  assert.match(help.stdout, /: `npx -y @tenphi\/harnesspm -C work\/app help @acme\/kit`/);
  assert.ok(fs.existsSync(path.join(app, 'node_modules/.harnesspm/fetched/@acme/kit/package.json')));
  const ran = run(root, '-C', 'work/app', 'run', 'kit:where');
  assert.equal(ran.status, 0, ran.stderr);
  assert.match(run(root, '-C', 'work/app', 'help').stderr, /^$/, 'the second help fetches nothing');
});

test('the block starts with the commands, one line per rule and tool, and status says when the block starts past line 30', () => {
  const { app } = session();
  installPackage(app, '@acme/kit', kitFiles());
  assert.equal(run(app, 'sync').status, 0);
  assert.ok(read(app, 'AGENTS.md').startsWith(`<!-- BEGIN:harnesspm`));
  const agents = read(app, 'AGENTS.md');
  assert.match(agents, new RegExp(`^<!-- BEGIN:harnesspm[^\\n]*-->\\n\\n${COMMANDS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\\n## @acme/kit\\n`));
  assert.match(agents, /\n## @acme\/kit\n\n- Always-on rule: Usage\. Read it with `help @acme\/kit` \(kit:rules\/usage\)\n- When editing `\*\*\/\*\.tsx`, read \S+forms\.md — Forms \(kit:rules\/forms\)\n- Docs: \S+ \(kit:docs\)\n- Tool: `kit:where` — Print where it runs \(kit:scripts\/where\)\n- Tool: `kit:needs` — Needs a dependency \(kit:scripts\/needs\)\n\n<!-- END/);
  assert.doesNotMatch(agents, /Use the kit\./, 'the rule text is not inlined');
  assert.doesNotMatch(run(app, 'status').stderr, /starts at line/);

  writeFiles(app, { 'AGENTS.md': `# App\n\n${Array.from({ length: 40 }, (_, i) => `Line ${i + 1}.`).join('\n')}\n` });
  assert.equal(run(app, 'sync').status, 0);
  const warning = /⚠️ {2}The harness block in AGENTS\.md starts at line 44\. Agents that read only the first 30 lines, such as with `head -30`, miss it\. Move the block to the top of its file, where sync keeps it\./;
  assert.match(run(app, 'status').stderr, warning);
  assert.match(run(app, 'doctor').stdout, /The harness block in AGENTS\.md starts at line 44/);
});

test('a model run keeps allow rules in the new command form where the earlier form was allowed', () => {
  const { app } = session();
  installPackage(app, '@acme/kit', kitFiles());
  assert.equal(run(app, 'sync').status, 0);
  // What an earlier harnesspm wrote: only `npx harnesspm run`.
  const earlier = (text: string): string => text.split('\n').filter((line) => !line.includes('@tenphi/harnesspm","run"') && !line.includes('npx -y @tenphi/harnesspm run')).join('\n');
  const stateFile = path.join(app, '.git/harnesspm/state.json');
  const state = JSON.parse(read(app, '.git/harnesspm/state.json'));
  state.exec.team.claude.allow = state.exec.team.claude.allow.filter((rule: string) => !rule.includes('@tenphi/harnesspm'));
  state.exec.team.codex.rules = state.exec.team.codex.rules.filter((rule: string) => !rule.includes('@tenphi/harnesspm'));
  fs.writeFileSync(stateFile, JSON.stringify(state));
  const settings = JSON.parse(read(app, '.claude/settings.local.json'));
  settings.permissions.allow = settings.permissions.allow.filter((rule: string) => !rule.includes('@tenphi/harnesspm'));
  writeFiles(app, { '.claude/settings.local.json': JSON.stringify(settings), '.codex/rules/harnesspm.rules': earlier(read(app, '.codex/rules/harnesspm.rules')) });

  const model = runWith(app, MODEL, 'sync');
  assert.equal(model.status, 0, model.stderr);
  assert.doesNotMatch(model.stdout, /held back/);
  const allow: string[] = JSON.parse(read(app, '.claude/settings.local.json')).permissions.allow;
  assert.ok(allow.includes('Bash(npx -y @tenphi/harnesspm run kit:where *)'));
  assert.ok(allow.includes('Bash(npx harnesspm run kit:where *)'));
  assert.match(read(app, '.codex/rules/harnesspm.rules'), /\["npx","-y","@tenphi\/harnesspm","run","kit:where"\]/);
});
