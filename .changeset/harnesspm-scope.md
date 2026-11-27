---
"@harnesspm/cli": minor
---

harnesspm moved to the npm package `@harnesspm/cli`. The command is still `harnesspm`. To move a project, run `npm i -D @harnesspm/cli && npm rm @tenphi/harnesspm`, then `npx -y @harnesspm/cli init`; `doctor` reminds you. Every text, message, managed block and hook now uses one form, `npx -y @harnesspm/cli`, never the bare `npx harnesspm`, also as the fallback of hooks and MCP servers. The block's first line changes, so `sync --check` fails once in CI: run `sync` and commit `AGENTS.md`. Until harnesspm 1.0, the earlier name and the bare form keep working: the installed `@tenphi/harnesspm`, its hooks and allow rules, the install script and the user-level `SessionStart` hook carry over at the next sync, and nothing needs approving again.
