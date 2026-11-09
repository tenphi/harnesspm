# 4. Outputs

Tack writes each agent's **native** files. It does not ask agents to understand a Tack format, and it does not generate agent plugins (see [4.9](#49-why-native-files-and-not-plugins)).

## 4.1 Principles

1. **Native files only.** Each unit goes where the agent already looks for that kind of thing.
2. **Generated content is marked.** Every generated file or block names the source to edit and says that `tack sync` rewrites it.
3. **Personal content never enters a tracked file.** Tack MUST refuse to write a layer 1 or layer 4 unit into a file that git tracks.
4. **Tack never edits `.gitignore`.** Per-machine outputs are excluded through `.git/info/exclude`, which belongs to the clone and is never committed. Worktrees share it.
5. **Shared files are edited, not owned.** In a file that people also edit, Tack changes only the entries it created. See [4.8](#48-editing-shared-files).

## 4.2 Stable package paths

pnpm, Yarn and monorepos put packages at paths that differ between machines. Tack therefore creates one stable link per harness package:

```
node_modules/.tack/pkgs/@tenphi/tasty  →  <real location of the package>
```

Every pointer Tack writes uses these paths, such as `node_modules/.tack/pkgs/@tenphi/tasty/docs/styles.md`. They live inside `node_modules`, so they are not committed, and agents treat them as part of the project.

## 4.3 Team outputs (layers 2 and 3)

| Unit | Claude Code | Codex | Committed? |
| --- | --- | --- | --- |
| Always-on rules, docs index, script list | Managed block in `AGENTS.md`, reached through `@AGENTS.md` in `CLAUDE.md` | Managed block in `AGENTS.md` | ✅ |
| File-scoped rules | Link in `.claude/rules/` with `paths` frontmatter, plus a pointer line in the block | Pointer line in the block ("when editing `**/*.tsx`, read …") | links: per machine |
| On-demand rules | Pointer line with description | Pointer line with description | ✅ (in the block) |
| Skills | Link in `.claude/skills/<name>` | Link in `.agents/skills/<name>` | per machine |
| Sub-agents | Link in `.claude/agents/<name>.md` | — | per machine |
| Hooks | Entries in `.claude/settings.json` | `.codex/hooks.json` | Claude ✅, Codex per machine |
| Permissions | `permissions` entries in `.claude/settings.json` | `.codex/rules/tack.rules` | Claude ✅, Codex per machine |
| MCP servers | Entries in `.mcp.json` | `[mcp_servers.<id>]` in `.codex/config.toml` | Claude ✅, Codex per machine |

Why Codex files are per machine: Codex has no personal layer inside a repository. Its project folder `.codex/` is the only project-level place for hooks, rules and MCP servers. Tack therefore builds `.codex/` on each machine from team and personal layers together. Team Codex settings come from `harness/` in the shared format, not from hand-edited `.codex/` files.

Why Claude files are committed: Claude Code reads committed `.claude/settings.json` and `.mcp.json` in cloud sessions, and has its own local files for the personal layer.

## 4.4 Local personal outputs (layer 4)

| Unit | Claude Code | Codex |
| --- | --- | --- |
| Rules | Managed block in `CLAUDE.local.md`, which Claude reads right after `CLAUDE.md` | `AGENTS.override.md`: a copy of `AGENTS.md` plus the personal block. Codex reads it instead of `AGENTS.md` in the same folder |
| Skills | Link in `.claude/skills/<name>` | Link in `.agents/skills/<name>` |
| Sub-agents | Link in `.claude/agents/` | — |
| Hooks, permissions | `.claude/settings.local.json` | `.codex/` (built per machine) |
| MCP servers | Local scope, added with `claude mcp add-json <name> '<json>' --scope local`. Stored in `~/.claude.json` for this project. A local server beats a `.mcp.json` server with the same name | `.codex/config.toml` |

All of these are per machine and excluded from git.

Notes:

1. `CLAUDE.local.md` counts as a `CLAUDE.md`. In a repository that has only `AGENTS.md`, creating it would stop Claude Code from reading `AGENTS.md`. In that case Tack MUST start `CLAUDE.local.md` with `@AGENTS.md`.
2. Tack writes `AGENTS.override.md` only when there are personal rules, because it hides `AGENTS.md` from Codex. `tack sync` rewrites it, and `tack status` flags it when `AGENTS.md` changed since.
3. A local `exclude` of a team **always-on** rule cannot remove that rule's text from Claude Code, because the committed block still loads. Tack adds a note to `CLAUDE.local.md` instead ("ignore rule X, use Y"), which Claude reads last. For Codex the override file is a full copy, so the rule is removed.

## 4.5 Global personal outputs (layer 1)

Global personal units go to the agents' **user-level** folders. They work in every repository, including repositories that do not use Tack.

| Unit | Claude Code | Codex |
| --- | --- | --- |
| Rules | Managed block in `~/.claude/CLAUDE.md` | Managed block in `~/.codex/AGENTS.md` |
| Skills | Link in `~/.claude/skills/` | Link in `~/.agents/skills/` |
| Sub-agents | Link in `~/.claude/agents/` | — |
| Hooks, permissions | Entries in `~/.claude/settings.json` | `~/.codex/hooks.json`, `~/.codex/rules/tack.rules` |
| MCP servers | User scope (`--scope user`) | `[mcp_servers.<id>]` in `~/.codex/config.toml` |

Both agents load user-level instructions before project instructions, which matches layer 1 being the lowest layer.

## 4.6 Monorepos

1. A workspace with its own units gets its own managed block in `<workspace>/AGENTS.md`.
2. Codex joins `AGENTS.md` files from the repository root down to the current folder, so it sees the root block and the workspace block.
3. Claude Code does not read a nested `AGENTS.md` when the root has a `CLAUDE.md`. Tack therefore writes `<workspace>/CLAUDE.md` containing `@AGENTS.md` when that file is missing. Claude loads it when it works in that workspace.
4. Skills and executable units are written at the root.

## 4.7 Managed blocks

A managed block is the only part of a Markdown file that Tack owns.

```markdown
<!-- BEGIN:tack — generated by `tack sync`. Edit tack.json or the sources named below. -->
## @tenphi/tasty 3.17.1 (via @cube-dev/ui-kit)

- Never put dynamic values into styles. Use tokens. (tasty:rules/style-values)
- When editing `**/*.tsx`, read node_modules/.tack/pkgs/@tenphi/tasty/harness/io.github.tenphi.tack/rules/state-maps.md
- Docs: node_modules/.tack/pkgs/@tenphi/tasty/docs/llms.txt

## @cube-dev/ui-kit 0.206.1

- …
- Scripts: `npx tack run uikit:probe <story>` — capture a story's DOM and computed CSS
<!-- END:tack -->
```

1. Text outside the markers is never changed.
2. If the markers are missing, Tack appends a block at the end of the file.
3. Each rule line carries its unit ID, so `tack why <id>` can explain it.

## 4.8 Editing shared files

| File | Who owns it | How Tack edits it |
| --- | --- | --- |
| `node_modules/.tack/`, links in skill, agent and rule folders, `.codex/rules/tack.rules` | Tack | Rewrites freely |
| `.codex/` as a whole | Tack | Builds it per machine (see [4.3](#43-team-outputs-layers-2-and-3)) |
| `AGENTS.md`, `CLAUDE.local.md`, `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` | People | Rewrites only the managed block |
| `.claude/settings.json`, `.claude/settings.local.json`, `.mcp.json`, `~/.claude/settings.json` | People | Adds, updates and removes only the entries it created. It records them in the lock (team) or in `~/.tack/state.json` (personal). It keeps key order and formatting |

## 4.9 Why native files and not plugins

Both agents have plugin systems, and a generated Claude Code plugin would put scripts on `PATH` and namespace skills. Tack does not use them in v1:

1. Claude Code cloud sessions do not install plugins that a repository declares, but they do read committed `.claude/settings.json`, `.mcp.json`, `.claude/skills/` and `CLAUDE.md`.
2. Native files show up in pull request diffs, so reviewers see what changes.
3. Native files work the same for every agent that has no plugin support.

A plugin output mode can be added later. See [12-open-questions.md](12-open-questions.md).

## 4.10 Size limits

| Agent | Limit |
| --- | --- |
| Codex | `AGENTS.md` files are joined up to `project_doc_max_bytes`, 32 KiB by default. The rest is cut off. |
| Claude Code | No hard cut-off. The vendor advises under about 200 lines per `CLAUDE.md`. |

`tack sync` and `tack status` report the always-on size per layer and per package, and warn when a limit is close.
