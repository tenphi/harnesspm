---
description: Every step of setting up harnesspm in a project - install, init, what to commit, trust, the CI check and the commands that check the setup.
---

# Set up a project

**In short**

- Install `@tenphi/harnesspm` as a dev dependency and run `npx harnesspm init` once.
- Commit `AGENTS.md`, `CLAUDE.md`, `harnesspm.json`, `harnesspm.lock.json`, `package.json` and the package manager's lockfile.
- Trust is the person's decision. An agent asks first. The person runs `npx harnesspm approve` in their own terminal for what an agent may not grant itself.
- Add `npx harnesspm sync --check` to CI.

You need Node.js 20 or later, and npm, pnpm, Yarn 1 or Yarn 4 with the `node-modules` linker. harnesspm writes files for Claude Code and Codex.

## 1. Install

```shell
npm i -D @tenphi/harnesspm      # or: pnpm add -D @tenphi/harnesspm
                                # or: yarn add -D @tenphi/harnesspm
```

The package is `@tenphi/harnesspm`. The command it installs is `harnesspm`, so `npx harnesspm …` works in the project from now on.

Do not skip this step. `init` adds a script that calls the `harnesspm` command, so it stops when the project does not list the package as a dependency.

## 2. Run `init`

The examples on this site use one app. It depends on `@acme/ui`, a design system that passes on the harness of `@acme/colors` and `@acme/styles`. The packages are made up, and the output is real:

