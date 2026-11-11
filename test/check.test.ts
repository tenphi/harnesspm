import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLUGIN_SCHEMA, project, run, skill, writeFiles } from './helpers.ts';

function library(manifestExt: Record<string, unknown>, files: Record<string, string>, pkgExtra: Record<string, unknown> = {}): string {
  const dir = project({}, pkgExtra);
  writeFiles(dir, {
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'mylib', extensions: { 'dev.harnesspm': manifestExt } }),
    ...files,
  });
  return dir;
}

test('S1: a small harness is valid', () => {
  const dir = library({}, { 'harness/dev.harnesspm/rules/usage.md': '# Usage\n\nCall init() first.\n', 'harness/skills/mylib-setup/SKILL.md': skill('mylib-setup') }, { files: ['dist', 'harness'] });
  const result = run(dir, 'check');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /always-on text of mylib: 0\.0 KiB/);
  assert.match(result.stdout, /harness is valid/);
});

test('check reports the problems that would ship', () => {
  const dir = library(
    { extend: ['typo'], docs: '../docs' },
    {
      'harness/skills/setup/SKILL.md': skill('wrong-name'),
      'harness/dev.harnesspm/rules/usage.md': '# Usage\n\nSee [the guide](../../guide.md).\n',
      'harness/dev.harnesspm/rules/key.md': '# Key\n\nghp_abcdefghijklmnopqrstuvwxyz0123456789\n',
    },
    { files: ['dist'] },
  );
  const result = run(dir, 'check');
  assert.equal(result.status, 1);
  const text = result.stdout + result.stderr;
  assert.match(text, /unknown field "extend"/);
  assert.match(text, /"files" must include "harness"/);
  assert.match(text, /docs: \.\.\/docs does not exist/);
  assert.match(text, /"name" must be "setup", the folder name/);
  assert.match(text, /the link \.\.\/\.\.\/guide\.md points at a missing file/);
  assert.match(text, /looks like it contains a GitHub token/);
  assert.match(text, /skill "setup" should start with the plugin name/);
});
