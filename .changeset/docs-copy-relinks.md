---
'@tenphi/harnesspm': patch
---

The docs copy points a link that leaves the docs folder, such as `../README.md`, at that file in the installed package, so it leads somewhere. `check` no longer warns on such links: a docs page keeps the links its own website needs.