```text
$ npx harnesspm init
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

The pending lines are normal. They name who turns the tools on: a person, never the agent. Rules, docs and skills work at once. Scripts, hooks and MCP servers wait until you trust their package ([step 4](#4-turn-on-a-packages-tools)). A rule in the block may already name a script that is still off: `npx -y @tenphi/harnesspm run` refuses it until then.

A pending line gives only a count. To learn what each tool does, read the package's manifest, `node_modules/.harnesspm/pkgs/<package>/harness/plugin.json`:

- `scripts` has each script's `description`. `"allow": true` means that the script asks to run without a prompt.
- Hooks are in `harness/dev.harnesspm/hooks.json`, and MCP servers in `harness/mcp.json`.

## 3. Commit what it wrote

| File | What it holds | Commit |
| --- | --- | --- |
| `AGENTS.md` | The managed block: the commands that reach the harness, then one line for each rule, docs index and tool of each package | Yes |
| `CLAUDE.md` | `@AGENTS.md`, so Claude Code reads the block. A folder with its own `AGENTS.md` that git tracks gets one too. | Yes |
| `harnesspm.json` | Your configuration: trust, patches, exclusions | Yes |
| `harnesspm.lock.json` | Every harness package and every unit's hash | Yes |
| `package.json` | The dev dependency, and the `postinstall` or `prepare` script | Yes |
| `package-lock.json`, `pnpm-lock.yaml` or `yarn.lock` | The dev dependency, as your package manager locked it | Yes |
| `.claude/`, `.agents/`, `.codex/`, `node_modules/.harnesspm/` | Links and settings for each agent | No. harnesspm lists them in `.git/info/exclude`. |
| `.rgignore` | Lets search tools such as ripgrep into the copies of your dependencies' docs in `node_modules/.harnesspm/docs/`. Agents' search skips `node_modules` otherwise. | No. harnesspm lists it in `.git/info/exclude`. |

```shell
git add AGENTS.md CLAUDE.md harnesspm.json harnesspm.lock.json package.json package-lock.json
git commit -m "chore: set up harnesspm"
```

If your repository has `AGENTS.md` files in subfolders, also commit the `CLAUDE.md` that `sync` wrote next to each. Claude Code skips a nested `AGENTS.md` once the root has a `CLAUDE.md`, and the import brings it back.

harnesspm never edits `.gitignore`. Text outside the managed block in `AGENTS.md` stays yours. See [what is committed](https://github.com/tenphi/harnesspm/blob/main/docs/spec/01-overview.md#17-what-is-committed).

## 4. Turn on a package's tools

A package can ship scripts, hooks and MCP servers. They run only when your project trusts the package.

Trust is the person's decision, in two steps:

1. The package goes into `trust` in `harnesspm.json`. The person edits the file, or tells an agent which packages to add. An agent never adds one by itself. From then on, the package's scripts run through `harnesspm run`, with the agent's usual permission prompt.
2. The person runs `npx harnesspm approve` in their own terminal. It writes what an agent may not grant itself: the new hooks, MCP servers and allow rules. When an agent runs `sync`, these stay pending until the change is merged into the default branch, and `approve` refuses an agent.

Step 1 looks like this:

```json
{
  "$schema": "https://unpkg.com/@tenphi/harnesspm/schema/harnesspm.schema.json",
  "trust": { "@acme/ui": true }
}
```

After step 1 and a `sync`, the script of `@acme/ui` appears in the block as a tool. The commands at the top of the block say how to run it and how to see its options with `help acme-ui:tokens`:

```markdown
- Tool: `acme-ui:tokens` — Find a color token by a part of its name, with its light and dark values (acme-ui:scripts/tokens)
```

`@acme/ui` asks for its script to run without a prompt, so step 2 also writes an allow rule for it into `.claude/settings.local.json` and Codex's rules. `true` follows upgrades. Use `"pin"` for a package your team does not control: each new version then waits for `npx harnesspm approve`. See [Trust and safety](./trust.md).

## 5. Keep it current

- A full install, such as `npm install`, `npm ci` or `pnpm install`, runs `sync` for you.
- After `npm install <pkg>`, `npm uninstall <pkg>` or `pnpm add <pkg>`, no script runs. Run `npx harnesspm sync` yourself.
- After you edit `harnesspm.json`, run `npx harnesspm sync`.
- An install without dev dependencies, such as `npm ci --omit=dev` in a Docker build, skips the sync, and the install goes on.

The script that `init` adds checks first that harnesspm is installed:

```json
"scripts": {
  "postinstall": "node -e \"try{require.resolve('@tenphi/harnesspm/package.json');process.exit(1)}catch{}\" || harnesspm sync"
}
```

Leave it as it is. A plain `harnesspm sync` fails every install without dev dependencies, because the `harnesspm` command is not installed then. A project that an older harnesspm set up has that plain form: run `npx harnesspm init` again to update it. `npx harnesspm doctor` warns until you do. The [install hook](https://github.com/tenphi/harnesspm/blob/main/docs/spec/10-cli.md#the-install-hook) in the specification explains each part.

Add a check to CI, so a missed sync fails the pull request:

```yaml
- run: npm ci
- run: npx harnesspm sync --check
```

`--check` writes nothing and ignores harnesses that people added on their machines. The `sync` that `npm ci` runs does not hide a missed sync: with `CI=true`, it writes only per-machine files, such as links and docs copies, and leaves the committed files for `--check` to compare. A job that commits the result runs `npx harnesspm sync --write` instead.

When something is out of date, `--check` says what to do:

```text
$ npx harnesspm sync --check
❌ AGENTS.md: the harnesspm block is out of date
❌ harnesspm.lock.json is out of date
Run `npx harnesspm sync` and commit the result.
```

## 6. Check the setup

`status` lists the layers, the packages and the always-on size for each agent:

```text
$ npx harnesspm status
📦 dependencies  @acme/ui 4.2.0 → @acme/colors 2.1.0, @acme/styles 3.4.1
🏢 project       harnesspm.json: no changes
➕ added         none
⏳ pending: @acme/colors: 1 script (not trusted; a person turns it on in "trust" in harnesspm.json)
⏳ pending: @acme/styles: 1 script, 1 hook (not trusted; a person turns it on in "trust" in harnesspm.json)
📏 always-on     Codex 1.9 KiB of 32 KiB · Claude Code 32 lines
```

`doctor` checks that per-machine files stay out of git and that the outputs are in place. Each problem names the command that fixes it:

```text
$ npx harnesspm doctor
🔒 Local files
  ✅ 15 per-machine files: ignored by git and not tracked
➕ Harnesses of your own
  ✅ .git/info/exclude can be written, so harnesspm keeps per-machine files out of git
  ℹ️  No harness added yet. Add one with `npx -y @tenphi/harnesspm add <source>`.
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
$ npx harnesspm why acme-colors:rules/usage
owner       dependency @acme/colors 2.1.0 (via @acme/ui)
source      node_modules/.harnesspm/pkgs/@acme/colors/harness/dev.harnesspm/rules/usage.md
patch       node_modules/@acme/ui/harness/dev.harnesspm/patches/acme-colors-usage.patch.md (from @acme/ui)
repository  https://github.com/acme/colors
editable    no. Add a `patch`, `replace` or `exclude` in harnesspm.json, or propose the change upstream.
```

## Next

- [Use a package's harness](./use.md): what agents get, and upgrades.
- [Change upstream units](./change-upstream.md): patch, replace or exclude a rule.
- [Share a harness from your library](./share.md).
- [Add your own or your team's harness](./add-your-own.md).
