---
description: Keep how you or your team work in a harness of your own, with rules, notes, skills and tools, and add it with harnesspm on top of every repository, without a commit there.
---

# Add your own or your team's harness

**In short**

- Your own harness is a git repository of rules, notes and skills about how you work. A team's harness is the same thing, owned by a team. Ask your agent to start one.
- You add it once per machine, in your own terminal, with `npx -y @harnesspm/cli add <source>`. It applies on top of every repository on the machine, or of one with `--local`, and nothing from it is committed there.
- Two things stay with you: adding it, which trusts its tools, and what goes into its always-on rules.
- `npx -y @harnesspm/cli doctor` checks that your per-machine files stay out of git.

This page is for your own way of working. To give a project the harness of its dependencies, see [Get started](./setup.md). To ship a harness with a library, see [Share a harness from your library](./share.md).

An **added harness** is an ordinary harness, with a `plugin.json` and units, in a git repository, a folder or an npm package. A team's harness and a person's own harness work the same way. Only their owners differ.

## What goes in it

Your harness costs context in every session, in every repository, so the choice is yours. Keep always-on rules to what you would tell every agent, such as your commit style, and put the rest where it loads only when needed:

| Content | Unit kind | Example |
| --- | --- | --- |
| How you or your team work | Always-on rule | Commit style, review habits, preferred tools |
| Context the agent reads when needed | Docs (notes) | Which repositories exist and how they relate |
| Repeated workflows | Skills | Releasing a package, a weekly update |
| Tools | Scripts, hooks, MCP servers | A local preview of linked repositories |
| Changes for one repository | Project entry | A local staging address, a replaced team rule |

To give a harness to everyone who works on a repository, make it a dependency instead: a harness-only package in `devDependencies`.

## Ask your agent

Two things stay with you: what goes into the always-on rules, and adding the harness, which trusts its tools. Paste one of these into Claude Code or Codex.

To add a harness you have, such as your team's:

```text
Run `npx -y @harnesspm/cli add <source>` and do what it prints.
```

Your agent gets the harness's rules and skills at once. Its hook and tools wait until you run the same `add` in your own terminal ([Add one](#add-one)).

To start a harness of your own, in a new folder:

```text
Run `npx -y @harnesspm/cli new rule workflow` in ~/dev/my-harness and do what it prints.
```

