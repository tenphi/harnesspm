---
description: Add your team's or your own rules, notes, skills and tools on top of any repository, without committing them.
---

# Add your own or your team's harness

**In short**

- `npx -y @tenphi/harnesspm add <source>` adds a harness on top of the repository's, on your machine only. It is never committed.
- With user scope, it applies in every repository on the machine. With `--local`, in one repository.
- `npx harnesspm doctor` checks that your per-machine files stay out of git.

An **added harness** is an ordinary harness, with a `plugin.json` and units, in a git repository, a folder or an npm package. A team's harness and a person's own harness work the same way. Only their owners differ.

## What goes in it

| Content | Unit kind | Example |
| --- | --- | --- |
| How you or your team work | Always-on rule | Commit style, review habits, preferred tools |
| Context the agent reads when needed | Docs (notes) | Which repositories exist and how they relate |
| Repeated workflows | Skills | Releasing a package, a weekly update |
| Tools | Scripts, hooks, MCP servers | A local preview of linked repositories |
| Changes for one repository | Project entry | A local staging address, a replaced team rule |

To give a harness to everyone who works on a repository, make it a dependency instead: a harness-only package in `devDependencies`.

## Add one

```shell
npx -y @tenphi/harnesspm add github:<owner>/<repo>
```

| Source | Example | Where it lives |
| --- | --- | --- |
| Git repository | `github:alex/harness`, `git:https://git.example.com/team/harness.git` | A working copy in `~/.harnesspm/harnesses/` |
| Folder | `~/dev/alex-harness` | In place |
| npm package | `npm:@alex/harness` | A cache in `~/.harnesspm/cache/`, read-only |

`add` prints the added always-on rules, so an agent that runs it follows them at once:

```text
$ npx -y @tenphi/harnesspm add ~/dev/alex-harness
Added alex (/home/alex/dev/alex-harness) with user scope

Rules from /home/alex/dev/alex-harness, to follow from now on in this session:

### Workflow (alex:rules/workflow)

- Use Conventional Commits.
- Run the tests before you open a pull request.
```

`add` also installs a `SessionStart` hook for each agent. It runs `npx -y @tenphi/harnesspm sync` when a session starts, so your harness applies in every repository, also in ones that do not use harnesspm. Pass `--no-hook` to skip it.

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
        "github.com/cube-js/cube-ui-kit": "./projects/cube-ui-kit"
      }
    }
  }
}
```

The entry applies wherever the repository's `origin` remote matches, also in a fresh clone in a cloud session. To write a new unit into it, run `npx harnesspm new rule <name> --to alex --entry`.

## Keep the project clean

- Units of an added harness never go into a tracked file. They go into `CLAUDE.local.md`, `.claude/settings.local.json`, `.codex/` and your user-level agent folders.
- harnesspm lists per-machine files in `.git/info/exclude`, which belongs to your clone and is never committed. It never edits `.gitignore`.
- CI and `sync --check` ignore added harnesses.
- `npx harnesspm status` lists every change an added harness makes to the repository's units.

`doctor` checks that a repository is ready for a harness of your own, and that no per-machine file can reach a commit:

```text
$ npx harnesspm doctor
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

- Ask your agent to "remember" something, and it can write a rule into your harness with `npx harnesspm new rule <name> --to <plugin>`. It saves the change the way your harness's `AGENTS.md` says. See [Change upstream units](./change-upstream.md#improve-a-harness-with-an-agent).
- `npx harnesspm update` fetches new versions of your added harnesses. It skips a working copy with uncommitted changes or unpushed commits, and says so.
- `npx harnesspm remove <source>` removes a harness and its outputs.

## More

- [Added harnesses](https://github.com/tenphi/harnesspm/blob/main/docs/spec/07-added.md) in the specification: the full rules.
- [Cloud sessions](./cloud.md): the same harness in Claude Code cloud sessions.
