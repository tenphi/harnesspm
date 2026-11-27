---
description: Set up harnesspm in a project, so your agents get the harness of your dependencies. Ask your agent or run two commands, commit what it wrote, decide which packages may run tools, and check the setup.
---

# Get started

**In short**

- Ask your agent to set up harnesspm, or install `@harnesspm/cli` as a dev dependency and run `npx -y @harnesspm/cli init` once. Your agents then get the harness of your dependencies.
- Commit `AGENTS.md`, `CLAUDE.md`, `harnesspm.json`, `harnesspm.lock.json`, `package.json` and the package manager's lockfile. After that, every install keeps it current, and `npx -y @harnesspm/cli sync --check` in CI catches a missed sync.
- Two things stay with you: which packages may run tools, and the permissions that an agent may not grant itself. You run `npx -y @harnesspm/cli approve` in your own terminal.

This page is for a project that uses libraries. To ship a harness with your library, see [Share a harness from your library](./share.md). To bring your own or your team's way of working to every repository, see [Add your own or your team's harness](./add-your-own.md).

You need Node.js 20 or later, and npm, pnpm, Yarn 1 or Yarn 4 with the `node-modules` linker. harnesspm writes files for Claude Code and Codex.

## Ask your agent

Paste this into Claude Code or Codex, in your project:

```text
Set up harnesspm in this project:
install @harnesspm/cli as a dev dependency
and run `npx -y @harnesspm/cli init`.

Then tell me what it wrote, which packages have
tools that wait for my trust, and what each tool does.
Do not change "trust" yourself.

Details: https://harnesspm.tenphi.me/guides/setup
```

