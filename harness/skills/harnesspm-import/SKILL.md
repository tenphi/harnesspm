---
name: harnesspm-import
description: Work with the harness a project takes from its dependencies, after setup, or add one on top. Covers trusting a package that ships tools, a cloned repository's harness with -C, a folder above several repositories, telemetry, and adding a harness such as the user's team's or their own. Use when the user asks about a package's agent rules or tools, to trust a package, to add a harness in this project or session, or to set up harnesspm.
---

# Using harness in a project

Setup is one command: `npx -y @harnesspm/cli init`. Do what it prints, and commit what it lists. In any folder, `npx -y @harnesspm/cli` says what the folder is and which command starts each task. In a project, it prints the report: packages, checks, and what waits for a person.

## Trust and permissions

- **Tools of a package that is not trusted stay off.** Ask the user before you add a package to `trust` in `harnesspm.json`. Say what each tool does and whether it runs without a prompt: `npx -y @harnesspm/cli help <package>` lists them.
- **You cannot grant permissions.** When you run harnesspm, new allow rules, hooks and MCP servers wait for a person, unless the default branch already records them. Ask the user to run `npx -y @harnesspm/cli approve` in their own terminal. In a Claude Code cloud session, where the user has no terminal, give them the line that harnesspm prints for the environment's setup script instead. Do not edit agent settings files to work around it.

## Other tasks

- **One upstream rule does not fit** the project: run `npx -y @harnesspm/cli new patch <rule ID>` and edit only the sections that differ. Use a `replace` entry in `harnesspm.json` to change a whole rule or skill, or an `exclude` entry to drop a unit.
- **A job that does not install dependencies**, such as a review bot, runs `npx -y @harnesspm/cli fetch` first.
- **You work in a clone below your session's folder**, such as `work/app`: run `npx -y @harnesspm/cli -C work/app help` to list its tools, rules and skills, and add `-C work/app` to each tool command. Nothing in your own repository changes. Without the clone's install, self-contained scripts run from the fetched packages; a script that needs the install says so.
- **Sessions start in a folder above several repositories**, such as `/home/user` in a cloud session with more than one, or `~/work`: ask the user to run `npx -y @harnesspm/cli sync` in that folder, after the installs (in a cloud session, in the environment's setup script). It writes each repository's hooks there and a block in that folder's `AGENTS.md` that names each repository. If you run it, the block appears and the hooks wait for a person.
- **The team wants to see how agents use the harness:** add `"telemetry": { "send": { "file": ".harnesspm/events.jsonl" } }` to `harnesspm.json`, or a command as `send`, and ask the user to run `npx -y @harnesspm/cli approve`. A person opts out with `DO_NOT_TRACK=1`. The spec's telemetry chapter, in the docs index, has the events and a rule template for reporting harness problems.

## Add a harness on top

```bash
npx -y @harnesspm/cli add <source>          # every repository on this machine
npx -y @harnesspm/cli add <source> --local  # this repository only
```

The source is `github:<owner>/<repo>`, `git:<url>`, `npm:<package>` or a folder path. Add a team's harness before the user's own, so the user's wins. The command prints the added rules. Follow them from now on in this session.

Outputs of added harnesses never go into the project's repository. Do not commit them. `npx -y @harnesspm/cli doctor` finds a per-machine file that git could commit, and names the fix. Ask the user before you untrack a file.
