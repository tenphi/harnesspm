---
'@tenphi/harnesspm': patch
---

A telemetry command handler that exits without reading its event is now logged with its exit code, not as `EPIPE`.
