#!/usr/bin/env node
import type { Output } from './commands.ts';
import * as path from 'node:path';
import { HarnessError, isDir, readJson } from './util.ts';

async function main(): Promise<void> {
  const commands = await import('./commands.ts');
  const { Refused } = await import('./run.ts');
  try {
    process.exitCode = await dispatch(process.argv.slice(2), commands);
  } catch (error) {
    if (error instanceof HarnessError) {
      console.error(`harnesspm: ${error.message}`);
      process.exitCode = error instanceof Refused ? 2 : 1;
    } else {
      throw error;
    }
  }
}

const HELP = `harnesspm — the harness package manager

Usage: npx -y @harnesspm/cli [-C <dir>] [<command>]
  harnesspm                      where to start: the tasks for this folder, or this project's report
  -C <dir>                       act on the project in <dir>, such as a repository you cloned. \`run\` keeps
                                 the current folder for the script, so file arguments stay valid
  harnesspm help                 the project's packages, one line each; outside a project, these commands
  harnesspm help <package | rule ID | tool>
                                 a package's rules, docs, tools, MCP servers, skills and hooks in full,
                                 one rule, or a tool's usage and run command. Needs no install

Projects
  harnesspm init                 set up harnesspm in this project: install it, write its files and sync
  harnesspm sync [--check | --write]
                                 write the agent files (--check: compare only, for CI;
                                 --write: committed files too when CI=true)
  harnesspm status               the project's report: packages, checks, and what waits for a person
  harnesspm doctor               the same report, which exits 1 when a check fails
  harnesspm why <ID>             where a unit comes from and how to change it
  harnesspm run <plugin>:<script> [-- args]
                                 run a script of a trusted package
  harnesspm approve [<package>]  a person's step: write what an agent could not grant, and approve
                                 a "pin" package's new version
  harnesspm fetch                download the harness packages in the lock, for jobs without an install

Harnesses on top of the repository's (your team's, your own)
  harnesspm add <source> [--local] [--no-hook]
                                 add a harness: github:<owner>/<repo>, git:<url>, npm:<name> or a folder
  harnesspm remove <source> [--local]
  harnesspm update               fetch new versions of added harnesses

Authors
  harnesspm check [<folder>]     validate a harness before publishing
  harnesspm new <kind> <name> [--to <plugin>] [--entry]
                                 a rule, skill, agent, script, hook or mcp from a template
  harnesspm new patch <rule ID> [--to <plugin>] [--entry]
                                 a patch that changes some sections of a rule
`;

/** Details for a command whose usage line is not enough. */
const DETAILS: Record<string, string> = {
  new: `Kinds: rule, skill, agent, script, hook, mcp. \`new patch\` takes a rule ID, such as acme-ui:rules/usage.
  --to <plugin>   write into a harness you added (\`npx -y @harnesspm/cli status\` lists them), not the project's own harness/
  --entry         with --to: write into that harness's entry for this repository`,
};

/** Help for one command: its lines in HELP and its details. Undefined for a word that is not a command. */
function commandHelp(command: string): string | undefined {
  const picked: string[] = [];
  let inside = false;
  for (const line of HELP.split('\n')) {
    if (line === `  harnesspm ${command}` || line.startsWith(`  harnesspm ${command} `)) {
      inside = true;
      picked.push(line);
    } else if (inside && /^ {3,}\S/.test(line)) picked.push(line);
    else inside = false;
  }
  if (picked.length === 0) return undefined;
  const details = DETAILS[command];
  return [...picked, ...(details !== undefined ? ['', details] : []), '', 'Every command: npx -y @harnesspm/cli --help. Every option: https://harnesspm.tenphi.me/reference/cli/'].join('\n');
}

const out: Output = {
  log: (line) => console.log(line),
  warn: (line) => console.error(line),
};

/**
 * `-C <dir>` before the command: harnesspm acts as if it started in <dir>, as `git -C` does (spec 10.1). Returns the
 * folder and the arguments after it.
 */
function projectFolder(argv: string[]): { cwd: string; named: boolean; argv: string[] } {
  if (argv[0] !== '-C') return { cwd: process.cwd(), named: false, argv };
  const dir = argv[1];
  if (dir === undefined || dir === '') throw new HarnessError('Usage: harnesspm -C <dir> <command>');
  const cwd = path.resolve(dir);
  if (!isDir(cwd)) throw new HarnessError(`-C ${dir}: no such folder`);
  return { cwd, named: true, argv: argv.slice(2) };
}

