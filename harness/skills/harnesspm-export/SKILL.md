---
name: harnesspm-export
description: Share agent rules, docs, skills or tools from a package through harnesspm, or change what a package already shares. Use when the user wants a library's users to get its agent guidance, asks to create or edit files under harness/, or wants to pass on the harness of packages it builds on.
---

# Sharing a harness from a package

## 1. Start small

If the package has no `harness/` folder, run `npx harnesspm new rule <name>`. It creates `harness/plugin.json` and one rule. That is a complete harness.

## 2. Decide what goes in

Share what the package's **users** need. Keep contributor-only instructions (release steps, internal structure) in the repository's own `AGENTS.md`.

| Users need | Unit kind | Command |
| --- | --- | --- |
| A rule to always follow | Rule, no frontmatter | `npx harnesspm new rule <name>` |
| A rule for some files only | Rule with `paths` frontmatter | same, then add `paths` |
| Background to read when needed | Docs, or a rule with `description` only | set `docs.dir` in `plugin.json` |
| A multi-step workflow | Skill, named `<plugin name>-<name>` | `npx harnesspm new skill <name>` |
| A specialist the agent can delegate to | Sub-agent, written for Claude Code and Codex | `npx harnesspm new sub-agent <name>` |
| A tool to run | Script | `npx harnesspm new script <name>` |
| Something that runs on an agent event | Hook that runs a script | `npx harnesspm new hook <name>` |

Write each skill's `description` as what it does, then "Use when …" with the situations and words people use. Agents pick skills by that text.

Keep always-on rules short. One topic per file, split into small `##` sections, so users can patch one section, replace one file or drop it.

## 3. Pass on upstream harness

- List the packages it builds on in `extends` in `plugin.json`.
- To change one of their rules for all users, prefer a patch: `npx harnesspm new patch <rule ID>`, then keep and edit only the sections that change. Use `replace` for a whole unit and `exclude` to drop one. Find IDs in the `AGENTS.md` block or with `npx harnesspm why <ID>`.

## 4. Check and publish

1. Run `npx harnesspm run harnesspm:check`. Fix every problem.
2. Make sure `harness` (and the docs folder, if used) is in the `files` field of `package.json`.
3. Add `"prepack": "harnesspm check"` to the `package.json` scripts.
