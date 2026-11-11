import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPatch, demoteHeadings, headings } from '../src/sections.ts';

const rule = `---
paths: ["**/*.tsx"]
---

# Comments

Intro text.

## Disable comments

Use eslint-disable.

## Legacy tokens

Old tokens.

### Nested

Still legacy.

## Naming

Use camelCase.
`;

test('a patch replaces a section with the same heading and level', () => {
  const result = applyPatch(rule, '## Disable comments\n\nUse oxlint-disable-next-line.\n');
  assert.match(result.text, /## Disable comments\n\nUse oxlint-disable-next-line\./);
  assert.doesNotMatch(result.text, /eslint-disable\./);
  assert.match(result.text, /^---\npaths:/, 'frontmatter is kept');
  assert.deepEqual(result.touched.map((t) => t.heading), ['Disable comments']);
});

test('a patch removes listed sections with everything below them', () => {
  const result = applyPatch(rule, '---\nremove: ["Legacy tokens"]\n---\n');
  assert.doesNotMatch(result.text, /Legacy tokens|Still legacy/);
  assert.match(result.text, /## Naming/);
});

test('new sections and text before the first heading are added at the end', () => {
  const result = applyPatch(rule, 'A closing note.\n\n## Imports\n\nSort imports.\n');
  assert.match(result.text, /## Naming\n\nUse camelCase\.\n\n## Imports\n\nSort imports\.\n\nA closing note\.\n$/);
});

test('a missing section to remove is a warning', () => {
  const result = applyPatch(rule, '---\nremove: ["Nope"]\n---\n');
  assert.equal(result.warnings.length, 1);
});

test('headings inside code blocks are not sections', () => {
  const lines = '# A\n\n```md\n# not a heading\n```\n\n## B\n'.split('\n');
  assert.deepEqual(headings(lines).map((h) => h.text), ['A', 'B']);
});

test('demoting headings keeps code blocks', () => {
  assert.equal(demoteHeadings('## A\n\n```\n# code\n```', 2), '#### A\n\n```\n# code\n```');
});
