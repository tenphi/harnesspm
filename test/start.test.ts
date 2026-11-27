// The bare command, where every task starts (spec 10.1), and `help` in and outside a project.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { installPackage, project, run, writeFiles } from './helpers.ts';

const VERSION = (JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version: string }).version;
const FOOTER = 'A person decides what runs: they add a harness and trust a package. An agent asks first.\nEvery command: npx -y @harnesspm/cli --help · Docs: https://harnesspm.tenphi.me\n';

/** The task lines of a start text: each one's description and command. */
const tasks = (text: string): [string, string][] =>
  text
    .split('\n')
    .filter((line) => /^ {2}\S.* {3,}npx -y /.test(line))
    .map((line) => {
      const [what, command] = line.trim().split(/ {3,}/);
      return [what!, command!];
    });

test('bare, in a package that does not use harnesspm: what ships a harness, and the tasks with setup first', () => {
  const dir = project({ '@acme/ui': '1' }, {}, false);
  installPackage(dir, '@acme/ui', { plugin: 'acme-ui', ext: { extends: ['@acme/colors'] }, harness: { 'dev.harnesspm/rules/usage.md': '# UI\n\nUse it.\n' } });
  installPackage(dir, '@acme/colors', { plugin: 'acme-colors', harness: { 'dev.harnesspm/rules/usage.md': '# Colors\n\nTokens.\n' } });
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    `harnesspm ${VERSION}: rules, docs, skills and tools from npm packages, for Claude Code and Codex.
This folder (${path.basename(dir)}) does not use harnesspm. 2 dependencies ship a harness: @acme/ui, @acme/colors.

Pick the task, run its command, and follow what it prints:
  Give this project's agents its dependencies' harness   npx -y @harnesspm/cli init
  Share a harness from this package                      npx -y @harnesspm/cli new rule usage
  Add your own or your team's harness, on every repo     npx -y @harnesspm/cli add <github:owner/repo | folder>
  Start a harness of your own, in an empty folder        npx -y @harnesspm/cli new rule workflow

${FOOTER}`,
  );
  assert.ok(result.stdout.trimEnd().split('\n').length <= 12, 'at most 12 lines');
  // It writes nothing.
  assert.deepEqual(fs.readdirSync(dir).sort(), ['.git', 'node_modules', 'package.json']);
});

test('bare, by folder: a library that shares a harness, a harness of your own, an empty folder, a parent folder', () => {
  // A library with harness/: check it first, then see it as users will.
  const lib = project({}, { name: '@acme/widgets' }, false);
  writeFiles(lib, { 'harness/plugin.json': JSON.stringify({ name: 'widgets' }) });
  const library = run(lib).stdout;
  assert.match(library, /\nThis package \(\S+\) shares a harness and does not use harnesspm itself\.\n/);
  assert.deepEqual(tasks(library).map(([, command]) => command), ['npx -y @harnesspm/cli check', 'npx -y @harnesspm/cli init', 'npx -y @harnesspm/cli new <kind> <name>', 'npx -y @harnesspm/cli add <github:owner/repo | folder>']);

  // No package.json, with harness/: a harness of one's own, which a person adds.
  const own = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-own-'));
  spawnSync('git', ['init', '-q'], { cwd: own });
  writeFiles(own, { 'harness/plugin.json': JSON.stringify({ name: 'alex' }) });
  const mine = run(own).stdout;
  assert.match(mine, /\nThis folder \(\S+\) is a harness, not a project: it has no package\.json\.\n/);
  assert.deepEqual(tasks(mine)[0], ['Check it', 'npx -y @harnesspm/cli check']);
  assert.match(tasks(mine)[2]![0], /a person does this/);

  // No package.json and no harness: a harness of your own comes first.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-empty-'));
  const start = run(empty).stdout;
  assert.match(start, /\nThis folder \(\S+\) is not a project: it has no package\.json\.\n/);
  assert.deepEqual(tasks(start)[0], ['Start a harness of your own, in this folder', 'npx -y @harnesspm/cli new rule workflow']);
  assert.ok(start.endsWith(FOOTER));

  // A folder above projects: it names them and the sync that gives sessions there their hooks.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-parent-'));
  for (const name of ['app', 'site']) {
    writeFiles(path.join(parent, name), { 'package.json': '{"name":"x"}\n', 'harnesspm.json': '{}\n' });
    spawnSync('git', ['init', '-q'], { cwd: path.join(parent, name) });
  }
  const above = run(parent).stdout;
  assert.match(above, /\nThis folder is above 2 projects that use harnesspm: app, site\.\n/);
  assert.deepEqual(tasks(above).slice(0, 2), [
    ['Give sessions that start here their hooks', 'npx -y @harnesspm/cli sync'],
    ["List a project's packages from here", 'npx -y @harnesspm/cli -C app help'],
  ]);
  for (const text of [library, mine, start, above]) assert.ok(text.trimEnd().split('\n').length <= 12, text);
});

test('bare, in a project: the report that status and doctor print', () => {
  const dir = project({ '@acme/ui': '1' });
  installPackage(dir, '@acme/ui', { plugin: 'acme-ui', harness: { 'dev.harnesspm/rules/usage.md': '# UI\n\nUse it.\n' } });
  assert.equal(run(dir, 'sync').status, 0);
  const bare = run(dir);
  assert.equal(bare.status, 0, bare.stderr);
  assert.match(bare.stdout, /^📦 dependencies {2}@acme\/ui 1\.0\.0\n/);
  assert.match(bare.stdout, /\n✅ Ready\. Nothing to fix\.\n$/);
  assert.equal(run(dir, 'status').stdout, bare.stdout);
  assert.equal(run(dir, 'doctor').stdout, bare.stdout);
  // From a subfolder too.
  fs.mkdirSync(path.join(dir, 'src'));
  assert.equal(run(path.join(dir, 'src')).stdout, bare.stdout);
});

test('help: in a project, its packages first; outside one, and with --help, every command', () => {
  const dir = project({ '@acme/ui': '1' });
  installPackage(dir, '@acme/ui', { plugin: 'acme-ui', harness: { 'dev.harnesspm/rules/usage.md': '# UI\n\nUse it.\n' } });
  assert.equal(run(dir, 'sync').status, 0);
  const inside = run(dir, 'help').stdout;
  assert.match(inside, /^This project: app\n\n- @acme\/ui — UI\. 1 rule: `npx -y @harnesspm\/cli help @acme\/ui`\n/);
  assert.match(inside, /\nEvery command: `npx -y @harnesspm\/cli --help`\.\n$/);
  assert.doesNotMatch(inside, /^Projects$/m);

  const commands = run(dir, '--help').stdout;
  assert.match(commands, /^harnesspm — the harness package manager\n/);
  assert.match(commands, /\n {2}harnesspm status {15}the project's report: packages, checks, and what waits for a person\n/);
  assert.doesNotMatch(commands, /This project/, '--help is the command list only');

  const outside = project({}, {}, false);
  assert.equal(run(outside, 'help').stdout, commands);
  assert.match(run(outside, 'nope').stderr, /Unknown command "nope"\. Every command: `npx -y @harnesspm\/cli --help`\./);
});
