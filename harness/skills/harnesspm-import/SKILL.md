---
name: harnesspm-import
description: Set up harnesspm in a project, take agent harness from its dependencies, trust packages that ship tools, or add a harness on top, such as the user's team's or their own. Use when the user asks to use a package's agent rules or tools, to set up harnesspm, or to add a harness in this project or session.
---

# Using harness in a project

## 1. Set up the project (once)

```bash
npm i -D @tenphi/harnesspm
npx harnesspm init
```

`init` adds `harnesspm sync` to the `postinstall` script of a private package, or to `prepare` otherwise, so every full install updates the agent files. The `node -e` check in front of it skips the sync when harnesspm is not installed, as in `npm ci --omit=dev`. Keep it: a plain `harnesspm sync` fails such installs. When `doctor` reports the plain form, run `npx harnesspm init` again. After `npm install <pkg>` or `pnpm add`, run `npx harnesspm sync` yourself. Commit `package.json` and the package manager's lockfile, `harnesspm.json`, `harnesspm.lock.json`, the `AGENTS.md` block and the `CLAUDE.md` files that import `AGENTS.md`, also the ones next to nested `AGENTS.md` files.

In CI, run `npx harnesspm sync --check` after the install. With `CI=true`, `sync` leaves committed files as they are, so the check sees a missed sync. A job that commits them runs `npx harnesspm sync --write`.

## 2. Check what arrived

Run `npx harnesspm status`. It lists the packages, pending tools and the always-on size.

- **Pending tools** come from packages the project does not trust yet. Ask the user before adding a package to `trust` in `harnesspm.json`, and say what each tool does: `harness/plugin.json` of its package has each script's `description`, and `"allow": true` when it asks to run without a prompt.
- **You cannot grant permissions.** When you run harnesspm, new allow rules, hooks and MCP servers stay pending, unless the default branch already records them. The held-back line says what differs. Ask the user to run `npx harnesspm approve` in their own terminal. In a Claude Code cloud session, where the user has no terminal, give them the line that harnesspm prints for the environment's setup script instead. Do not edit agent settings files to work around it.
- **One upstream rule does not fit** the project: run `npx harnesspm new patch <rule ID>` and edit only the sections that differ. Use a `replace` entry in `harnesspm.json` to change a whole rule or skill, or an `exclude` entry to drop a unit.
- **A job that does not install dependencies**, such as a review bot, runs `npx -y @tenphi/harnesspm fetch` first.
- **You work in a clone below your session's folder**, such as `work/app`: run `npx -y @tenphi/harnesspm -C work/app help` to list its tools, rules and skills, and add `-C work/app` to each tool command. Nothing in your own repository changes. Without the clone's install, self-contained scripts run from the fetched packages; a script that needs the install says so.
- **Sessions start in a folder above several repositories**, such as `/home/user` in a cloud session with more than one, or `~/work`: ask the user to run `npx -y @tenphi/harnesspm sync` in that folder, after the installs (in a cloud session, in the environment's setup script). It writes each repository's hooks there and a block in that folder's `AGENTS.md` that names each repository. If you run it, the block appears and the hooks stay held back.
- **The team wants to see how agents use the harness:** add `"telemetry": { "send": { "file": ".harnesspm/events.jsonl" } }` to `harnesspm.json`, or a command as `send`, and ask the user to run `npx harnesspm sync`. A person opts out with `DO_NOT_TRACK=1`. The spec's telemetry chapter, in the docs index, has the events and a rule template for reporting harness problems.

## 3. Add a harness on top

```bash
npx -y @tenphi/harnesspm add <source>          # every repository on this machine
npx -y @tenphi/harnesspm add <source> --local  # this repository only
```

The source is `github:<owner>/<repo>`, `git:<url>`, `npm:<package>` or a folder path. Add a team's harness before the user's own, so the user's wins. The command prints the added rules. Follow them from now on in this session.

Outputs of added harnesses never go into the project's repository. Do not commit them. Then run `npx -y @tenphi/harnesspm doctor`: it finds a per-machine file that git could commit, and names the fix. Ask the user before you untrack a file.
