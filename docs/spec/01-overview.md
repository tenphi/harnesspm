# 1. Overview

## 1.1 Problem

A library knows how it should be used. An AI agent that works in a project using that library does not, unless someone tells it. Today that knowledge travels by hand:

- Rules are copied from one repository to another and then drift apart.
- Docs are reached through symlinks into `node_modules`, which break when nothing is installed.
- Index files that list a library's docs are written by hand and fall behind the library.
- A library that builds on another library restates the upstream rules, or vendors the upstream docs into its own package.
- The same rule is written once per agent: for Claude Code, for Codex, for Cursor.
- Scaffolding writes agent files once and never updates them.
- Developers keep their own rules and skills in private, unshared places that do not exist in cloud sessions.

[research/motivating-case.md](../research/motivating-case.md) shows these problems in a real chain of packages.

## 1.2 Goals

1. **A library ships its harness in its npm package.** One folder, standard formats, no extra dependency for the library.
2. **Harness passes through dependency chains.** A library can pass on the harness of the libraries it builds on, change it and add its own.
3. **Install once, stay current.** After each install, every agent sees the harness of the versions that are installed.
4. **One source, every agent.** Tack writes each agent's native files. The first targets are Claude Code and Codex.
5. **Executables are first-class and safe.** Scripts, hooks, MCP servers and permissions ship with the rest, behind an explicit trust model.
6. **Every developer can add a personal layer.** It comes from a git-ignored folder or from the developer's own repository, works in cloud sessions, and can be edited and pushed back.
7. **Standards first.** Tack uses existing open standards wherever they fit and adds only what they do not cover.
8. **Tack uses itself.** This repository consumes its own harness and publishes it with the package.

## 1.3 Non-goals

- **A registry.** npm is the registry. Git and local folders are the other sources.
- **A new rule language.** Rules are Markdown. Skills follow the Agent Skills format.
- **Running an agent.** Tack prepares files. The agent reads them.
- **Sandboxing.** Tack decides what is installed and trusted. Agents keep their own sandboxes and approval prompts.
- **Memory in v1.** What "memory" should mean is an open question. See [12-open-questions.md](12-open-questions.md#121-memory).

## 1.4 Terms

| Term | Meaning |
| --- | --- |
| **Harness** | Everything an agent needs for a codebase: rules, docs, skills, sub-agents, scripts, hooks, MCP servers, permissions. |
| **Harness package** | An npm package, git repository or folder that ships a `harness/` folder. |
| **Unit** | One item in a harness: one rule, one skill, one script, one hook, one MCP server. Each unit has an ID. |
| **Producer** | A package author who ships a harness. |
| **Consumer** | A project that receives harness from its dependencies. A package can be both. |
| **Layer** | One source of units with a fixed priority: global personal, dependencies, project, local personal. |
| **Personal harness** | A harness that belongs to one developer, not to the team. |
| **Output** | A file Tack writes for an agent, such as a block in `AGENTS.md` or a link in `.claude/skills/`. |
| **Executable unit** | A script, hook, MCP server or permission. These need trust. |
| **Text unit** | A rule, doc or sub-agent definition. Skills are text units, even when they bundle scripts for the agent to run. |

## 1.5 Base scenarios

Each scenario must take as few steps as possible. These are the cases the design optimizes for.

| # | Scenario | What the person does |
| --- | --- | --- |
| S1 | A library shares its harness | Adds a `harness/` folder and lists it in `files`. |
| S2 | A library builds on upstream harness | Adds `extends` with the upstream package names, then its own units. |
| S3 | An app receives everything | Runs `npm i -D @tenphi/tack` and `npx tack init` once. |
| S4 | An app changes one upstream rule | Adds one `replace` or `exclude` entry. |
| S5 | An app upgrades a dependency | Nothing. The install re-syncs, and the pull request diff shows what changed in the harness. |
| S6 | Several repositories share a policy | Publish a harness-only package and add it as a dev dependency. |
| S7 | A monorepo | Nothing. Each workspace gets the harness of its own dependencies. |
| S8 | A library ships a tool | Adds a script and marks it for the agent. Consumers that trust the package can run it. |
| S9 | A developer adds a personal layer | Runs `npx tack personal add <source>` once. |
| S10 | A developer improves their personal harness | Edits it from any project, then runs `npx tack personal push`. |
| S11 | A developer works in a cloud session | Adds the same `personal add` command to the cloud environment's setup script, or asks the agent to run it. |

## 1.6 Shape of the solution

```
                 ┌─────────────────────────────────────────────┐
  layer 1        │ 🌍 global personal   ~/.tack/config.json      │  lowest priority
  layer 2        │ 📦 dependencies      harness/ in node_modules │
  layer 3        │ 🏢 project           tack.json + harness/     │
  layer 4        │ 🙋 local personal    tack.local.json          │  highest priority
                 └───────────────────────┬─────────────────────┘
                                         │ tack sync
          ┌──────────────────────────────┼──────────────────────────────┐
          ▼                              ▼                              ▼
   committed team files          per-machine files               user-level files
   AGENTS.md block               links, .codex/, local settings   ~/.claude, ~/.codex
   .claude/settings.json         CLAUDE.local.md                  (global personal)
   .mcp.json, tack.lock.json     AGENTS.override.md
```

- Committed files depend only on layers 2 and 3, so every teammate and CI produce the same result.
- Per-machine files are excluded from git through `.git/info/exclude`. Tack never edits `.gitignore`.
- The details are in [03-resolution.md](03-resolution.md) and [04-outputs.md](04-outputs.md).
