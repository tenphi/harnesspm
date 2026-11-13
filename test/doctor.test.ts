import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { installPackage, PLUGIN_SCHEMA, project, run, writeFiles } from './helpers.ts';

const git = (dir: string, ...args: string[]): void => {
  const result = spawnSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=dev', ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};

/** A synced project that depends on a package with one rule. */
function app(): string {
  const dir = project({ '@acme/kit': '1' });
  installPackage(dir, '@acme/kit', { plugin: 'kit', harness: { 'dev.harnesspm/rules/forms.md': '# Forms\n\nUse the Form component.\n' } });
  assert.equal(run(dir, 'sync').status, 0);
  return dir;
}

test('doctor: a synced project is ready', () => {
  const dir = app();
  const result = run(dir, 'doctor');
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /🔒 Local files\n {2}✅ \d+ per-machine files?: ignored by git and not tracked/);
  assert.match(result.stdout, /✅ \d+ per-machine outputs? in place/);
  assert.match(result.stdout, /✅ \.git\/info\/exclude can be written/);
  assert.match(result.stdout, /✅ Committed outputs are up to date/);
  assert.match(result.stdout, /✅ Ready\. Nothing to fix\./);
});

test('doctor: a tracked per-machine file fails, with the command that untracks it', () => {
  const dir = app();
  writeFiles(dir, { 'CLAUDE.local.md': '# My notes\n' });
  git(dir, 'add', 'CLAUDE.local.md');
  git(dir, 'commit', '-q', '-m', 'notes');
  const result = run(dir, 'doctor');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /❌ CLAUDE\.local\.md is tracked by git, so a commit can include this machine's files, and harnesspm writes no added harnesses into it\. Run `git rm --cached CLAUDE\.local\.md` and commit\./);
  assert.match(result.stdout, /❌ 1 problem\./);
});

test('doctor: a hand-made harnesspm.local.json fails until sync lists it, and status points to doctor', () => {
  const dir = app();
  writeFiles(dir, { 'harnesspm.local.json': '{ "telemetry": false }\n' });
  const before = run(dir, 'doctor');
  assert.equal(before.status, 1);
  assert.match(before.stdout, /❌ harnesspm\.local\.json is not ignored by git, so `git add` can pick it up\. Run `npx harnesspm sync`, which lists it in \.git\/info\/exclude\./);
  assert.match(run(dir, 'status').stdout, /🩺 local files {3}1 problem\. Run `npx harnesspm doctor`\./);

  assert.equal(run(dir, 'sync').status, 0);
  assert.equal(run(dir, 'doctor').status, 0);
  assert.doesNotMatch(run(dir, 'status').stdout, /🩺/);
});

test('doctor: a per-machine file that harnesspm does not write goes into .gitignore', () => {
  const dir = app();
  writeFiles(dir, { '.claude/settings.local.json': '{}\n' });
  const before = run(dir, 'doctor');
  assert.equal(before.status, 1);
  assert.match(before.stdout, /❌ \.claude\/settings\.local\.json is not ignored by git, so `git add` can pick it up\. Add `\/\.claude\/settings\.local\.json` to \.gitignore, or to \.git\/info\/exclude for this clone only\./);
  writeFiles(dir, { '.gitignore': '.claude/settings.local.json\n' });
  assert.equal(run(dir, 'doctor').status, 0);
});

test('doctor: a .gitignore pattern that brings back an excluded file is named', () => {
  const dir = app();
  writeFiles(dir, { '.gitignore': '!/node_modules/.harnesspm/\n' });
  const result = run(dir, 'doctor');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /❌ node_modules\/\.harnesspm is not ignored by git, so `git add` can pick it up\. It is in \.git\/info\/exclude, but a `!` pattern in a \.gitignore file brings it back\. Remove that pattern\./);
});

test('doctor: committed outputs that are out of date fail', () => {
  const dir = app();
  fs.appendFileSync(path.join(dir, 'harnesspm.lock.json'), '\n');
  const result = run(dir, 'doctor');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /❌ harnesspm\.lock\.json is out of date\. Run `npx harnesspm sync` and commit the result\./);
});

test('doctor: an added harness that is not on this machine fails', () => {
  const dir = app();
  const own = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-alex-'));
  writeFiles(own, { 'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'alex' }), 'harness/dev.harnesspm/rules/style.md': '# Style\n\nShort commits.\n' });
  assert.equal(run(dir, 'add', own, '--no-hook').status, 0);
  assert.match(run(dir, 'doctor').stdout, /✅ Added: alex \(/);
  fs.rmSync(own, { recursive: true, force: true });
  const result = run(dir, 'doctor');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /❌ .*harnesspm-alex-.* is not on this machine yet\./);
});

test('doctor: outside a git repository it warns and does not fail', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-nogit-'));
  writeFiles(dir, { 'package.json': '{ "name": "app", "version": "1.0.0" }\n', 'harnesspm.json': '{}\n' });
  assert.equal(run(dir, 'sync').status, 0);
  const result = run(dir, 'doctor');
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /⚠️ {2}Not a git repository: nothing keeps per-machine files out of commits/);
});

test('doctor: an untrusted package is a warning that says the fix once', () => {
  const dir = project({ '@acme/kit': '1' });
  installPackage(dir, '@acme/kit', {
    plugin: 'kit',
    ext: { scripts: { probe: { file: './dev.harnesspm/scripts/probe.mjs', description: 'Probe' } } },
    harness: { 'dev.harnesspm/scripts/probe.mjs': "console.log('ok');\n" },
  });
  assert.equal(run(dir, 'sync').status, 0);
  const result = run(dir, 'doctor');
  assert.equal(result.status, 0, result.stdout);
  const line = result.stdout.split('\n').find((l) => l.includes('@acme/kit'));
  assert.equal(line, '  ⚠️  Off: @acme/kit: 1 script (not trusted; add it to "trust" in harnesspm.json)');
});
