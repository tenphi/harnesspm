---
description: What a project gets from the harness of its dependencies, how upgrades show up in review, and what to run after an install.
---

# Use a package's harness

**In short**

- After `npx harnesspm init`, every full install gives your agents the harness of the versions you installed.
- Your agents read rules and pointers in `AGENTS.md`, and skills, sub-agents and tools in their own folders.
- Upgrades show up in pull requests as changes to the managed block and the lock.

Set the project up first with [Getting started](./getting-started.mdx).

## Which packages count

harnesspm reads the `dependencies`, `devDependencies` and `optionalDependencies` of your project. Each one that has a `harness/` folder is a harness package. A package also brings the harness of the packages it lists in `extends`. Nothing else reaches you: a library's own development tools never do.

harnesspm only reads files. It never runs code from a package to find its harness.

## What your agents get

| Unit | How the agent gets it |
| --- | --- |
| Always-on rule | Its text is in the managed block in `AGENTS.md`. |
| File-scoped rule | A pointer line in the block. Claude Code also loads it by itself when it works on a matching file. |
| On-demand rule | A pointer line with a description. The agent reads it when it is relevant. |
| Docs | One pointer line to an index of the package's docs, at the installed version. |
| Skill | A link in `.claude/skills/` and `.agents/skills/`. The agent loads it when it fits the task. |
| Sub-agent | A file in `.claude/agents/` and `.codex/agents/`. |
| Script | A line in the block with the command that runs it, once the package is trusted. |
| Hook, MCP server, permission | Entries in each agent's settings, once the package is trusted. |

Every line in the block ends with the unit's ID, such as `glaze:rules/colors`. `npx harnesspm why <ID>` finds its source. The [package format](https://github.com/tenphi/harnesspm/blob/main/docs/spec/02-package-format.md#24-unit-kinds) lists every kind.

## Stable paths

Package managers put packages in different places. harnesspm links each harness package to one stable path in `node_modules/.harnesspm/pkgs/`, and the block uses only these paths. So the same block works on every machine and with every package manager.

A job that does not install dependencies, such as a review bot, runs `npx -y @tenphi/harnesspm fetch`. It downloads only the harness packages in the lock, checks their integrity, and fills the same paths. The lock takes each package's integrity from `package-lock.json`, `pnpm-lock.yaml` or Yarn 1's `yarn.lock`. With Yarn 4, `fetch` downloads without that check and says so for each package.

## Upgrades

- A full install (`npm install`, `npm ci`, `pnpm install`, `yarn`) runs `harnesspm sync` for you.
- `npm install <pkg>`, `npm uninstall <pkg>`, `pnpm add <pkg>` and `pnpm remove <pkg>` run no scripts. Run `npx harnesspm sync` after them.
- Yarn 4 runs `postinstall` but not `prepare`. In a published package, where `init` uses `prepare`, run `yarn harnesspm sync` after installs. See [package managers](https://github.com/tenphi/harnesspm/blob/main/docs/research/package-managers.md).

The pull request shows the change. The block names each package's version, and the lock records every unit's hash:

```diff
-## @tenphi/tasty 3.19.0
+## @tenphi/tasty 3.19.1
```

When an upgrade changes a section that your patch replaces or removes, `sync` warns and names the section, because your patch may be out of date.

## One version per package

The block points at one path per package, so harnesspm uses one version of each package in a repository. A direct dependency wins. Otherwise the copy closest to your project in the `extends` chain wins, then the highest version. harnesspm warns and names the versions. See [one package, several versions](https://github.com/tenphi/harnesspm/blob/main/docs/spec/03-resolution.md#35-one-package-several-versions).

## Keep the always-on text small

Always-on text is in every session. `npx harnesspm status` reports its size for each agent:

```text
📏 always-on     Codex 3.1 KiB of 32 KiB · Claude Code 51 lines
```

Codex reads `AGENTS.md` files up to 32 KiB by default and cuts off the rest. `status` warns when `AGENTS.md` comes close to that limit and says when it is over, and `doctor` warns too. Claude Code's docs advise under about 200 lines per `CLAUDE.md`. Both facts have sources in [agent capabilities](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md). To drop a package or a unit you do not need, see [Change upstream units](./change-upstream.md).

## More

- [Resolution](https://github.com/tenphi/harnesspm/blob/main/docs/spec/03-resolution.md) in the specification: layers, `extends` and priority.
- [Outputs](https://github.com/tenphi/harnesspm/blob/main/docs/spec/04-outputs.md) in the specification: every file harnesspm writes for each agent.
