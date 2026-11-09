# 2. Package format

**In short**

- A harness is a `harness/` folder at the package root. It is an [Agent Plugins 1.0](https://agent-plugins.org/) plugin: `plugin.json`, `skills/`, `mcp.json`.
- Everything Tack adds lives in the standard's extension namespace: the `io.github.tenphi.tack` field in `plugin.json` and the folder of the same name.
- Every unit has an ID, `<plugin name>:<kind>/<name>`, used to replace or exclude it.

The smallest harness is two files:

```text
harness/
├── plugin.json                          {"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "name": "mylib"}
└── io.github.tenphi.tack/rules/usage.md  one rule, always on
```

The portable parts (skills and MCP servers) work in any Agent Plugins client, even without Tack.

## 2.1 Location

1. A package MUST put its harness in a folder named `harness/` at the package root.
2. A published npm package MUST include `harness` in the `files` field of `package.json`.
3. Tack MUST NOT run any code from a package to discover its harness. Discovery reads files only.
4. For compatibility, Tack also reads a package-root `skills/` folder, the layout pnpm and the `skills` CLI use. Such a package contributes skills only.

> pnpm 12.11 and later link `skills/` folders from direct dependencies by themselves. Because Tack reads `harness/skills/`, the two do not link the same skills twice.

## 2.2 Layout

A package that uses every unit kind:

```text
harness/
├── plugin.json                       ← Agent Plugins manifest (required)
├── skills/                           ← Agent Skills, one folder each
│   └── uikit-review/
│       └── SKILL.md
├── mcp.json                          ← Agent Plugins MCP configuration
└── io.github.tenphi.tack/            ← Tack extension folder
    ├── rules/
    │   ├── forms.md
    │   └── state-maps.md
    ├── agents/
    │   └── uikit-reviewer.md
    ├── scripts/
    │   ├── probe.mjs
    │   └── check-styles.mjs
    ├── hooks.json
    └── permissions.json
```

Every file is optional except `plugin.json`. A package that has only one rule is valid.

The extension folder name is the Tack namespace. It is `io.github.tenphi.tack` until the project has a domain of its own. See [13-open-questions.md](13-open-questions.md#133-extension-namespace).

## 2.3 Manifest

`plugin.json` follows Agent Plugins 1.0. Its schema is closed, so all Tack fields go under `extensions["io.github.tenphi.tack"]`.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "uikit",
  "description": "Rules, docs and tools for building UIs with @cube-dev/ui-kit",
  "extensions": {
    "io.github.tenphi.tack": {
      "extends": ["@tenphi/tasty", "@tenphi/glaze"],
      "docs": { "dir": "../docs/components" },
      "scripts": {
        "probe": {
          "file": "./io.github.tenphi.tack/scripts/probe.mjs",
          "description": "Capture a story's DOM and computed CSS",
          "allow": true
        },
        "check-styles": { "file": "./io.github.tenphi.tack/scripts/check-styles.mjs" }
      },
      "exclude": ["tasty:rules/legacy-tokens"],
      "replace": { "tasty:rules/lint-comments": "./io.github.tenphi.tack/rules/lint-comments.md" }
    }
  }
}
```

### Core fields (Agent Plugins)

| Field | Required | Notes |
| --- | --- | --- |
| `$schema` | yes | The Agent Plugins schema identifier. |
| `name` | yes | The **plugin name**. Lowercase letters, digits, `-` and `.`. Tack uses it as the prefix in unit IDs and script names. |
| `version` | no | If missing, Tack uses `version` from `package.json`. |
| `description`, `author`, `homepage`, `repository`, `license`, `keywords` | no | Metadata, as defined by Agent Plugins. |

### Tack extension fields

| Field | Type | Meaning |
| --- | --- | --- |
| `extends` | string[] | Packages whose harness this harness passes on. Resolved from this package's own folder. See [03-resolution.md](03-resolution.md#33-extends). |
| `exclude` | string[] | Units or whole packages to drop from what this harness passes on. |
| `replace` | object | Unit ID → path of a file that takes that unit's place. |
| `docs` | object | Where the docs are and how to index them. See [2.6](#26-docs). |
| `scripts` | object | Script name → script definition. See [05-executables.md](05-executables.md#51-scripts). |
| `projects` | object | Git remote → folder with units for that project. Read only in personal harnesses. See [07-personal.md](07-personal.md#72-example). |

Unknown fields inside the extension MUST make `tack check` fail, so typos do not ship.

## 2.4 Unit kinds

| Kind | Location | Format | Activation |
| --- | --- | --- | --- |
| Rule | `<ns>/rules/*.md` | Markdown with optional frontmatter | Always on, file-scoped, or on demand. See [2.5](#25-rules). |
| Skill | `skills/<name>/SKILL.md` | [Agent Skills](https://agentskills.io/specification) | The agent loads it when relevant or when asked. |
| Sub-agent | `<ns>/agents/*.md` | Markdown with `name`, `description`, `tools`, `model` frontmatter | The agent starts it. Claude Code only in v1. |
| Doc | The folder named in `docs` | Markdown | Listed in an index. The agent reads a page when needed. |
| Script | Named in `scripts` | Any executable file | Run through `tack run`. |
| Hook | `<ns>/hooks.json` | See [05-executables.md](05-executables.md#52-hooks) | The agent runs it on an event. |
| MCP server | `mcp.json` | Agent Plugins MCP configuration | The agent starts it. |
| Permission | `<ns>/permissions.json`, and `allow` on scripts | See [05-executables.md](05-executables.md#54-permissions) | The agent applies it. |

`<ns>` is the extension folder, `io.github.tenphi.tack`.

## 2.5 Rules

A rule is one Markdown file about one topic. Small files make overrides simple: a consumer replaces or drops a whole file, never a part of one.

```markdown
---
description: How to write state maps in Tasty styles
paths: ["**/*.tsx", "**/*.ts"]
---

# State maps

- Put every state of one property in one map.
- …
```

| Frontmatter | Activation |
| --- | --- |
| none | **Always on.** The text goes into the agent's main instructions. |
| `paths`, with or without `description` | **File-scoped.** Active when the agent works on matching files. The description, if any, is the text of the pointer line. |
| `description` only | **On demand.** Listed with its description. The agent reads it when relevant. |

Always-on rules cost context in every session. A package SHOULD keep them short and move details into on-demand rules, docs or skills. `tack check` reports the size of a package's always-on text.

## 2.6 Docs

```json
"docs": { "dir": "../docs", "exclude": ["internal/**"] }
```

1. `dir` is relative to `harness/`. It MAY point outside `harness/` but MUST stay inside the package.
2. If `<dir>/llms.txt` exists, Tack uses it as the index. Its format is the [llms.txt](https://llmstxt.org/) convention: a Markdown list of links with short descriptions.
3. Otherwise Tack builds the index from each page's first heading and its frontmatter `description`.
4. The index points at the files of the **installed** version. See [04-outputs.md](04-outputs.md#42-stable-package-paths).

## 2.7 Unit IDs

Every unit has an ID: `<plugin name>:<kind>/<name>`.

| Unit | ID |
| --- | --- |
| `harness/io.github.tenphi.tack/rules/state-maps.md` in plugin `tasty` | `tasty:rules/state-maps` |
| `harness/skills/uikit-review/` in plugin `uikit` | `uikit:skills/uikit-review` |
| script `probe` in plugin `uikit` | `uikit:scripts/probe` |
| server `docs` in `mcp.json` of plugin `uikit` | `uikit:mcp/docs` |
| hook entry with `"id": "check-styles"` | `uikit:hooks/check-styles` |

`exclude` also accepts a package name, such as `@tenphi/glaze`, to drop a whole package.

## 2.8 Naming rules

1. Plugin names MUST be unique within one resolved graph. On a clash, Tack stops and names both packages. The consumer can then exclude one of them.
2. **Tack never renames a skill.** The Agent Skills format requires a skill's `name` to match its folder name, and agents look skills up by that name.
3. Skill names SHOULD start with the plugin name, such as `uikit-review`, so names from different packages do not collide. `tack check` warns when they do not.
4. When two layers ship a skill with the same name, the higher layer wins and Tack prints a warning.
5. Script names MUST be unique within a plugin. Agents call them as `<plugin name>:<script>`, such as `uikit:probe`.

## 2.9 Validation

`tack check` runs at `prepack` and fails when:

- `plugin.json` or `mcp.json` breaks the Agent Plugins schema;
- a skill breaks the Agent Skills format;
- a Tack extension field is unknown or has the wrong type;
- a path points outside the package, or at a file the npm tarball would not include;
- a link in a rule, skill or doc points at a file that will not be published.

It also prints the size of the always-on text, so authors see what each install costs.
