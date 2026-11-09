# Tack — the harness package manager

> **Status: specification draft.** There is no code yet. This repository holds the design that the first implementation will follow.

Tack moves an **AI harness** between projects through npm packages. A harness is everything an AI coding agent needs to work well with a codebase: rules, docs, skills, sub-agents, scripts, hooks, MCP servers and permissions.

```
 PRODUCER                         TACK                               CONSUMER
 (a library: Tasty, UI Kit…)      (npm i -D @tenphi/tack)             (an app, another library…)

 ships a harness/ folder  ──▶  tack sync (runs on install) ──▶  AGENTS.md block    (Codex + Claude Code)
 in its npm package              • finds harness in dependencies     .claude/…, .codex/…, .agents/skills
 (an Agent Plugins plugin)       • follows extends chains            docs pinned to installed versions
                                 • applies overrides and trust       scripts, hooks, MCP, permissions
                                 • adds your personal layer          your own rules and skills on top
```

## Why

Today a library's agent guidance reaches its users by hand: copied rule files that drift, symlinks into `node_modules`, hand-written indexes, and the same rule written again for every agent. Tack replaces that with one mechanism:

- **Libraries** add a `harness/` folder to their npm package.
- **Libraries that build on other libraries** pass the upstream harness on and add their own.
- **Apps** install Tack once. After every install, each agent sees the right rules, docs and tools for the versions that are installed.
- **Developers** add a personal layer from their own repository, on a laptop or in a cloud session, and can push changes back to it.

## First targets

- **Agents:** Claude Code and Codex. Other agents that read `AGENTS.md` and `.agents/skills` get the portable parts for free.
- **Package managers:** npm, pnpm and Yarn (node-modules linker).

## Read the specification

Start with [docs/spec/README.md](docs/spec/README.md).

| Document | What it covers |
| --- | --- |
| [Overview](docs/spec/01-overview.md) | Goals, non-goals, terms, base scenarios |
| [Package format](docs/spec/02-package-format.md) | The `harness/` folder: an Agent Plugins plugin plus the Tack extension |
| [Resolution](docs/spec/03-resolution.md) | Layers, `extends`, overrides, versions, monorepos |
| [Outputs](docs/spec/04-outputs.md) | What Tack writes for Claude Code and Codex |
| [Executables](docs/spec/05-executables.md) | Scripts, hooks, MCP servers, permissions |
| [Trust and lock](docs/spec/06-trust.md) | Approvals, hashes, CI checks |
| [Personal harness](docs/spec/07-personal.md) | Your own layer, and how to edit and push it |
| [Cloud sessions](docs/spec/08-cloud.md) | Claude Code and Codex cloud environments |
| [CLI](docs/spec/09-cli.md) | Commands |
| [Standards](docs/spec/10-standards.md) | Which open standards Tack uses and where it goes beyond them |
| [Dogfooding](docs/spec/11-dogfooding.md) | How this repository uses and publishes its own harness |
| [Open questions](docs/spec/12-open-questions.md) | Memory, naming, and other undecided points |

Background research lives in [docs/research/](docs/research/).

## Name

**Tack** is the gear of a horse, harness included. It also means to *tack on* (add a layer) and to *pin* something in place (pin versions). The package is `@tenphi/tack` and the command is `tack`.
