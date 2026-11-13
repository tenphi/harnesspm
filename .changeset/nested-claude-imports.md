---
'@tenphi/harnesspm': minor
---

`harnesspm sync` makes Claude Code read nested `AGENTS.md` files again: each one that git tracks gets a `CLAUDE.md` next to it with `@AGENTS.md`, because the root `CLAUDE.md` silenced them. `sync --check` and `doctor` report a missing import.