Your agent follows the steps below and stops at trust, which is yours to decide ([step 4](#4-turn-on-a-packages-tools)). Once `init` has run, your agent has three skills for harnesspm itself, so you can [ask for the rest](./ask-your-agent.mdx).

## 1. Install

```shell
npm i -D @harnesspm/cli      # or: pnpm add -D @harnesspm/cli
                             # or: yarn add -D @harnesspm/cli
```

The package is `@harnesspm/cli`. The command it installs is `harnesspm`, so `npx -y @harnesspm/cli …` works in the project from now on.

Up to version 0.16 the package was `@tenphi/harnesspm`. To move a project, run `npm i -D @harnesspm/cli && npm rm @tenphi/harnesspm`, then `npx -y @harnesspm/cli init`. `doctor` reminds you. If you added a harness of your own on a machine, also run `npx -y @harnesspm/cli update` there once. Until harnesspm 1.0 the earlier name keeps working, and nothing needs approving again. See [Moving from `@tenphi/harnesspm`](https://github.com/tenphi/harnesspm/blob/main/docs/spec/10-cli.md#moving-from-tenphiharnesspm).

Do not skip this step. `init` adds a script that calls the `harnesspm` command, so it stops when the project does not list the package as a dependency.

## 2. Run `init`

The examples on this site use one app. It depends on `@acme/ui`, a design system that passes on the harness of `@acme/colors` and `@acme/styles`. The packages are made up, and the output is real:

```text
$ npx -y @harnesspm/cli init
Created harnesspm.json
Added `harnesspm sync` to the "postinstall" script
CLAUDE.md now imports AGENTS.md
⏳ pending: @acme/colors: 1 script (not trusted; a person turns it on in "trust" in harnesspm.json)
⏳ pending: @acme/styles: 1 script, 1 hook (not trusted; a person turns it on in "trust" in harnesspm.json)
⏳ pending: @acme/ui: 1 script (not trusted; a person turns it on in "trust" in harnesspm.json)
harnesspm: 6 rules, 5 skills, 4 docs from 4 packages. Updated 18 files.
To commit: AGENTS.md, CLAUDE.md, harnesspm.json, harnesspm.lock.json, package.json, package-lock.json
Links and settings for this machine stay out of git: .git/info/exclude lists them.
```

`init` does four things:

1. It creates `harnesspm.json`, the project's configuration. Every field is optional.
2. It adds `harnesspm sync` to `postinstall` in a private package, or to `prepare` in a published one. Every full install now runs it, and an install without dev dependencies skips it ([step 5](#5-keep-it-current)).
3. It makes `CLAUDE.md` import `AGENTS.md` with an `@AGENTS.md` line, so Claude Code reads the same rules as Codex.
4. It runs `harnesspm sync`, which finds the harness of every dependency and writes each agent's files.

The four packages are the three `@acme` packages and harnesspm itself. Its own harness teaches agents to use harnesspm, with the skills `harnesspm-import`, `harnesspm-export` and `harnesspm-improve`.

The pending lines are normal. They name who turns the tools on: a person, never the agent. Rules, docs and skills work at once. Scripts, hooks and MCP servers wait until you trust their package ([step 4](#4-turn-on-a-packages-tools)). A rule in the block may already name a script that is still off: `npx -y @harnesspm/cli run` refuses it until then.

A pending line gives only a count. To learn what each tool does, read the package's manifest, `node_modules/.harnesspm/pkgs/<package>/harness/plugin.json`:

- `scripts` has each script's `description`. `"allow": true` means that the script asks to run without a prompt.
- Hooks are in `harness/dev.harnesspm/hooks.json`, and MCP servers in `harness/mcp.json`.

## 3. Commit what it wrote

The block in `AGENTS.md` is instructions to your agent. Read it once, like code, before you commit it.

| File | What it holds | Commit |
| --- | --- | --- |
| `AGENTS.md` | The managed block: the commands that reach the harness, then one line for each rule, docs index and tool of each package | Yes |
| `CLAUDE.md` | `@AGENTS.md`, so Claude Code reads the block. A folder with its own `AGENTS.md` that git tracks gets one too. | Yes |
| `harnesspm.json` | Your configuration: trust, patches, exclusions | Yes |
| `harnesspm.lock.json` | Every harness package and every unit's hash | Yes |
| `package.json` | The dev dependency, and the `postinstall` or `prepare` script | Yes |
| `package-lock.json`, `pnpm-lock.yaml` or `yarn.lock` | The dev dependency, as your package manager locked it | Yes |
| `.claude/`, `.agents/`, `.codex/`, `node_modules/.harnesspm/` | Links and settings for each agent | No. harnesspm lists them in `.git/info/exclude`. |
| `.harnesspm/docs/` | Copies of your dependencies' docs, so that agents find them by searching | No. harnesspm lists `.harnesspm/` in `.git/info/exclude`. |
| `.gitignore` | The line `/.harnesspm/`, which you add, so that formatters such as Prettier skip the docs copies: they read `.gitignore`, not `.git/info/exclude`. `sync` warns until it is there. | Yes |
| `.rgignore` | Lets search tools such as ripgrep into `.harnesspm/docs/`, which git ignores and which is hidden. | No. harnesspm lists it in `.git/info/exclude`. |

```shell
git add .gitignore AGENTS.md CLAUDE.md harnesspm.json harnesspm.lock.json package.json package-lock.json
git commit -m "chore: set up harnesspm"
```

If your repository has `AGENTS.md` files in subfolders, also commit the `CLAUDE.md` that `sync` wrote next to each. Claude Code skips a nested `AGENTS.md` once the root has a `CLAUDE.md`, and the import brings it back.

harnesspm never edits `.gitignore`. Text outside the managed block in `AGENTS.md` stays yours. See [what is committed](https://github.com/tenphi/harnesspm/blob/main/docs/spec/01-overview.md#17-what-is-committed).

## 4. Turn on a package's tools

A package can ship scripts, hooks and MCP servers. They are code, so they run only when your project trusts the package. Trust is your decision, in two steps:

1. The package goes into `trust` in `harnesspm.json`. You edit the file, or tell your agent which packages to add. An agent never adds one by itself. From then on, the package's scripts run through `harnesspm run`, with your agent's usual permission prompt.
2. You run `npx -y @harnesspm/cli approve` in your own terminal. It writes what an agent may not grant itself: the new hooks, MCP servers and allow rules. Your agent cannot do this step. When an agent runs `sync`, these stay pending until the change is merged into the default branch, and `approve` refuses an agent.

For step 1, ask your agent what is waiting first, then say which packages you trust:

```text
Which harnesspm tools are pending, and what does each one do?
```

```text
Trust @acme/ui in harnesspm.
```

Your agent adds the package to `trust` and runs `npx -y @harnesspm/cli sync`:

```json
{
  "$schema": "https://unpkg.com/@harnesspm/cli/schema/harnesspm.schema.json",
  "trust": { "@acme/ui": true }
}
```

The script of `@acme/ui` then appears in the block as a tool. The commands at the top of the block say how to run it and how to see its options with `help acme-ui:tokens`:

```markdown
- Tool: `acme-ui:tokens` — Find a color token by a part of its name, with its light and dark values (acme-ui:scripts/tokens)
```

`@acme/ui` asks for its script to run without a prompt, so step 2 also writes an allow rule for it into `.claude/settings.local.json` and Codex's rules. `true` follows upgrades. Use `"pin"` for a package your team does not control: each new version then waits for `npx -y @harnesspm/cli approve`. See [Trust and safety](./trust.md).

## 5. Keep it current

- A full install, such as `npm install`, `npm ci`, `pnpm install` or `yarn`, runs `sync` for you.
- After `npm install <pkg>`, `npm uninstall <pkg>`, `pnpm add <pkg>` or `pnpm remove <pkg>`, no script runs. harnesspm's own rule tells your agent to run `npx -y @harnesspm/cli sync`. When you install by hand, run it yourself.
- Yarn 4 runs `postinstall` but not `prepare`. In a published package, where `init` uses `prepare`, run `yarn harnesspm sync` after installs. See [package managers](https://github.com/tenphi/harnesspm/blob/main/docs/research/package-managers.md).
- After you edit `harnesspm.json`, run `npx -y @harnesspm/cli sync`.
- An install without dev dependencies, such as `npm ci --omit=dev` in a Docker build, skips the sync, and the install goes on.

Upgrades then show up in pull requests: [Use a package's harness](./use.md#upgrades) shows what changes.

The script that `init` adds checks first that harnesspm is installed:

```json
"scripts": {
  "postinstall": "node -e \"try{require.resolve('@harnesspm/cli/package.json');process.exit(1)}catch{}\" || harnesspm sync"
}
```

Leave it as it is. A plain `harnesspm sync` fails every install without dev dependencies, because the `harnesspm` command is not installed then. A project that an older harnesspm set up has that plain form: run `npx -y @harnesspm/cli init` again to update it. `npx -y @harnesspm/cli doctor` warns until you do. The [install hook](https://github.com/tenphi/harnesspm/blob/main/docs/spec/10-cli.md#the-install-hook) in the specification explains each part.

Add a check to CI, so a missed sync fails the pull request. Or ask your agent: "Add `npx -y @harnesspm/cli sync --check` to our CI, after the install."

```yaml
- run: npm ci
- run: npx -y @harnesspm/cli sync --check
```

`--check` writes nothing and ignores harnesses that people added on their machines. The `sync` that `npm ci` runs does not hide a missed sync: with `CI=true`, it writes only per-machine files, such as links and docs copies, and leaves the committed files for `--check` to compare. A job that commits the result runs `npx -y @harnesspm/cli sync --write` instead.

When something is out of date, `--check` says what to do:

```text
$ npx -y @harnesspm/cli sync --check
❌ AGENTS.md: the harnesspm block is out of date
❌ harnesspm.lock.json is out of date
Run `npx -y @harnesspm/cli sync` and commit the result.
```

## 6. Check the setup

`status` lists the layers, the packages and the always-on size for each agent:

```text
$ npx -y @harnesspm/cli status
📦 dependencies  @acme/ui 4.2.0 → @acme/colors 2.1.0, @acme/styles 3.4.1
🏢 project       harnesspm.json: no changes
➕ added         none
⏳ pending: @acme/colors: 1 script (not trusted; a person turns it on in "trust" in harnesspm.json)
⏳ pending: @acme/styles: 1 script, 1 hook (not trusted; a person turns it on in "trust" in harnesspm.json)
📏 always-on     Codex 1.9 KiB of 32 KiB · Claude Code 32 lines
```

`doctor` checks that per-machine files stay out of git and that the outputs are in place. Each problem names the command that fixes it:

```text
$ npx -y @harnesspm/cli doctor
🔒 Local files
  ✅ 15 per-machine files: ignored by git and not tracked
➕ Harnesses of your own
  ✅ .git/info/exclude can be written, so harnesspm keeps per-machine files out of git
  ℹ️  No harness added yet. Add one with `npx -y @harnesspm/cli add <source>`.
📦 Outputs
  ✅ Committed outputs are up to date
  ✅ 20 per-machine outputs in place
🛡️  Trust
  ⚠️  Off: @acme/colors: 1 script (not trusted; a person turns it on in "trust" in harnesspm.json)
  ⚠️  Off: @acme/styles: 1 script, 1 hook (not trusted; a person turns it on in "trust" in harnesspm.json)

✅ Ready. Nothing to fix.
```

`why` names the source of any unit, every change made to it, and how to change it yourself:

```text
$ npx -y @harnesspm/cli why acme-colors:rules/usage
owner       dependency @acme/colors 2.1.0 (via @acme/ui)
source      node_modules/.harnesspm/pkgs/@acme/colors/harness/dev.harnesspm/rules/usage.md
patch       node_modules/@acme/ui/harness/dev.harnesspm/patches/acme-colors-usage.patch.md (from @acme/ui)
repository  https://github.com/acme/colors
editable    no. Add a `patch`, `replace` or `exclude` in harnesspm.json, or propose the change upstream.
```

## Why one step

A package cannot set this up by itself, and that is on purpose.

- npm 12, pnpm and Bun do not run the install scripts of dependencies until you allow each one ([sources](https://github.com/tenphi/harnesspm/blob/main/docs/research/package-managers.md#install-scripts-of-dependencies)).
- What your agent reads is your project's decision. You take the step once, and you see every later change in review.

## Next

- [Use a package's harness](./use.md): what agents get, and upgrades.
- [Change upstream units](./change-upstream.md): patch, replace or exclude a rule.
- [Ask your agent](./ask-your-agent.mdx): prompts for the tasks after setup, and what stays with you.
