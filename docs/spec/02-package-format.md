# 2. Package format

**In short**

- A harness is a `harness/` folder at the package root. It is an [Agent Plugins 1.0](https://agent-plugins.org/) plugin: `plugin.json`, `skills/`, `mcp.json`.
- Everything harnesspm adds lives in the standard's extension namespace: the `dev.harnesspm` field in `plugin.json` and the folder of the same name.
- Every unit has an ID, `<plugin name>:<kind>/<name>`, used to exclude, replace or patch it.

The smallest harness is two files:

```text
harness/
├── plugin.json                          {"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "name": "mylib"}
└── dev.harnesspm/rules/usage.md  one rule, always on
```

The portable parts (skills and MCP servers) work in any Agent Plugins client, even without harnesspm.

## 2.1 Location

1. A package MUST put its harness in a folder named `harness/` at the package root.
2. If `package.json` has a `files` field, it MUST include `harness`.
3. harnesspm MUST NOT run any code from a package to discover its harness. Discovery reads files only.
> pnpm 12.11 and later link package-root `skills/` folders from direct dependencies by themselves. harnesspm reads only `harness/skills/`, so the two never link the same skills twice.

## 2.2 Layout

A package that uses every unit kind:

```text
harness/
├── plugin.json                       ← Agent Plugins manifest (required)
├── skills/                           ← Agent Skills, one folder each
│   └── uikit-review/
│       └── SKILL.md
├── mcp.json                          ← Agent Plugins MCP configuration
└── dev.harnesspm/            ← harnesspm extension folder
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

The extension folder name is the harnesspm namespace, `dev.harnesspm`, based on the domain `harnesspm.dev`. See [13-open-questions.md](13-open-questions.md#133-extension-namespace).

## 2.3 Manifest

`plugin.json` follows Agent Plugins 1.0. Its schema is closed, so all harnesspm fields go under `extensions["dev.harnesspm"]`.

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
        },
        "check-styles": { "file": "./dev.harnesspm/scripts/check-styles.mjs" }
      },
      "exclude": ["tasty:rules/legacy-tokens"],
      "replace": { "tasty:rules/lint-comments": "./dev.harnesspm/rules/lint-comments.md" }
    }
  }
}
```

### Core fields (Agent Plugins)

| Field | Required | Notes |
| --- | --- | --- |
| `$schema` | yes | The Agent Plugins schema identifier. |
| `name` | yes | The **plugin name**. Lowercase letters, digits, `-` and `.`. harnesspm uses it as the prefix in unit IDs and script names. |
| `version` | no | If missing, harnesspm uses `version` from `package.json`. |
| `description`, `author`, `homepage`, `repository`, `license`, `keywords` | no | Metadata, as defined by Agent Plugins. |

### harnesspm extension fields

| Field | Type | Meaning |
| --- | --- | --- |
| `extends` | string[] | Packages whose harness this harness passes on. Resolved from this package's own folder. See [03-resolution.md](03-resolution.md#33-extends). |
| `exclude` | string[] | Units or whole packages to drop from what this harness passes on. |
| `replace` | object | Unit ID → path of a file that takes that unit's place. |
| `patch` | object | Rule ID → path of a patch that changes some of its sections. See [2.5](#25-rules). |
| `docs` | string | The folder with the package's docs. See [2.7](#27-docs). |
| `scripts` | object | Script name → script definition. See [05-executables.md](05-executables.md#51-scripts). |
| `projects` | object | Git remote → folder with units for that repository. Read only in added harnesses. See [07-added.md](07-added.md#72-example). |

Unknown fields inside the extension MUST make `harnesspm check` fail, so typos do not ship.

## 2.4 Unit kinds

| Kind | Location | Format | Activation |
| --- | --- | --- | --- |
| Rule | `<ns>/rules/*.md` | Markdown with optional frontmatter | Always on, file-scoped, or on demand. See [2.5](#25-rules). |
| Skill | `skills/<name>/SKILL.md` | [Agent Skills](https://agentskills.io/specification) | The agent loads it when relevant or when asked. |
| Sub-agent | `<ns>/agents/*.md` | Markdown: `name` and `description` frontmatter, instructions in the body. See [2.6](#26-sub-agents). | The agent starts it. |
| Doc | The folder named in `docs` | Markdown | Listed in an index. The agent reads a page when needed. |
| Script | Named in `scripts` | Any executable file | Run through `harnesspm run`. |
| Hook | `<ns>/hooks.json` | See [05-executables.md](05-executables.md#52-hooks) | The agent runs it on an event. |
| MCP server | `mcp.json` | Agent Plugins MCP configuration | The agent starts it. |
| Permission | `<ns>/permissions.json`, and `allow` on scripts | See [05-executables.md](05-executables.md#54-permissions) | The agent applies it. |

`<ns>` is the extension folder, `dev.harnesspm`. A file that `replace` or `patch` names is not a unit of its own, even inside `rules/`.

An agent picks a skill by its `description`. Say what the skill does, then, after "Use when", the situations and the words people use when they need it. Being picked is likely, not certain. When a skill must run in a situation, also add an always-on rule that names it: "To trace UI text, use the `uikit-text-origin` skill."

## 2.5 Rules

A rule is one Markdown file about one topic. Small files make overrides simple: a consumer replaces or drops a whole file, or patches a few of its sections.

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

Always-on rules cost context in every session. A package SHOULD keep them short and move details into on-demand rules, docs or skills. `harnesspm check` reports the size of a package's always-on text.

A package SHOULD split a rule into small sections with `##` headings, so that others can change one section with a patch.

### Patches

A patch changes some sections of a rule and keeps the rest. It is a Markdown file:

```markdown
---
remove: ["Legacy tokens"]
---

## Disable comments

Use `oxlint-disable-next-line`. `eslint-disable` comments are ignored in this project.
```

1. A **section** is a heading and everything up to the next heading of the same or a higher level.
2. Each section in the patch **replaces** the section with the same heading text and level in the rule.
3. A section whose heading the rule does not have is **added** at the end.
4. Text before the first heading of the patch is **added** at the end of the rule.
5. `remove` in the frontmatter lists headings whose sections are **removed**.

A patch keeps the rule's ID. `harnesspm why` lists the patches applied to a unit. Patches work on rules only. Where patches come from and in which order they apply is defined in [03-resolution.md](03-resolution.md#34-priority).

## 2.6 Sub-agents

```markdown
---
name: uikit-reviewer
description: Reviews UI changes against UI Kit rules. Use for UI pull requests.
claude: { tools: "Read, Grep, Glob", model: "sonnet" }
codex: { model_reasoning_effort: "medium" }
---

Review the change like an owner. Do not edit files.
```

| Part | Claude Code | Codex |
| --- | --- | --- |
| `name`, `description` | frontmatter | `name`, `description` |
| Body | the prompt | `developer_instructions` |
| `claude:` | copied into the frontmatter | ignored |
| `codex:` | ignored | copied into the TOML file |

Only `name`, `description` and the body are portable. Agent-specific settings, such as models and tool limits, go under the agent's own key.

## 2.7 Docs

```json
"docs": "../docs"
```

1. The path is relative to `harness/`. It MAY point outside `harness/` but MUST stay inside the package.
2. If `<dir>/llms.txt` exists, harnesspm uses it as the index. Its format is the [llms.txt](https://llmstxt.org/) convention: a Markdown list of links with short descriptions.
3. Otherwise harnesspm builds the index from each page's first heading and its frontmatter `description`. To leave pages out, write an `llms.txt`.
4. The index points at the files of the **installed** version. See [04-outputs.md](04-outputs.md#42-stable-package-paths).

## 2.8 Unit IDs

Every unit has an ID: `<plugin name>:<kind>/<name>`.

| Unit | ID |
| --- | --- |
| `harness/dev.harnesspm/rules/state-maps.md` in plugin `tasty` | `tasty:rules/state-maps` |
| `harness/skills/uikit-review/` in plugin `uikit` | `uikit:skills/uikit-review` |
| script `probe` in plugin `uikit` | `uikit:scripts/probe` |
| server `docs` in `mcp.json` of plugin `uikit` | `uikit:mcp/docs` |
| hook entry with `"id": "check-styles"` | `uikit:hooks/check-styles` |
| `harness/dev.harnesspm/agents/uikit-reviewer.md` | `uikit:agents/uikit-reviewer` |
| the docs of plugin `uikit` | `uikit:docs` |
| `permissions.json` of plugin `uikit` | `uikit:permissions` |

`exclude` also accepts a package name, such as `@tenphi/glaze`, to drop a whole package.

Commands name scripts and MCP servers in a short form, `<plugin name>:<name>`: `harnesspm run uikit:probe`, `harnesspm mcp uikit:docs`. Agents see an MCP server as `<plugin name>-<server>`, such as `uikit-docs`.

## 2.9 Naming rules

1. Plugin names MUST be unique within one resolved graph. On a clash, harnesspm stops and names both packages. The consumer can then exclude one of them.
2. **harnesspm never renames a skill.** The Agent Skills format requires a skill's `name` to match its folder name, and agents look skills up by that name.
3. Skill names SHOULD start with the plugin name, such as `uikit-review`, so names from different packages do not collide. `harnesspm check` warns when they do not.
4. When two layers ship a skill with the same name, the higher layer wins and harnesspm prints a warning.
5. Script names MUST be unique within a plugin. Agents call them as `<plugin name>:<script>`, such as `uikit:probe`.

## 2.10 Validation

`harnesspm check` runs at `prepack` and fails when:

- `plugin.json` or `mcp.json` breaks the Agent Plugins schema;
- a skill breaks the Agent Skills format;
- a harnesspm extension field is unknown or has the wrong type;
- a path points outside the package, or at a file the npm tarball would not include;
- a link in a rule, skill or doc points at a file that will not be published.
