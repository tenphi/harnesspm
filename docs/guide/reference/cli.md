---
description: Every harnesspm command and option, with exit codes.
---

# CLI reference

**In short**

- Projects use `init`, `sync`, `status`, `doctor`, `why`, `approve` and `run`. Jobs without an install use `fetch`.
- Authors use `check` and `new`. People use `add`, `remove` and `update` for harnesses on top of the repository's.
- Use `npx harnesspm …` in a project that depends on harnesspm, and `npx -y @tenphi/harnesspm …` anywhere else.

The npm package is `@tenphi/harnesspm`. The command it installs is `harnesspm`. `npx harnesspm help` lists every command. [CLI](../../spec/10-cli.md) in the specification says exactly what each one does.

## Projects

| Command | What it does |
| --- | --- |
| `harnesspm init` | Creates `harnesspm.json`, adds `harnesspm sync` to `postinstall` in a private package or to `prepare` otherwise, makes `CLAUDE.md` import `AGENTS.md`, then runs `sync`. |
| `harnesspm sync` | Resolves the layers and writes every output. Every full install runs it. In a repository without `harnesspm.json`, or without installed dependencies, it writes only the per-machine outputs of added harnesses. |
| `harnesspm sync --check` | Writes nothing and ignores added harnesses. Fails when the block or the lock is out of date, or when a `"pin"` package has an unapproved version. For CI. |
| `harnesspm status` | Layers, packages, versions, pending trust, changes from added harnesses, always-on size per agent, and whether telemetry is on. |
| `harnesspm doctor` | Checks that per-machine files stay out of git and that the outputs are in place. Changes nothing. Each problem names its fix. |
| `harnesspm why <ID>` | A unit's owner, source, repository and whether it is editable. For a script, also its command and trust. |
| `harnesspm approve [<package>]` | Writes the entries that a model run left pending, and approves a `"pin"` package's new version. A person runs it. |
| `harnesspm run [--agent <agent>] <plugin>:<script> [-- args]` | Runs a script of a trusted package, at the version in the lock. |
| `harnesspm fetch` | Downloads only the harness packages in the lock and checks their integrity. For jobs that do not install dependencies. |

Package managers run `postinstall` and `prepare` on a full install, but not on `npm install <pkg>`, `npm uninstall` or `pnpm add`. Run `npx harnesspm sync` after those.

## Authors

| Command | What it does |
| --- | --- |
| `harnesspm check [<folder>]` | Validates a harness and warns about files that look like secrets. Run it at `prepack`. |
| `harnesspm new <kind> <name>` | Writes a unit from a template. `<kind>` is `rule`, `skill`, `agent`, `script`, `hook` or `mcp`. Creates `harness/plugin.json` when the project has none. |
| `harnesspm new patch <rule ID>` | Writes a patch with a copy of the rule's sections and registers it: in `harness/plugin.json` when the rule reaches the project through its own harness's `extends`, otherwise in `harnesspm.json`. |

Both `new` forms take `--to <plugin>` to write into an added harness, and `--to <plugin> --entry` to write into its entry for this repository.

## People

| Command | What it does |
| --- | --- |
| `harnesspm add <source> [--local] [--no-hook]` | Adds a harness on top of the repository's: with user scope, or for this repository with `--local`. Installs a `SessionStart` hook unless `--no-hook`, and prints the added always-on rules. |
| `harnesspm remove <source> [--local]` | Removes it and its outputs. With the last harness of user scope, the hook goes too. |
| `harnesspm update` | Fetches new versions of added harnesses. Skips working copies with uncommitted changes or unpushed commits. |

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
