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

test('files may list entries inside the docs folder, to leave some of it out', () => {
  const dir = library(
    { docs: '../docs' },
    { 'harness/dev.harnesspm/rules/usage.md': '# Usage\n\nText.\n', 'docs/components/button.md': '# Button\n', 'docs/rules/internal.md': '# Internal\n' },
    { files: ['harness', 'docs/components', 'docs/*.md'] },
  );
  const ok = run(dir, 'check');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  writeFiles(dir, { 'package.json': JSON.stringify({ name: 'mylib', version: '1.0.0', files: ['harness', 'dist'] }) });
  assert.match(run(dir, 'check').stdout, /"files" must include the docs folder "docs", or entries inside it/);
});

test('check reports a docs page with invalid frontmatter, unless the package has its own llms.txt', () => {
  const dir = library(
    { docs: '../docs' },
    // An unquoted colon in a value is not valid YAML.
    { 'harness/dev.harnesspm/rules/usage.md': '# Usage\n\nText.\n', 'docs/button.md': '---\ndescription: The Button component: types and sizes\n---\n\n# Button\n' },
    { files: ['harness', 'docs'] },
  );
  const result = run(dir, 'check');
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Invalid frontmatter in docs\/button\.md/);
  // With its own index, harnesspm never reads the pages.
  writeFiles(dir, { 'docs/llms.txt': '# Docs\n\n- [Button](button.md)\n' });
  const own = run(dir, 'check');
  assert.equal(own.status, 0, own.stdout + own.stderr);
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

test('check judges docs by what npm packs: built pages git ignores, links to files that do not ship, and .mdx pages', () => {
  const dir = library(
    { docs: '../docs' },
    {
      'harness/dev.harnesspm/rules/usage.md': '# Usage\n\nText.\n',
      // Built at prepack, so git ignores it, but `files` ships it.
      '.gitignore': 'docs/*.md\n',
      'docs/built.md': '# Built\n\nSee [nothing](./nope.md).\n',
      // Tracked, but it does not ship, so its links are not the package's.
      'docs/rules/internal.md': '# Internal\n\nSee [code](../../src/x.ts).\n',
      'src/x.ts': 'export {};\n',
    },
    { files: ['harness', 'docs/*.md', 'docs/*.mdx'] },
  );
  const built = run(dir, 'check');
  assert.equal(built.status, 1);
  assert.match(built.stdout + built.stderr, /docs\/built\.md: the link \.\/nope\.md points at a missing file/);
  assert.doesNotMatch(built.stdout + built.stderr, /internal\.md/);

  writeFiles(dir, { 'docs/built.md': '# Built\n\nSee [code](../src/x.ts).\n' });
  assert.match(run(dir, 'check').stdout, /docs\/built\.md: the link \.\.\/src\/x\.ts points at a file the package does not ship/);

  writeFiles(dir, { 'docs/built.md': '# Built\n\nText.\n', 'docs/page.mdx': '---\ntitle: Page\n---\n\nSee [gone](./gone.md).\n' });
  assert.match(run(dir, 'check').stdout, /docs\/page\.mdx: the link \.\/gone\.md points at a missing file/);

  writeFiles(dir, { 'docs/page.mdx': '---\ntitle: Page\n---\n\nSee [built](./built.md).\n' });
  const ok = run(dir, 'check');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

test('a private key needs a body: a PEM header alone, as in a placeholder, is no secret', () => {
  const placeholder = library({}, { 'harness/dev.harnesspm/rules/keys.md': '# Keys\n\n```\n-----BEGIN PRIVATE KEY-----\n```\n' }, { files: ['harness'] });
  const quiet = run(placeholder, 'check');
  assert.doesNotMatch(quiet.stdout + quiet.stderr, /private key/);
  const key = library(
    {},
    { 'harness/dev.harnesspm/rules/keys.md': `# Keys\n\n-----BEGIN PRIVATE KEY-----\n${'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC'.repeat(2)}\n-----END PRIVATE KEY-----\n` },
    { files: ['harness'] },
  );
  const loud = run(key, 'check');
  assert.match(loud.stdout + loud.stderr, /keys\.md looks like it contains a private key/);
});

test('check reads files as npm does: globs across folders, and ! entries that leave a file out', () => {
  const dir = library(
    { docs: '../docs' },
    {
      'harness/dev.harnesspm/rules/usage.md': '# Usage\n\nSee [the guide](../../../docs/guides/deep/guide.md) and [the license](../../../LICENSE).\n',
      'docs/guides/deep/guide.md': '# Guide\n\nSee [the draft](../../draft.md).\n',
      'docs/draft.md': '# Draft\n',
      LICENSE: 'MIT\n',
    },
    { files: ['harness', 'docs/**/*.md', '!docs/draft.md'] },
  );
  const result = run(dir, 'check');
  assert.equal(result.status, 1);
  const text = result.stdout + result.stderr;
  assert.match(text, /guide\.md: the link \.\.\/\.\.\/draft\.md points at a file the package does not ship/);
  // npm always packs the license, and the glob reaches the nested guide.
  assert.doesNotMatch(text, /usage\.md/);
});
