# 10. CLI

**In short**

- Every task starts with one command, `npx -y @harnesspm/cli`. In a project it prints the project's report; elsewhere, what the folder is and the task for it, each with the one command that starts it. Every command's output names the next step ([below](#where-every-task-starts)).
- Projects use `init`, `sync`, `status`, `doctor`, `why`, `approve` and `run`. Jobs that do not install dependencies use `fetch`.
- From outside a project, such as a repository that cloned it, add `-C <dir>` before the command. `help` lists the project's packages, and `help <package>` prints one in full.
- `help <tool>` prints a tool's usage, its answer exit codes and its run command, without running it.
- Authors use `check` and `new`.
- People use `add`, `remove` and `update` for harnesses on top of the repository's.
- Saving changes to a harness is not a harnesspm command. The owner's rules decide it ([08-improving.md](08-improving.md)).
- The npm package is `@harnesspm/cli`. Up to 0.16 it was `@tenphi/harnesspm`, which harnesspm still recognizes until 1.0 ([below](#moving-from-tenphiharnesspm)).

The npm package is `@harnesspm/cli`, and the command it installs is `harnesspm`. `npx -y @harnesspm/cli …` works everywhere: in a project that depends on it, npx runs the installed version, and elsewhere it downloads the package by its full name. Every text, message, block and hook that harnesspm writes uses this one form ([4.6](04-outputs.md#46-managed-blocks)). It never writes the bare `npx harnesspm …`: that works only in a project that depends on harnesspm, and elsewhere npx would fetch whatever is published under the unscoped name, without asking in a hook. An allow rule always has the prefix of the command it allows.

`npx -y @harnesspm/cli --help` lists every command, and `<command> --help` shows one. Inside a project, or with `-C`, `help` lists the project's packages ([below](#the-project-in-help)) and points at `--help`; elsewhere it lists every command. `help <package | rule ID | tool>` prints one of them in full ([below](#help-for-a-package-a-rule-or-a-tool)). A message that names a step for a person, such as trusting a package or approving what an agent could not grant, says that a person takes it, and names `approve` for every step that a person's run of harnesspm takes. An agent reads every message too, and must not take that step as its own.

### Where every task starts

`npx -y @harnesspm/cli`, without a command, is where every task starts. The site shows this command, and the CLI, versioned with the package, holds the steps. In a project that uses harnesspm (a `harnesspm.json` in the folder or above it), it prints the project's report ([10.5](#105-the-report)). Elsewhere it writes nothing and prints at most 12 lines: harnesspm's version, what the folder is, its tasks with the likeliest first, each with the one command that starts it, who decides what runs, and where every command and the docs are.

| The folder | What it says | Its tasks, in order |
| --- | --- | --- |
| A package that does not use harnesspm | Which dependencies ship a harness | `init`, `new rule usage`, `add <source>`, a harness of your own (`new rule workflow`) |
| A package with `harness/` | It shares a harness | `check`, `init` to see the harness as its users' agents will, `new <kind> <name>`, `add <source>` |
| A parent folder ([4.10](04-outputs.md#410-sessions-that-start-in-a-parent-folder)) | The projects right below it | `sync`, `-C <project> help`, `add <source>` |
| A folder with `harness/` and no `package.json` | It is a harness, not a project | `check`, `new <kind> <name>`, `add <the folder>`, which a person runs |
| Any other folder | It is not a project | `new rule workflow`, `add <source>`, then `init` and `new rule usage` in a project or package |

```text
$ npx -y @harnesspm/cli
harnesspm 0.17.0: rules, docs, skills and tools from npm packages, for Claude Code and Codex.
This folder (app) does not use harnesspm. 3 dependencies ship a harness: @acme/ui, @acme/colors, @acme/styles.

Pick the task, run its command, and follow what it prints:
  Give this project's agents its dependencies' harness   npx -y @harnesspm/cli init
  Share a harness from this package                      npx -y @harnesspm/cli new rule usage
  Add your own or your team's harness, on every repo     npx -y @harnesspm/cli add <github:owner/repo | folder>
  Start a harness of your own, in an empty folder        npx -y @harnesspm/cli new rule workflow

A person decides what runs: they add a harness and trust a package. An agent asks first.
Every command: npx -y @harnesspm/cli --help · Docs: https://harnesspm.tenphi.me
```

The command that a task starts with prints the next step in turn: `init` its report, `new` the steps for the folder (10.2), and an error the command that fixes it. One module, `src/start.ts`, holds these texts.

## 10.1 Projects

| Command | What it does |
| --- | --- |
| `harnesspm init` | Sets up the project, in this order. (1) When its `package.json` does not list `@harnesspm/cli` in `dependencies`, `devDependencies` or `optionalDependencies`, it installs the package as a dev dependency, at its own version or a later compatible one, with the project's package manager: the one of its lockfile, else of its `packageManager` field, else npm (`npm i -D`, `pnpm add -D`, `yarn add -D`, `bun add -d`; `-w` at a pnpm workspace root, `-W` at a Yarn 1 one). The script that `init` adds calls the `harnesspm` command, so the next install would fail without the package. (2) It creates `harnesspm.json`, adds the [install hook](#the-install-hook) to the `postinstall` script of a private package or to `prepare` otherwise, unless a Yarn plugin already runs harnesspm (point 7), makes `CLAUDE.md` import `AGENTS.md`, and adds `/.harnesspm/` to the `.gitignore` of the project folder when no `.gitignore` ignores that folder ([4.3](04-outputs.md#43-project-outputs), note 8). (3) It runs `harnesspm sync`. (4) It reports what it wrote, the tools of each package that is not trusted, with what each does and whether it runs without a prompt, the committed files ([1.7](01-overview.md#17-what-is-committed)) that git sees as new or changed, the check for CI, and what the agent does next. It MUST stop before it changes anything when the install fails, and when the project uses Yarn Plug'n'Play, which writes no `node_modules`. An agent's run installs too: the person asked for the setup. Trust and the entries that only a person grants stay with the person ([06-trust.md](06-trust.md#62-trusting-a-package)). |
| `harnesspm sync` | Resolves the layers and writes all outputs. Runs on every install. In a repository that does not use harnesspm (it has no `harnesspm.json`), or whose dependencies are not installed, it writes only the per-machine outputs of added harnesses, so it never wipes the committed block. When an agent runs it, new allow rules, hooks and MCP servers stay pending outside the reviewed state, and the line under "Waiting for a person" says what differs and names `approve` ([06-trust.md](06-trust.md#62-trusting-a-package)). With `CI=true`, it writes only the per-machine outputs and leaves the committed ones to `sync --check` ([06-trust.md](06-trust.md#64-ci)). In a parent folder, which is not in a git repository and has projects right below it, it writes their hooks and a pointer block for sessions that start there, and a project's sync keeps its entries there current. With added harnesses, it also writes their per-machine outputs in each git repository right below the folder ([4.10](04-outputs.md#410-sessions-that-start-in-a-parent-folder)). |
| `harnesspm sync --check` | Writes nothing and ignores added harnesses, as every run with `CI=true` does. Fails when a committed output or the lock is out of date. For CI. |
| `harnesspm sync --write` | Writes the committed outputs with `CI=true` too, for a job that commits them. `init`, `approve` and `new` always write them. |
| `harnesspm status` | The project's report ([10.5](#105-the-report)): layers, packages and versions, changes that added harnesses make, always-on size per agent, telemetry, the checks that the repository is ready for harnesses, its own and a person's, and everything that waits for a person. The bare command prints it in a project. Exits `0`. |
| `harnesspm doctor` | The same report. Exits `1` when a check fails; what waits for a person does not fail. |
| `harnesspm why <ID>` | Owner, source, repository and whether the unit is editable ([08-improving.md](08-improving.md#81-find-the-source)). Works for every unit ID ([2.8](02-package-format.md#28-unit-ids)), also for a unit of a project entry that does not apply here ([8.1](08-improving.md#81-find-the-source)). For a script, also the command that runs it; for a script, hook, MCP server or sub-agent of a dependency, whether its package is trusted. |
| `harnesspm approve [<package>]` | The person's step. Writes the entries that a model run held back, and the tools of a package that a person just added to `trust`, then records a `"pin"` package's new version as approved in the lock. It syncs as a person's `sync` does. A person runs it, not an agent. |
| `harnesspm run [--agent <agent>] <plugin>:<script> [-- args]` | Runs a script ([05-executables.md](05-executables.md#51-scripts)) in the caller's folder. Hooks pass `--agent`, which sets `HARNESSPM_AGENT`. Without an install, it runs the script from the [fetched packages](01-overview.md#15-terms). When there are none, it says so and names `fetch` and the install, not `No script`. |
| `harnesspm fetch` | Downloads only the harness packages in the lock, without a full install, and checks their integrity ([04-outputs.md](04-outputs.md#42-stable-package-paths)). Writes their docs copies, which search tools find ([4.3](04-outputs.md#43-project-outputs), note 8). For review bots and CI jobs that do not install dependencies, and for a clone that an agent uses without installing it. |
| `harnesspm help` | Inside a project, or with `-C`, the project's packages, one line each ([below](#the-project-in-help)), and a pointer to `--help`. Elsewhere, every command, as `--help` prints. |
| `harnesspm help <package \| rule ID \| tool>` | A package's rules, docs, tools, MCP servers, skills and hooks in full, one rule, or a tool's usage and run command ([below](#help-for-a-package-a-rule-or-a-tool)). Needs no install. |

### `-C <dir>`

`-C <dir>` goes before the command, as in `git -C`: harnesspm acts as if it started in `<dir>`. It works with every command, such as `help`, `fetch`, `run`, `mcp`, `why`, `status` and `doctor`.

```bash
npx -y @harnesspm/cli -C work/app help
npx -y @harnesspm/cli -C work/app run uikit:colors surface
```

- `run` keeps the caller's folder for the script, so file arguments stay valid. `HARNESSPM_PROJECT_DIR` is the named project. A hook (`run --agent`) from outside the project runs in the project, and not for a file outside it ([4.10](04-outputs.md#410-sessions-that-start-in-a-parent-folder)).
- The `run` event goes to the named project's telemetry handler. Its `run`, `help` and `why` events carry `outside: true` when the caller's folder is outside the project ([14.2](14-telemetry.md#142-events)).
- Hooks and allow rules of the named project do not apply: the agent reads them only from the folder its session starts in ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#outside-the-start-folder)). A `sync` in that folder writes the project's hooks there ([4.10](04-outputs.md#410-sessions-that-start-in-a-parent-folder)).
- harnesspm runs as the version npx started. It does not hand off to the named project's installed copy.

### The project in `help`

Inside a project, or with `-C`, `help` prints a "This project" section. It gives each package of the dependency and project layers one line, across all workspaces: what it covers (its `description` in `plugin.json`, else the titles of its always-on rules), how many rules, tools, MCP servers, skills and hooks it has, and the `help <package>` command that prints the rest.

```text
This project: app (work/app)
Paths start at the current folder. The tools run here too, with -C.

- @acme/ui — Acme UI. 1 rule, docs, 1 tool, 1 skill: `npx -y @harnesspm/cli -C work/app help @acme/ui`

A tool's options: `npx -y @harnesspm/cli -C work/app help <tool>`. Run a tool: `npx -y @harnesspm/cli -C work/app run <tool> [args]`.
Every command: `npx -y @harnesspm/cli --help`.
```

### Help for a package, a rule or a tool

`help <target>` prints one part of the project's harness. A command name, such as `help sync`, still prints that command's help.

| Target | What `help` prints |
| --- | --- |
| A package, by its npm name or plugin name | Everything it contributes, with the project's `patch`, `replace` and `exclude` applied, and nothing left out: each rule in full, with how it becomes active and who changed it; its docs index; its tools, each with its description, its `usage`, the exact `run` command and `no prompt` when it asks to run without one (`allow`, [5.4](05-executables.md#54-permissions)); its MCP servers; its skills, with the path of each `SKILL.md`; the hooks it registers. When the package is not trusted, the tools, MCP servers and hooks carry a line that says so. |
| A rule ID, such as `acme-ui:rules/usage` | That rule in full. |
| A tool, as `<plugin>:<script>` or by its ID | Its description, its `usage` ([5.1](05-executables.md#51-scripts)), whether it runs without a prompt, its `answers` and the exact `run` command. Without a `usage`, it says that none is declared. With `answers`, an `Exit:` line says that those codes are answers, such as "found problems", not a broken tool. The tool line in `help <package>` and the managed block stays one line and leaves them out. It never runs the script, so it works without an install. |

For every target:

- Commands carry `-C <dir>` when `help` was given one, and paths start at the caller's folder, as in the project section.
- In a workspace, `help` and `why` use the rule text resolved for that workspace. At the repository root, they use the root's version when it has one and label differing workspace versions for a rule the root does not use.
- `help` needs no install: it reads the lock and the fetched packages. When the project has neither an install nor fetched packages, `help` fetches first, which only downloads and checks integrity.
- Each run sends a `help` event to the project's handler ([14.2](14-telemetry.md#142-events)), so a team can see whether agents follow the block's pointers.

Package managers run these scripts on a full install, but not on `npm install <pkg>`, `npm uninstall` or `pnpm add`, so run `npx -y @harnesspm/cli sync` after those. `sync --check` in CI catches a missed one. `postinstall` would also run when others install a published package, so `init` uses it only in a private package; Yarn 2 and later run `postinstall` but not `prepare` ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/package-managers.md)).

### The install hook

`init` adds this command, after any script that is already there:

```shell
node -e "try{require.resolve('@harnesspm/cli/package.json');process.exit(1)}catch{}" || harnesspm sync
```

1. harnesspm is a dev dependency. An install without dev dependencies, such as `npm ci --omit=dev`, `pnpm install --prod` or `yarn install --production`, still runs the project's own scripts, but has no `harnesspm` command. The `node -e` part ends with success exactly then, so `||` skips the sync and the install goes on.
2. When harnesspm is installed, the `node -e` part fails, so the sync runs. A failing sync MUST still fail the install.
3. After an existing script, the hook goes in parentheses: `patch-package && (… || harnesspm sync)`. Without them, a failure of `patch-package` would run the sync, and the sync's success would hide it.
4. `node -e`, `||` and parentheses work in sh, Windows cmd and Yarn's own shell. `|| true` would not: cmd has no `true` command.
5. Older versions of `init` wrote the hook as plain `harnesspm sync`, which fails such an install. `init` replaces that form, alone or after ` && `, and `doctor` warns about it. A script that runs `harnesspm sync` in any other form stays as it is.
6. The `node -e` part names the package that the project lists. A project that still lists `@tenphi/harnesspm` gets a hook for that name. A hook for a name the project no longer lists would skip every sync, so `init` replaces it with the hook for the listed name, and `doctor` warns about it.
7. A project may sync on install another way: a Yarn plugin in `.yarnrc.yml` that runs `harnesspm sync` after every install. When the path or spec of a plugin there names harnesspm, `init` adds no hook, which would sync a second time on each install, and says so ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/package-managers.md)).

The `node -e` part resolves `@harnesspm/cli/package.json` from the project folder. So the package's `exports` field MUST export `./package.json`. It does, next to `./telemetry` ([14.9](14-telemetry.md#149-events-from-a-projects-own-tools)).

`harnesspm mcp [--agent <agent>] <plugin>:<server>` also exists. Agents call it to start stdio MCP servers. `harnesspm track --agent <agent>` is the command of harnesspm's own telemetry hooks ([14.4](14-telemetry.md#144-agent-events)). People do not need either.

### Moving from `@tenphi/harnesspm`

Up to version 0.16, the package was `@tenphi/harnesspm`. From 0.17 it is `@harnesspm/cli`, with the same command, `harnesspm`, and the same versions, so a project moves with one install:

```shell
npm i -D @harnesspm/cli && npm rm @tenphi/harnesspm
npx -y @harnesspm/cli init
```

A machine with an added harness ([07-added.md](07-added.md)) runs one command once, because its user-level hook still runs the earlier package:

```shell
npx -y @harnesspm/cli update
```

`init` updates the install hook; the next `sync` rewrites the rest. Until then, and until harnesspm 1.0, harnesspm treats the earlier name as its own:

| Where the earlier name is | What harnesspm does |
|---|---|
| The installed CLI file, `node_modules/@tenphi/harnesspm/dist/cli.js` | Hooks and MCP servers start it when `@harnesspm/cli` is not installed ([5.2](05-executables.md#52-hooks)). |
| Hook commands and allow rules with `npx -y @tenphi/harnesspm` or that file | They grant the same as the current form. So `sync` replaces them even in a run of the agent's model, and nothing is held back ([6.2](06-trust.md#62-trusting-a-package), rule 4). |
| The user-level `SessionStart` hook, `npx -y @tenphi/harnesspm update` or `sync` | It runs the earlier package, whose versions cannot rewrite it. A person runs `npx -y @harnesspm/cli update` once on each machine with an added harness; that run replaces it with `npx -y @harnesspm/cli update` ([7.5](07-added.md#75-applying-in-every-repository)). A later sync of the new version by a person, a setup script or a hook does the same. |
| The project's `package.json` | `init` and the `harnesspm` command accept either name. `doctor` warns that the package moved and names the two commands above. |
| The install hook | See [the install hook](#the-install-hook), point 6. |
| Both packages installed | They ship the same harness, so `@harnesspm/cli` gives it and the other is left out, with no plugin name clash. |
| `$schema` in `harnesspm.json` | The earlier URL keeps working, because the registry keeps the earlier package. `doctor` names the current one. |

`@tenphi/harnesspm` is deprecated on npm, with a message that names the new package and both commands above. No release of the new code goes out under the earlier name. Its versions stay installable. harnesspm 1.0 drops the earlier name: the list `OLD_PACKAGE_NAMES` in `src/util.ts` holds it.

## 10.2 Authors

| Command | What it does |
| --- | --- |
| `harnesspm check [<folder>]` | Validates a harness and its project entries ([02-package-format.md](02-package-format.md#210-validation)) and warns about files that look like secrets. Prints the always-on size of the harness and of each entry. Run it at `prepack`. |
| `harnesspm new <kind> <name> [--to <plugin>] [--entry]` | `<kind>` is `rule`, `skill`, `agent` (a sub-agent), `script`, `hook` or `mcp`. Writes a valid unit from a template, and creates `harness/plugin.json` when the project has none. A skill's name gets the plugin name in front. `--to <plugin>` writes it into an added harness, `--to <plugin> --entry` into its entry for this repository, which holds rules, skills, sub-agents and docs. |
| `harnesspm new patch <rule ID> [--to <plugin>] [--entry]` | Writes a patch with a copy of the rule's sections, or of the whole rule when it has none, and registers it: in `harness/plugin.json` (file in `harness/dev.harnesspm/patches/`) when the rule reaches the project through its own harness's `extends`, so users get the change too; otherwise in `harnesspm.json` (file in `harnesspm/patches/`); with `--to <plugin>`, in that added harness. Edit the sections to change and delete the others. |

## 10.3 People

| Command | What it does |
| --- | --- |
| `harnesspm add <source> [--local] [--no-hook]` | Adds a harness on top of the repository's: with user scope, or with `--local` for this repository only. Installs the `SessionStart` hook ([07-added.md](07-added.md#75-applying-in-every-repository)) and prints the added always-on rules. |
| `harnesspm remove <source> [--local]` | Removes it and its outputs. With the last harness with user scope, the hook and write access go too. |
| `harnesspm update` | Fetches new versions of added harnesses and rewrites their outputs. Prints what changed for each, such as `updated a1b2c3d → e4f5a6b`. Skips working copies with uncommitted changes or unpushed commits and lists them. The `SessionStart` hook runs it ([7.5](07-added.md#75-applying-in-every-repository)): without a person at a terminal, git never prompts, a fetch stops after 30 seconds, and one that fails is a warning, not an error. |

## 10.4 Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. Pending trust is not an error. |
| `1` | Error: invalid harness, failed check. |
| `2` | `harnesspm run` refused a script ([05-executables.md](05-executables.md#51-scripts)). When a hook calls it, `2` also blocks the event: harnesspm fails closed. |

## 10.5 The report

`npx -y @harnesspm/cli status`, `doctor` and the bare command in a project print one report. It answers three questions: what the project gives its agents, whether a person can work here with harnesses, the repository's and their own, without per-machine files reaching a commit, and what waits for a person.

It opens with one line each for the dependencies, the project's changes, the units that added harnesses change (`✏️ changed here`), the always-on size per agent, and telemetry when the project configures it: on, held or off on this machine. The checks follow:

| Group | Check | Fails when |
| --- | --- | --- |
| 🔒 Local files | Every per-machine file on disk is ignored by git and not tracked. The files are the ones harnesspm lists in `.git/info/exclude`, plus `harnesspm.local.json`, `CLAUDE.local.md`, `.claude/settings.local.json` and a telemetry file. Git answers, so `.gitignore`, `.git/info/exclude` and a global excludes file all count. | A file is tracked (fix: `git rm --cached`), or not ignored (fix: `sync` for a file harnesspm writes, otherwise a `.gitignore` entry). When a `!` pattern brings a file back, it names the pattern and its file. Outside a git repository it only warns. |
| ➕ Harnesses of your own | The clone's exclude file can be written. Each added harness is on this machine. | The exclude file cannot be written, or an added harness is missing. |
| 📝 Outputs | Committed outputs are up to date, as `sync --check` checks. Per-machine links and generated files are in place, with the entries that the default branch records ([6.2](06-trust.md#62-trusting-a-package), rule 4). `AGENTS.md` fits in Codex's 32 KiB, and Codex reaches every managed block ([4.9](04-outputs.md#49-size-limits)). | A committed output or the lock is out of date. These only warn: missing per-machine outputs and entries, because `sync` writes them; an `AGENTS.md` over or close to 32 KiB; a managed block that Codex never reads, or reads only in part, or that starts past line 30; and an [install hook](#the-install-hook) in the old form, which fails an install without dev dependencies. |
| ⏳ Waiting for a person | Packages that are not trusted, `"pin"` versions that are not approved, and entries that an agent's run held back, a held telemetry handler first: the list that `sync` prints. Each line names the person's step: trust, then `approve`; in a Claude Code cloud session, the line for the setup script ([9.1](09-cloud.md#91-the-repositorys-harness)). | Never: these are not problems ([10.4](#104-exit-codes)). |

```text
$ npx -y @harnesspm/cli doctor
📦 dependencies  @acme/ui 4.2.0 → @acme/colors 2.1.0, @acme/styles 3.4.1
🏢 project       harnesspm.json: no changes
📏 always-on     Codex 1.7 KiB of 32 KiB · Claude Code 31 lines
🔒 Local files
  ❌ CLAUDE.local.md is tracked by git, so a commit can include this machine's files, and harnesspm writes no added harnesses into it. Run `git rm --cached CLAUDE.local.md` and commit.
➕ Harnesses of your own
  ✅ .git/info/exclude can be written, so harnesspm keeps per-machine files out of git
  ✅ Added: alex (github:alex/harness, user)
📝 Outputs
  ✅ Committed outputs are up to date
  ✅ 40 per-machine outputs in place
⏳ Waiting for a person
  - @acme/styles: 1 script, 1 hook (not trusted). A person adds "@acme/styles": true to "trust" in harnesspm.json, then runs `npx -y @harnesspm/cli approve`.

❌ 1 problem. Each line above says how to fix it.
```

`status` exits `0`. `doctor` exits `1` when a check fails, so a job can gate on it. The report never edits `.gitignore`, never untracks a file and never writes outputs. `sync` writes, and the person decides the rest.
