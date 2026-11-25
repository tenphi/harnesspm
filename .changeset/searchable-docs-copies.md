---
"@tenphi/harnesspm": minor
---

`sync` and `fetch` copy every dependency's docs into `node_modules/.harnesspm/docs/`, and write a `.rgignore` that lets agents' search tools, such as Claude Code's Grep and `rg`, into that one folder. Search skipped a dependency's docs before, because they sit in `node_modules`. Git ignores the copies and the `.rgignore`, and formatters skip `node_modules`. The `Docs:` lines in the managed block now point at the copies: run `npx harnesspm sync` after upgrading and commit `AGENTS.md`.
