---
'@tenphi/harnesspm': patch
---

The install script that `harnesspm init` writes skips `harnesspm sync` when harnesspm is not installed, so an install without dev dependencies, such as `npm ci --omit=dev`, no longer fails with "harnesspm: not found". In a project that is already set up, run `npx harnesspm init` again to update the script; `harnesspm doctor` warns until you do.
