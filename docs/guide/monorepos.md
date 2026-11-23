---
description: How harnesspm resolves each workspace of a monorepo on its own dependencies, and where it writes the outputs.
---

# Monorepos

**In short**

- Nothing to configure. Run `npx harnesspm init` at the root, as in any project.
- Each workspace gets the harness of its own dependencies. Backend workspaces do not get frontend rules.
- Shared rules with the same text go into the root `AGENTS.md`. Workspace rules and overrides go in workspace blocks.

## Workspaces

harnesspm reads workspaces from the `workspaces` field of the root `package.json`, or from `pnpm-workspace.yaml`. It resolves each workspace from its own folder, on its own `dependencies`, `devDependencies` and `optionalDependencies`.

A package can patch or replace a rule in the workspaces where it passes on that rule through `extends`. Run `harnesspm help <rule ID>` from the workspace, or use `harnesspm -C <workspace> help <rule ID>`, to see the text and who changed it.

Each agent gets one version of a skill, linked at the root. If some consumers resolve a replacement and others resolve the original or a different replacement, harnesspm keeps the original, warns during sync, and explains the choice in `harnesspm why <skill ID>`.

## Where outputs go

| Output | Where |
| --- | --- |
| Units that the root reaches, or that every workspace shares, when their content is the same | The root `AGENTS.md` block |
| Workspace units and rules with different text across workspaces | A block in `<workspace>/AGENTS.md`, with paths relative to that folder |
| `CLAUDE.md` with `@AGENTS.md` | Next to each workspace `AGENTS.md`, and each nested `AGENTS.md` that git tracks |
| A `## Workspaces` section that names each workspace with a block | The root `AGENTS.md` block, first |
| Skills, scripts, hooks, MCP servers, permissions | The root, where both agents read them |

Codex joins `AGENTS.md` files from the root down to the folder it works in. Claude Code does not read a nested `AGENTS.md` when the root has a `CLAUDE.md`, so harnesspm makes a `CLAUDE.md` next to it import it, also for an `AGENTS.md` you wrote yourself ([sources](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#instructions)). Commit both files. A block that becomes empty is removed, and so is a file that held only the block.

Claude Code loads a workspace's block only when the agent opens a file there with its file tools, not when it works through the shell. So the always-on root block names the workspaces that have one, and asks the agent to read that `AGENTS.md` before it changes files there.

## Your own workspaces

A workspace's own `harness/` belongs to that workspace. A workspace that another workspace depends on is still your own code, so its harness is in the project layer and trusted. It needs no `trust` entry.

## One version per package

Outputs point at one path per package, so the whole repository uses one version of each harness package. A workspace's direct dependency wins, then the copy closest in the `extends` chain, then the highest version. harnesspm warns and names the versions.

## More

- Monorepos in the specification's [Resolution](https://github.com/tenphi/harnesspm/blob/main/docs/spec/03-resolution.md#36-monorepos) and [Outputs](https://github.com/tenphi/harnesspm/blob/main/docs/spec/04-outputs.md#45-monorepos) chapters.
