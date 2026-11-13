---
'@tenphi/harnesspm': patch
---

The managed block now has a blank line after its BEGIN marker and before its END marker, so Prettier no longer changes it and breaks `sync --check`. A block in the old form still passes `--check`, and the next `sync` rewrites it once.
