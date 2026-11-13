---
'@tenphi/harnesspm': patch
---

`harnesspm.lock.json` now takes each harness package's integrity and tarball URL from `pnpm-lock.yaml` and Yarn 1's `yarn.lock` too, so `harnesspm fetch` checks its downloads in pnpm and Yarn projects. For a lock without them, `fetch` reads the package manager's lockfile, and it names each package it cannot check.
