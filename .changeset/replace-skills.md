---
'@tenphi/harnesspm': minor
---

`replace` now works on skills: map a skill ID to a folder with its own `SKILL.md`, which keeps the skill's name, ID and place. A package that passes on another package's harness can adapt an upstream skill for its users, and the folder is not a skill of its own, so nothing warns about two skills with one name. A replaced skill gets the trust of the package that replaced it. For other units, such as tools and hooks, `replace` warns and points to `exclude`, and `check` fails on it; the spec now says so.
