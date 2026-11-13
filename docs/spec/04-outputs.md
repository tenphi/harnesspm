# 4. Outputs

**In short**

- harnesspm writes each agent's **native** files, where the agent already looks.
- Of the outputs, only the managed blocks in `AGENTS.md`, the `@AGENTS.md` lines in `CLAUDE.md` files and `harnesspm.lock.json` are committed. Everything else is written on each machine and kept out of git.
- People never edit outputs. Every output names its source.

Package authors do not need this chapter. It defines what implementations write.

## 4.1 Principles

1. **Native files only.** No agent has to understand a harnesspm format.
2. **Commit only what reviewers need.** The managed block in `AGENTS.md` shows rule changes in pull requests. The lock shows every other unit change. All other outputs are per machine.
3. **Per-machine outputs are excluded through `.git/info/exclude`.** That file belongs to the clone, is never committed, and is shared by worktrees. harnesspm never edits `.gitignore`. `harnesspm doctor` checks that every per-machine file is ignored and untracked ([10.5](10-cli.md#105-doctor)).
4. **Units of added harnesses never enter a tracked file.** harnesspm MUST refuse to write one there.
5. **Outputs are marked.** Each generated file or block says it is generated and names the sources to edit.
6. **harnesspm edits only its own entries** in files that people or agents also write, and keeps the rest unchanged.

## 4.2 Stable package paths

Package managers place packages at paths that differ between machines. harnesspm creates one stable link per harness package and uses only these paths in outputs:

```
node_modules/.harnesspm/pkgs/@tenphi/tasty  →  <real location of the package>
```

A job that does not install dependencies, such as a review bot, runs `npx -y @tenphi/harnesspm fetch`. It downloads only the harness packages in the lock with `npm pack`, checks each tarball against the lock's integrity, and fills these paths and the generated files, so pointers in the committed block work there too. It reuses installed copies, never runs package code and writes no agent settings.

## 4.3 Project outputs

These hold the dependency and project layers, plus added harnesses with local scope and the project entries of all added harnesses.

| Unit | Claude Code | Codex |
| --- | --- | --- |
| Always-on rules, docs index, script list (team) | Managed block in `AGENTS.md` (committed), reached through `@AGENTS.md` in `CLAUDE.md` | Managed block in `AGENTS.md` (committed) |
| Always-on rules (added harnesses) | Managed block in `CLAUDE.local.md` | `developer_instructions` in `.codex/config.toml` |
| File-scoped rules | Link in `.claude/rules/harnesspm/<plugin>/` with `paths`, plus a pointer line in the block | Pointer line in the block |
| On-demand rules | Pointer line with its description | Pointer line with its description |
| Skills | Link in `.claude/skills/<name>`, plus `Skill(<name>)` in `permissions.allow` of `.claude/settings.local.json` for skills from the project, an added harness or a trusted package | Link in `.agents/skills/<name>` |
| Sub-agents | Generated `.claude/agents/<name>.md` | Generated `.codex/agents/<name>.toml` |
| Hooks, permissions | Entries in `.claude/settings.local.json` | `.codex/hooks.json`, `.codex/rules/harnesspm.rules` |
| MCP servers | Local scope: `projects.<project>.mcpServers` in `~/.claude.json`, where `claude mcp add-json --scope local` writes them | `[mcp_servers.<id>]` in `.codex/config.toml` |

Notes:

1. `CLAUDE.local.md` counts as a `CLAUDE.md` for Claude Code. In a repository with only `AGENTS.md`, harnesspm MUST start `CLAUDE.local.md` with `@AGENTS.md`, or Claude would stop reading `AGENTS.md`.
2. harnesspm owns `.codex/` and writes it on each machine. If a team already commits `.codex/config.toml`, harnesspm does not touch it and `harnesspm status` lists the units Codex is missing. The team moves those settings into `harness/`, which feeds both agents.
3. A file-scoped rule has two outputs for Claude Code on purpose: the link activates it natively on matching files, and the pointer line in the shared block serves Codex.
4. File-scoped and on-demand rules of added harnesses are pointer lines with absolute paths, in `CLAUDE.local.md` and the user-level blocks. They get no `.claude/rules/` link, because Claude Code treats a link to a file outside the working folder as an external import that needs approval. Patched rules and docs indexes of added harnesses are generated into `~/.harnesspm/generated/`, because a repository may have no `node_modules`.
5. An added harness's `exclude` or `patch` of a team always-on rule cannot change committed text. harnesspm writes the change into the local block instead ("ignore rule X", or "in rule X, section Y now says: …"), which both agents read after the team block.
6. With agent events on, harnesspm also writes its own telemetry hooks into the same hook files, and the index they read into `node_modules/.harnesspm/telemetry.json` ([14.4](14-telemetry.md#144-agent-events)).
7. Claude Code reads a nested `AGENTS.md` only when no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists in its folder or above, and the root `CLAUDE.md` that imports the block is one ([research](../research/agent-capabilities.md#instructions)). So every nested `AGENTS.md` that git tracks, outside `node_modules`, gets an `@AGENTS.md` line in a `CLAUDE.md` in the same folder. harnesspm creates that file, or adds the line at the top of an existing one. A folder whose `.claude/CLAUDE.md` already has `@../AGENTS.md` keeps it and gets no second import. These files are committed outputs: `sync --check` and `doctor` report a missing line.

## 4.4 Outputs of added harnesses, user scope

These go to the agents' user-level folders, so they work in every repository, including ones without harnesspm.

| Unit | Claude Code | Codex |
| --- | --- | --- |
| Rules | Managed block in `~/.claude/CLAUDE.md` | Managed block in `~/.codex/AGENTS.md` |
| Skills | Link in `~/.claude/skills/`, plus `Skill(<name>)` in `permissions.allow` of `~/.claude/settings.json` | Link in `~/.agents/skills/` |
| Sub-agents | Generated in `~/.claude/agents/` | Generated in `~/.codex/agents/` |
| Hooks, permissions | Entries in `~/.claude/settings.json` | `~/.codex/hooks.json`, `~/.codex/rules/harnesspm.rules` |
| MCP servers | User scope: `mcpServers` in `~/.claude.json` | `[mcp_servers.<id>]` in a managed block at the end of `~/.codex/config.toml` |
| Write access to the working copies of added harnesses | `permissions.additionalDirectories` | `sandbox_workspace_write.writable_roots` |
| The hook that applies added harnesses in each repository ([07-added.md](07-added.md#75-applying-in-every-repository)) | `SessionStart` entry in `~/.claude/settings.json` | `SessionStart` entry in `~/.codex/hooks.json` |

## 4.5 Monorepos

1. A workspace with its own units gets a managed block in `<workspace>/AGENTS.md`. Codex joins `AGENTS.md` files from the root down to the current folder. Paths in a workspace's block are relative to its folder. A block that becomes empty is removed, and so is a file that held only the block.
2. A workspace's `AGENTS.md` gets a `CLAUDE.md` that imports it, like every nested `AGENTS.md` ([4.3](#43-project-outputs), note 7). Both files are committed.
3. Skills and executable units are written at the root.

## 4.6 Managed blocks

A managed block is the only part of a Markdown file harnesspm owns. Text outside it never changes. Without markers, harnesspm appends a block at the end.

```markdown
<!-- BEGIN:harnesspm — generated by `harnesspm sync`. Do not edit. To change a rule, run `npx harnesspm why <ID>`. -->

## @tenphi/tasty 3.17.1 (via @cube-dev/ui-kit)

- Never put dynamic values into styles. Use tokens. (tasty:rules/style-values)
- When editing `**/*.tsx`, read node_modules/.harnesspm/pkgs/@tenphi/tasty/harness/dev.harnesspm/rules/state-maps.md (tasty:rules/state-maps)
- Docs: node_modules/.harnesspm/pkgs/@tenphi/tasty/docs/llms.txt

## @cube-dev/ui-kit 0.206.1

- …
- Scripts: `npx harnesspm run uikit:probe <story>` — capture a story's DOM and computed CSS

<!-- END:harnesspm -->
```

Every line carries its unit ID, so an agent can find the source with `harnesspm why`.

A blank line follows the BEGIN marker and comes before the END marker, so Markdown formatters such as Prettier leave the block as it is. A block written without them, as harnesspm 0.3 did, still counts as up to date, and the next `sync` rewrites it once.

## 4.7 Files shared with people

`CLAUDE.md` files, `~/.codex/AGENTS.md`, `.claude/settings.local.json` and `~/.claude/settings.json` are also written by people, or by the agent itself (Claude Code saves "don't ask again" approvals into `.claude/settings.local.json`). In these files, and in `~/.claude.json`, `.codex/hooks.json` and `~/.codex/config.toml`, harnesspm changes only its managed block or the entries it created. It records its entries in a per-machine state file, `harnesspm/state.json` in the clone's git folder or `~/.harnesspm/state.json`, so it can remove them later. A settings file that held only harnesspm's entries is deleted with them.

## 4.8 Why native files and not plugins

Both agents have plugin systems. harnesspm does not generate plugins in v1, because Claude Code cloud sessions do not install plugins that a repository declares, and plugins hide changes from pull request review. See [13-open-questions.md](13-open-questions.md#135-plugin-output-mode).

## 4.9 Size limits

| Agent | Limit |
| --- | --- |
| Codex | `AGENTS.md` files are joined up to `project_doc_max_bytes`, 32 KiB by default. The rest is cut off. |
| Claude Code | No hard limit. The vendor advises under about 200 lines per `CLAUDE.md`. |

`harnesspm status` reports the always-on size per agent, warns near a limit, and says when `AGENTS.md` is over Codex's. `harnesspm doctor` warns under Outputs when `AGENTS.md` is over 32 KiB, because Codex then reads only its first 32 KiB.
