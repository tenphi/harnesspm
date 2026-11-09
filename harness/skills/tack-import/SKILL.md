---
name: tack-import
description: Set up Tack in a project, take agent harness from its dependencies, trust packages that ship tools, or install the user's personal harness. Use when the user asks to use a package's agent rules or tools, to set up Tack, or to install their own harness in this project or session.
---

# Using harness in a project

## 1. Set up the project (once)

```bash
npm i -D @tenphi/tack
npx tack init
```

`init` adds `tack sync` to the `prepare` script, so every install updates the agent files. Commit `tack.json`, `tack.lock.json` and the `AGENTS.md` block.

## 2. Check what arrived

Run `npx tack status`. It lists the packages, pending tools and the always-on size.

- **Pending tools** come from packages the project does not trust yet. Ask the user before adding a package to `trust` in `tack.json`. Then run `npx tack sync`.
- **One upstream rule does not fit** the project: run `npx tack new patch <rule ID>` and edit only the sections that differ. Use a `replace` or `exclude` entry in `tack.json` to change or drop a whole unit.
- **A job that does not install dependencies**, such as a review bot, runs `npx -y @tenphi/tack fetch --frozen` first.

## 3. Install the user's personal harness

```bash
npx -y @tenphi/tack personal add <source>            # everywhere on this machine
npx -y @tenphi/tack personal add <source> --project  # this project only
```

The source is `github:<owner>/<repo>`, `git:<url>`, `npm:<package>` or a folder path. The command prints the personal rules. Follow them from now on in this session.

Personal files never go into the project's repository. Do not commit them.
