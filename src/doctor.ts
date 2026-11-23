// `harnesspm doctor`: checks that a repository is ready for harnesses, its own and a person's (spec 10.1).
// It reports and changes nothing. Each problem says the command that fixes it.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { excludedBySync } from './outputs.ts';
import { excludeEntry, exists, gitExclude, isDir } from './util.ts';

export type Level = 'ok' | 'info' | 'warn' | 'fail';

export interface Finding {
  level: Level;
  text: string;
}

const MARK: Record<Level, string> = { ok: '✅', info: 'ℹ️ ', warn: '⚠️ ', fail: '❌' };
export const formatFinding = (f: Finding): string => `  ${MARK[f.level]} ${f.text}`;

/** Per-machine files that agents or people create, besides the ones harnesspm lists in .git/info/exclude. */
const PER_MACHINE = ['harnesspm.local.json', 'CLAUDE.local.md', '.claude/settings.local.json'];

/** What a tracked per-machine file stops harnesspm from writing. */
const BLOCKS: Record<string, string> = {
  'CLAUDE.local.md': 'harnesspm writes no added harnesses into it',
  '.claude/settings.local.json': 'harnesspm writes no hooks or permissions there',
};

/** Git's output split on NUL. Exit code 1 means "no match" for both commands used here. `empty` keeps empty fields. */
function git(projectDir: string, args: string[], input?: string, empty = false): string[] {
  const result = spawnSync('git', args, { cwd: projectDir, encoding: 'utf8', ...(input !== undefined ? { input } : {}) });
  if (result.status !== 0 && result.status !== 1) return [];
  const fields = result.stdout.split('\0');
  return empty ? fields : fields.filter(Boolean);
}

const plain = (entry: string): string => entry.replace(/^\/+/, '').replace(/\/+$/, '');

/**
 * The pattern that decides each path, by `git check-ignore -v -n`, with the file it is in. A pattern that starts with `!`
 * brings the path back. A path that no pattern matches is not in the result.
 */
function deciding(projectDir: string, paths: string[]): Map<string, { source: string; pattern: string }> {
  const fields = paths.length > 0 ? git(projectDir, ['check-ignore', '-z', '-v', '-n', '--stdin'], `${paths.join('\0')}\0`, true) : [];
  const result = new Map<string, { source: string; pattern: string }>();
  for (let i = 0; i + 3 < fields.length; i += 4) {
    const [source = '', , pattern = '', rel = ''] = fields.slice(i, i + 4);
    if (pattern !== '') result.set(rel, { source, pattern });
  }
  return result;
}

/**
 * Checks that every per-machine file on disk is ignored by git and not tracked, so no commit can include it.
 * Git answers, so `.gitignore`, `.git/info/exclude` and a global excludes file all count.
 * `extra` adds project-relative files that harnesspm creates, such as a telemetry file. `sync` is the command that fixes them.
 * Undefined outside a git repository.
 */
export function checkLocalFiles(projectDir: string, extra: string[] = [], sync = 'npx harnesspm sync'): { checked: number; problems: Finding[] } | undefined {
  const exclude = gitExclude(projectDir);
  if (exclude === undefined) return undefined;
  const listed = new Set(excludedBySync(projectDir).map(plain));
  // `sync` lists these whenever they exist, so it fixes them too.
  const syncFixes = new Set([...listed, 'harnesspm.local.json', ...extra.map(plain)]);
  const candidates = [...new Set([...syncFixes, ...PER_MACHINE])].filter((rel) => rel !== '' && exists(path.join(projectDir, rel))).sort();
  if (candidates.length === 0) return { checked: 0, problems: [] };

  const tracked = git(projectDir, ['ls-files', '-z', '--', ...candidates]);
  const isTracked = (rel: string): boolean => tracked.some((t) => t === rel || t.startsWith(`${rel}/`));
  const untracked = candidates.filter((rel) => !isTracked(rel));
  const decided = deciding(projectDir, untracked);

  const problems: Finding[] = [];
  for (const rel of candidates) {
    if (isTracked(rel)) {
      const blocks = BLOCKS[rel] !== undefined ? `, and ${BLOCKS[rel]}` : '';
      const flag = isDir(path.join(projectDir, rel)) && !fs.lstatSync(path.join(projectDir, rel)).isSymbolicLink() ? '-r ' : '';
      problems.push({ level: 'fail', text: `${rel} is tracked by git, so a commit can include this machine's files${blocks}. Run \`git rm ${flag}--cached ${rel}\` and commit.` });
    } else {
      const match = decided.get(rel);
      if (match !== undefined && !match.pattern.startsWith('!')) continue;
      // A project below the git root writes `/<folder>/<path>` into .git/info/exclude, and `/<path>` into its own .gitignore.
      const fix =
        match !== undefined
          ? `The pattern \`${match.pattern}\` in ${match.source} brings it back. Remove that pattern.`
          : syncFixes.has(rel)
            ? `Run \`${sync}\`, which lists it in .git/info/exclude.`
            : exclude.prefix === ''
              ? `Add \`/${rel}\` to .gitignore, or to .git/info/exclude for this clone only.`
              : `Add \`/${rel}\` to the .gitignore in ${exclude.prefix}, or \`${excludeEntry(exclude.prefix, rel)}\` to .git/info/exclude for this clone only.`;
      problems.push({ level: 'fail', text: `${rel} is not ignored by git, so \`git add\` can pick it up. ${fix}` });
    }
  }
  return { checked: candidates.length, problems };
}

/** Whether harnesspm can write the clone's exclude file, creating it if needed. */
export function excludeWritable(file: string): boolean {
  for (let p = file; ; p = path.dirname(p)) {
    if (exists(p)) {
      try {
        fs.accessSync(p, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    }
    if (path.dirname(p) === p) return false;
  }
}
