// Whether the repository is as a person reviewed it, so a model run may write its entries (spec 6.2, rule 4).
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { CONFIG_FILE } from './config.ts';
import { LOCK_FILE, sameLock } from './lock.ts';
import type { Resolution } from './resolve.ts';
import { readTextIfExists } from './util.ts';

export type Reviewed = { ok: true; branch: string } | { ok: false; reason: string };

/**
 * The repository is as reviewed when its trust inputs are the same as where HEAD meets the remote default branch,
 * with no untracked file among them, and this sync computes the committed lock (`lock`), so the installed packages
 * are the ones the lock records. Only local refs are read: a stale `origin/HEAD` means an older reviewed state.
 * `reason` says what differs, so a person knows whether a review or an install is due.
 */
export function reviewedState(projectDir: string, team: Resolution, lock: string): Reviewed {
  const git = (...args: string[]): string | undefined => {
    const result = spawnSync('git', args, { cwd: projectDir, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : undefined;
  };
  const branch = git('symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  if (branch === undefined) {
    if (git('rev-parse', '--git-dir') === undefined) return { ok: false, reason: 'the project is not in a git repository' };
    return { ok: false, reason: 'origin/HEAD is not set (`git remote set-head origin --auto` sets it)' };
  }
  const base = git('merge-base', 'HEAD', branch);
  if (base === undefined) return { ok: false, reason: `HEAD has no commit in common with ${branch}` };
  const folders = ['', ...team.workspaces.map((ws) => `${ws.key}/`)].flatMap((dir) => [`${dir}harness`, `${dir}harnesspm/patches`]);
  const inputs = [CONFIG_FILE, LOCK_FILE, ...folders];
  const changed = git('diff', '--name-only', '--relative', '--no-renames', base, '--', ...inputs);
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...inputs);
  if (changed === undefined || untracked === undefined) return { ok: false, reason: `git could not compare the trust inputs with ${branch}` };
  const files = [...changed.split('\n'), ...untracked.split('\n')].filter((file) => file !== '');
  if (files.length > 0) {
    const more = files.length > 1 ? ` and ${files.length - 1} more file${files.length > 2 ? 's' : ''}` : '';
    return { ok: false, reason: `${files[0]}${more} differ${files.length > 1 ? '' : 's'} from ${branch}` };
  }
  if (!sameLock(readTextIfExists(path.join(projectDir, LOCK_FILE)), lock)) return { ok: false, reason: `the installed packages do not match ${LOCK_FILE}` };
  return { ok: true, branch };
}
