---
description: Set up harnesspm in a project, so your agents get the harness of your dependencies. One command, or one line to your agent. Then commit what it lists, decide which packages may run tools, and check the setup.
---

# Get started

**In short**

- Run `npx -y @harnesspm/cli init` in your project, or ask your agent to. It installs harnesspm, sets the project up, and prints what to commit and what waits for you.
- Commit what `init` lists. After that, every install keeps it current, and `npx -y @harnesspm/cli sync --check` in CI catches a missed sync.
- Two things stay with you: which packages may run tools, and the permissions that an agent may not grant itself. You run `npx -y @harnesspm/cli approve` in your own terminal.

This page is for a project that uses libraries. To ship a harness with your library, see [Share a harness from your library](./share.md). To bring your own or your team's way of working to every repository, see [Add your own or your team's harness](./add-your-own.md). Not sure which? Run `npx -y @harnesspm/cli` in the folder: it names the task for it.

You need Node.js 20 or later, and npm, pnpm, Yarn 1 or Yarn 4 with the `node-modules` linker. harnesspm writes files for Claude Code and Codex.

## Ask your agent

You decide which packages may run tools, and you grant what an agent may not grant itself ([step 3](#3-turn-on-a-packages-tools)). Everything else your agent can do. Paste this into Claude Code or Codex, in your project:

```text
Run `npx -y @harnesspm/cli init` in this project and do what it prints.
```

`init` ends with a report for you, and tells your agent to give it to you and wait for your trust decision. Once it has run, your agent has three skills for harnesspm itself, so you can [ask for the rest](./ask-your-agent.mdx).

## 1. Run `init`

The examples on this site use one app. It depends on `@acme/ui`, a design system that passes on the harness of `@acme/colors` and `@acme/styles`. The packages are made up, and the output is real:

```text
$ npx -y @harnesspm/cli init
Installed @harnesspm/cli as a dev dependency (npm i -D)
Wrote harnesspm.json, the "postinstall" script (syncs on every install), CLAUDE.md (imports AGENTS.md), .gitignore (/.harnesspm/)
harnesspm: 6 rules, 5 skills, 4 docs from 4 packages. Agents find them through the block in AGENTS.md.

Rules, docs and skills work now.
⏳ Waiting for a person: these tools stay off until a person trusts their package.
  @acme/colors  acme-colors:contrast — Measure the WCAG contrast of a text color on a background · no prompt
  @acme/styles  acme-styles:check — Check the styles in a file · no prompt · a PostToolUse hook runs it
  @acme/ui      acme-ui:tokens — Find a color token by a part of its name, with its light and dark values · no prompt
  To turn one on, a person adds its package to "trust" in harnesspm.json, then runs `npx -y @harnesspm/cli approve` in their own terminal. An agent never changes "trust" itself.

To commit: .gitignore, AGENTS.md, CLAUDE.md, harnesspm.json, harnesspm.lock.json, package.json, package-lock.json
In CI, after the install: npx -y @harnesspm/cli sync --check
Agent: report this to the person and wait for their trust decision.
```

`init` does this, in order:

1. It installs `@harnesspm/cli` as a dev dependency, with the package manager your lockfile names. A project that lists it already skips this step.
2. It creates `harnesspm.json`, the project's configuration. Every field is optional.
3. It adds `harnesspm sync` to `postinstall` in a private package, or to `prepare` in a published one. Every full install now runs it, and an install without dev dependencies skips it.
4. It makes `CLAUDE.md` import `AGENTS.md` with an `@AGENTS.md` line, so Claude Code reads the same rules as Codex.
5. It adds `/.harnesspm/` to `.gitignore`, so formatters such as Prettier skip the copies of your dependencies' docs.
6. It runs `harnesspm sync`, which finds the harness of every dependency and writes each agent's files.

The four packages are the three `@acme` packages and harnesspm itself. Its own harness teaches agents to use harnesspm, with the skills `harnesspm-import`, `harnesspm-export` and `harnesspm-improve`.

Rules, docs and skills work at once. Each tool in the list waits until you trust its package ([step 3](#3-turn-on-a-packages-tools)). `no prompt` means that the package asks for the tool to run without your agent's permission prompt. A rule in the block may already name a tool that is still off: `npx -y @harnesspm/cli run` refuses it until then.

## 2. Commit what `init` lists

The block in `AGENTS.md` is instructions to your agent. Read it once, like code, before you commit it. Then commit the files on the `To commit` line:

```shell
git add .gitignore AGENTS.md CLAUDE.md harnesspm.json harnesspm.lock.json package.json package-lock.json
git commit -m "chore: set up harnesspm"
```

The list holds only what git sees as new or changed, so it may be shorter in your project, and it names the `CLAUDE.md` next to each `AGENTS.md` in a subfolder. Links, settings and docs copies for this machine stay out of git: harnesspm lists them in `.git/info/exclude`. Text outside the managed block in `AGENTS.md` stays yours. [Files harnesspm writes](./reference/config.md#files-harnesspm-writes) says what each file holds.

## 3. Turn on a package's tools

A package can ship scripts, hooks and MCP servers. They are code, so they run only when your project trusts the package. Trust is your decision, in two steps:

1. The package goes into `trust` in `harnesspm.json`. You edit the file, or tell your agent which packages to add. An agent never adds one by itself. From then on, the package's scripts run through `harnesspm run`, with your agent's usual permission prompt.
2. You run `npx -y @harnesspm/cli approve` in your own terminal. It writes what an agent may not grant itself: the new hooks, MCP servers and allow rules. Your agent cannot do this step. When an agent runs `sync`, these wait until the change is merged into the default branch, and `approve` refuses an agent.

For step 1, ask your agent what is waiting first, then say which packages you trust:

```text
Which harnesspm tools are waiting for me, and what does each one do?
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

## 4. Keep it current

- A full install, such as `npm install`, `npm ci`, `pnpm install` or `yarn`, runs `sync` for you.
- After `npm install <pkg>`, `npm uninstall <pkg>`, `pnpm add <pkg>` or `pnpm remove <pkg>`, no script runs. harnesspm's own rule tells your agent to run `npx -y @harnesspm/cli sync`. When you install by hand, run it yourself.
- Yarn 4 runs `postinstall` but not `prepare`. In a published package, where `init` uses `prepare`, run `yarn harnesspm sync` after installs. See [package managers](https://github.com/tenphi/harnesspm/blob/main/docs/research/package-managers.md).
- After you edit `harnesspm.json`, run `npx -y @harnesspm/cli sync`.

Upgrades then show up in pull requests: [Use a package's harness](./use.md#upgrades) shows what changes.

Add the check that `init` names to CI, so a missed sync fails the pull request. Or ask your agent: "Add `npx -y @harnesspm/cli sync --check` to our CI, after the install."

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

## 5. Check the setup

In the project, `npx -y @harnesspm/cli` prints its report: the packages and the always-on size for each agent, the checks that per-machine files stay out of git and that the outputs are in place, and what waits for you. Each problem names the command that fixes it. `status` and `doctor` print the same report, and `doctor` fails when a check fails:

```text
$ npx -y @harnesspm/cli
📦 dependencies  @acme/ui 4.2.0 → @acme/colors 2.1.0, @acme/styles 3.4.1 · @harnesspm/cli …
🏢 project       harnesspm.json: no changes
📏 always-on     Codex 1.7 KiB of 32 KiB · Claude Code 31 lines
🔒 Local files
  ✅ 15 per-machine files: ignored by git and not tracked
➕ Harnesses of your own
  ✅ .git/info/exclude can be written, so harnesspm keeps per-machine files out of git
  ℹ️  No harness added yet. Add one with `npx -y @harnesspm/cli add <source>`.
📝 Outputs
  ✅ Committed outputs are up to date
  ✅ 40 per-machine outputs in place
⏳ Waiting for a person
  - @acme/colors: 1 script (not trusted). A person adds "@acme/colors": true to "trust" in harnesspm.json, then runs `npx -y @harnesspm/cli approve`.
  - @acme/styles: 1 script, 1 hook (not trusted). A person adds "@acme/styles": true to "trust" in harnesspm.json, then runs `npx -y @harnesspm/cli approve`.
  - @acme/ui: 1 script (not trusted). A person adds "@acme/ui": true to "trust" in harnesspm.json, then runs `npx -y @harnesspm/cli approve`.

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
