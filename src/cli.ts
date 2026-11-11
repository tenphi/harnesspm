#!/usr/bin/env node
import { add, approve, check, fetch, init, mcp, newUnit, remove, run, status, sync, update, why, type Output } from './commands.ts';
import { Refused } from './run.ts';
import { HarnessError, readJson } from './util.ts';

const HELP = `harnesspm — the harness package manager

Projects
  harnesspm init                 set up harnesspm in this project
  harnesspm sync [--check]       write the agent files (--check: compare only, for CI)
  harnesspm status               layers, packages and always-on size
  harnesspm why <ID>             where a unit comes from and how to change it
  harnesspm run <plugin>:<script> [-- args]
                                 run a script of a trusted package
  harnesspm approve [<package>]  approve a "pin" package's new version, and write what an agent could not
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

const out: Output = {
  log: (line) => console.log(line),
  warn: (line) => console.error(line),
};

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command !== 'run' && command !== 'mcp' && (rest.includes('--help') || rest.includes('-h'))) {
    console.log(HELP);
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
    return command === 'run' ? run(process.cwd(), ref, args, agent) : mcp(process.cwd(), ref, agent);
  }
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  const cwd = process.cwd();
  const unknown = (allowed: string[]): void => {
    for (const flag of flags) if (!allowed.includes(flag)) throw new HarnessError(`Unknown option ${flag} for ${command}`);
  };
  switch (command) {
    case 'init':
      unknown([]);
      return init(cwd, out);
    case 'sync':
      unknown(['--check']);
      return sync(cwd, out, { check: flags.has('--check') });
    case 'status':
      unknown([]);
      return status(cwd, out);
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
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;
    default:
      throw new HarnessError(`Unknown command "${command}". Run \`harnesspm help\`.`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof HarnessError) {
    console.error(`harnesspm: ${error.message}`);
    process.exitCode = error instanceof Refused ? 2 : 1;
  } else {
    throw error;
  }
}
