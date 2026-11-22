# 10. CLI

**In short**

- Projects use `init`, `sync`, `status`, `doctor`, `why`, `approve` and `run`. Jobs that do not install dependencies use `fetch`.
- From outside a project, such as a repository that cloned it, add `-C <dir>` before the command. `help` lists the project's packages, and `help <package>` prints one in full.
- `help <tool>` prints a tool's usage, its answer exit codes and its run command, without running it.
- Authors use `check` and `new`.
- People use `add`, `remove` and `update` for harnesses on top of the repository's.
- Saving changes to a harness is not a harnesspm command. The owner's rules decide it ([08-improving.md](08-improving.md)).

The npm package is `@tenphi/harnesspm`, and the command it installs is `harnesspm`. `npx -y @tenphi/harnesspm …` works everywhere: in a project that depends on it, npx runs the installed version, and elsewhere it downloads the package by its full name. Tool lines in the managed block use this form ([4.6](04-outputs.md#46-managed-blocks)). `npx harnesspm …` works only in a project that depends on harnesspm, and messages there may use it. An allow rule always has the prefix of the command it allows.

`harnesspm help` lists every command, and `harnesspm <command> --help` shows one. Inside a project, or with `-C`, `help` also lists the project's packages ([below](#the-project-in-help)), and `help <package | rule ID | tool>` prints one of them in full ([below](#help-for-a-package-a-rule-or-a-tool)). A message that names a step for a person, such as trusting a package or approving a version, says that a person takes it. An agent reads every message too, and must not take that step as its own.

## 10.1 Projects

| Command | What it does |
| --- | --- |
| `harnesspm init` | Creates `harnesspm.json`, adds the [install hook](#the-install-hook) to the `postinstall` script of a private package or to `prepare` otherwise, makes `CLAUDE.md` import `AGENTS.md`, then runs `harnesspm sync` and names the committed files ([1.7](01-overview.md#17-what-is-committed)) that git sees as new or changed. It MUST stop before it changes anything when the project's `package.json` does not list `@tenphi/harnesspm` in `dependencies`, `devDependencies` or `optionalDependencies`: the script it adds calls the `harnesspm` command, so the next install would fail. |
| `harnesspm sync` | Resolves the layers and writes all outputs. Runs on every install. In a repository that does not use harnesspm (it has no `harnesspm.json`), or whose dependencies are not installed, it writes only the per-machine outputs of added harnesses, so it never wipes the committed block. When an agent runs it, new allow rules, hooks and MCP servers stay pending outside the reviewed state, and the held-back line says what differs ([06-trust.md](06-trust.md#62-trusting-a-package)). With `CI=true`, it writes only the per-machine outputs and leaves the committed ones to `sync --check` ([06-trust.md](06-trust.md#64-ci)). |
| `harnesspm sync --check` | Writes nothing and ignores added harnesses, as every run with `CI=true` does. Fails when a committed output or the lock is out of date. For CI. |
| `harnesspm sync --write` | Writes the committed outputs with `CI=true` too, for a job that commits them. `init`, `approve` and `new` always write them. |
| `harnesspm status` | Layers, packages, versions, pending trust, entries an agent's sync would hold back (the list `sync` prints), changes that added harnesses make to the repository's units, always-on size per agent, managed blocks that Codex does not reach ([4.9](04-outputs.md#49-size-limits)), and whether telemetry is on, held or off on this machine. Points to `doctor` when a per-machine file has a problem. |
| `harnesspm doctor` | Checks that the repository is ready for harnesses, its own and a person's. It changes nothing. Each problem names the command that fixes it. Exits `1` when a check fails; warnings, such as pending trust, do not fail. See [10.5](#105-doctor). |
| `harnesspm why <ID>` | Owner, source, repository and whether the unit is editable ([08-improving.md](08-improving.md#81-find-the-source)). Works for every unit ID ([2.8](02-package-format.md#28-unit-ids)). For a script, also the command that runs it; for a script, hook, MCP server or sub-agent of a dependency, whether its package is trusted. |
| `harnesspm approve [<package>]` | Writes the entries that a model run left pending, and records a `"pin"` package's new version as approved in the lock. A person runs it, not an agent. |
| `harnesspm run [--agent <agent>] <plugin>:<script> [-- args]` | Runs a script ([05-executables.md](05-executables.md#51-scripts)) in the caller's folder. Hooks pass `--agent`, which sets `HARNESSPM_AGENT`. Without an install, it runs the script from the [fetched packages](01-overview.md#15-terms). When there are none, it says so and names `fetch` and the install, not `No script`. |
| `harnesspm fetch` | Downloads only the harness packages in the lock, without a full install, and checks their integrity ([04-outputs.md](04-outputs.md#42-stable-package-paths)). For review bots and CI jobs that do not install dependencies, and for a clone that an agent uses without installing it. |
| `harnesspm help` | Every command. Inside a project, or with `-C`, also the project's packages, one line each ([below](#the-project-in-help)). |
| `harnesspm help <package \| rule ID \| tool>` | A package's rules, docs, tools, MCP servers, skills and hooks in full, one rule, or a tool's usage and run command ([below](#help-for-a-package-a-rule-or-a-tool)). Needs no install. |

### `-C <dir>`

`-C <dir>` goes before the command, as in `git -C`: harnesspm acts as if it started in `<dir>`. It works with every command, such as `help`, `fetch`, `run`, `mcp`, `why`, `status` and `doctor`.

```bash
npx -y @tenphi/harnesspm -C work/app help
npx -y @tenphi/harnesspm -C work/app run uikit:colors surface
```

- `run` keeps the caller's folder for the script, so file arguments stay valid. `HARNESSPM_PROJECT_DIR` is the named project.
- The `run` event goes to the named project's telemetry handler. Its `run`, `help` and `why` events carry `outside: true` when the caller's folder is outside the project ([14.2](14-telemetry.md#142-events)).
- Hooks and allow rules of the named project do not apply: the agent reads them only from the folder its session starts in ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#outside-the-start-folder)).
- harnesspm runs as the version npx started. It does not hand off to the named project's installed copy.

### The project in `help`

Inside a project, or with `-C`, `help` ends with a "This project" section. It gives each package of the dependency and project layers one line, across all workspaces: what it covers (its `description` in `plugin.json`, else the titles of its always-on rules), how many rules, tools, MCP servers, skills and hooks it has, and the `help <package>` command that prints the rest.

```text
This project: app (work/app)
Paths start at the current folder. The tools run here too, with -C.

- @acme/ui — Acme UI. 1 rule, docs, 1 tool, 1 skill: `npx -y @tenphi/harnesspm -C work/app help @acme/ui`
```

### Help for a package, a rule or a tool

`help <target>` prints one part of the project's harness. A command name, such as `help sync`, still prints that command's help.

| Target | What `help` prints |
| --- | --- |
| A package, by its npm name or plugin name | Everything it contributes, with the project's `patch`, `replace` and `exclude` applied, and nothing left out: each rule in full, with how it becomes active and who changed it; its docs index; its tools, each with its description, its `usage` and the exact `run` command; its MCP servers; its skills, with the path of each `SKILL.md`; the hooks it registers. When the package is not trusted, the tools, MCP servers and hooks carry a line that says so. |
| A rule ID, such as `acme-ui:rules/usage` | That rule in full. |
| A tool, as `<plugin>:<script>` or by its ID | Its description, its `usage` ([5.1](05-executables.md#51-scripts)), its `answers` and the exact `run` command. Without a `usage`, it says that none is declared. With `answers`, an `Exit:` line says that those codes are answers, such as "found problems", not a broken tool. The tool line in `help <package>` and the managed block stays one line and leaves them out. It never runs the script, so it works without an install. |

For every target:

- Commands carry `-C <dir>` when `help` was given one, and paths start at the caller's folder, as in the project section.
- `help` needs no install: it reads the lock and the fetched packages. When the project has neither an install nor fetched packages, `help` fetches first, which only downloads and checks integrity.
- Each run sends a `help` event to the project's handler ([14.2](14-telemetry.md#142-events)), so a team can see whether agents follow the block's pointers.

Package managers run these scripts on a full install, but not on `npm install <pkg>`, `npm uninstall` or `pnpm add`, so run `npx harnesspm sync` after those. `sync --check` in CI catches a missed one. `postinstall` would also run when others install a published package, so `init` uses it only in a private package; Yarn 2 and later run `postinstall` but not `prepare` ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/package-managers.md)).

### The install hook

`init` adds this command, after any script that is already there:

```shell
node -e "try{require.resolve('@tenphi/harnesspm/package.json');process.exit(1)}catch{}" || harnesspm sync
```

1. harnesspm is a dev dependency. An install without dev dependencies, such as `npm ci --omit=dev`, `pnpm install --prod` or `yarn install --production`, still runs the project's own scripts, but has no `harnesspm` command. The `node -e` part ends with success exactly then, so `||` skips the sync and the install goes on.
2. When harnesspm is installed, the `node -e` part fails, so the sync runs. A failing sync MUST still fail the install.
3. After an existing script, the hook goes in parentheses: `patch-package && (… || harnesspm sync)`. Without them, a failure of `patch-package` would run the sync, and the sync's success would hide it.
4. `node -e`, `||` and parentheses work in sh, Windows cmd and Yarn's own shell. `|| true` would not: cmd has no `true` command.
5. Older versions of `init` wrote the hook as plain `harnesspm sync`, which fails such an install. `init` replaces that form, alone or after ` && `, and `doctor` warns about it. A script that runs `harnesspm sync` in any other form stays as it is.

The `node -e` part resolves `@tenphi/harnesspm/package.json` from the project folder. So the package's `exports` field MUST export `./package.json`. It does, next to `./telemetry` ([14.9](14-telemetry.md#149-events-from-a-projects-own-tools)).

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
| 🔒 Local files | Every per-machine file on disk is ignored by git and not tracked. The files are the ones harnesspm lists in `.git/info/exclude`, plus `harnesspm.local.json`, `CLAUDE.local.md`, `.claude/settings.local.json` and a telemetry file. Git answers, so `.gitignore`, `.git/info/exclude` and a global excludes file all count. | A file is tracked (fix: `git rm --cached`), or not ignored (fix: `sync` for a file harnesspm writes, otherwise a `.gitignore` entry). When a `!` pattern brings a file back, it names the pattern and its file. Outside a git repository it only warns. |
| ➕ Harnesses of your own | The clone's exclude file can be written. Each added harness is on this machine. | The exclude file cannot be written, or an added harness is missing. |
| 📦 Outputs | Committed outputs are up to date, as `sync --check` checks. Per-machine links and generated files are in place. `AGENTS.md` fits in Codex's 32 KiB, and Codex reaches every managed block ([4.9](04-outputs.md#49-size-limits)). | A committed output or the lock is out of date. Four problems only warn: missing per-machine outputs, because `sync` writes them; an `AGENTS.md` over 32 KiB; a managed block that Codex never reads, or reads only in part; and an [install hook](#the-install-hook) in the old form, which fails an install without dev dependencies. |
| 🛡️ Trust | Entries that wait for trust or for a person, with a held telemetry handler: the list that `sync` prints. | Never: these are warnings ([10.4](#104-exit-codes)). |

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
