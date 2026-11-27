// The site shows real output of the example app that docs-site/examples/acme.mjs writes. This test writes the app, runs
// the commands the site shows, and fails when the output and the site drift apart. Fix the site with the new output.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runWith } from './helpers.ts';

const REPO = path.join(import.meta.dirname, '..');
const VERSION = (JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { version: string }).version;
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A documented output as a pattern: `…` cuts any text, in a line or across lines, and `{version}` is this version. */
function pattern(doc: string): RegExp {
  const body = doc.trimEnd().split('…').map(escape).join('[^]*?').replaceAll(escape('{version}'), escape(VERSION));
  return new RegExp(`^${body}\\n$`);
}

/** The output that a Markdown page shows under `$ <command>`, in a `text` code block. */
function shown(file: string, command: string): string {
  const text = fs.readFileSync(path.join(REPO, file), 'utf8');
  const head = `\`\`\`text\n$ ${command}\n`;
  const start = text.indexOf(head);
  assert.ok(start >= 0, `${file} shows \`${command}\``);
  const rest = text.slice(start + head.length);
  return rest.slice(0, rest.indexOf('```'));
}

test('the site shows what the CLI prints in the example app: the start, init and the report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harnesspm-examples-'));
  const made = spawnSync(process.execPath, [path.join(REPO, 'docs-site/examples/acme.mjs'), root], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  const app = path.join(root, 'app');
  // The example's stand-in npm installs harnesspm from this repository.
  const env = { PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env['PATH'] ?? ''}` };

  const start = runWith(app, env);
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, pattern(fs.readFileSync(path.join(REPO, 'docs-site/examples/start.txt'), 'utf8')), 'docs-site/examples/start.txt');

  const init = runWith(app, env, 'init');
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, pattern(shown('docs/guide/setup.md', 'npx -y @harnesspm/cli init')), 'docs/guide/setup.md, init');

  const report = runWith(app, env);
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, pattern(shown('docs/guide/setup.md', 'npx -y @harnesspm/cli')), 'docs/guide/setup.md, the report');
});
