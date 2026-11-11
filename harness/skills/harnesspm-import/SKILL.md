---
name: harnesspm-import
description: Set up harnesspm in a project, take agent harness from its dependencies, trust packages that ship tools, or add a harness on top, such as the user's team's or their own. Use when the user asks to use a package's agent rules or tools, to set up harnesspm, or to add a harness in this project or session.
---

# Using harness in a project

## 1. Set up the project (once)

```bash
npm i -D harnesspm
npx harnesspm init
```

`init` adds `harnesspm sync` to the `postinstall` script of a private package, or to `prepare` otherwise, so every full install updates the agent files. After `npm install <pkg>` or `pnpm add`, run `npx harnesspm sync` yourself. Commit `harnesspm.json`, `harnesspm.lock.json` and the `AGENTS.md` block.

## 2. Check what arrived

Run `npx harnesspm status`. It lists the packages, pending tools and the always-on size.

- **Pending tools** come from packages the project does not trust yet. Ask the user before adding a package to `trust` in `harnesspm.json`.
- **You cannot grant permissions.** When you run harnesspm, new allow rules, hooks and MCP servers stay pending. Ask the user to run `npx harnesspm approve` in their own terminal. Do not edit agent settings files to work around it.
- **One upstream rule does not fit** the project: run `npx harnesspm new patch <rule ID>` and edit only the sections that differ. Use a `replace` or `exclude` entry in `harnesspm.json` to change or drop a whole unit.
- **A job that does not install dependencies**, such as a review bot, runs `npx -y harnesspm fetch` first.

## 3. Add a harness on top

```bash
npx -y harnesspm add <source>          # every repository on this machine
npx -y harnesspm add <source> --local  # this repository only
```

The source is `github:<owner>/<repo>`, `git:<url>`, `npm:<package>` or a folder path. Add a team's harness before the user's own, so the user's wins. The command prints the added rules. Follow them from now on in this session.

Outputs of added harnesses never go into the project's repository. Do not commit them.
