---
"@tenphi/harnesspm": patch
---

`check` warns when a docs page links to a file outside the docs folder, such as `../README.md`, because that link leads nowhere in the docs copy that projects search. It does not fail the check.
