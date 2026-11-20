---
'@tenphi/harnesspm': minor
---

Rules are no longer inlined in AGENTS.md; agents get them with `help <package>`. The managed block now starts with the commands that reach the harness, then names each always-on rule in one line (its title and section headings), and lists tools by name without repeating the run command. `harnesspm help <package>` prints a package's rules in full with your patches, its docs, tools, MCP servers, skills and hooks; `help <rule ID>` prints one rule; `help <tool>` prints a tool's usage and run command without running it, from a new optional `usage` field in the script's manifest entry. All work with `-C` and without an install, and `help` with a target is a new telemetry event.
