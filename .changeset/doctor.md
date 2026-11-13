---
'@tenphi/harnesspm': minor
---

New `harnesspm doctor`: checks that a repository is ready for harnesses, its own and a person's. Every per-machine file on disk must be ignored by git and not tracked, so no commit can include it. It also checks that added harnesses are on this machine, that outputs are in place, and what waits for trust. Each problem names the command that fixes it. `status` points to it when a per-machine file has a problem.
