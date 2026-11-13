---
'@tenphi/harnesspm': minor
---

Opt-in telemetry: with `telemetry` in `harnesspm.json`, harnesspm sends events about script runs, MCP server starts, `sync` and `why` to the team's own handler, a command or a JSON Lines file. With agent events on, its own async hooks also report when Claude Code reads a harness file or loads a skill, and when a Claude Code or Codex session starts. Events never hold arguments, file contents or prompts. A handler gets events only after a person's `sync` records it in the lock, and a person opts out with `DO_NOT_TRACK=1` or `"telemetry": false` in `harnesspm.local.json`.
