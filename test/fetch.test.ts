import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { homeOf, installPackage, PLUGIN_SCHEMA, project, read, run, writeFiles } from './helpers.ts';

function npm(cwd: string, home: string, ...args: string[]): string {
  const result = spawnSync('npm', [...args, '--no-audit', '--no-fund', '--silent'], { cwd, encoding: 'utf8', env: { ...process.env, HOME: home, npm_config_cache: path.join(home, '.npm') } });
  assert.equal(result.status, 0, `npm ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

test('S13: fetch downloads the locked packages and fills the paths that the committed block names', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-fetch-'));
  const home = path.join(work, 'home');
  writeFiles(path.join(work, 'tasty'), {
    'package.json': JSON.stringify({ name: '@tenphi/tasty', version: '3.17.1', files: ['harness', 'docs'] }),
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'tasty', extensions: { 'dev.harnesspm': { docs: '../docs' } } }),
    'harness/dev.harnesspm/rules/state-maps.md': '---\ndescription: State maps\npaths: ["**/*.tsx"]\n---\n\n# State maps\n\nOne map.\n',
    'docs/intro.md': '# Intro\n\nText.\n',
  });
  const tasty = path.join(work, npm(path.join(work, 'tasty'), home, 'pack', '--pack-destination', work));
  writeFiles(path.join(work, 'uikit'), {
    'package.json': JSON.stringify({ name: '@cube-dev/ui-kit', version: '0.206.1', files: ['harness'], dependencies: { '@tenphi/tasty': `file:${tasty}` } }),
    'harness/plugin.json': JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'uikit', extensions: { 'dev.harnesspm': { extends: ['@tenphi/tasty'] } } }),
    'harness/dev.harnesspm/rules/forms.md': '# Forms\n\nUse the controller.\n',
  });
  const uikit = path.join(work, npm(path.join(work, 'uikit'), home, 'pack', '--pack-destination', work));

  const dir = project({ '@cube-dev/ui-kit': `file:${uikit}` });
  npm(dir, homeOf(dir), 'install', '--ignore-scripts');
  assert.equal(run(dir, 'sync').status, 0);
  const lock = JSON.parse(read(dir, 'harnesspm.lock.json'));
  for (const name of ['@cube-dev/ui-kit', '@tenphi/tasty']) {
    assert.ok(lock.packages[name].resolved, `${name} has a tarball URL`);
    assert.match(lock.packages[name].integrity, /^sha512-/);
  }
  const agents = read(dir, 'AGENTS.md');

  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true });
  const fetched = run(dir, 'fetch');
  assert.equal(fetched.status, 0, fetched.stderr);
  assert.match(fetched.stdout, /fetched 2 packages \(@cube-dev\/ui-kit 0\.206\.1, @tenphi\/tasty 3\.17\.1\)/);
  assert.doesNotMatch(fetched.stderr, /does not match/);
  for (const [, file] of agents.matchAll(/(?:read|Docs:) (node_modules\/\S+)/g)) assert.ok(fs.existsSync(path.join(dir, file!)), `${file} exists`);
  assert.match(read(dir, 'node_modules/.harnesspm/docs/tasty/llms.txt'), /\[Intro\]/);
  assert.equal(read(dir, 'AGENTS.md'), agents, 'fetch changes no committed file');
  assert.ok(!fs.existsSync(path.join(dir, '.claude/settings.local.json')), 'and writes no agent settings');
  assert.match(run(dir, 'fetch').stdout, /fetched 0 packages, reused 2/, 'a second fetch reuses the downloads');

  // A lock without integrity, as harnesspm 0.3 wrote with pnpm: fetch reads the package manager's lockfile.
  const bare = JSON.parse(read(dir, 'harnesspm.lock.json'));
  for (const entry of Object.values(bare.packages) as Record<string, unknown>[]) delete entry['integrity'];
  writeFiles(dir, { 'harnesspm.lock.json': JSON.stringify(bare) });
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true });
  const fallback = run(dir, 'fetch');
  assert.equal(fallback.status, 0, fallback.stderr);
  assert.doesNotMatch(fallback.stderr, /not checked/, 'the integrity in package-lock.json checks the download');
  // With no integrity in any lock, fetch still downloads and says so for each package.
  const lockfile = read(dir, 'package-lock.json');
  fs.rmSync(path.join(dir, 'package-lock.json'));
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true });
  const unchecked = run(dir, 'fetch');
  assert.equal(unchecked.status, 0, unchecked.stderr);
  assert.match(unchecked.stderr, /⚠️ {2}@tenphi\/tasty 3\.17\.1: no integrity in harnesspm\.lock\.json or the package manager's lockfile, so the download is not checked/);
  assert.match(unchecked.stderr, /⚠️ {2}@cube-dev\/ui-kit 0\.206\.1: no integrity/);
  assert.match(unchecked.stdout, /fetched 2 packages/);
  writeFiles(dir, { 'package-lock.json': lockfile });

  const tampered = JSON.parse(read(dir, 'harnesspm.lock.json'));
  tampered.packages['@tenphi/tasty'].integrity = 'sha512-AAAA';
  writeFiles(dir, { 'harnesspm.lock.json': JSON.stringify(tampered) });
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true });
  const refused = run(dir, 'fetch');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /@tenphi\/tasty: the downloaded tarball does not match the integrity in the lock/);
});

test('the lock takes tarball URLs and integrity from pnpm-lock.yaml and from Yarn 1 yarn.lock', () => {
  const dir = project({ '@tenphi/glaze': '^3.1.0', '@tenphi/tasty': 'file:../tasty-3.17.1.tgz' });
  installPackage(dir, '@tenphi/glaze', { plugin: 'glaze', version: '3.1.0' });
  installPackage(dir, '@tenphi/tasty', { plugin: 'tasty', version: '3.17.1' });
  const packages = (): Record<string, { resolved?: string; integrity?: string }> => JSON.parse(read(dir, 'harnesspm.lock.json')).packages;

  // pnpm 9: one entry per version, a tarball only for packages outside the registry. The snapshots section has no resolution.
  writeFiles(dir, {
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      '',
      'importers:',
      '',
      '  .:',
      '    devDependencies:',
      "      '@tenphi/glaze':",
      '        specifier: ^3.1.0',
      '        version: 3.1.0',
      '',
      'packages:',
      '',
      "  '@tenphi/glaze-tools@3.1.0':",
      '    resolution: {integrity: sha512-TOOLS==}',
      '',
      "  '@tenphi/glaze@3.0.0':",
      '    resolution: {integrity: sha512-OLD==}',
      '',
      "  '@tenphi/glaze@3.1.0':",
      '    resolution: {integrity: sha512-GLAZE==}',
      "    engines: {node: '>=20'}",
      '',
      "  '@tenphi/tasty@file:../tasty-3.17.1.tgz':",
      '    resolution: {integrity: sha512-TASTY==, tarball: file:../tasty-3.17.1.tgz}',
      '    version: 3.17.1',
      '',
      'snapshots:',
      '',
      "  '@tenphi/glaze@3.1.0': {}",
      '',
    ].join('\n'),
  });
  assert.equal(run(dir, 'sync').status, 0);
  assert.deepEqual(packages()['@tenphi/glaze'], { version: '3.1.0', plugin: 'glaze', integrity: 'sha512-GLAZE==' });
  assert.deepEqual(packages()['@tenphi/tasty'], { version: '3.17.1', plugin: 'tasty', resolved: 'file:../tasty-3.17.1.tgz', integrity: 'sha512-TASTY==' });

  // pnpm 8 (lockfile 6.0) keys start with a slash and may carry peer suffixes.
  writeFiles(dir, { 'pnpm-lock.yaml': "lockfileVersion: '6.0'\n\npackages:\n\n  /@tenphi/glaze@3.1.0(react@18.3.1):\n    resolution: {integrity: sha512-SIX==}\n    dev: true\n" });
  run(dir, 'sync');
  assert.equal(packages()['@tenphi/glaze']!.integrity, 'sha512-SIX==');

  // Yarn 1: several ranges share one entry; the URL loses its #sha1 fragment.
  fs.rmSync(path.join(dir, 'pnpm-lock.yaml'));
  writeFiles(dir, {
    'yarn.lock': [
      '# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.',
      '# yarn lockfile v1',
      '',
      '',
      '"@tenphi/glaze@^3.0.0", "@tenphi/glaze@^3.1.0":',
      '  version "3.1.0"',
      '  resolved "https://registry.yarnpkg.com/@tenphi/glaze/-/glaze-3.1.0.tgz#0123456789abcdef"',
      '  integrity sha512-YARN==',
      '  dependencies:',
      '    tslib "^2.0.0"',
      '',
    ].join('\n'),
  });
  run(dir, 'sync');
  assert.deepEqual(packages()['@tenphi/glaze'], { version: '3.1.0', plugin: 'glaze', resolved: 'https://registry.yarnpkg.com/@tenphi/glaze/-/glaze-3.1.0.tgz', integrity: 'sha512-YARN==' });
  assert.deepEqual(packages()['@tenphi/tasty'], { version: '3.17.1', plugin: 'tasty' }, 'not in yarn.lock');
});
