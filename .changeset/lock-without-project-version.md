---
'@tenphi/harnesspm': patch
---

`harnesspm.lock.json` no longer records the project's own version, so a release that raises `version` in `package.json` no longer makes the lock out of date. A lock that has it still passes `sync --check`, and the next `sync` drops it.
