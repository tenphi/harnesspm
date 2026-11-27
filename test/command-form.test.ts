import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BLOCK_BEGIN } from '../src/render.ts';
import { NPX_ANY } from '../src/util.ts';

// harnesspm writes one command form, `npx -y @harnesspm/cli` (spec 10.1). The bare `npx harnesspm` works only in a project
// that depends on harnesspm; elsewhere npx would fetch whatever is published under the unscoped name.
const BARE = /\bnpx harnesspm\b/;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesIn(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test('no file under harness/ types the bare npx harnesspm', () => {
  for (const file of filesIn(path.join(root, 'harness'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => assert.doesNotMatch(line, BARE, `${path.relative(root, file)}:${i + 1}`));
  }
});

test('the block marker and every message use the scoped form', () => {
  assert.doesNotMatch(BLOCK_BEGIN, BARE);
  assert.ok(BLOCK_BEGIN.includes(`${NPX_ANY} why <ID>`));
  // Code outside comments names the bare form only to match what earlier versions wrote and what packages still type.
  const matching = /NPX_BARE =|allowKey|RUNNER_PREFIX/;
  for (const file of filesIn(path.join(root, 'src'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/**') || matching.test(code)) return;
      assert.doesNotMatch(line, BARE, `${path.relative(root, file)}:${i + 1}`);
    });
  }
});
