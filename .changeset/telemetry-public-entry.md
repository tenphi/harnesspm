---
"@tenphi/harnesspm": minor
---

New `@tenphi/harnesspm/telemetry` entry with `reportRun`, so a project's own tools send `run` events to the same handler. The package now has an `exports` field, so deep imports of internal files no longer resolve.
