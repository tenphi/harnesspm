---
'@tenphi/harnesspm': patch
---

A docs folder of your own harness that your build writes and git ignores no longer makes the lock and the `AGENTS.md` blocks depend on whether a build ran: `sync` leaves it out, built or not, and `check` still reads the built pages. An `exclude` of that docs unit no longer warns that it does not exist.
