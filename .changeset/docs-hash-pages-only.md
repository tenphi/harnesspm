---
"@tenphi/harnesspm": patch
---

A docs unit's hash in `harnesspm.lock.json` now covers only its `llms.txt` and its `.md` and `.mdx` pages. A package that points `docs` at its source folder, with pages next to the code, no longer gets a stale lock from every change to a source or test file. The next `sync` rewrites the hash of a docs folder that holds other files.
