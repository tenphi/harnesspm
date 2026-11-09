---
name: tack-improve
description: Change or add a rule, note, skill, script or other unit in any Tack harness (a dependency's, the project's, or the user's personal one) and save the change the way its owner wants. Use when a rule is wrong or missing, when the user says "remember this", or asks to improve their harness.
---

# Improving a harness

## 1. Find the owner

For an existing unit, run `npx tack why <ID>`. The ID is at the end of each line in the `AGENTS.md` block. It tells you the owner, the source file and whether you can edit it.

For something new, choose the owner:

| The change is about | Owner | Create with |
| --- | --- | --- |
| How a package should be used, for all its users | The package (dependency) | — propose upstream, see 3 |
| This project, for the whole team | The project | `npx tack new <kind> <name>` |
| How the user works, everywhere | The personal harness | `npx tack new <kind> <name> --personal` |
| This project, only for the user | The personal harness, project entry | `npx tack new <kind> <name> --personal --project` |

Ask the user when it is not clear. Never put private data from this project into a personal harness without the user's agreement.

## 2. Edit the source

- Edit the source file that `why` names, never an output (the `AGENTS.md` block, `CLAUDE.local.md`, `.codex/`).
- Run `npx tack sync`, then `npx tack run tack:check`.

## 3. Save the change the owner's way

1. Read `AGENTS.md` and `CONTRIBUTING.md` at the root of the owner's repository. Follow them.
2. If they say nothing about saving:
   1. Show the user the change and ask before going on.
   2. Create a branch `tack/<topic>` and commit with a message that says what and why.
   3. Push it and open a pull request or merge request with the tools you have.
   4. If a step is not possible, stop and tell the user what is done and what is left. In a cloud session, show the full change.
3. Never push to the default branch unless the owner's rules allow it.

For a dependency: add a `replace` in `tack.json` (team) or in the personal harness (user) now, and offer to open an issue or pull request at the package's repository.
