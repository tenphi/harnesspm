# 1. Overview

**In short**

- A library ships a `harness/` folder in its npm package. A project installs harnesspm. After every install, Claude Code and Codex see the harness of the versions that are installed.
- There are three layers: **dependencies**, **project** and **added** harnesses. Each layer can add units, and replace, patch or drop units of the layers below.
- An agent can improve any harness: a dependency's (upstream), the project's (in the repository), or a person's (in that person's own repository). The owner's own rules decide how a change is saved.

## 1.1 Problem

A library knows how it should be used. An agent that works in a project using that library does not, unless someone tells it. Today that knowledge travels by hand:

- Rules are copied between repositories and drift apart.
- Docs are reached through hand-made symlinks and hand-written indexes that fall behind.
- A library that builds on another library restates or vendors the upstream material.
- The same rule is written once per agent.
- A developer's own workflow and context live in places that cloud sessions and other projects cannot see.

[research/motivating-case.md](https://github.com/tenphi/harnesspm/blob/main/docs/research/motivating-case.md) shows these problems in a real chain of packages.

## 1.2 How it works

### Share (export)

A library adds a folder and publishes as usual.

```text
my-lib/
├── package.json        "files": [..., "harness"], "prepack": "harnesspm check"
└── harness/
    ├── plugin.json     name, and which packages it builds on ("extends")
    ├── skills/…        Agent Skills
    └── dev.harnesspm/
        └── rules/…     Markdown rules
```

### Start

```bash
npx -y @harnesspm/cli
```

Every task starts with this one command. In a project it prints the project's report. Elsewhere it says what the folder is and names the command that starts each task, and that command prints the next step ([10.1](10-cli.md#where-every-task-starts)).

### Use (import)

```bash
npx -y @harnesspm/cli init
```

`init` installs `@harnesspm/cli` as a dev dependency, then sets the project up. Every full install, such as `npm install` or `pnpm install`, then runs `harnesspm sync`. It finds the harness of each dependency, follows `extends` chains, applies the project's changes, and writes each agent's native files. The project commits the generated block in `AGENTS.md` and `harnesspm.lock.json`, so upgrades show up in pull requests.

### Add on top

```bash
npx -y @harnesspm/cli add github:alex/harness
```

The person's workflow rules, context notes and skills now apply to every project on this machine, and project-specific entries to their projects. The project repository does not change.

### Improve

```bash
npx -y @harnesspm/cli why tasty:rules/state-maps
```

`why` names the unit's owner and source. The agent edits the source and proposes the change the way the owner's rules say. The default is a branch and a pull request.

## 1.3 Goals

1. **One folder to share.** Standard formats. No new runtime dependency for the library.
2. **Harness passes through dependency chains**, and each package can change what it passes on.
3. **Install once, stay current**, at the installed versions.
4. **One source, every agent.** Native files for Claude Code and Codex first.
5. **Executables are first-class and safe:** scripts, hooks, MCP servers and permissions behind an explicit trust model.
6. **Added harnesses**, such as a team's or a person's own, that never change the project's repository and also work in Claude Code cloud sessions.
7. **Every harness can be improved by an agent**, under its owner's rules.
8. **Standards first. harnesspm uses itself.**

## 1.4 Non-goals

- **A registry.** npm, git and folders are the sources.
- **A new rule language.** Rules are Markdown. Skills follow Agent Skills.
- **The agent's own memory.** Notes that Claude Code or Codex save by themselves stay with the agent. A person's workflow and context belong in their own added harness.
- **Git hosting.** harnesspm does not call GitHub, GitLab or any other host. Agents use their own tools to push and open pull requests.
- **Sandboxing.** Agents keep their own sandboxes and approval prompts.
- **Codex Cloud, in v1.** Codex is supported on a person's computer. See [13.12](13-open-questions.md#1312-removed-in-review).

## 1.5 Terms

| Term | Meaning |
| --- | --- |
| **Harness** | Everything an agent needs for a codebase: rules, docs, skills, sub-agents, scripts, hooks, MCP servers, permissions. |
| **Harness package** | An npm package, git repository or folder that has a `harness/` folder. |
| **Plugin name** | The `name` in a harness's `plugin.json`. It starts every unit ID of that harness. |
| **Unit** | One item in a harness, such as one rule or one script. Each unit has an ID, such as `uikit:rules/forms`. |
| **Patch** | A Markdown file that replaces, adds or removes sections of a rule and keeps the rest. |
| **Layer** | Where units come from: dependencies, project or added harnesses. A higher layer can drop, replace or patch units of the layers below. |
| **Added harness** | A harness that a person adds on their machine, on top of the repository's, such as a team's or their own. Never committed. Several can be stacked. |
| **Scope** | Where an added harness applies: **user** (every repository on the machine) or **local** (one repository). |
| **Owner** | The harness a unit comes from: a dependency, the project, or an added harness. The owner's rules decide how its units change. |
| **Source** | Where something is read from: the file of a unit, or the git repository, folder or npm package of an added harness. Outputs are generated from sources. |
| **Project entry** | A folder in an added harness with units for one repository, matched by its git remote. |
| **Output** | A file or block harnesspm writes for an agent. Never edited by hand. |
| **Managed block** | The part of a Markdown file that harnesspm writes, between `BEGIN:harnesspm` and `END:harnesspm` markers. |
| **Block commands** | The lines at the top of a committed managed block. They say how to list the harness, print a package's rules and tools with `help <package>`, print a tool's options with `help <tool>`, run a tool, and add `-C <path>` from another folder, such as a repository that cloned this one. |
| **Fetched package** | A harness package that `harnesspm fetch` downloaded into `node_modules/.harnesspm/fetched/`, without its dependencies. A project without an install reads and runs its harness from fetched packages. |
| **Docs copy** | A copy of a dependency's docs pages in `.harnesspm/docs/<plugin name>/` at the project root, which `sync` and `fetch` write on each machine. Agents' search tools skip what git ignores and hidden folders, so a `.rgignore` lets them into that one folder ([4.3](04-outputs.md#43-project-outputs), note 8). Never committed. |
| **Install hook** | The command that `init` adds to the project's `postinstall` or `prepare` script. It runs `harnesspm sync` on every full install, and skips it when harnesspm is not installed. |
| **Lock** | `harnesspm.lock.json`: the committed record of harness packages and unit hashes. |
| **Executable unit** | A script, hook, MCP server or allow permission. Needs trust. |
| **Trust** | A project's consent, in `harnesspm.json`, for a package's executable units to run. |
| **Pending** | An executable unit that harnesspm does not write yet: its package is not trusted, a `"pin"` package has a new version, or the agent's model started the run outside the reviewed state. |
| **Reviewed state** | The repository's trust inputs as the remote default branch has them, with the lock that the install reproduces. A run by the agent's model may write what it records. |
| **Event** | A record of one harness interaction, such as a script run or an agent reading a rule. Sent only when the project turns on telemetry. |
| **Answer** | An exit code that a script declares as the tool doing its job, not failing, such as `1` for a lint that found problems or `2` for a hook that blocks. Listed in the script's `answers`. |
| **Handler** | The command or file that gets a project's events. Named in `harnesspm.json`, and active only as a person's sync recorded it in the lock. |
| **Telemetry** | The events a project collects about how agents and people use its harness. Off unless the project turns it on. |
| **Parent folder** | A folder that is not in a git repository, with projects or other git repositories right below it, such as `/home/user` in a Claude Code cloud session with several repositories, or a person's folder of clones. A session that starts there reads no settings of the projects, so `sync` in it writes their hooks there, and applies the added harnesses in each repository below it ([4.10](04-outputs.md#410-sessions-that-start-in-a-parent-folder)). |
| **Worktree** | A second checkout of a repository that `git worktree add` makes, with its own folder and branch, such as the one the Claude Code desktop app makes for a session. Its `.git` is a file that points into the main checkout's `.git/worktrees/`. |

## 1.6 Base scenarios

Every feature serves at least one of these. Each must take as few steps as possible.

| # | Scenario | What the person does |
| --- | --- | --- |
| S1 | A library shares its harness | Adds `harness/` and lists it in `files`. |
| S2 | A library builds on upstream harness | Lists the upstream packages in `extends`, adds its own units. |
| S3 | A project uses the harness of its dependencies | `npx -y @harnesspm/cli init`, once. It installs harnesspm, and its report says what to commit and what waits for the person. |
| S4 | A project changes one upstream rule | One `patch` for a few sections, or one `replace` or `exclude` entry. |
| S5 | A project upgrades a dependency | Nothing after a full install. After `npm install <pkg>` or `pnpm add`, `npx -y @harnesspm/cli sync`. The pull request shows what changed. |
| S6 | Several repositories share a policy | A harness-only package, added as a dev dependency. |
| S7 | A monorepo | Nothing. Each workspace gets the harness of its own dependencies. |
| S8 | A library ships a tool for agents | A script in the harness. Projects that trust the package can run it. |
| S9 | A person adds a harness on top, such as their team's or their own | `npx -y @harnesspm/cli add <source>`, once per machine. |
| S10 | A person keeps workflow and context outside project repositories | Rules and notes in their own added harness, with project entries. |
| S11 | An agent improves a harness | Edits the source that `harnesspm why` names, then saves under the owner's rules. |
| S12 | A person works in a Claude Code cloud session | The project's install in the environment's setup script, by absolute path. For an added harness, the same `add` there, or asked of the agent. |
| S13 | A job reads the harness without an install, such as a review bot | `npx -y @harnesspm/cli fetch`. |
| S14 | A team sees how agents use its harnesses | `telemetry` in `harnesspm.json` with a handler, then `npx -y @harnesspm/cli sync`. |
| S15 | An agent finds a harness unit that is wrong, missing or failing | Nothing in harnesspm. The project's own rule tells agents where to report, and `harnesspm why` gives the details. |
| S16 | A person checks that a repository is ready for a harness of their own, and that no per-machine file can reach a commit | `npx -y @harnesspm/cli doctor`, or the bare command in a project, which prints the same report. |
| S17 | A teammate's merged change adds a hook, an MCP server or an allow rule | Nothing. The next install writes it on every machine, also when an agent runs the install. |
| S18 | An agent clones the repositories its task needs, such as into `work/app`, and uses their harnesses from its own folder | Nothing in the cloning repository. The block commands in the clone's `AGENTS.md` say how: `npx -y @harnesspm/cli -C work/app help` lists its packages, `-C work/app help <package>` prints one, and `-C work/app run <unit>` runs a tool, also before the clone is installed. Hooks of the clone run there only after a `sync` in that folder (S20). |
| S19 | A repository has many harness packages or workspaces, and its `AGENTS.md` must stay inside the agents' limits | Nothing. The managed block names each rule and tool in one line. Agents print a package's rules with `help <package>` and a tool's options with `help <tool>`. |
| S20 | A session starts in a folder above several repositories, such as a Claude Code cloud session with more than one, a person's folder of clones, or a job runner's work folder | `npx -y @harnesspm/cli sync` in that folder, after the installs: in the environment's setup script, once on a person's machine, or in the runner's checkout step. Each repository's hooks run there, and a block in that folder's `AGENTS.md` names each repository and its `help` command. A later sync of a repository keeps its entries there current. The `SessionStart` hook of an added harness syncs that folder too, so each repository gets its project entry. |
| S21 | An agent looks for a dependency's docs with its search tool, not through the block | Nothing: `init` adds one `/.harnesspm/` line to `.gitignore`, so formatters skip the copies. `sync` and `fetch` copy every dependency's docs into `.harnesspm/docs/`, and a `.rgignore` that git ignores lets search tools in. |

## 1.7 What is committed

| Committed | Per machine (excluded through `.git/info/exclude`) |
| --- | --- |
| `harnesspm.json`, `harnesspm.lock.json`, the managed blocks in `AGENTS.md`, the `@AGENTS.md` lines in `CLAUDE.md` files (at the root and next to each nested `AGENTS.md`) | Everything else: links, docs copies, agent settings, `.codex/`, outputs of added harnesses |

Committed files depend only on the dependency and project layers, so every teammate and CI produce the same result. Only `init` edits `.gitignore`: it adds the one line `/.harnesspm/` when no `.gitignore` ignores that folder, and `.gitignore` is then among the files to commit. `sync` never edits it, and warns while the line is missing.
