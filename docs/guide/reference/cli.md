---
description: Every harnesspm command and option, with exit codes.
---

# CLI reference

**In short**

- Every task starts with `npx -y @harnesspm/cli`. In a project it prints the project's report; elsewhere, what the folder is and the command for each task. Each command prints the next step.
- Projects use `init`, `sync`, `status`, `doctor`, `why`, `approve` and `run`. Jobs without an install use `fetch`.
- Authors use `check` and `new`. People use `add`, `remove` and `update` for harnesses on top of the repository's.
- `npx -y @harnesspm/cli …` works everywhere: in a project that depends on harnesspm, npx runs the installed version, and elsewhere npx downloads it. harnesspm never uses the bare `npx harnesspm …`.
- From another folder, such as a session above a clone, add `-C <dir>` before the command.

The npm package is `@harnesspm/cli`. The command it installs is `harnesspm`. `npx -y @harnesspm/cli --help` lists every command, and `npx -y @harnesspm/cli <command> --help` shows one, with its options. Inside a project, or with `-C`, `help` lists the project's packages, and `help <package>`, `help <rule ID>` or `help <tool>` prints one in full. The specification's [CLI chapter](https://github.com/tenphi/harnesspm/blob/main/docs/spec/10-cli.md), on GitHub, says exactly what each one does.

## Projects

| Command | What it does |
| --- | --- |
| `harnesspm` | Where every task starts. In a project, its report, as `status` prints it. Elsewhere, what the folder is and its tasks, each with the command that starts it. Writes nothing. |
| `harnesspm init` | Installs `@harnesspm/cli` as a dev dependency with the project's package manager when the project does not list it, creates `harnesspm.json`, adds `harnesspm sync` to `postinstall` in a private package or to `prepare` otherwise, makes `CLAUDE.md` import `AGENTS.md`, adds `/.harnesspm/` to `.gitignore`, then runs `sync`. The script skips the sync when harnesspm is not installed, as in `npm ci --omit=dev`. Run again, `init` updates a script from an older version. Stops and changes nothing when the install fails, or with Yarn Plug'n'Play. Ends with the tools that wait for a person, the files to commit and the check for CI. |
| `harnesspm sync` | Resolves the layers and writes every output. Every full install runs it. In a repository without `harnesspm.json`, or without installed dependencies, it writes only the per-machine outputs of added harnesses. With `CI=true`, it writes only per-machine outputs and leaves the committed files to `sync --check`. |
| `harnesspm sync --check` | Writes nothing and ignores added harnesses. Fails when the block or the lock is out of date, or when a `"pin"` package has an unapproved version. For CI. |
| `harnesspm sync --write` | Writes the committed files with `CI=true` too, for a job that commits them. |
| `harnesspm status` | The project's report: packages and versions, changes from added harnesses, always-on size per agent, telemetry, the checks that per-machine files stay out of git and that the outputs are in place, and what waits for a person. Changes nothing. Each problem names its fix. |
| `harnesspm doctor` | The same report. Exits `1` when a check fails. |
| `harnesspm why <ID>` | A unit's owner, source, repository and whether it is editable. For a script, also its command and trust. It also finds a unit of your project entries from any folder. |
| `harnesspm approve [<package>]` | The person's step: writes what an agent could not grant, such as the hooks and allow rules of a package just added to `trust`, and approves a `"pin"` package's new version. A person runs it. |
| `harnesspm run [--agent <agent>] <plugin>:<script> [-- args]` | Runs a script of a trusted package, at the version in the lock, in the current folder. Without an install, it runs the script from the fetched packages, and says what is missing when there are none. |
| `harnesspm fetch` | Downloads only the harness packages in the lock and checks their integrity. Runs no package code. For jobs that do not install dependencies. |
| `harnesspm help` | Inside a project, or with `-C`, the project's packages, one line each, across its workspaces. Fetches first when the project has neither an install nor fetched packages. Elsewhere, every command, as `--help` prints. |
| `harnesspm help <package \| rule ID \| tool>` | A package by its npm or plugin name: its rules in full with the project's patches, docs index, tools with their usage, run command and whether they run without a prompt, MCP servers, skills and hooks. A rule ID: that rule. A tool, `<plugin>:<script>`: its description, `usage` and run command, without running it. Works without an install, and sends a `help` event when telemetry is on. |

### `-C <dir>`

`harnesspm -C <dir> <command>` acts on the project in `<dir>`, as `git -C` does, such as `npx -y @harnesspm/cli -C work/app run acme-ui:tokens surface`. Every command takes it. `run` keeps the current folder for the script, so file arguments stay valid, and `HARNESSPM_PROJECT_DIR` is the named project.

Package managers run `postinstall` and `prepare` on a full install, but not on `npm install <pkg>`, `npm uninstall` or `pnpm add`. Run `npx -y @harnesspm/cli sync` after those.

## Authors

| Command | What it does |
| --- | --- |
| `harnesspm check [<folder>]` | Validates a harness and its project entries, and warns about files that look like secrets. Run it at `prepack`. |
| `harnesspm new <kind> <name>` | Writes a unit from a template. `<kind>` is `rule`, `skill`, `agent`, `script`, `hook` or `mcp`. Creates `harness/plugin.json` when the project has none. |
| `harnesspm new patch <rule ID>` | Writes a patch with a copy of the rule's sections and registers it: in `harness/plugin.json` when the rule reaches the project through its own harness's `extends`, otherwise in `harnesspm.json`. |

Both `new` forms take `--to <plugin>` to write into an added harness, and `--to <plugin> --entry` to write into its entry for this repository.

## People

| Command | What it does |
| --- | --- |
| `harnesspm add <source> [--local] [--no-hook]` | Adds a harness on top of the repository's: with user scope, or for this repository with `--local`. Installs a `SessionStart` hook unless `--no-hook`, and prints the added always-on rules. |
| `harnesspm remove <source> [--local]` | Removes it and its outputs. With the last harness of user scope, the hook goes too. |
| `harnesspm update` | Fetches new versions of added harnesses and prints what changed. Skips working copies with uncommitted changes or unpushed commits. The `SessionStart` hook runs it, and a fetch that fails there only warns. |

A source is `github:<owner>/<repo>`, `git:<url>`, `npm:<name>` or a folder.

## For agents and hooks

| Command | What it does |
| --- | --- |
| `harnesspm mcp [--agent <agent>] <plugin>:<server>` | Starts a stdio MCP server. Agents call it. |
| `harnesspm track --agent <agent>` | The command of harnesspm's own telemetry hooks. |

People do not need these.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. Pending trust is not an error. |
| `1` | Error: an invalid harness, a failed check. |
| `2` | `harnesspm run` refused a script. When a hook calls it, `2` also blocks the event. |
