---
description: Ship rules, docs, skills and tools for agents in your library's npm package, and pass on the harness of the libraries it builds on.
---

# Share a harness from your library

**In short**

- Install `@harnesspm/cli` as a dev dependency. Then add a `harness/` folder with a `plugin.json` and one Markdown rule.
- List `harness` in the `files` field of `package.json`, and run `harnesspm check` at `prepack`.
- Use `extends` to pass on the harness of the libraries you build on, and `patch` to adapt their rules for your users.
- Say in the README that the package ships a harness. Users' agents get it on the next install, once their project uses harnesspm.

## Install harnesspm

```shell
npm i -D @harnesspm/cli
```

Your library needs harnesspm only to write and check its harness, so it is a dev dependency. Your users install harnesspm in their own project.

The steps also ship in the package, as the `harnesspm-export` skill: `node_modules/@harnesspm/cli/harness/skills/harnesspm-export/SKILL.md`.

## The smallest harness

A harness can be two files: a manifest and one rule. `npx harnesspm new` writes both from templates:

```text
$ npx harnesspm new rule usage
Wrote in the project's own harness (harness/):
  harness/plugin.json
  harness/dev.harnesspm/rules/usage.md
Next: edit it, then run `npx harnesspm check`. To see the harness in this repository's AGENTS.md too, run `npx harnesspm init`.
```

`npx harnesspm new --help` lists every kind. The manifest, `harness/plugin.json`, starts like this:

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

## Tell your users

A project that uses harnesspm gets your harness on its next install. Other projects get nothing by themselves, because no package can set itself up on install ([sources](https://github.com/tenphi/harnesspm/blob/main/docs/research/package-managers.md#install-scripts-of-dependencies)). So add a note to your README:

````markdown
## Coding agents

This package ships a harness for coding agents: rules, docs and tools that match the version you install. To give it to Claude Code and Codex, set up [harnesspm](https://harnesspm.tenphi.me) in your project:

```shell
npm i -D @harnesspm/cli
npx harnesspm init
```
````

Change "rules, docs and tools" to what your harness has.

## See what your users get

Sharing needs no `npx harnesspm init` in the library's repository. Run it when you want to see the harness as your users' agents will:

- Your own harness then shows in the block in your `AGENTS.md`, under `(this project)`, and your agents read it.
- `npx harnesspm why <ID>` and `npx harnesspm status` work in the repository. Without `init`, `why` finds no unit there.
- `init` adds `harnesspm sync` to the `prepare` script, and writes files to commit. [Set up a project](./setup.md) has the list.

## Rules

A rule is one Markdown file about one topic, in `harness/dev.harnesspm/rules/`. Its frontmatter decides when the agent sees it:

| Frontmatter | The agent sees it |
| --- | --- |
| None | Always. The text goes into the block in `AGENTS.md`. |
| `paths` | When it works on matching files, such as `["**/*.tsx"]`. |
| `description` only | On demand. The block lists it with its description. |

- Keep always-on rules short. They cost context in every session. Move details into on-demand rules, docs or skills.
- Name each `##` section by what it asks, such as "Never edit outputs". The `AGENTS.md` block shows an always-on rule as its title and these headings, and agents read the text with `npx -y @harnesspm/cli help <package>`.
- When a rule has more than a few lines, split it into small sections with `##` headings. A user can then patch one section and keep the rest.
- When a skill must run in a situation, also name it in an always-on rule: "To check a theme, use the `my-lib-theme` skill."

## Docs

Point `docs` at your docs folder, relative to `harness/`:

```json
"extensions": { "dev.harnesspm": { "docs": "../docs" } }
```

The block gets one line that points at an index of these pages, at the installed version. harnesspm uses your `llms.txt` as the index when the folder has one. Otherwise it lists every `.md` and `.mdx` page with its title and `description`. `check` fails on a page whose frontmatter is not valid YAML. Add `docs` to `files` too.

Your docs folder can be one that your build writes and git ignores. Your users get it from the tarball. In your own repository, `sync` leaves it out, so the lock stays the same before and after a build, and `check` at `prepack` still reads it.

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

- Agents run it as `npx -y @harnesspm/cli run my-lib:probe -- <args>`, with `-C <dir>` from outside the project. The runner always runs the installed version. In a project without an install, it runs the script from the fetched package, which has none of your dependencies: a script that imports only Node.js's own modules works there too.
- `description` shows the script to agents. Without it, only your hooks and MCP servers use it.
- `allow: true` asks that agents may run it without a prompt. It takes effect only in projects that trust your package.

Nothing executable runs until a project trusts your package. See [Trust and safety](./trust.md) and [Executables](https://github.com/tenphi/harnesspm/blob/main/docs/spec/05-executables.md).

## Pass on the harness you build on

When your library builds on another library that ships a harness, list it in `extends`:

```json
"extensions": {
  "dev.harnesspm": {
    "extends": ["@acme/colors", "@acme/styles"]
  }
}
```

- Each name resolves from your package's folder, so it must be one of your dependencies or peer dependencies. Users get the version your library uses.
- Only `extends` passes harness on. Your other dependencies, such as your development tools, never reach your users.
- An entry that is an optional peer dependency is skipped quietly when the user has not installed it.

## Adapt what you pass on

You can change an upstream unit for all your users, with the same fields a project uses: `exclude`, `replace` and `patch`. To patch a rule, use harnesspm in your library's own repository too (`npx harnesspm init`), then:

```text
$ npx harnesspm new patch acme-colors:rules/usage
Wrote harness/dev.harnesspm/patches/acme-colors-usage.patch.md, registered in harness/plugin.json.
Keep only the sections you change and edit them. Delete the others. To drop a section, list its heading in `remove:` frontmatter.
```

Because the rule reaches your repository through your own harness's `extends`, `new patch` registers the patch in `harness/plugin.json`, so your users get the change too. In the site's example, `@acme/ui` patches the colors rule of `@acme/colors`, so that apps on `@acme/ui` use its tokens.

When an upstream skill does not fit your users, replace it with a skill folder of your own, in `harness/plugin.json`:

```json
"replace": { "acme-colors:skills/acme-colors-theme": "./skills/acme-colors-theme" }
```

The folder is not a skill of its own. It takes the upstream skill's ID and place, so its `SKILL.md` keeps the upstream `name`. Tools, hooks and other units can't be replaced: exclude them and add your own.

With harnesspm in your repository, your own agents also read your harness, in the project layer. Contributors see what users see.

## More

- [Package format](https://github.com/tenphi/harnesspm/blob/main/docs/spec/02-package-format.md) in the specification: every unit kind, manifest field and validation rule.
- [Package format reference](./reference/package-format.md): the same, as lookup tables.
- harnesspm's own harness is a small example: [`harness/`](https://github.com/tenphi/harnesspm/tree/main/harness). The home page lists [more projects that ship one](/#in-real-projects).
