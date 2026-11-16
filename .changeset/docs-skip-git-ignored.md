---
"@tenphi/harnesspm": patch
---

Docs leave out the files git ignores. A local file next to the pages, such as an agent's plan, no longer changes the lock, the docs index or `check` on one machine only, so `sync --check` in CI agrees with a local sync.
