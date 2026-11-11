#!/usr/bin/env node
import { add, check, init, remove, status, sync, update, why, type Output } from './commands.ts';
import { HarnessError, readJson } from './util.ts';

const HELP = `harnesspm — the harness package manager

Projects
  harnesspm init                 set up harnesspm in this project
  harnesspm sync [--check]       write the agent files (--check: compare only, for CI)
  harnesspm status               layers, packages and always-on size
  harnesspm why <ID>             where a unit comes from and how to change it

Harnesses on top of the repository's (your team's, your own)
  harnesspm add <source> [--local] [--no-hook]
                                 add a harness: github:<owner>/<repo>, git:<url>, npm:<name> or a folder
  harnesspm remove <source> [--local]
  harnesspm update               fetch new versions of added harnesses

Authors
  harnesspm check [<folder>]     validate a harness before publishing
`;

const out: Output = {
  log: (line) => console.log(line),
  warn: (line) => console.error(line),
};

function main(argv: string[]): number {
  const [command, ...rest] = argv;
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
    process.exitCode = 1;
  } else {
    throw error;
  }
}
