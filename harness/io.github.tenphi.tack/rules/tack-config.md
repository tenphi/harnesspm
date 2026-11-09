---
description: How to change Tack configuration and harness files safely
paths: ["tack.json", "tack.local.json", "harness/**"]
---

# Changing Tack configuration

- `tack.json` and `harness/` belong to the team and are committed. `tack.local.json` is personal and never committed.
- To change a few sections of an upstream rule, create a patch with `npx tack new patch <rule ID>`, keep only the sections you change, and edit them. To change a whole unit, use `replace`. To drop it, use `exclude`. Do not copy the whole upstream harness.
- Executable units (scripts, hooks, MCP servers, allow permissions) run only for trusted packages. Do not add a package to `trust` without the user's agreement.
- After a change, run `npx tack run tack:check` and fix every reported problem.
