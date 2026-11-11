import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { homeOf, PLUGIN_SCHEMA, project, read, run, writeFiles } from './helpers.ts';

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

  const tampered = JSON.parse(read(dir, 'harnesspm.lock.json'));
  tampered.packages['@tenphi/tasty'].integrity = 'sha512-AAAA';
  writeFiles(dir, { 'harnesspm.lock.json': JSON.stringify(tampered) });
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true });
  const refused = run(dir, 'fetch');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /@tenphi\/tasty: the downloaded tarball does not match the integrity in the lock/);
});
