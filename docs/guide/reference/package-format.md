---
description: The harness/ folder at a glance - layout, manifest fields, unit kinds and IDs, rule frontmatter, scripts, hooks, MCP servers and permissions.
---

# Package format reference

**In short**

- A harness is a `harness/` folder at the package root: an [Agent Plugins 1.0](https://agent-plugins.org/) plugin plus the `dev.harnesspm` extension.
- Every file is optional except `plugin.json`.
- Every unit has an ID, `<plugin name>:<kind>/<name>`, which projects use to exclude, replace or patch it.

[Package format](../../spec/02-package-format.md) and [Executables](../../spec/05-executables.md) in the specification have every rule.

## Layout

```text
harness/
├── plugin.json              Agent Plugins manifest (required)
├── skills/
│   └── uikit-review/
│       └── SKILL.md         Agent Skills
├── mcp.json                 Agent Plugins MCP configuration
└── dev.harnesspm/           harnesspm extension folder
    ├── rules/
    │   └── forms.md
    ├── agents/
    │   └── uikit-reviewer.md
    ├── scripts/
    │   └── probe.mjs
    ├── hooks.json
    └── permissions.json
```

## `plugin.json`

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "uikit",
  "description": "Rules, docs and tools for building UIs with @cube-dev/ui-kit",
  "extensions": {
    "dev.harnesspm": {
      "extends": ["@tenphi/tasty", "@tenphi/glaze"],
      "docs": "../docs/components",
      "scripts": {
        "probe": {
          "file": "./dev.harnesspm/scripts/probe.mjs",
          "description": "Capture a story's DOM and computed CSS",
          "allow": true
        }
      },
      "exclude": ["tasty:rules/legacy-tokens"],
      "replace": { "tasty:rules/lint-comments": "./dev.harnesspm/rules/lint-comments.md" }
    }
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `$schema` | Yes | The Agent Plugins schema. |
| `name` | Yes | The plugin name: lowercase letters, digits, `-` and `.`. It starts every unit ID. |
| `version` | No | Defaults to `version` in `package.json`. |
| `description`, `author`, `homepage`, `repository`, `license`, `keywords` | No | Agent Plugins metadata. |

### `extensions["dev.harnesspm"]`

| Field | Type | Meaning |
| --- | --- | --- |
| `extends` | string[] | Packages whose harness this one passes on, resolved from this package's folder. |
| `exclude` | string[] | Units or packages to drop from what it passes on. |
| `replace` | object | Unit ID → a file that takes the unit's place. |
| `patch` | object | Rule ID → a patch that changes some of its sections. |
| `docs` | string | The docs folder, relative to `harness/`, inside the package. |
| `scripts` | object | Script name → `{ file, description?, allow? }`. |
| `projects` | object | Git remote → a folder with units for that repository. Read only in added harnesses. |

`harnesspm check` fails on an unknown field, so typos do not ship.

## Unit kinds and IDs

| Kind | Location | ID |
| --- | --- | --- |
| Rule | `dev.harnesspm/rules/<name>.md` | `uikit:rules/<name>` |
| Skill | `skills/<name>/SKILL.md` | `uikit:skills/<name>` |
| Sub-agent | `dev.harnesspm/agents/<name>.md` | `uikit:agents/<name>` |
| Docs | The folder in `docs` | `uikit:docs` |
| Script | `scripts` in `plugin.json` | `uikit:scripts/<name>` |
| Hook | `dev.harnesspm/hooks.json`, by `id` | `uikit:hooks/<id>` |
| MCP server | `mcp.json`, by server name | `uikit:mcp/<name>` |
| Permissions | `dev.harnesspm/permissions.json` | `uikit:permissions` |

Commands name scripts and MCP servers as `<plugin>:<name>`: `npx harnesspm run uikit:probe`. Agents see an MCP server as `<plugin>-<server>`, such as `uikit-docs`.

## Rules

| Frontmatter | Activation |
| --- | --- |
| None | Always on. The text goes into the managed block. |
| `paths`, with or without `description` | File-scoped. Active when the agent works on matching files. |
| `description` only | On demand. Listed with its description. |

`paths` are globs from the project root. A pattern without a leading `/` also matches at any depth. Start it with `/`, such as `/harness/**`, to match only at the root.

### Patches

```markdown
---
remove: ["Legacy tokens"]
---

## Disable comments

Use `oxlint-disable-next-line`. `eslint-disable` comments are ignored in this project.
```

A section is a heading and everything up to the next heading of the same or a higher level. A section in the patch replaces the one with the same heading and level, or is added at the end. `remove` lists sections to remove.

## Sub-agents

```markdown
---
name: uikit-reviewer
description: Reviews UI changes against UI Kit rules. Use for UI pull requests.
claude: { tools: "Read, Grep, Glob", model: "sonnet" }
codex: { model_reasoning_effort: "medium" }
---

Review the change like an owner. Do not edit files.
```

`name`, `description` and the body are portable. Settings for one agent go under its own key.

## Scripts

| Field | Required | Meaning |
| --- | --- | --- |
| `file` | Yes | Path inside `harness/`, starting with `./`. |
| `description` | No | Shows the script to agents. Without it, only hooks and MCP servers use it. |
| `allow` | No | Asks that agents may run it without a prompt, in projects that trust the package. |

The runner sets `PLUGIN_ROOT`, `PLUGIN_DATA`, `HARNESSPM_PROJECT_DIR` and `HARNESSPM_AGENT`. It runs `.js`, `.mjs` and `.cjs` files with `node`, `.sh` files with `sh`, and other files directly.

## Hooks

```json
{
  "hooks": {
    "PostToolUse": [
      { "id": "check-styles", "matcher": { "claude": "Edit|Write" }, "run": "check-styles", "timeout": 30 }
    ]
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | The unit name. |
| `run` | Yes | A script name from `scripts`. |
| `matcher` | No | A string for both agents, or an object with `claude` and `codex` keys. |
| `timeout` | No | Seconds. |

Events: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`. A hook script reads the agent's JSON on stdin, exits `0` to continue and `2` to block, with the reason on stderr.

## MCP servers

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "docs": { "type": "stdio", "command": "node", "args": ["${PLUGIN_ROOT}/dev.harnesspm/scripts/docs-mcp.mjs"] },
    "figma": { "type": "streamable-http", "url": "https://example.com/mcp" }
  }
}
```

stdio servers start through `npx harnesspm mcp <plugin>:<server>`. Remote servers are written as they are. Never put secrets in `mcp.json`.

## Permissions

```json
{
  "deny": [["git", "push", "--force"]],
  "ask": [["npm", "publish"]]
}
```

Deny and ask rules are command prefixes. They pass through from any package. Allow rules come only from `"allow": true` on a trusted package's own scripts.
