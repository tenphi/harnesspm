---
"@tenphi/harnesspm": patch
---

The user-level blocks in `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` show absolute paths for the on-demand rules, file-scoped rules and docs of added harnesses from git and npm sources, as the spec says. They showed paths such as `harnesses/<name>/harness/…`, relative to `~/.harnesspm`, which an agent could not open from a repository. Run `npx -y @tenphi/harnesspm sync` once to rewrite them.
