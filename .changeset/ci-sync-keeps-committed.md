---
'@tenphi/harnesspm': minor
---

With `CI=true`, `harnesspm sync` writes only per-machine files and leaves `AGENTS.md`, `CLAUDE.md` and the lock as they are, so `sync --check` after an install catches a missed sync. `sync --write` writes them anyway, for jobs that commit the result.
