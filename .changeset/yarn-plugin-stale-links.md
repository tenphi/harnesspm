---
"@harnesspm/cli": patch
---

`init` adds no install hook when a Yarn plugin in `.yarnrc.yml` already runs harnesspm, so each install syncs once, not twice. `sync` and `fetch` now remove the links in `node_modules/.harnesspm/pkgs/` that they no longer write, such as the one a move from `@tenphi/harnesspm` left behind.
