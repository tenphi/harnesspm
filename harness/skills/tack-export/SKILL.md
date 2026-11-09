---
name: tack-export
description: Share agent rules, docs, skills or tools from a package through Tack, or change what a package already shares. Use when the user wants a library's users to get its agent guidance, asks to create or edit files under harness/, or wants to pass on the harness of packages it builds on.
---

# Sharing a harness from a package

## 1. Start small

If the package has no `harness/` folder, run `npx tack new rule <name>`. It creates `harness/plugin.json` and one rule. That is a complete harness.

## 2. Decide what goes in

Share what the package's **users** need. Keep contributor-only instructions (release steps, internal structure) in the repository's own `AGENTS.md`.

| Users need | Unit kind | Command |
| --- | --- | --- |
| A rule to always follow | Rule, no frontmatter | `npx tack new rule <name>` |
| A rule for some files only | Rule with `paths` frontmatter | same, then add `paths` |
| Background to read when needed | Docs, or a rule with `description` only | set `docs.dir` in `plugin.json` |
| A multi-step workflow | Skill, named `<plugin name>-<name>` | `npx tack new skill <name>` |
| A tool to run | Script | `npx tack new script <name>` |
| Something that runs on an agent event | Hook that runs a script | `npx tack new hook <name>` |

Keep always-on rules short. One topic per file, so users can replace or drop one file.

## 3. Pass on upstream harness

- List the packages it builds on in `extends` in `plugin.json`.
- To change one of their units for all users, add a `replace` or `exclude` with the unit ID. Find IDs with `npx tack why <ID>` or in the `AGENTS.md` block.

## 4. Check and publish

1. Run `npx tack run tack:check`. Fix every problem.
2. Make sure `harness` (and the docs folder, if used) is in the `files` field of `package.json`.
3. Add `"prepack": "tack check"` to the `package.json` scripts.