function dispatch(argvIn: string[], { add, approve, check, doctor, fetch, init, mcp, newUnit, notAProject, projectHelp, remove, run, start, status, sync, targetHelp, update, why }: typeof import('./commands.ts')): number | Promise<number> {
  const { cwd, named, argv } = projectFolder(argvIn);
  const [command, ...rest] = argv;
  const isHelp = (arg: string | undefined): boolean => arg === '--help' || arg === '-h';
  // After `run <plugin>:<script>`, every argument goes to the script, `--help` too. Only a first `--help` is harnesspm's.
  if (command !== undefined && (command === 'run' || command === 'mcp' ? isHelp(rest[0]) : rest.some(isHelp))) {
    console.log(commandHelp(command) ?? HELP);
    return 0;
  }
  if (command === 'run' || command === 'mcp') {
    // Everything after the script name goes to the script, untouched.
    let agent: string | undefined;
    let i = 0;
    if (rest[0] === '--agent') {
      agent = rest[1];
      i = 2;
    }
    const ref = rest[i];
    if (ref === undefined) throw new HarnessError(`Usage: harnesspm ${command} [--agent <claude|codex>] <plugin>:<name>${command === 'run' ? ' [-- args]' : ''}`);
    const args = rest.slice(i + 1);
    if (args[0] === '--') args.shift();
    return command === 'run' ? run(cwd, ref, args, agent) : mcp(cwd, ref, agent);
  }
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  const unknown = (allowed: string[]): void => {
    for (const flag of flags) if (!allowed.includes(flag)) throw new HarnessError(`Unknown option ${flag} for ${command}`);
  };
  switch (command) {
    case 'init':
      unknown([]);
      return init(cwd, out);
    case 'sync':
      unknown(['--check', '--write']);
      return sync(cwd, out, { check: flags.has('--check'), write: flags.has('--write') });
    case 'status':
      unknown([]);
      return status(cwd, out);
    case 'doctor':
      unknown([]);
      return doctor(cwd, out);
    case 'why':
      unknown([]);
      if (args[0] === undefined) throw new HarnessError('Usage: harnesspm why <ID>');
      return why(cwd, args[0], out);
    case 'add':
    case 'remove': {
      unknown(command === 'add' ? ['--local', '--no-hook'] : ['--local']);
      if (args[0] === undefined) throw new HarnessError(`Usage: harnesspm ${command} <source>${command === 'add' ? ' [--local] [--no-hook]' : ' [--local]'}`);
      if (command === 'add') return add(cwd, args[0], out, { local: flags.has('--local'), hook: !flags.has('--no-hook') });
      return remove(cwd, args[0], out, { local: flags.has('--local') });
    }
    case 'update':
      unknown([]);
      return update(cwd, out);
    case 'new': {
      const flagArgs = rest.filter((a, i) => a === '--to' || rest[i - 1] === '--to' || a === '--entry');
      const positional = rest.filter((a) => !flagArgs.includes(a) && !a.startsWith('--'));
      const toIndex = rest.indexOf('--to');
      const to = toIndex >= 0 ? rest[toIndex + 1] : undefined;
      for (const a of rest) if (a.startsWith('--') && a !== '--to' && a !== '--entry') throw new HarnessError(`Unknown option ${a} for new`);
      if (positional.length !== 2) throw new HarnessError('Usage: harnesspm new <kind> <name> [--to <plugin>] [--entry], or harnesspm new patch <rule ID>');
      return newUnit(cwd, positional[0]!, positional[1]!, { ...(to !== undefined ? { to } : {}), entry: rest.includes('--entry') }, out);
    }
    case 'fetch':
      unknown([]);
      return fetch(cwd, out);
    case 'approve':
      unknown([]);
      return approve(cwd, args[0], out);
    case 'check':
      unknown([]);
      return check(args[0] ?? cwd, out);
    case '--version':
    case '-v': {
      const pkg = readJson(new URL('../package.json', import.meta.url).pathname) as { version: string };
      console.log(pkg.version);
      return 0;
    }
    case undefined:
      // Every task starts here: the project's report, or the tasks for this folder (spec 10.1).
      return start(cwd, out);
    case '--help':
    case '-h':
      console.log(HELP.trimEnd());
      return 0;
    case 'help': {
      if (args[0] !== undefined) {
        // A command first, then a package, rule or tool of the project (spec 10.1).
        const text = commandHelp(args[0]);
        if (text !== undefined) {
          console.log(text);
          return 0;
        }
        return targetHelp(cwd, args[0], out);
      }
      // Inside a project, or with -C, the project's packages lead. Elsewhere, the commands.
      const code = projectHelp(cwd, out);
      if (code !== undefined) return code;
      console.log(HELP.trimEnd());
      if (named) console.log(`\n${notAProject(cwd)}`);
      return 0;
    }
    default:
      throw new HarnessError(`Unknown command "${command}". Every command: \`npx -y @harnesspm/cli --help\`.`);
  }
}

// Agent hooks call `harnesspm track` on every matching tool call, so it loads only what it needs (spec 14.4). A hook in a
// folder above the project names the project with `-C <dir>` (spec 4.10).
const tracked = process.argv[2] === 'track' ? 3 : process.argv[2] === '-C' && process.argv[4] === 'track' ? 5 : 0;
if (tracked > 0) {
  const { track } = await import('./telemetry.ts');
  process.exitCode = track(process.argv.slice(tracked), tracked === 5 ? path.resolve(process.argv[3]!) : undefined);
} else {
  await main();
}
