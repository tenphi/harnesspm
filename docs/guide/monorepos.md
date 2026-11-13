---
description: How harnesspm resolves each workspace of a monorepo on its own dependencies, and where it writes the outputs.
---

# Monorepos

**In short**

- Nothing to configure. Run `npx harnesspm init` at the root, as in any project.
- Each workspace gets the harness of its own dependencies. Backend workspaces do not get frontend rules.
- Shared units go into the root `AGENTS.md`. A workspace with its own units gets its own block.

## Workspaces

harnesspm reads workspaces from the `workspaces` field of the root `package.json`, or from `pnpm-workspace.yaml`. It resolves each workspace from its own folder, on its own `dependencies`, `devDependencies` and `optionalDependencies`.

## Where outputs go

| Output | Where |
| --- | --- |
| Units that the root reaches, or that every workspace shares | The root `AGENTS.md` block |
| Units of one workspace | A block in `<workspace>/AGENTS.md`, with paths relative to that folder |
| `CLAUDE.md` with `@AGENTS.md` | Next to each workspace `AGENTS.md`, and each nested `AGENTS.md` that git tracks |
| Skills, scripts, hooks, MCP servers, permissions | The root, where both agents read them |

Codex joins `AGENTS.md` files from the root down to the folder it works in. Claude Code does not read a nested `AGENTS.md` when the root has a `CLAUDE.md`, so harnesspm makes a `CLAUDE.md` next to it import it, also for an `AGENTS.md` you wrote yourself ([sources](../research/agent-capabilities.md#instructions)). Commit both files. A block that becomes empty is removed, and so is a file that held only the block.

## Your own workspaces

A workspace's own `harness/` belongs to that workspace. A workspace that another workspace depends on is still your own code, so its harness is in the project layer and trusted. It needs no `trust` entry.

## One version per package

Outputs point at one path per package, so the whole repository uses one version of each harness package. A workspace's direct dependency wins, then the copy closest in the `extends` chain, then the highest version. harnesspm warns and names the versions.

## More

- [Monorepos in Resolution](../spec/03-resolution.md#36-monorepos) and [in Outputs](../spec/04-outputs.md#45-monorepos).
