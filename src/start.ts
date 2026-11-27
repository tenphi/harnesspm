// Where every task starts (spec 10.1): the bare command's tasks for a folder, and the next steps that `init`, `new` and
// errors print. One source, so the site only shows the command and the CLI, versioned with the package, holds the steps.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE } from './config.ts';
import { childProjects, isParentFolder } from './parent.ts';
import { resolve } from './resolve.ts';
import { HarnessError, NPX_ANY, PACKAGE_NAME, PACKAGE_NAMES, isDir, isFile, isRecord, readJson, readJsonIfExists, relPosix, shellWord } from './util.ts';

export const DOCS_URL = 'https://harnesspm.tenphi.me';

/** The version of the running harnesspm. */
export function version(): string {
  const pkg = readJson(fileURLToPath(new URL('../package.json', import.meta.url)));
  return isRecord(pkg) && typeof pkg['version'] === 'string' ? pkg['version'] : 'unknown';
}

interface Task {
  what: string;
  command: string;
}

const ADD: Task = { what: "Add your own or your team's harness, on every repo", command: `${NPX_ANY} add <github:owner/repo | folder>` };
const OWN: Task = { what: 'Start a harness of your own, in an empty folder', command: `${NPX_ANY} new rule workflow` };

/** Who decides, said once under every list of tasks. */
export const PERSON_DECIDES = 'A person decides what runs: they add a harness and trust a package. An agent asks first.';
export const EVERY_COMMAND = `Every command: \`${NPX_ANY} --help\``;

/** The dependencies of a package folder that ship a harness, harnesspm's own left out. */
function shipping(dir: string): string {
  try {
    const packages = resolve(dir, { team: true }).packages.filter((p) => p.layer === 'dependencies' && !PACKAGE_NAMES.includes(p.name));
    // The ones the project lists first, then those they pass on.
    const names = [...packages.filter((p) => p.direct), ...packages.filter((p) => !p.direct)].map((p) => p.name);
    if (names.length === 0) return isDir(path.join(dir, 'node_modules')) ? 'No installed dependency ships a harness yet.' : 'Its dependencies are not installed yet.';
    return `${names.length === 1 ? '1 dependency ships' : `${names.length} dependencies ship`} a harness: ${names.join(', ')}.`;
  } catch (error) {
    if (error instanceof HarnessError) return '';
    throw error;
  }
}

/**
 * What the bare command prints in a folder that does not use harnesspm: what the folder is, and the tasks for it, the
 * likeliest first. Each task names the one command that starts it, and that command prints the next step.
 */
