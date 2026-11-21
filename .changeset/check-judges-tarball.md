---
'@tenphi/harnesspm': patch
---

`harnesspm check` judges a package by what its tarball would hold, read from `files` in `package.json`. It now checks docs pages built at `prepack`, which git ignores but npm packs, and reports a link to a file the package does not ship. Links in `.mdx` pages are checked too. The private-key warning now needs a key body, so a `-----BEGIN PRIVATE KEY-----` placeholder in docs no longer triggers it. The spec's links to `docs/research/`, which doesn't ship, now lead to GitHub.
