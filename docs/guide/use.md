---
description: What a project gets from the harness of its dependencies, how upgrades show up in review, and what to run after an install.
---

# Use a package's harness

**In short**

- After `npx -y @harnesspm/cli init`, every full install gives your agents the harness of the versions you installed.
- Your agents read rules and pointers in `AGENTS.md`, and skills, sub-agents and tools in their own folders.
- Upgrades show up in pull requests as changes to the managed block and the lock.

Set the project up first with [Get started](./setup.md).

## Which packages count

harnesspm reads the `dependencies`, `devDependencies` and `optionalDependencies` of your project. Each one that has a `harness/` folder is a harness package. A package also brings the harness of the packages it lists in `extends`. Nothing else reaches you: a library's own development tools never do.

harnesspm only reads files. It never runs code from a package to find its harness.

## What your agents get

| Unit | How the agent gets it |
| --- | --- |
| Always-on rule | One line in the managed block in `AGENTS.md`: its title and section headings. The agent reads the text with `npx -y @harnesspm/cli help <package>`. |
| File-scoped rule | A pointer line in the block. Claude Code also loads it by itself when it works on a matching file. |
| On-demand rule | A pointer line with a description. The agent reads it when it is relevant. |
| Docs | One pointer line to an index of the package's docs, at the installed version. |
| Skill | A link in `.claude/skills/` and `.agents/skills/`. The agent loads it when it fits the task. |
| Sub-agent | A file in `.claude/agents/` and `.codex/agents/`. |
| Script | A tool line in the block, once the package is trusted. `npx -y @harnesspm/cli help <tool>` prints its usage and command. |
| Hook, MCP server, permission | Entries in each agent's settings, once the package is trusted. |

The block starts with the commands that reach the rest: `help` lists the packages, `help <package>` prints a package's rules, docs, tools, MCP servers, skills and hooks, with your patches applied, and `help <tool>` prints a tool's usage. Every line in the block ends with the unit's ID, such as `acme-colors:rules/usage`. `npx -y @harnesspm/cli why <ID>` finds its source. The [package format](https://github.com/tenphi/harnesspm/blob/main/docs/spec/02-package-format.md#24-unit-kinds) lists every kind.

## Stable paths

Package managers put packages in different places. harnesspm links each harness package to one stable path in `node_modules/.harnesspm/pkgs/`, and the block uses only these paths. So the same block works on every machine and with every package manager.

A job that does not install dependencies, such as a review bot, runs `npx -y @harnesspm/cli fetch`. It downloads only the harness packages in the lock, checks their integrity, and fills the same paths. It runs no package code. The lock takes each package's integrity from `package-lock.json`, `pnpm-lock.yaml` or Yarn 1's `yarn.lock`. With Yarn 4, `fetch` downloads without that check and says so for each package.

## From another folder

An agent often works in a clone below its session's folder, such as `work/app`, when the repository it starts in tells it to clone what a task needs. The cloning repository needs nothing from harnesspm. The commands at the top of the clone's managed block tell the agent what to do:

```bash
npx -y @harnesspm/cli -C work/app help                          # the clone's packages, one line each
npx -y @harnesspm/cli -C work/app help @acme/ui                 # one package's rules, docs, tools and skills
npx -y @harnesspm/cli -C work/app help acme-ui:tokens           # a tool's usage, without running it
npx -y @harnesspm/cli -C work/app run acme-ui:tokens surface    # run it, from the session's folder
```

- `-C <dir>` goes before the command, as in `git -C`. Every command takes it.
- The script runs in the current folder, so file arguments stay valid. The `run` event goes to the clone's telemetry handler.
- A clone that is not installed works too. `help` fetches its harness packages first, and `help <tool>` never runs the script; fetching only downloads and checks integrity. Self-contained scripts then run. A script that needs a package of the clone's install says so and names the install command.
- The clone's hooks and allow rules do not apply: agents read them only from the folder the session starts in. A sync in that folder fixes the hooks, below.

### Sessions that start above your repositories

When you start sessions in a folder that holds several clones, such as `~/work` with `app` and `ui-kit` in it, run this once there, after the clones are installed:

```bash
cd ~/work && npx -y @harnesspm/cli sync
```

- Each repository's hooks then run in sessions that start in `~/work`, with `-C <repository>`, so edit checks and telemetry work there too.
- A block in `~/work/AGENTS.md`, which `~/work/CLAUDE.md` imports, names each repository, its `AGENTS.md` and its `help` command, so the agent knows where the rules are.
- Each repository's own sync, such as its install's, keeps its entries there current. Allow rules, MCP servers and skills stay in the repositories.
- A job runner that starts in a work folder runs the same command in its checkout step, after the install. The outputs reach the session at its next start or resume; tools work at once through the block commands.
- Keep the block near the top of `AGENTS.md`: agents often read only the first lines. `status` warns when the block starts past line 30.

## Upgrades

A full install runs `harnesspm sync` for you. [Keep it current](./setup.md#4-keep-it-current) lists the installs that run no script, and what to run after them.

The pull request shows the change. The lock records each package's version and every unit's hash. The block names no versions, so it changes only when a rule, a doc or a tool does. Here `@acme/ui` 4.3.0 changed only its `tokens` script:

```diff
     "@acme/ui": {
-      "version": "4.2.0",
+      "version": "4.3.0",
       "plugin": "acme-ui"
 …
     "acme-ui:scripts/tokens": {
       "kind": "scripts",
-      "hash": "54ba39c0298593bc"
+      "hash": "45e6351947d862a9"
```

When an upgrade changes a section that your patch replaces or removes, `sync` warns and names the section, because your patch may be out of date.

## One version per package

The block points at one path per package, so harnesspm uses one version of each package in a repository. A direct dependency wins. Otherwise the copy closest to your project in the `extends` chain wins, then the highest version. harnesspm warns and names the versions. See [one package, several versions](https://github.com/tenphi/harnesspm/blob/main/docs/spec/03-resolution.md#35-one-package-several-versions).

## Keep the always-on text small

Always-on text is in every session. The managed block names each rule and tool in one line, so it stays small with many packages and workspaces. `npx -y @harnesspm/cli status` reports the size for each agent:

```text
📏 always-on     Codex 1.7 KiB of 32 KiB · Claude Code 31 lines
```

Codex reads `AGENTS.md` files up to 32 KiB by default and cuts off the rest. The report that `status` and `doctor` print warns when `AGENTS.md` comes close to that limit and says when it is over. It also names each harnesspm block that Codex never reaches, such as one after long hand-written text, and say that agents can still get it with `help <package>`. Move that block to the top of the file: `sync` keeps it there. Claude Code's docs advise under about 200 lines per `CLAUDE.md`. Both facts have sources in [agent capabilities](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md). To drop a package or a unit you do not need, see [Change upstream units](./change-upstream.md).

## More

- [Resolution](https://github.com/tenphi/harnesspm/blob/main/docs/spec/03-resolution.md) in the specification: layers, `extends` and priority.
- [Outputs](https://github.com/tenphi/harnesspm/blob/main/docs/spec/04-outputs.md) in the specification: every file harnesspm writes for each agent.
