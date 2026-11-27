---
description: Ship rules, docs, skills and tools for agents in your library's npm package. Ask your agent to add the harness, decide what goes in, publish it, tell your users, and pass on the harness of the libraries you build on.
---

# Share a harness from your library

**In short**

- Ask your agent to add a harness to your library with harnesspm. It is a `harness/` folder in your npm package, with a `plugin.json` and Markdown rules. harnesspm is only a dev dependency.
- You decide what every user's agent must always know. Keep that short.
- List `harness` in the `files` field of `package.json`, run `harnesspm check` at `prepack`, and say in the README that the package ships a harness.
- Use `extends` to pass on the harness of the libraries you build on, and `patch` to adapt their rules for your users.

This page is for a library's author. To use the harness of your dependencies, see [Get started](./setup.md). To bring your own way of working to every repository, see [Add your own or your team's harness](./add-your-own.md).

## What you decide

A harness costs your users context, so the choice is yours:

- **Always-on rules** are in every session of every user. Keep them to the few things agents get wrong with your library.
- **Docs and skills** load only when an agent needs them. Put the details there.
- **Tools**, such as scripts, hooks and MCP servers, run only in projects that trust your package.

## Ask your agent

Paste this into Claude Code or Codex, in your library's repository:

```text
Use harnesspm to share a harness from this package,
so that the agents of its users know how to use it.

1. Install @harnesspm/cli as a dev dependency.
2. Follow https://harnesspm.tenphi.me/guides/share.
   The installed package has the steps too, in its
   harnesspm-export skill.
3. Draft one short rule about the mistakes agents
   make with this package, from our docs and source.
   I will correct it.
4. Set the harness's `docs` field to our docs folder.
5. Show me the harness before you commit.
```

Your agent knows nothing about harnesspm in this repository yet. So the prompt names harnesspm, and says where the steps are. Keep both when you write your own.

Your agent follows the steps below. The rule it writes is a draft: you know which mistakes agents really make with your library. Then ask for what you need, and name harnesspm each time:

```text
Add a skill to our harnesspm harness that walks
an agent through a migration to version 3.
```

Does your library build on another one that ships a harness? Ask: "Pass on the harness of `@acme/colors` in our harnesspm harness." Your users then get both, in the version you use.

## Install harnesspm

```shell
npm i -D @harnesspm/cli
```

Your library needs harnesspm only to write and check its harness, so it is a dev dependency. Your users install harnesspm in their own project.

The steps also ship in the package, as the `harnesspm-export` skill: `node_modules/@harnesspm/cli/harness/skills/harnesspm-export/SKILL.md`.

## The smallest harness

A harness can be two files: a manifest and one rule. `npx -y @harnesspm/cli new` writes both from templates:

```text
$ npx -y @harnesspm/cli new rule usage
Wrote in the project's own harness (harness/):
  harness/plugin.json
  harness/dev.harnesspm/rules/usage.md
Next: edit it, then run `npx -y @harnesspm/cli check`. To see the harness in this repository's AGENTS.md too, run `npx -y @harnesspm/cli init`.
```

`npx -y @harnesspm/cli new --help` lists every kind. The manifest, `harness/plugin.json`, starts like this:

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
$ npx -y @harnesspm/cli check
📏 always-on text of my-lib: 0.1 KiB
✅ harness is valid
```

## Tell your users

Publish as usual. A project that uses harnesspm gets your harness on its next install. Other projects get nothing by themselves, because [no package can set itself up on install](./setup.md#why-one-step). So add a note to your README, or ask your agent to:

````markdown
## Coding agents

This package ships a harness for coding agents: rules, docs and tools that match the version you install. To give it to Claude Code and Codex, set up [harnesspm](https://harnesspm.tenphi.me) in your project:

```shell
npm i -D @harnesspm/cli
npx -y @harnesspm/cli init
```
````

Change "rules, docs and tools" to what your harness has.

## See what your users get

Sharing needs no `npx -y @harnesspm/cli init` in the library's repository. Run it when you want to see the harness as your users' agents will, or ask your agent:

```text
Set up harnesspm in this repository too:
run `npx -y @harnesspm/cli init`.
```

- Your own harness then shows in the block in your `AGENTS.md`, under `(this project)`, and your agents read it. Work with it for a while, and fix what misleads them.
- `npx -y @harnesspm/cli why <ID>` and `npx -y @harnesspm/cli status` work in the repository. Without `init`, `why` finds no unit there.
- `init` adds `harnesspm sync` to the `prepare` script, and writes files to commit. [Get started](./setup.md#3-commit-what-it-wrote) has the list.

## Rules

A rule is one Markdown file about one topic, in `harness/dev.harnesspm/rules/`. Its frontmatter decides when the agent sees it:

| Frontmatter | The agent sees it |
| --- | --- |
| None | Always. The text goes into the block in `AGENTS.md`. |
| `paths` | When it works on matching files, such as `["**/*.tsx"]`. |
| `description` only | On demand. The block lists it with its description. |

- Keep always-on rules short ([What you decide](#what-you-decide)). Move details into on-demand rules, docs or skills.
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
npx -y @harnesspm/cli new skill review     # harness/skills/my-lib-review/SKILL.md
npx -y @harnesspm/cli new agent reviewer   # harness/dev.harnesspm/agents/reviewer.md
```

Skills follow the [Agent Skills](https://agentskills.io/specification) format, so they also work without harnesspm. `new` puts the plugin name in front of a skill's name, so names from different packages do not collide. An agent picks a skill by its `description`: say what it does, then "Use when" and the words people use.

## Scripts, hooks and MCP servers

```shell
npx -y @harnesspm/cli new script probe   # harness/dev.harnesspm/scripts/probe.mjs
npx -y @harnesspm/cli new hook check     # a PostToolUse hook that runs a script
npx -y @harnesspm/cli new mcp docs       # harness/mcp.json and a stdio server
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

You can change an upstream unit for all your users, with the same fields a project uses: `exclude`, `replace` and `patch`. To patch a rule, use harnesspm in your library's own repository too (`npx -y @harnesspm/cli init`), then:

```text
$ npx -y @harnesspm/cli new patch acme-colors:rules/usage
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
- [Ask your agent](./ask-your-agent.mdx): prompts for the tasks after setup.
- harnesspm's own harness is a small example: [`harness/`](https://github.com/tenphi/harnesspm/tree/main/harness). The home page lists [more projects that ship one](/#in-real-projects).
