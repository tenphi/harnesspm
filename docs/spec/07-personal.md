# 7. Personal harness

**In short**

- A personal harness is an ordinary harness that belongs to one person: their workflow rules, context notes, skills, scripts, and entries for specific projects.
- It applies **everywhere** on the machine, and its project entries apply to the matching projects.
- It never changes the project's repository.
- Agents can improve it, as described in [08-improving.md](08-improving.md).

## 7.1 What goes in it

A personal harness holds what should live outside every project repository:

| Content | Unit kind | Example |
| --- | --- | --- |
| How the person works | Always-on rule | Commit style, review habits, preferred tools |
| Context the agent reads when needed | Docs (notes) | Which repositories exist and how they relate, environments, people to ask |
| Repeated workflows | Skills | Releasing a package, preparing a weekly update |
| Personal tools | Scripts, hooks, MCP servers | A script that opens a local preview of linked repositories |
| Changes for one project | Project entry | A local staging address, a replaced team rule |

This is the "memory" a person keeps across projects and machines. Notes that an agent saves by itself, such as Claude Code auto memory, stay with the agent and are not part of harnesspm.

## 7.2 Example

```text
andrew-harness/                    a git repository, on any host
├── AGENTS.md                      how to change this repository, including how to save changes
└── harness/
    ├── plugin.json
    ├── dev.harnesspm/rules/
    │   └── workflow.md            always on
    ├── notes/                     read on demand
    │   ├── llms.txt               index of the notes
    │   └── projects.md            repositories and how they relate
    ├── skills/
    │   └── andrew-release/SKILL.md
    └── projects/
        └── cube-ui-kit/           same layout as harness/; plugin.json is optional
            └── dev.harnesspm/rules/local-setup.md
```

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "andrew",
  "extensions": {
    "dev.harnesspm": {
      "docs": { "dir": "./notes" },
      "projects": {
        "github.com/cube-js/cube-ui-kit": "./projects/cube-ui-kit"
      }
    }
  }
}
```

A project entry is matched by the project's git remote, so it also works in a fresh clone in a cloud session. It can hold its own units and its own `replace` and `exclude` for team units.

## 7.3 Sources

| Source | Example | Editable | Where it lives |
| --- | --- | --- | --- |
| Git repository | `github:andrew/harness`, `git:https://git.example.com/andrew/harness.git` | yes | A working copy in `~/.harnesspm/personal/<name>/` |
| Folder | `~/dev/andrew-harness` | yes | In place |
| npm package | `npm:@andrew/harness` | no | A cache in `~/.harnesspm/cache/` |

Git sources work with any host. npm and git sources never touch the project's `package.json` or lockfile.

## 7.4 Scopes

| Scope | How to add | Recorded in | Outputs |
| --- | --- | --- | --- |
| **Everywhere** | `npx harnesspm personal add <source>` | `~/.harnesspm/config.json` | User-level folders, see [04-outputs.md](04-outputs.md#44-personal-outputs-scope-everywhere) |
| **This project** | `npx harnesspm personal add <source> --project`, or a project entry in a harness added everywhere | `harnesspm.local.json` in the project, excluded from git | Project outputs, see [04-outputs.md](04-outputs.md#43-project-outputs) |

Both files have one field:

```json
{ "personal": ["github:andrew/harness", "~/dev/work-notes"] }
```

Units with scope "this project" come after units with scope "everywhere", so they win.

## 7.5 Keeping the project clean

1. Personal outputs are never written into tracked files. Per-machine files are excluded through `.git/info/exclude`.
2. CI ignores the personal layer.
3. `harnesspm status` lists every personal change to team units, so it stays visible to the person.
4. In a cloud environment shared by several people, personal setup belongs in the person's own environment. See [09-cloud.md](09-cloud.md).
