---
"@tenphi/harnesspm": minor
---

Scripts can list their `answers` exit codes (such as `[1]` for a lint that found problems): `run` events get an `outcome` of `ok`, `answer` or `failed`, `reportRun` takes `answers` too, and `help <tool>` prints them. `run`, `help` and `why` events from a folder outside the project, such as with `-C`, carry `outside: true`.
