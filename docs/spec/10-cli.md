# 10. CLI

**In short**

- Projects use `init`, `sync`, `status`, `doctor`, `why`, `approve` and `run`. Jobs that do not install dependencies use `fetch`.
- Authors use `check` and `new`.
- People use `add`, `remove` and `update` for harnesses on top of the repository's.
- Saving changes to a harness is not a harnesspm command. The owner's rules decide it ([08-improving.md](08-improving.md)).

The npm package is `@tenphi/harnesspm`, and the command it installs is `harnesspm`. Use `npx harnesspm …` in a project that depends on it. Use `npx -y @tenphi/harnesspm …` anywhere else, so npx downloads the package by its full name. Outputs follow the same split, and an allow rule always has the prefix of the command it allows.

## 10.1 Projects

| Command | What it does |
| --- | --- |
| `harnesspm init` | Creates `harnesspm.json`, adds `harnesspm sync` to the `postinstall` script of a private package or to `prepare` otherwise, makes `CLAUDE.md` import `AGENTS.md`, then runs `harnesspm sync`. |
| `harnesspm sync` | Resolves the layers and writes all outputs. Runs on every install. In a repository that does not use harnesspm (it has no `harnesspm.json`), or whose dependencies are not installed, it writes only the per-machine outputs of added harnesses, so it never wipes the committed block. When an agent runs it, new allow rules, hooks and MCP servers stay pending ([06-trust.md](06-trust.md#62-trusting-a-package)). With `CI=true`, it writes only the per-machine outputs and leaves the committed ones to `sync --check` ([06-trust.md](06-trust.md#64-ci)). |
| `harnesspm sync --check` | Writes nothing and ignores added harnesses, as every run with `CI=true` does. Fails when a committed output or the lock is out of date. For CI. |
| `harnesspm sync --write` | Writes the committed outputs with `CI=true` too, for a job that commits them. `init`, `approve` and `new` always write them. |
| `harnesspm status` | Layers, packages, versions, pending trust, changes that added harnesses make to the repository's units, always-on size per agent, and whether telemetry is on, held or off on this machine. Points to `doctor` when a per-machine file has a problem. |
| `harnesspm doctor` | Checks that the repository is ready for harnesses, its own and a person's. It changes nothing. Each problem names the command that fixes it. Exits `1` when a check fails; warnings, such as pending trust, do not fail. See [10.5](#105-doctor). |
| `harnesspm why <ID>` | Owner, source, repository and whether the unit is editable ([08-improving.md](08-improving.md#81-find-the-source)). Works for every unit ID ([2.8](02-package-format.md#28-unit-ids)). For a script, also the command that runs it; for a script, hook, MCP server or sub-agent of a dependency, whether its package is trusted. |
| `harnesspm approve [<package>]` | Writes the entries that a model run left pending, and records a `"pin"` package's new version as approved in the lock. A person runs it, not an agent. |
| `harnesspm run [--agent <agent>] <plugin>:<script> [-- args]` | Runs a script ([05-executables.md](05-executables.md#51-scripts)). Hooks pass `--agent`, which sets `HARNESSPM_AGENT`. |
| `harnesspm fetch` | Downloads only the harness packages in the lock, without a full install, and checks their integrity ([04-outputs.md](04-outputs.md#42-stable-package-paths)). For review bots and CI jobs that do not install dependencies. |

Package managers run these scripts on a full install, but not on `npm install <pkg>`, `npm uninstall` or `pnpm add`, so run `npx harnesspm sync` after those. `sync --check` in CI catches a missed one. `postinstall` would also run when others install a published package, so `init` uses it only in a private package; Yarn 2 and later run `postinstall` but not `prepare` ([research](../research/package-managers.md)).

`harnesspm mcp [--agent <agent>] <plugin>:<server>` also exists. Agents call it to start stdio MCP servers. `harnesspm track --agent <agent>` is the command of harnesspm's own telemetry hooks ([14.4](14-telemetry.md#144-agent-events)). People do not need either.

```text
$ npx harnesspm status
📦 dependencies  @cube-dev/ui-kit 0.206.1 → @tenphi/tasty 3.17.1, @tenphi/glaze 2.0.0
🏢 project       harnesspm.json: 1 replace · 1 patch
➕ added         github:cube-js/frontend-harness (user) · github:alex/harness (user), project entry cube-ui-kit
⏳ pending       some-third-party: 1 hook (not trusted)
📏 always-on     Codex 18.4 KiB of 32 KiB · Claude Code 212 lines
📡 telemetry     run, mcp, sync, why, read, skill, session → file .harnesspm/events.jsonl
```

## 10.2 Authors

| Command | What it does |
| --- | --- |
| `harnesspm check [<folder>]` | Validates a harness ([02-package-format.md](02-package-format.md#210-validation)) and warns about files that look like secrets. Run it at `prepack`. |
| `harnesspm new <kind> <name> [--to <plugin>] [--entry]` | `<kind>` is `rule`, `skill`, `agent` (a sub-agent), `script`, `hook` or `mcp`. Writes a valid unit from a template, and creates `harness/plugin.json` when the project has none. A skill's name gets the plugin name in front. `--to <plugin>` writes it into an added harness, `--to <plugin> --entry` into its entry for this repository, which holds rules, skills, sub-agents and docs. |
| `harnesspm new patch <rule ID> [--to <plugin>] [--entry]` | Writes a patch with a copy of the rule's sections, or of the whole rule when it has none, and registers it: in `harness/plugin.json` (file in `harness/dev.harnesspm/patches/`) when the rule reaches the project through its own harness's `extends`, so users get the change too; otherwise in `harnesspm.json` (file in `harnesspm/patches/`); with `--to <plugin>`, in that added harness. Edit the sections to change and delete the others. |

## 10.3 People

| Command | What it does |
| --- | --- |
| `harnesspm add <source> [--local] [--no-hook]` | Adds a harness on top of the repository's: with user scope, or with `--local` for this repository only. Installs the `SessionStart` hook ([07-added.md](07-added.md#75-applying-in-every-repository)) and prints the added always-on rules. |
| `harnesspm remove <source> [--local]` | Removes it and its outputs. With the last harness with user scope, the hook and write access go too. |
| `harnesspm update` | Fetches new versions of added harnesses and rewrites their outputs. Skips working copies with uncommitted changes or unpushed commits and lists them. |

## 10.4 Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. Pending trust is not an error. |
| `1` | Error: invalid harness, failed check. |
| `2` | `harnesspm run` refused a script ([05-executables.md](05-executables.md#51-scripts)). When a hook calls it, `2` also blocks the event: harnesspm fails closed. |

## 10.5 Doctor

`npx harnesspm doctor` answers one question: can a person work here with harnesses, the repository's and their own, without per-machine files reaching a commit?

| Group | Check | Fails when |
| --- | --- | --- |
| 🔒 Local files | Every per-machine file on disk is ignored by git and not tracked. The files are the ones harnesspm lists in `.git/info/exclude`, plus `harnesspm.local.json`, `CLAUDE.local.md`, `.claude/settings.local.json` and a telemetry file. Git answers, so `.gitignore`, `.git/info/exclude` and a global excludes file all count. | A file is tracked (fix: `git rm --cached`), or not ignored (fix: `sync` for a file harnesspm writes, otherwise a `.gitignore` entry). Outside a git repository it only warns. |
| ➕ Harnesses of your own | The clone's exclude file can be written. Each added harness is on this machine. | The exclude file cannot be written, or an added harness is missing. |
| 📦 Outputs | Committed outputs are up to date, as `sync --check` checks. Per-machine links and generated files are in place. `AGENTS.md` fits in Codex's 32 KiB. | A committed output or the lock is out of date. Missing per-machine outputs only warn, because `sync` writes them, and so does an `AGENTS.md` over 32 KiB. |
| 🛡️ Trust | Entries that wait for trust or for a person, and a held telemetry handler. | Never: these are warnings ([10.4](#104-exit-codes)). |

```text
$ npx harnesspm doctor
🔒 Local files
  ❌ CLAUDE.local.md is tracked by git, so a commit can include this machine's files, and harnesspm writes no added harnesses into it. Run `git rm --cached CLAUDE.local.md` and commit.
➕ Harnesses of your own
  ✅ .git/info/exclude can be written, so harnesspm keeps per-machine files out of git
  ✅ Added: alex (github:alex/harness, user)
📦 Outputs
  ✅ Committed outputs are up to date
  ✅ 14 per-machine outputs in place
🛡️  Trust
  ✅ Nothing waits for trust

❌ 1 problem. Each line above says how to fix it.
```

`doctor` never edits `.gitignore`, never untracks a file and never writes outputs. `sync` writes, and the person decides the rest.
