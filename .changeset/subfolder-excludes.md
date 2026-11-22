---
'@tenphi/harnesspm': patch
---

A project in a subfolder of a git repository, such as `docs-site/`, now keeps its per-machine files out of git: `sync` writes its entries in `.git/info/exclude` from the git root (`/docs-site/.claude/skills/…`), in a section named after its folder, and keeps its own state file, so two projects in one repository never touch each other's entries. The next sync moves the entries an older version wrote into the root's section. A hook already in a settings file is not added a second time. `doctor` names the `!` pattern and file that bring a file back, and asks for a sync when no pattern matches.
