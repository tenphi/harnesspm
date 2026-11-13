# 7. Added harnesses

**In short**

- An **added harness** is an ordinary harness that a person adds on their machine, on top of the repository's. It is never committed.
- Add any number, in order: for example, your team's shared harness, then your own. A later one wins on a skill name.
- **User scope** applies a harness in every repository on the machine, including its entries for single repositories. **Local scope** applies it in one repository.
- Agents can improve an added harness, as described in [08-improving.md](08-improving.md).

## 7.1 What goes in it

An added harness holds what should not live in every project repository:

| Content | Unit kind | Example |
| --- | --- | --- |
| How a team or a person works | Always-on rule | Commit style, review habits, preferred tools |
| Context the agent reads when needed | Docs (notes) | Which repositories exist and how they relate, environments, people to ask |
| Repeated workflows | Skills | Releasing a package, preparing a weekly update |
| Tools | Scripts, hooks, MCP servers | A script that opens a local preview of linked repositories |
| Changes for one repository | Project entry | A local staging address, a replaced team rule |

A team's harness and a person's own harness use the same format and the same commands. Only their owners differ, and each owner's rules decide how its changes are saved ([08-improving.md](08-improving.md#83-the-owner-decides-how-to-save)). To give a harness to everyone who works on a repository, make it a dependency instead (S6).

A person's own added harness is the "memory" they keep across projects and machines. Notes that an agent saves by itself, such as Claude Code auto memory, stay with the agent and are not part of harnesspm.

## 7.2 Example

```text
alex-harness/                    a git repository, on any host
├── AGENTS.md                      how to change this repository, including how to save changes
└── harness/
    ├── plugin.json
    ├── dev.harnesspm/rules/
    │   └── workflow.md            always on
    ├── notes/                     read on demand
    │   ├── llms.txt               index of the notes
    │   └── projects.md            repositories and how they relate
    ├── skills/
    │   └── alex-release/SKILL.md
    └── projects/
        └── cube-ui-kit/           same layout as harness/; plugin.json is optional
            └── dev.harnesspm/rules/local-setup.md
```

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

A project entry is matched by the repository's `origin` remote, written as `<host>/<path>` without `.git`, for SSH and HTTPS URLs alike. So it also works in a fresh clone in a cloud session.

Units in an entry belong to the added harness, so their IDs start with its plugin name. An entry's unit wins over one with the same ID in the rest of the harness. The entry's optional `plugin.json` uses the same name and may hold `exclude`, `replace` and `patch` for the repository's units.

## 7.3 Sources

| Source | Example | Editable | Where it lives |
| --- | --- | --- | --- |
| Git repository | `github:alex/harness`, `git:https://git.example.com/team/harness.git` | yes | A working copy in `~/.harnesspm/harnesses/<name>/` |
| Folder | `~/dev/alex-harness` | yes | In place |
| npm package | `npm:@alex/harness` | no | A cache in `~/.harnesspm/cache/` |

Git sources work with any host. npm and git sources never touch the project's `package.json` or lockfile.

## 7.4 Scopes and order

| Scope | How to add | Recorded in | Outputs |
| --- | --- | --- | --- |
| **User** | `npx harnesspm add <source>` | `~/.harnesspm/config.json` | User-level folders, see [04-outputs.md](04-outputs.md#44-outputs-of-added-harnesses-user-scope) |
| **Local** | `npx harnesspm add <source> --local` | `harnesspm.local.json` in the repository, excluded from git | Project outputs, see [04-outputs.md](04-outputs.md#43-project-outputs) |

Both files have one field:

```json
{ "harnesses": ["github:cube-js/frontend-harness", "github:alex/harness"] }
```

`add` appends, so harnesses apply in the order they were added: user scope first, then local scope. A project entry comes right after its harness. `harnesspm new --to <plugin>` names the harness to write into.

## 7.5 Applying in every repository

`harnesspm add` also installs one user-level `SessionStart` hook for each agent. The hook runs `npx -y @tenphi/harnesspm sync` at the start of every session. In a repository that does not use harnesspm, or whose dependencies are not installed yet, `sync` writes only the per-machine outputs of added harnesses, including their project entries, and changes only git-excluded files.

- Claude Code runs the hook with `AI_AGENT=…_harness`, so this sync may write hooks and permissions ([06-trust.md](06-trust.md#62-trusting-a-package), rule 4).
- Claude Code uses what the hook writes in the same session: a `CLAUDE.local.md` and a `.claude/settings.local.json` written by a `SessionStart` hook were both read in cloud sessions.
- Codex asks the person to review a new hook once, in `/hooks`.
- `--no-hook` skips the hook. Project entries then apply only where `harnesspm sync` runs.
- `harnesspm remove` takes the hook away with the last harness with user scope.

## 7.6 Keeping the project clean

1. Added units are never written into tracked files. Per-machine files are excluded through `.git/info/exclude`. `harnesspm doctor` shows whether a repository is ready for a harness of your own, and finds a per-machine file that a commit could include ([10.5](10-cli.md#105-doctor)).
2. CI ignores added harnesses. With `CI=true`, `sync` writes only per-machine outputs ([06-trust.md](06-trust.md#64-ci)).
3. `harnesspm status` lists every change that an added harness makes to the repository's units, so it stays visible.
4. In a cloud environment shared by several people, add harnesses in your own environment. See [09-cloud.md](09-cloud.md).
