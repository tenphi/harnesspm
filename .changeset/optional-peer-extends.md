---
'@tenphi/harnesspm': patch
---

An `extends` entry that is an optional peer dependency of its package (`optional: true` in `peerDependenciesMeta`) is skipped without a warning when it is not installed.
