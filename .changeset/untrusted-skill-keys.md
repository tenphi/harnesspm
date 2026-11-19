---
"@tenphi/harnesspm": minor
---

Until a package is trusted, its sub-agents are written without Claude Code's `hooks` and `mcpServers`, as `permissionMode` already was, and a skill of its that sets `allowed-tools` or `hooks` is linked as a copy without them. Claude Code ignores the same sub-agent keys in plugins for security. `sync` names each key it leaves out.
