---
description: How to change Tack configuration and harness files safely
paths: ["tack.json", "tack.local.json", "harness/**", "harness.local/**"]
---

# Changing Tack configuration

- `tack.json` and `harness/` belong to the team and are committed. `tack.local.json` and `harness.local/` are personal and never committed.
- To change one upstream rule, add a `replace` or `exclude` entry with its unit ID. Do not copy the whole upstream harness.
- Executable units (scripts, hooks, MCP servers, allow permissions) run only for trusted packages. Do not add a package to `trust` without the user's agreement.
- After a change, run `npx tack run tack:check` and fix every reported problem.
