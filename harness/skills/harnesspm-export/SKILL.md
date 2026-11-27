---
name: harnesspm-export
description: Share agent rules, docs, skills or tools from a package through harnesspm, or change what a package already shares. Use when the user wants a library's users to get its agent guidance, asks to create or edit files under harness/, or wants to pass on the harness of packages it builds on.
---

# Sharing a harness from a package

## 1. Start small

Install harnesspm as a dev dependency of the package: `npm i -D @harnesspm/cli`. The package needs no `npx -y @harnesspm/cli init` to share a harness.

If the package has no `harness/` folder, run `npx -y @harnesspm/cli new rule <name>`. It creates `harness/plugin.json` and one rule. That is a complete harness.

## 2. Decide what goes in

Share what the package's **users** need. Keep contributor-only instructions (release steps, internal structure) in the repository's own `AGENTS.md`.

| Users need | Unit kind | Command |
| --- | --- | --- |
| A rule to always follow | Rule, no frontmatter | `npx -y @harnesspm/cli new rule <name>` |
| A rule for some files only | Rule with `paths` frontmatter. Start a pattern with `/` to match only the project's own folder, such as `/src/**`: without it, the pattern matches at any depth, `node_modules` too | same, then add `paths` |
| Background to read when needed | Docs, or a rule with `description` only | in `plugin.json`, set `"extensions": { "dev.harnesspm": { "docs": "../docs" } }`: the path of the docs folder, relative to `harness/` |
| A multi-step workflow | Skill, named `<plugin name>-<name>` | `npx -y @harnesspm/cli new skill <name>` |
| A specialist the agent can delegate to | Sub-agent, written for Claude Code and Codex | `npx -y @harnesspm/cli new agent <name>` |
| A tool to run | Script | `npx -y @harnesspm/cli new script <name>` |
| Something that runs on an agent event | Hook that runs a script | `npx -y @harnesspm/cli new hook <name>` |

Write each skill's `description` as what it does, then "Use when …" with the situations and words people use. Agents pick skills by that text, but not every time: when a skill must run in a situation, also add an always-on rule that names it.

Keep always-on rules short. One topic per file, split into small `##` sections, so users can patch one section, replace one file or drop it. The `AGENTS.md` block shows an always-on rule as one line, its title and its `##` and `###` headings, and agents read the text with `npx -y @harnesspm/cli help <package>`. So name each section by what it asks, such as "Never edit outputs".

## 3. Pass on upstream harness

- List the packages it builds on in `extends` in `plugin.json`.
- To change one of their rules for all users, prefer a patch: `npx -y @harnesspm/cli new patch <rule ID>` registers it in `harness/plugin.json`. Keep and edit only the sections that change. Use `replace` for a whole rule or skill, and `exclude` to drop a unit. Find IDs in the `AGENTS.md` block or with `npx -y @harnesspm/cli why <ID>`.

## 4. Check and publish

1. If `package.json` has a `files` field, make sure it lists `harness` and the docs folder, if used.
2. Run `npx -y @harnesspm/cli check`. Fix every problem.
3. Add `"prepack": "harnesspm check"` to the `package.json` scripts.
4. Add a short note to the README: the package ships a harness for coding agents, and a project gets it with `npx -y @harnesspm/cli init`. A project that does not use harnesspm gets nothing by itself.
5. To see the harness as users' agents will, run `npx -y @harnesspm/cli init` in this repository. Its own harness then shows in its `AGENTS.md` block.
