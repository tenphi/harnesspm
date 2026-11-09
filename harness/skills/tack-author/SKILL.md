---
name: tack-author
description: Create or change a Tack harness in a package or project, add rules, skills, sub-agents, scripts, hooks or MCP servers, and prepare it for publishing. Use when the user asks to share agent rules or tools through a package, or edits files under harness/.
---

# Authoring a Tack harness

## 1. Find the harness root

- A package's harness is the `harness/` folder at the package root. Its manifest is `harness/plugin.json` (Agent Plugins format).
- Tack fields live under `extensions["io.github.tenphi.tack"]` in `plugin.json`, and Tack files under `harness/io.github.tenphi.tack/`.
- If there is no `harness/` folder yet, run `npx tack new rule <name>`. It creates the folder and a valid manifest.

## 2. Pick the unit kind

| The user wants | Kind | Where |
| --- | --- | --- |
| A rule the agent always follows | Rule, no frontmatter | `io.github.tenphi.tack/rules/<name>.md` |
| A rule for some files only | Rule with `paths` | same |
| Background the agent reads when needed | Rule with `description`, or docs | same, or the `docs` folder |
| A multi-step workflow | Skill | `skills/<plugin name>-<name>/SKILL.md` |
| A tool the agent runs | Script | `io.github.tenphi.tack/scripts/`, declared in `scripts` |
| Something that runs on an agent event | Hook | `io.github.tenphi.tack/hooks.json`, with `run` naming a script |
| A tool server | MCP server | `mcp.json` |

Keep always-on rules short. Move details into on-demand rules, docs or skills.

## 3. Name it

- Unit IDs are `<plugin name>:<kind>/<name>`.
- Start skill names with the plugin name. Never rename a skill folder without changing its `name` field too.

## 4. Build on other packages

- To pass on another package's harness, add it to `extends`.
- To change one of its units, use `replace` or `exclude` with the unit ID. Run `npx tack why <unit ID>` to find IDs.

## 5. Check and publish

1. Run `npx tack run tack:check`.
2. Make sure `harness` is in the `files` field of `package.json`.
3. Add `"prepack": "tack pack-check"` to `package.json` scripts.
