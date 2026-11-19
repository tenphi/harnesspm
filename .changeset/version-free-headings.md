---
"@tenphi/harnesspm": minor
---

Package headings in the managed block no longer name the version, so an upgrade that keeps a package's harness the same changes only `harnesspm.lock.json`. Run `npx harnesspm sync` once and commit the updated `AGENTS.md` files.
