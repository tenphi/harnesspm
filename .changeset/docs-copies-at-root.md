---
"@tenphi/harnesspm": minor
---

The copies of dependencies' docs move out of `node_modules`, to `.harnesspm/docs/` at the project root. After upgrading, run `sync` and commit `AGENTS.md`, whose `Docs:` lines change, and add `/.harnesspm/` to `.gitignore` so formatters such as Prettier skip the copies: `sync` warns until it is there. A `.rgignore` of your own needs the lines `!/.harnesspm/`, `/.harnesspm/*` and `!/.harnesspm/docs/` instead of the `node_modules` ones. `sync` removes the old copies, and `fetch` writes the copies only where git ignores them.
