---
"@harnesspm/cli": minor
---

harnesspm moved to the npm package `@harnesspm/cli`. The command is still `harnesspm`. To move a project, run `npm i -D @harnesspm/cli && npm rm @tenphi/harnesspm`, then `npx harnesspm init`; `doctor` reminds you. Until 1.0, harnesspm still recognizes `@tenphi/harnesspm`: its installed CLI, hooks, allow rules, install script and the user-level `SessionStart` hook carry over at the next sync, and nothing needs approving again.
