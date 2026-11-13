---
description: Ship rules, docs, skills and tools for agents in your library's npm package, and pass on the harness of the libraries it builds on.
---

# Share a harness from your library

**In short**

- Add a `harness/` folder with a `plugin.json` and one Markdown rule. Your users' agents get it on their next install.
- List `harness` in the `files` field of `package.json`, and run `harnesspm check` at `prepack`.
- Use `extends` to pass on the harness of the libraries you build on, and `patch` to adapt their rules for your users.

Your users install harnesspm in their project. Your library adds it as a dev dependency for the `prepack` check, and needs no runtime dependency on it.

## The smallest harness

A harness can be two files: a manifest and one rule. `npx harnesspm new` writes both from templates:

```text
$ npx harnesspm new rule usage
Created in the project harness (harness):
  harness/dev.harnesspm/rules/usage.md
Edit it, then save it the way that harness's owner wants (`npx harnesspm why <ID>` names the rules).
```

It also creates the manifest, `harness/plugin.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-lib"
}
```

`plugin.json` is an [Agent Plugins 1.0](https://agent-plugins.org/) manifest. Its `name` is the **plugin name**: it starts the ID of every unit, such as `my-lib:rules/usage`. Everything harnesspm adds lives in the `dev.harnesspm` extension field and folder.

## Publish it

```json
{
  "files": ["dist", "harness"],
  "scripts": { "prepack": "harnesspm check" }
}
```

`harnesspm check` fails when a manifest, a skill or an extension field is invalid, when a path leaves the package, or when a file the harness needs would not be published. It also reports the size of your always-on text:

```text
$ npx harnesspm check
📏 always-on text of my-lib: 0.1 KiB
✅ harness is valid
```

## Rules

A rule is one Markdown file about one topic, in `harness/dev.harnesspm/rules/`. Its frontmatter decides when the agent sees it:

| Frontmatter | The agent sees it |
| --- | --- |
| None | Always. The text goes into the block in `AGENTS.md`. |
| `paths` | When it works on matching files, such as `["**/*.tsx"]`. |
| `description` only | On demand. The block lists it with its description. |

- Keep always-on rules short. They cost context in every session. Move details into on-demand rules, docs or skills.
- Split a rule into small sections with `##` headings. A user can then patch one section and keep the rest.
- When a skill must run in a situation, also name it in an always-on rule: "To check a theme, use the `my-lib-theme` skill."

## Docs

Point `docs` at your docs folder, relative to `harness/`:

```json
"extensions": { "dev.harnesspm": { "docs": "../docs" } }
```

The block gets one line that points at an index of these pages, at the installed version. harnesspm uses your `llms.txt` as the index when the folder has one. Otherwise it lists every `.md` and `.mdx` page with its title and `description`. Add `docs` to `files` too.

## Skills and sub-agents

```shell
npx harnesspm new skill review     # harness/skills/my-lib-review/SKILL.md
npx harnesspm new agent reviewer   # harness/dev.harnesspm/agents/reviewer.md
```

Skills follow the [Agent Skills](https://agentskills.io/specification) format, so they also work without harnesspm. `new` puts the plugin name in front of a skill's name, so names from different packages do not collide. An agent picks a skill by its `description`: say what it does, then "Use when" and the words people use.

## Scripts, hooks and MCP servers

```shell
npx harnesspm new script probe   # harness/dev.harnesspm/scripts/probe.mjs
npx harnesspm new hook check     # a PostToolUse hook that runs a script
npx harnesspm new mcp docs       # harness/mcp.json and a stdio server
```

A script is registered in `plugin.json`:

```json
"scripts": {
  "probe": {
    "file": "./dev.harnesspm/scripts/probe.mjs",
    "description": "Capture a story's DOM and computed CSS",
    "allow": true
  }
}
```

- Agents run it as `npx harnesspm run my-lib:probe -- <args>`. The runner always runs the installed version.
- `description` shows the script to agents. Without it, only your hooks and MCP servers use it.
- `allow: true` asks that agents may run it without a prompt. It takes effect only in projects that trust your package.

Nothing executable runs until a project trusts your package. See [Trust and safety](./trust.md) and [Executables](../spec/05-executables.md).

## Pass on the harness you build on

When your library builds on another library that ships a harness, list it in `extends`:

```json
"extensions": {
  "dev.harnesspm": {
    "extends": ["@tenphi/glaze", "@tenphi/tasty"]
  }
}
```

- Each name resolves from your package's folder, so it must be one of your dependencies or peer dependencies. Users get the version your library uses.
- Only `extends` passes harness on. Your other dependencies, such as your development tools, never reach your users.
- An entry that is an optional peer dependency is skipped quietly when the user has not installed it.

## Adapt what you pass on

You can change an upstream unit for all your users, with the same fields a project uses: `exclude`, `replace` and `patch`. To patch a rule, use harnesspm in your library's own repository too (`npx harnesspm init`), then:

```text
$ npx harnesspm new patch glaze:rules/colors
Wrote harness/dev.harnesspm/patches/glaze-colors.patch.md, registered in harness/plugin.json.
Keep only the sections you change and edit them. Delete the others. To drop a section, list its heading in `remove:` frontmatter.
```

Because the rule reaches your repository through your own harness's `extends`, `new patch` registers the patch in `harness/plugin.json`, so your users get the change too. UI Kit does this: it patches Glaze's colors rule so that apps on UI Kit use UI Kit's palette tokens.

With harnesspm in your repository, your own agents also read your harness, in the project layer. Contributors see what users see.

## More

- [Package format](../spec/02-package-format.md): every unit kind, manifest field and validation rule.
- [Package format reference](./reference/package-format.md): the same, as lookup tables.
- harnesspm's own harness is a small example: [`harness/`](https://github.com/tenphi/harnesspm/tree/main/harness).
