---
description: Every field of harnesspm.json, and the per-machine files harnesspm.local.json and ~/.harnesspm/config.json.
---

# Configuration reference

**In short**

- `harnesspm.json` is the project's configuration. It is committed, and every field is optional.
- `harnesspm.local.json` and `~/.harnesspm/config.json` are per machine. They list added harnesses and can turn telemetry off.
- Run `npx -y @harnesspm/cli sync` after every change.

## `harnesspm.json`

```json
{
  "$schema": "https://unpkg.com/@harnesspm/cli/schema/harnesspm.schema.json",
  "exclude": ["acme-colors:skills/acme-colors-theme", "acme-styles:hooks/check-edit"],
  "replace": { "acme-styles:rules/usage": "./harnesspm/styles-usage.md" },
  "patch": { "acme-colors:rules/usage": "./harnesspm/patches/acme-colors-usage.patch.md" },
  "trust": { "@acme/ui": true, "@acme/colors": "pin" },
  "telemetry": { "events": "all", "send": { "file": ".harnesspm/events.jsonl" } }
}
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `$schema` | string | — | The JSON schema, for editors. |
| `exclude` | string[] | `[]` | Unit IDs or package names, such as `"@acme/styles"`, to drop, with everything only they extend. |
| `replace` | object | `{}` | Rule or skill ID → path of a project file, or skill folder, that takes its place. |
| `patch` | object | `{}` | Rule ID → path of a patch that changes some of its sections. |
| `trust` | object | `{}` | Package name → `true` (follows upgrades) or `"pin"` (each new version needs `harnesspm approve`). Lets the package's scripts, hooks, MCP servers and allow rules run. |
| `telemetry` | object | off | Events and the handler that gets them. |

Paths are relative to the project root. Unknown fields give a warning. The schema ships with the package, at [`schema/harnesspm.schema.json`](https://unpkg.com/@harnesspm/cli/schema/harnesspm.schema.json).

### `telemetry`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `events` | `"all"` or string[] | `"all"` | Which of `run`, `mcp`, `sync`, `why`, `help`, `read`, `skill` and `session` to send. |
| `send` | string or `{ "file": "<path>" }` | required | The handler. A string is a command that gets each event as JSON on stdin. `file` appends one JSON line per event. |

The handler is active only after a person's `sync` or `approve` recorded it in the lock. See [Telemetry](../telemetry.md).

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

`init` ends with the list of files to commit: the ones in this table that git sees as new or changed.

| File | What it holds | Committed | Edit by hand |
| --- | --- | --- | --- |
| `harnesspm.json` | The project's configuration, which `init` creates | Yes | Yes |
| `harnesspm.lock.json` | Every harness package and every unit's hash | Yes | No |
| The block in `AGENTS.md`, between `BEGIN:harnesspm` and `END:harnesspm` | The commands that reach the harness, then one line for each rule, docs index and tool of each package | Yes | No. Text outside the block is yours. |
| `@AGENTS.md` in `CLAUDE.md`, at the root and next to each nested `AGENTS.md` that git tracks | The import that makes Claude Code read the block | Yes | The rest of `CLAUDE.md` is yours. |
| `package.json` and the package manager's lockfile | The dev dependency and the `postinstall` or `prepare` script, which `init` adds | Yes | Yes, but keep the script as `init` wrote it. |
| `/.harnesspm/` in `.gitignore` | The line that `init` adds, so formatters skip the docs copies | Yes | The rest of `.gitignore` is yours. |
| Everything else: `.claude/`, `.codex/`, `.agents/skills/`, `CLAUDE.local.md`, `node_modules/.harnesspm/`, the docs copies in `.harnesspm/docs/` and `.rgignore` | Links, settings and copies for each agent on this machine, listed in `.git/info/exclude` | No | No |

The specification's [Outputs chapter](https://github.com/tenphi/harnesspm/blob/main/docs/spec/04-outputs.md) lists every file.
