# Tack — the harness package manager

> **Status: specification draft.** There is no code yet. This repository holds the design that the first implementation will follow.

Tack moves an **AI harness** between projects through npm packages. A harness is everything an AI coding agent needs to work well with a codebase: rules, docs, skills, sub-agents, scripts, hooks, MCP servers and permissions.

## How it works

| Flow | Who | What they do |
| --- | --- | --- |
| 📤 **Share** | A library | Adds a `harness/` folder to its npm package. It can pass on the harness of the libraries it builds on (`extends`). |
| 📥 **Use** | A project | `npm i -D @tenphi/tack` and `npx tack init`. After every install, Claude Code and Codex see the harness of the installed versions. |
| 🙋 **Add your own** | A person | `npx tack personal add github:me/harness`. Their workflow, context and tools apply on top, without changing the project's repository. |
| 🛠️ **Improve** | An agent | `npx tack why <unit>` finds the source. The agent edits it and saves the change the way the owner's rules say, by default with a pull request. |

```
dependencies (harness/ in node_modules, through extends)
      ▼
project      (tack.json, the project's own harness/)          → AGENTS.md block + tack.lock.json, committed
      ▼
personal     (your harness: everywhere, or for this project)  → per-machine files, never committed
```

## First targets

- **Agents:** Claude Code and Codex. Other agents that read `AGENTS.md` and `.agents/skills` get the portable parts.
- **Package managers:** npm, pnpm and Yarn (node-modules linker).

## Read the specification

Start with [docs/spec/README.md](docs/spec/README.md). Every chapter opens with a short summary.

| Chapter | What it covers |
| --- | --- |
| [1. Overview](docs/spec/01-overview.md) | How it works, goals, terms, base scenarios |
| [2. Package format](docs/spec/02-package-format.md) | The `harness/` folder: an Agent Plugins plugin plus the Tack extension |
| [3. Resolution](docs/spec/03-resolution.md) | Layers, `extends`, overrides, versions, monorepos |
| [4. Outputs](docs/spec/04-outputs.md) | What Tack writes for Claude Code and Codex |
| [5. Executables](docs/spec/05-executables.md) | Scripts, hooks, MCP servers, permissions |
| [6. Trust and lock](docs/spec/06-trust.md) | What may run, and how changes are reviewed |
| [7. Personal harness](docs/spec/07-personal.md) | A person's workflow, context and tools, outside project repositories |
| [8. Improving a harness](docs/spec/08-improving.md) | How agents change any harness under its owner's rules |
| [9. Cloud sessions](docs/spec/09-cloud.md) | Claude Code and Codex cloud environments |
| [10. CLI](docs/spec/10-cli.md) | Commands |
| [11. Standards](docs/spec/11-standards.md) | Which open standards Tack uses and where it goes beyond them |
| [12. Dogfooding](docs/spec/12-dogfooding.md) | How this repository uses and publishes its own harness |
| [13. Open questions](docs/spec/13-open-questions.md) | Undecided points, and options removed in review |

Background research lives in [docs/research/](docs/research/).

## Name

**Tack** is the gear of a horse, harness included. It also means to *tack on* (add a layer) and to *pin* something in place (pin versions). The package is `@tenphi/tack` and the command is `tack`.
