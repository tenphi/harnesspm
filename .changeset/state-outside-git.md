---
'@tenphi/harnesspm': patch
---

Outside a git repository, `harnesspm sync` no longer creates `.git/harnesspm/state.json`. It keeps that per-machine state in `~/.harnesspm/state/` instead.
