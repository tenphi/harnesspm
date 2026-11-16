---
'@tenphi/harnesspm': patch
---

`harnesspm sync` no longer fails when a docs page of a package has invalid frontmatter: it warns and lists the page by its heading or file name. `harnesspm check` reports such a page, so the author fixes it before publishing.
