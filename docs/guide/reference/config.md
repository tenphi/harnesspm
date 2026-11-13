---
description: Every field of harnesspm.json, and the per-machine files harnesspm.local.json and ~/.harnesspm/config.json.
---

# Configuration reference

**In short**

- `harnesspm.json` is the project's configuration. It is committed, and every field is optional.
- `harnesspm.local.json` and `~/.harnesspm/config.json` are per machine. They list added harnesses and can turn telemetry off.
- Run `npx harnesspm sync` after every change.

## `harnesspm.json`

```json
{
  "$schema": "https://unpkg.com/@tenphi/harnesspm/schema/harnesspm.schema.json",
  "exclude": ["@tenphi/eslint-plugin-tasty", "glaze:skills/glaze-theme"],
  "replace": { "tasty:rules/usage": "./harnesspm/tasty-usage.md" },
  "patch": { "glaze:rules/colors": "./harnesspm/patches/glaze-colors.patch.md" },
  "trust": { "@cube-dev/ui-kit": true, "@tenphi/glaze": "pin" },
  "telemetry": { "events": "all", "send": { "file": ".harnesspm/events.jsonl" } }
}
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `$schema` | string | — | The JSON schema, for editors. |
| `exclude` | string[] | `[]` | Packages or unit IDs to drop, with everything only they extend. |
| `replace` | object | `{}` | Unit ID → path of a project file that takes its place. |
| `patch` | object | `{}` | Rule ID → path of a patch that changes some of its sections. |
| `trust` | object | `{}` | Package name → `true` (follows upgrades) or `"pin"` (each new version needs `harnesspm approve`). Lets the package's scripts, hooks, MCP servers and allow rules run. |
| `telemetry` | object | off | Events and the handler that gets them. |

Paths are relative to the project root. Unknown fields give a warning. The schema ships with the package, at [`schema/harnesspm.schema.json`](https://unpkg.com/@tenphi/harnesspm/schema/harnesspm.schema.json).

### `telemetry`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `events` | `"all"` or string[] | `"all"` | Which of `run`, `mcp`, `sync`, `why`, `read`, `skill` and `session` to send. |
| `send` | string or `{ "file": "<path>" }` | required | The handler. A string is a command that gets each event as JSON on stdin. `file` appends one JSON line per event. |

The handler is active only after a person's `sync` recorded it in the lock. See [Telemetry](../telemetry.md).

### The project's own harness

A project can also have its own `harness/` folder. It resolves like any harness package: its `extends` brings packages in, and its `exclude`, `replace` and `patch` apply for the project and for its users. `harnesspm.json` applies after it, for this repository only.

## `harnesspm.local.json`

Per repository, excluded from git, never committed.

```json
{
  "harnesses": ["github:alex/harness"],
  "telemetry": false
}
```

| Field | Meaning |
| --- | --- |
| `harnesses` | Harnesses added with `harnesspm add --local`, in order. |
| `telemetry` | `false` stops every event on this machine for this repository. |

## `~/.harnesspm/config.json`

Per machine, for every repository. Same fields:

| Field | Meaning |
| --- | --- |
| `harnesses` | Harnesses added with user scope, in order. |
| `telemetry` | `false` stops every event in every repository on this machine. |

`add` and `remove` write `harnesses` for you.

## Files harnesspm writes

| File | Committed | Edit by hand |
| --- | --- | --- |
| `harnesspm.lock.json` | Yes | No |
| The block in `AGENTS.md`, between `BEGIN:harnesspm` and `END:harnesspm` | Yes | No. Text outside the block is yours. |
| `@AGENTS.md` in `CLAUDE.md`, at the root and next to each nested `AGENTS.md` that git tracks | Yes | The rest of `CLAUDE.md` is yours. |
| Everything else: `.claude/`, `.codex/`, `.agents/skills/`, `CLAUDE.local.md`, `node_modules/.harnesspm/` | No | No |

The specification's [Outputs chapter](https://github.com/tenphi/harnesspm/blob/main/docs/spec/04-outputs.md) lists every file.
