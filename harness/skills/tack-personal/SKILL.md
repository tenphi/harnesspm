---
name: tack-personal
description: Add, change, save and push the user's personal Tack harness, globally or for one project. Use when the user asks to remember a preference, add their own rule, skill, script or hook, install their harness in this session, or push changes to their harness repository.
---

# Working with a personal harness

## 1. Install it

- In a new environment or cloud session: `npx -y @tenphi/tack personal add <source>`. The source is `github:<owner>/<repo>`, `npm:<package>` or a folder path.
- The command prints the personal rules. Follow them from now on in this session.

## 2. Choose global or per-project

| The change is about | Put it in |
| --- | --- |
| How the user likes to work everywhere | The personal harness root. Use `npx tack personal new <kind> <name>` |
| Only this repository | The project entry. Add `--project` to the same command |

Ask the user when it is not clear.

## 3. Edit sources, not outputs

- Edit files in the personal working copy, which `npx tack personal status` lists. Links in skill folders lead there too.
- Never edit `CLAUDE.local.md` blocks, `AGENTS.override.md` or `.codex/` files. They are generated.
- After editing, run `npx tack sync` so the outputs update.

## 4. Save and push

1. Show the user `npx tack personal diff`.
2. Run `npx tack personal save -m "<short message>"`. Fix every problem it reports.
3. Run `npx tack personal push`. If it cannot push, it writes a patch to `~/.tack/outbox/`. Tell the user where the patch is.

Never put tokens, passwords or private data from the current project into the personal harness.
