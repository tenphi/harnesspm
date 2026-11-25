---
"@tenphi/harnesspm": minor
---

`sync` and `fetch` copy the docs of installed packages into `.harnesspm/docs/`, so agents find them with their search tools, which skip `node_modules`. Git ignores the copies through `.git/info/exclude`, and an `.rgignore` lets ripgrep-based search into them. The `Docs:` lines in the managed block now point at the copies: run `npx harnesspm sync` after upgrading and commit `AGENTS.md`.