export function startText(dir: string): string[] {
  const name = path.basename(dir);
  const isPackage = isRecord(readJsonIfExists(path.join(dir, 'package.json')));
  const hasHarness = isFile(path.join(dir, 'harness', 'plugin.json'));
  let about: string;
  let tasks: Task[];
  if (isPackage && hasHarness) {
    about = `This package (${name}) shares a harness and does not use harnesspm itself.`;
    tasks = [
      { what: 'Check the harness this package shares', command: `${NPX_ANY} check` },
      { what: "See it as its users' agents will, in AGENTS.md", command: `${NPX_ANY} init` },
      { what: 'Add a rule, skill or tool to it', command: `${NPX_ANY} new <kind> <name>` },
      ADD,
    ];
  } else if (isPackage) {
    about = `This folder (${name}) does not use harnesspm. ${shipping(dir)}`.trimEnd();
    tasks = [
      { what: "Give this project's agents its dependencies' harness", command: `${NPX_ANY} init` },
      { what: 'Share a harness from this package', command: `${NPX_ANY} new rule usage` },
      ADD,
      OWN,
    ];
  } else if (isParentFolder(dir)) {
    const projects = childProjects(dir).map((p) => path.basename(p));
    about = `This folder is above ${projects.length === 1 ? '1 project' : `${projects.length} projects`} that use harnesspm: ${projects.join(', ')}.`;
    tasks = [
      { what: 'Give sessions that start here their hooks', command: `${NPX_ANY} sync` },
      { what: "List a project's packages from here", command: `${NPX_ANY} -C ${shellWord(projects[0]!)} help` },
      ADD,
    ];
  } else if (hasHarness) {
    about = `This folder (${name}) is a harness, not a project: it has no package.json.`;
    tasks = [
      { what: 'Check it', command: `${NPX_ANY} check` },
      { what: 'Add a rule, skill or tool to it', command: `${NPX_ANY} new <kind> <name>` },
      { what: 'Add it on this machine (a person does this)', command: `${NPX_ANY} add ${shellWord(dir)}` },
    ];
  } else {
    about = `This folder (${name}) is not a project: it has no package.json.`;
    tasks = [
      { ...OWN, what: 'Start a harness of your own, in this folder' },
      ADD,
      { what: "Give a project's agents its dependencies' harness, in it", command: `${NPX_ANY} init` },
      { what: 'Share a harness from a package, in it', command: `${NPX_ANY} new rule usage` },
    ];
  }
  const width = Math.max(...tasks.map((t) => t.what.length)) + 3;
  return [
    `harnesspm ${version()}: rules, docs, skills and tools from npm packages, for Claude Code and Codex.`,
    about,
    '',
    'Pick the task, run its command, and follow what it prints:',
    ...tasks.map((t) => `  ${t.what.padEnd(width)}${t.command}`),
    '',
    PERSON_DECIDES,
    `Every command: ${NPX_ANY} --help · Docs: ${DOCS_URL}`,
  ];
}

/** The steps after `init` wrote and synced: what to commit, the check for CI, and what the agent does now. */
export function afterInit(toCommit: string[], waiting: boolean): string[] {
  return [
    ...(toCommit.length > 0 ? [`To commit: ${toCommit.join(', ')}`] : []),
    `In CI, after the install: ${NPX_ANY} sync --check`,
    waiting ? 'Agent: report this to the person and wait for their trust decision.' : 'Agent: report this to the person.',
  ];
}

/** The harnesspm-export skill: the copy the project installed, else the one that ships with this harnesspm. */
function exportSkill(projectDir: string): string {
  const rel = path.join('harness', 'skills', 'harnesspm-export', 'SKILL.md');
  const installed = path.join(projectDir, 'node_modules', PACKAGE_NAME, rel);
  return isFile(installed) ? relPosix(projectDir, installed) : fileURLToPath(new URL(`../${rel.split(path.sep).join('/')}`, import.meta.url));
}

/**
 * What to do after `new`, by the folder (spec 10.2): an added harness saves the owner's way, a project that uses
 * harnesspm syncs, a package publishes the harness, and a harness of one's own is added by a person.
 */
export function nextAfterNew(projectDir: string, added: boolean): string[] {
  if (added) return [`Next: edit it, run \`${NPX_ANY} sync\`, then save the change the way that harness's own AGENTS.md or CONTRIBUTING.md says.`];
  if (isFile(path.join(projectDir, CONFIG_FILE))) return [`Next: edit it, then run \`${NPX_ANY} sync\` and \`${NPX_ANY} check\`.`];
  if (!isFile(path.join(projectDir, 'package.json'))) {
    return [
      `Next: edit it, run \`${NPX_ANY} check\`, and commit.`,
      `A person adds it on their machine, in their own terminal: \`${NPX_ANY} add ${shellWord(projectDir)}\`, or \`add github:<owner>/<repo>\` once it is pushed.`,
    ];
  }
  return [
    `Next: edit it, then run \`${NPX_ANY} check\`.`,
    `To publish it, add "harness" to "files" in package.json, and "prepack": "harnesspm check" with ${PACKAGE_NAME} as a dev dependency.`,
    `Every step, and what goes into a harness: the harnesspm-export skill, ${exportSkill(projectDir)}`,
  ];
}
