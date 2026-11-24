---
"@tenphi/harnesspm": minor
---

Sessions that start in a folder above your repositories, such as a Claude Code cloud session with several repositories or your folder of clones, now get each repository's hooks: run `npx -y @tenphi/harnesspm sync` in that folder once, after the installs. It writes the hooks with `-C <repository>` into that folder's agent settings, and a block in its `AGENTS.md` that names each repository, its rules and its `help` command; each repository's own sync keeps its entries there current, and a sync there removes the entries of repositories that are gone. Such a hook runs in its repository and skips edits in the others. An agent's own sync never adds hooks there. Telemetry hook events now use the session ID that Claude Code's commands see, so a session's hook and command events no longer split into two sessions, and events from such a folder carry `outside: true`.
