---
'@tenphi/harnesspm': patch
---

`harnesspm init` stops when `@tenphi/harnesspm` is not a dependency of the project, changes nothing, and names the command that installs it. Before, it added an install script that failed the next install with "harnesspm: not found".
