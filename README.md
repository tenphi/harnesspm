# harnesspm — the harness package manager

> **Status: a working proof of concept of the [specification](docs/spec/README.md) (0.7 draft).** It covers every scenario. Expect changes before 1.0.

The docs site is **[harnesspm.tenphi.me](https://harnesspm.tenphi.me)**: getting started, guides, a reference and the specification.

harnesspm moves an **AI harness** between projects through npm packages. A harness is everything an AI coding agent needs to work well with a codebase: rules, docs, skills, sub-agents, scripts, hooks, MCP servers and permissions.

## How it works

| Flow | Who | What they do |
| --- | --- | --- |
| 📤 **Share** | A library | Adds a `harness/` folder to its npm package. It can pass on the harness of the libraries it builds on (`extends`). |
| 📥 **Use** | A project | `npm i -D @tenphi/harnesspm` and `npx harnesspm init`. After every install, Claude Code and Codex see the harness of the installed versions. |
| ➕ **Add on top** | A person | `npx harnesspm add github:me/harness`. A team's or their own workflow, context and tools apply on top, without changing the project's repository. |
| 🛠️ **Improve** | An agent | `npx harnesspm why <unit>` finds the source. The agent edits it and saves the change the way the owner's rules say, by default with a pull request. |

```
dependencies (harness/ in node_modules, through extends)
      ▼
project      (harnesspm.json, the project's own harness/)          → AGENTS.md block + harnesspm.lock.json, committed
      ▼
added        (harnesses you add: your team's, your own)       → per-machine files, never committed
```

## Quick start

In a project:

```bash
npm i -D @tenphi/harnesspm
npx harnesspm init
```

`init` creates `harnesspm.json` and runs `harnesspm sync` after every full install. Commit `AGENTS.md`, `CLAUDE.md`, `harnesspm.json` and `harnesspm.lock.json`.

In a library, to share its harness:

```bash
npx harnesspm new rule usage
npx harnesspm check
```

Add `"harness"` to the `files` field of `package.json`. To add your own or your team's harness on top of every repository on your machine:

```bash
npx harnesspm add github:<owner>/<repo>
```

To see how agents use the harness, a team can turn on telemetry in `harnesspm.json`. It is off by default, sends events only to the team's own handler (a command or a file), and never sends arguments or file contents. See [chapter 14](docs/spec/14-telemetry.md).

Node.js 20 or later. `npx harnesspm help` lists every command. [CHANGELOG.md](CHANGELOG.md) lists the changes.

## First targets

- **Agents:** Claude Code and Codex. Other agents that read `AGENTS.md` and `.agents/skills` get the portable parts.
- **Package managers:** npm, pnpm, Yarn 1 and Yarn 4 (node-modules linker).

## Proof of concept

| Milestone | Scenarios | Status |
| --- | --- | --- |
| 1. Team harness: `init`, `sync`, `sync --check`, `status`, `why`, `check` | S1–S6 | ✅ |
| 2. Added harnesses: `add`, `remove`, `update`, project entries, the `SessionStart` hook | S9, S10, S12 | ✅ |
| 3. Executables and trust: `run`, hooks, MCP servers, permissions, `approve` | S8 | ✅ |
| 4. Agents and the rest: Claude Code reading the outputs, monorepos, `fetch`, `new` | S7, S11, S13 | ✅ |

## Read the specification

Start with [docs/spec/README.md](docs/spec/README.md). Every chapter opens with a short summary.

| Chapter | What it covers |
| --- | --- |
| [1. Overview](docs/spec/01-overview.md) | How it works, goals, terms, base scenarios |
| [2. Package format](docs/spec/02-package-format.md) | The `harness/` folder: an Agent Plugins plugin plus the harnesspm extension |
| [3. Resolution](docs/spec/03-resolution.md) | Layers, `extends`, overrides, versions, monorepos |
| [4. Outputs](docs/spec/04-outputs.md) | What harnesspm writes for Claude Code and Codex |
| [5. Executables](docs/spec/05-executables.md) | Scripts, hooks, MCP servers, permissions |
| [6. Trust and lock](docs/spec/06-trust.md) | What may run, and how changes are reviewed |
| [7. Added harnesses](docs/spec/07-added.md) | A team's or a person's workflow, context and tools, added on top of a repository |
| [8. Improving a harness](docs/spec/08-improving.md) | How agents change any harness under its owner's rules |
| [9. Cloud sessions](docs/spec/09-cloud.md) | Claude Code cloud environments (Codex Cloud is not in v1) |
| [10. CLI](docs/spec/10-cli.md) | Commands |
| [11. Standards](docs/spec/11-standards.md) | Which open standards harnesspm uses and where it goes beyond them |
| [12. Dogfooding](docs/spec/12-dogfooding.md) | How this repository uses and publishes its own harness |
| [13. Open questions](docs/spec/13-open-questions.md) | Undecided points, and options removed in review |
| [14. Telemetry](docs/spec/14-telemetry.md) | Opt-in events about how agents and people use a harness |

Background research lives in [docs/research/](docs/research/).

## Name

**harnesspm** stands for *harness package manager*, in the line of npm and pnpm. It is written in lowercase. The npm package and the command are both `harnesspm`, and the extension namespace is `dev.harnesspm`, based on the domain `harnesspm.dev`.
