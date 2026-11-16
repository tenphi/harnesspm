# harnesspm

**Harness management for npm packages.**

A **harness** is everything a coding agent needs to use a library well: rules, docs, skills, sub-agents, scripts, hooks, MCP servers and permissions. A library ships it in its npm package. harnesspm gives it to Claude Code and Codex on every install, for the version you installed.

> 🧪 harnesspm is an experimental tool. Its formats and commands can still change.

📚 Docs: **[harnesspm.tenphi.me](https://harnesspm.tenphi.me)**. Getting started, guides and a reference.

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

`init` creates `harnesspm.json` and runs `harnesspm sync` after every full install. Commit `AGENTS.md`, `CLAUDE.md`, `harnesspm.json` and `harnesspm.lock.json`. Or ask your agent to do it: [Getting started](https://harnesspm.tenphi.me/getting-started/) has the prompt.

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

`npx harnesspm help` lists every command. [CHANGELOG.md](CHANGELOG.md) lists the changes.

## Requirements

- **Node.js** 20 or later.
- **Package managers:** npm, pnpm, Yarn 1 and Yarn 4 (node-modules linker).
- **Agents:** Claude Code and Codex. Other agents that read `AGENTS.md` and `.agents/skills` get the portable parts.

## Learn more

- 📚 [The docs site](https://harnesspm.tenphi.me): getting started, guides and a reference.
- 📐 [The specification](docs/spec/README.md): every format, rule and command. Each chapter opens with a short summary. It ships in the npm package, so agents read the version you installed.
- 🔬 [The research notes](docs/research/): the sources behind every statement about the agents.
- 🧩 [Projects that ship a harness](https://harnesspm.tenphi.me/#in-real-projects), as working examples.

## Name

**harnesspm** stands for *harness package manager*, in the line of npm and pnpm. It is written in lowercase. The npm package is `@tenphi/harnesspm`, and the command is `harnesspm`. The extension namespace is `dev.harnesspm`.
