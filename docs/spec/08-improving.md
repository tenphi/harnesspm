# 8. Improving a harness

**In short**

- Every unit has an **owner**: a dependency, the project, or a personal harness.
- `harnesspm why <ID>` tells the agent where the source is and whether it can edit it.
- The owner's own `AGENTS.md` and `CONTRIBUTING.md` decide how a change is saved. Without them, the default is a branch and a pull request.
- harnesspm finds sources and grants write access. It does not push or talk to git hosts. The agent does that with its own tools.

## 8.1 Find the source

```text
$ npx harnesspm why tasty:rules/state-maps
owner       dependency @tenphi/tasty 3.17.1 (via @cube-dev/ui-kit)
source      node_modules/.harnesspm/pkgs/@tenphi/tasty/harness/dev.harnesspm/rules/state-maps.md
repository  https://github.com/tenphi/tasty
editable    no. Add a `replace` in harnesspm.json, or propose the change upstream.

$ npx harnesspm why andrew:rules/workflow
owner       personal github:andrew/harness (scope: everywhere)
source      ~/.harnesspm/personal/andrew/harness/dev.harnesspm/rules/workflow.md
rules       ~/.harnesspm/personal/andrew/AGENTS.md
editable    yes
```

## 8.2 Three owners

| Owner | Where the source is | How the agent changes it |
| --- | --- | --- |
| 📦 Dependency | `node_modules`, read-only | Now: a `patch` for a small change, or a `replace` or `exclude`, in the project (for the team) or in the personal harness (for one person). Later: a proposal to the package's `repository`. |
| 🏢 Project | The project repository | Edit the file, like any other change in that repository. |
| 🙋 Personal | The personal working copy or folder | Edit the file there. |

To create a new unit instead of changing one, use `npx harnesspm new <kind> <name>` with `--personal`, `--personal --project`, or no flag for the project harness.

## 8.3 The owner decides how to save

A harness is a repository, or lives in one. That repository's root `AGENTS.md` and `CONTRIBUTING.md` are its rules for changes. These are existing conventions, so harnesspm adds no setting for them.

Before changing a source, the agent MUST read those files in the source repository and follow them. They can say anything that fits the owner, for example:

- "Commit and push to `main`."
- "Open a merge request on our GitLab and assign me."
- "Leave the change uncommitted. I review it myself."

## 8.4 Default when the owner says nothing

1. Show the person the change and the reason, and ask before going on.
2. Create a branch from the default branch, named `harnesspm/<topic>`.
3. Commit with a message that says what changed and why.
4. Push the branch and open a pull request or merge request with the tools the agent has, such as the GitHub CLI or an MCP server for the host.
5. If a step is not possible, stop there and tell the person what is done and what is left: the branch, the commit, or the diff itself.

The agent MUST NOT push to the default branch unless the owner's rules allow it.

For a dependency, the proposal goes to the package's `repository`, following that repository's rules. It is usually an issue or a pull request that the person reviews first.

## 8.5 Access

| Owner | Write access |
| --- | --- |
| Dependency | Never. `node_modules` is not a source. |
| Project | As for any file in the project. |
| Personal | harnesspm adds the working copy to the agent's writable folders: `permissions.additionalDirectories` for Claude Code, `sandbox_workspace_write.writable_roots` for Codex. |

## 8.6 Checks before saving

1. Run `npx harnesspm check <harness folder>`. It validates the harness and warns about files that look like secrets.
2. Never copy private data from the current project into a personal harness without the person's agreement.

## 8.7 Shared working copies

Several projects and sessions on one machine use the same personal working copy. `harnesspm personal update` never changes a working copy that has uncommitted changes or unpushed commits. It reports them instead.

## 8.8 What harnesspm ships for this

harnesspm's own harness has the skill `harnesspm-improve`, which walks the agent through 8.1 to 8.6. See [12-dogfooding.md](12-dogfooding.md).