Your agent does [Start one](#start-one) below. The rule it writes is a draft: you know how you work. Then you [add it](#add-one) in your own terminal.

## Start one

A harness of your own starts as a folder with git. `new` writes its manifest and first unit:

```shell
mkdir -p ~/dev/my-harness && cd ~/dev/my-harness && git init
npx -y @harnesspm/cli new rule workflow
```

- `new` creates `harness/plugin.json`, with the folder's name as the plugin name, and `harness/dev.harnesspm/rules/workflow.md`, an always-on rule. It then prints the next steps: `check`, a commit, and the `add` that a person runs.
- Write the rule, then run `npx -y @harnesspm/cli check`, and commit.
- A folder works on this machine. To use the harness on other machines and in cloud sessions, push it to a repository of yours and add it from there.
- The person adds it, as below. An agent that starts a harness for someone stops before `add`.

## Add one

```shell
npx -y @harnesspm/cli add github:<owner>/<repo>
```

- **You** run it, once per machine. An agent that runs `add` gets the rules and skills, and the tools wait for you.
- Adding a harness is your trust decision: its scripts, hooks and MCP servers run as you, in every repository.

| Source | Example | Where it lives |
| --- | --- | --- |
| Git repository | `github:alex/harness`, `git:https://git.example.com/team/harness.git` | A working copy in `~/.harnesspm/harnesses/` |
| Folder | `~/dev/alex-harness` | In place |
| npm package | `npm:@alex/harness` | A cache in `~/.harnesspm/cache/`, read-only |

`add` prints the added always-on rules, so an agent that runs it follows them at once:

```text
$ npx -y @harnesspm/cli add ~/dev/alex-harness
Added alex (/home/alex/dev/alex-harness) with user scope

Rules from /home/alex/dev/alex-harness, to follow from now on in this session:

### Workflow (alex:rules/workflow)

- Use Conventional Commits.
- Run the tests before you open a pull request.
```

`add` also installs a `SessionStart` hook for each agent. It runs `npx -y @harnesspm/cli update` when a session starts, so your harness's newest commits apply in every repository, also in ones that do not use harnesspm. A working copy with your unsaved or unpushed work is left as it is, and a fetch that fails only warns. Pass `--no-hook` to skip it.

## Scopes and order

| Scope | Command | Recorded in | Applies |
| --- | --- | --- | --- |
| User | `add <source>` | `~/.harnesspm/config.json` | In every repository on this machine |
| Local | `add <source> --local` | `harnesspm.local.json`, excluded from git | In this repository |

You can add several harnesses, for example your team's, then your own. They apply in the order you added them: user scope first, then local scope. When two of them ship a skill with the same name, the later one wins.

## Entries for one repository

An added harness can hold units for one repository. `projects` in its `plugin.json` maps a git remote to a folder with the same layout as `harness/`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "alex",
  "extensions": {
    "dev.harnesspm": {
      "docs": "./notes",
      "projects": {
        "github.com/acme/app": "./projects/app"
      }
    }
  }
}
```

The entry applies wherever the repository's `origin` remote matches, also in a fresh clone in a cloud session. To write a new unit into it, run `npx -y @harnesspm/cli new rule <name> --to alex --entry`.

## Keep the project clean

- Units of an added harness never go into a tracked file. They go into `CLAUDE.local.md`, `.claude/settings.local.json`, `.codex/` and your user-level agent folders.
- harnesspm lists per-machine files in `.git/info/exclude`, which belongs to your clone and is never committed. It never edits `.gitignore`.
- CI and `sync --check` ignore added harnesses.
- `npx -y @harnesspm/cli status` lists every change an added harness makes to the repository's units.

`doctor` checks that a repository is ready for a harness of your own, and that no per-machine file can reach a commit:

```text
$ npx -y @harnesspm/cli doctor
🔒 Local files
  ✅ 12 per-machine files: ignored by git and not tracked
➕ Harnesses of your own
  ✅ .git/info/exclude can be written, so harnesspm keeps per-machine files out of git
  ✅ Added: alex (/home/alex/dev/alex-harness, user)
📦 Outputs
  ✅ Committed outputs are up to date
  ✅ 14 per-machine outputs in place

✅ Ready. Nothing to fix.
```

When a file is tracked or not ignored, `doctor` fails and names the fix, such as `git rm --cached CLAUDE.local.md`. It never changes anything itself.

## Change it later

Grow your harness as you work. Ask your agent, and name harnesspm:

```text
Remember this in my own harnesspm harness:
I review pull requests with the checklist in my notes.
```

- Your agent writes a rule or a note into your harness, such as with `npx -y @harnesspm/cli new rule <name> --to <plugin>`. It saves the change the way your harness's `AGENTS.md` says, such as a commit. See [Change upstream units](./change-upstream.md#improve-a-harness-with-an-agent). Without the word harnesspm, an agent may keep the note in its own memory, on one machine and for one agent.
- `npx -y @harnesspm/cli update` fetches new versions of your added harnesses, and the hook that `add` installs runs it when a session starts. It skips a working copy with uncommitted changes or unpushed commits, and says so.
- `npx -y @harnesspm/cli remove <source>` removes a harness and its outputs.

## In cloud sessions

A Claude Code cloud session starts on a clean machine, without your harness. Put the `add` command into the setup script of your own environment, and each new session starts with it. [Cloud sessions](./cloud.md#your-own-harness) has the details, also for private repositories.

## More

- [Added harnesses](https://github.com/tenphi/harnesspm/blob/main/docs/spec/07-added.md) in the specification: the full rules.
- [Ask your agent](./ask-your-agent.mdx): prompts for the tasks after setup.
