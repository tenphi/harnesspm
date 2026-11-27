# 4. Outputs

**In short**

- harnesspm writes each agent's **native** files, where the agent already looks.
- Of the outputs, only the managed blocks in `AGENTS.md`, the `@AGENTS.md` lines in `CLAUDE.md` files and `harnesspm.lock.json` are committed. Everything else is written on each machine and kept out of git.
- People never edit outputs. Every output names its source.
- The docs of dependencies are copied into `.harnesspm/docs/` at the project root, and a `.rgignore` lets agents' search tools into that folder ([4.3](#43-project-outputs), note 8).
- A session that starts in a folder above the repositories gets their hooks and a pointer to their harness after a `sync` in that folder ([4.10](#410-sessions-that-start-in-a-parent-folder)).

Package authors do not need this chapter. It defines what implementations write.

## 4.1 Principles

1. **Native files only.** No agent has to understand a harnesspm format.
2. **Commit only what reviewers need.** The managed block in `AGENTS.md` shows rule changes in pull requests. The lock shows every other unit change. All other outputs are per machine.
3. **Per-machine outputs are excluded through `.git/info/exclude`.** That file belongs to the clone, is never committed, and is shared by worktrees. Only `init` edits `.gitignore`, with one line for the docs copies (note 8 in [4.3](#43-project-outputs)). `harnesspm doctor` checks that every per-machine file is ignored and untracked ([10.5](10-cli.md#105-the-report)). Its patterns start at the git root, so a project below it, such as `docs-site/`, puts its folder in front of each entry (`/docs-site/.claude/skills/…`) and keeps them in a section of its own, named after its folder. Two projects in one repository never touch each other's entries.
4. **Units of added harnesses never enter a tracked file.** harnesspm MUST refuse to write one there.
5. **Outputs are marked.** Each generated file or block says it is generated and names the sources to edit.
6. **harnesspm edits only its own entries** in files that people or agents also write, and keeps the rest unchanged.

## 4.2 Stable package paths

Package managers place packages at paths that differ between machines. harnesspm creates one stable link per harness package and uses only these paths in outputs:

```
node_modules/.harnesspm/pkgs/@tenphi/tasty  →  <real location of the package>
```

`sync` and `fetch` remove a link there that they no longer write, such as one for a dependency the project dropped or for a package's earlier name. Anything there that is not a link stays.

A job that does not install dependencies, such as a review bot, runs `npx -y @harnesspm/cli fetch`. It downloads only the harness packages in the lock with `npm pack`, checks each tarball against the lock's integrity, and fills these paths, the generated files and the docs copies, so pointers in the committed block work there too. It writes the docs copies only where git ignores them, and the `.rgignore` that lets search tools into them only once `.git/info/exclude` lists it: a sandbox may keep `.git` read-only ([4.3](#43-project-outputs), note 8). It reuses installed copies and writes no agent settings. `fetch` itself never runs package code: `run` stays the separate, explicit step that does, and it can run a script from a fetched package ([5.1](05-executables.md#the-runner)). `help` fetches by itself when a project has neither an install nor fetched packages ([10.1](10-cli.md#101-projects)). When the lock has no integrity for a package, `fetch` looks in the package manager's lockfile. When neither has one, it still downloads the package and warns, naming it.

## 4.3 Project outputs

These hold the dependency and project layers, plus added harnesses with local scope and the project entries of all added harnesses.

| Unit | Claude Code | Codex |
| --- | --- | --- |
| Always-on rules, docs index, script list (team) | Managed block in `AGENTS.md` (committed), reached through `@AGENTS.md` in `CLAUDE.md`. One line per rule: `harnesspm help <package>` prints the text ([4.6](#46-managed-blocks)). | Managed block in `AGENTS.md` (committed), the same lines |
| Always-on rules (added harnesses) | Managed block in `CLAUDE.local.md` | `developer_instructions` in `.codex/config.toml` |
| File-scoped rules | Link in `.claude/rules/harnesspm/<plugin>/` with `paths`, plus a pointer line in the block | Pointer line in the block |
| On-demand rules | Pointer line with its description | Pointer line with its description |
| Skills | Link in `.claude/skills/<name>`, plus `Skill(<name>)` in `permissions.allow` of `.claude/settings.local.json` for skills from the project, an added harness or a trusted package. An untrusted package's skill with `allowed-tools` or `hooks` links to a copy without them in `node_modules/.harnesspm/skills/` ([6.1](06-trust.md#61-what-needs-trust)). | Link in `.agents/skills/<name>`, to the same copy |
| Docs of dependencies | Copies of the pages and `llms.txt` in `.harnesspm/docs/<plugin name>/`, and a `.rgignore` that lets search tools into that folder (note 8) | The same files |
| Sub-agents | Generated `.claude/agents/<name>.md` | Generated `.codex/agents/<name>.toml` |
| Hooks, permissions | Entries in `.claude/settings.local.json` | `.codex/hooks.json`, `.codex/rules/harnesspm.rules` |
| MCP servers | Local scope: `projects.<project>.mcpServers` in `~/.claude.json`, where `claude mcp add-json --scope local` writes them | `[mcp_servers.<id>]` in `.codex/config.toml` |

Notes:

1. `CLAUDE.local.md` counts as a `CLAUDE.md` for Claude Code. In a repository with only `AGENTS.md`, harnesspm MUST start `CLAUDE.local.md` with `@AGENTS.md`, or Claude would stop reading `AGENTS.md`.
2. harnesspm owns `.codex/` and writes it on each machine. If a team already commits `.codex/config.toml`, harnesspm does not touch it and `harnesspm status` lists the units Codex is missing. The team moves those settings into `harness/`, which feeds both agents.
3. A file-scoped rule has two outputs for Claude Code on purpose: the link activates it natively on matching files, and the pointer line in the shared block serves Codex. If an override changes its text in only some workspaces, both agents use the workspace blocks.
4. File-scoped and on-demand rules of added harnesses are pointer lines with absolute paths, in `CLAUDE.local.md` and the user-level blocks. So are their `Docs:` lines, and the pages a generated docs index lists. The agent reads them from whatever folder it works in, and the working copies of git and npm sources sit in `~/.harnesspm/`. They get no `.claude/rules/` link, because Claude Code treats a link to a file outside the working folder as an external import that needs approval. Patched rules and docs indexes of added harnesses are generated into `~/.harnesspm/generated/`, because a repository may have no `node_modules`.
5. An added harness's `exclude` or `patch` of a team always-on rule cannot change committed text. harnesspm writes the change into the local block instead ("ignore rule X", or "in rule X, section Y now says: …"), which both agents read after the team block.
6. With agent events on, harnesspm also writes its own telemetry hooks into the same hook files, and the index they read into `node_modules/.harnesspm/telemetry.json` ([14.4](14-telemetry.md#144-agent-events)).
7. Claude Code reads a nested `AGENTS.md` only when no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists in its folder or above, and the root `CLAUDE.md` that imports the block is one ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#instructions)). So every nested `AGENTS.md` that git tracks, outside `node_modules`, gets an `@AGENTS.md` line in a `CLAUDE.md` in the same folder. harnesspm creates that file, or adds the line at the top of an existing one. A folder whose `.claude/CLAUDE.md` already has `@../AGENTS.md` keeps it and gets no second import. These files are committed outputs: `sync --check` and `doctor` report a missing line.
8. Agents also look for docs by searching, not only through the block. Their search tools skip what git ignores and do not follow links, and plain `rg` also skips hidden folders: Claude Code's Grep and plain `rg` found no page in `node_modules`, under `node_modules/.harnesspm/pkgs/`, or behind a committed link into `node_modules` ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#search)). So `sync` and `fetch` copy each dependency's pages (`.md`, `.mdx`, a linked one too) and `llms.txt` into `.harnesspm/docs/<plugin name>/` at the project root, leaving out what git ignores ([2.7](02-package-format.md#27-docs)). Other files, such as images, are not copied. A link in a copied page that leaves the docs folder, such as `../README.md`, would lead nowhere in the copy, so the copy points it at that file under `node_modules/.harnesspm/pkgs/<package>/`, in the installed package. The package keeps its own link, which its other readers need: a docs site may render the README as a page, as Tasty's does ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/motivating-case.md#docs-sites)).
   - Every dependency is copied, a workspace package too, so the committed pointer never depends on whether a package manager links or copies a package.
   - The copies sit outside `node_modules`, with the project's own files. Git ignores the folder through `/.harnesspm/` in `.git/info/exclude` (4.1, principle 3). Formatters such as Prettier skip what `.gitignore` lists but not what `.git/info/exclude` lists ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#search)), so `init` adds `/.harnesspm/` to the `.gitignore` of the project folder, and `sync` warns until a `.gitignore` in the repository ignores the folder, naming the one in the project folder when the project is below the git root. A global excludes file does not count, since Prettier does not read it.
   - `sync` and `fetch` write the copies only where git ignores the folder `.harnesspm/docs/`, so that an agent's `git add -A` never takes them. They write the copies after `.git/info/exclude`, so a sandbox that keeps `.git` read-only gets copies only when `.gitignore` lists the folder. A pattern that ignores some of the files, such as `*.txt`, does not count. When git fails inside a repository, as in one another user owns, nothing is known to be ignored, so they write no copies.
   - A sync removes the copies that harnesspm 0.13 wrote in `node_modules/.harnesspm/docs/`.
   - A `.rgignore` in the project folder lets ripgrep, and the search tools built on it, into that one folder, because its lines outrank git's ignore rules for ripgrep: `!/.harnesspm/`, `/.harnesspm/*` and `!/.harnesspm/docs/`, after a line that says harnesspm wrote it. The rest of `.harnesspm/`, such as a telemetry file, stays out of search. The `.rgignore` is listed in `.git/info/exclude`.
   - When the repository has a `.rgignore` of its own, harnesspm leaves it as it is, and `sync` warns until it has these lines. Without docs copies, `sync` removes its own `.rgignore`.

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
4. The root block starts with a `## Workspaces` section that names each workspace with a block of its own. Claude Code loads a workspace's block only when the agent opens a file there with its file tools, and Codex only when it starts in that folder ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#instructions)). The root block is always on, so an agent that works through the shell still learns that the block exists.
5. When a rule's text differs, each workspace's block points to its version. Patched versions that agents read from files have distinct paths. A workspace block with nested workspaces tells agents to use the nested workspace's rules when editing its files.

## 4.6 Managed blocks

A managed block is the only part of a Markdown file harnesspm owns. Text outside it never changes. Without markers, harnesspm appends a block at the end.

The committed block is **compact**: the block commands at the top, then one line per unit. Each always-on rule gets a line with its title and a summary, and `harnesspm help <package>` prints its text ([10.1](10-cli.md#help-for-a-package-a-rule-or-a-tool)). So the block stays small with many packages and many workspaces, inside Codex's limit ([4.9](#49-size-limits)).

```markdown
<!-- BEGIN:harnesspm — generated by `harnesspm sync`. Do not edit. To change a rule, run `npx -y @harnesspm/cli why <ID>`. -->

- Every package of this harness: `npx -y @harnesspm/cli help`. A package's rules and tools in full: `npx -y @harnesspm/cli help <package>`.
- Run a tool: `npx -y @harnesspm/cli run <tool> [args]`. Its options: `npx -y @harnesspm/cli help <tool>`.
- From outside this folder, add `-C <path to this folder>` before `help` or `run`.

## @tenphi/tasty (via @cube-dev/ui-kit)

- Always-on rule: Style values — Tokens, Dynamic values. Read it with `help @tenphi/tasty` (tasty:rules/style-values)
- When editing `**/*.tsx`, read node_modules/.harnesspm/pkgs/@tenphi/tasty/harness/dev.harnesspm/rules/state-maps.md — How to write state maps in Tasty styles (tasty:rules/state-maps)
- Docs: .harnesspm/docs/tasty/llms.txt (tasty:docs)

## @cube-dev/ui-kit

- Always-on rule: Forms — Controllers, Validation. Read it with `help @cube-dev/ui-kit` (uikit:rules/forms)
- Tool: `uikit:probe` — Capture a story's DOM and computed CSS (uikit:scripts/probe)

<!-- END:harnesspm -->
```

| Unit | In the committed block |
| --- | --- |
| Block commands, first in a committed block with units | The three lines above, in every block: the root's and each workspace's. They replace the single "outside line" of earlier versions. |
| Package | A `##` heading with its name, and `(via <package>)` when it comes through `extends`. Upstream packages come first. No version: the lock records it, so an upgrade that keeps the harness the same changes only the lock. |
| Always-on rule | ``- Always-on rule: <title> — <summary>. Read it with `help <package>` (<ID>)``. The summary is the rule's `description`, else its `##` and `###` headings in order. A rule without them has the title alone. `<package>` is the npm name, or the plugin name of an added harness. |
| File-scoped rule | `- When editing <globs>, read <file> — <description> (<ID>)` |
| On-demand rule | `- <description>: read <file> (<ID>)` |
| Docs | `- Docs: <index> (<ID>)`. For a dependency, the index is the `llms.txt` of its [docs copy](#43-project-outputs) in `.harnesspm/docs/<plugin name>/`: the package's own, or one harnesspm generates that lists the copied pages. For the project's own docs, it is their `llms.txt`, or one generated in the same folder that lists the pages where they are. |
| Script with a `description`, from the project or a trusted package | ``- Tool: `<plugin name>:<script>` — <description> (<ID>)``. The block commands say how to run it and how to see its options. |
| Hooks that check file edits, from the project or a trusted package | ``- Edit files with your file tools, not shell commands such as `sed`, so the hook that checks each edit runs (<IDs>)``, once per package. A hook counts when it runs before or after a tool and its matcher, read as each agent reads it, matches an edit tool: `Edit`, `Write` or `MultiEdit` for Claude Code, `apply_patch`, `Edit` or `Write` for Codex. A matcher that matches every tool does not count. An edit through the shell skips it. |
| Workspaces with blocks of their own, in the root block of a monorepo | A `## Workspaces` section after the block commands, naming each folder ([4.5](#45-monorepos)) |

The commands use `npx -y @harnesspm/cli` in every block. Inside the project, npx runs the installed harnesspm. Outside it, the agent adds `-C <path>`. The bare `npx harnesspm` fails outside a project, because `harnesspm` is not a published package name ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#outside-the-start-folder)).

**What a reviewer sees.** A dependency upgrade that changes a rule's text changes the unit's hash in the lock. The block changes only when the rule's title, headings or `description` change. `harnesspm help <package>` prints the new text.

**Blocks that stay in full.** Blocks in `CLAUDE.local.md` and user-level files hold added harnesses, which only an agent in the project, or on that machine, reads. They have no block commands, inline each always-on rule as a `###` heading with its title and ID, then its text with headings moved down two levels, and list a script as ``- Script: `npx -y @harnesspm/cli run <plugin name>:<script>` — <description> (<ID>)``. The changes that added harnesses make to the repository's rules go there in full too ([4.3](#43-project-outputs), note 5), and `help` prints the changed text on that machine.

Every heading and line of a unit carries its ID, so an agent can find the source with `harnesspm why`.

**Position.** Agents often read only the top of `AGENTS.md`, such as with `head -30` ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#outside-the-start-folder)), so the block commands come first. A new file gets the block at its top. In an existing file without markers, the block goes at the end, and a person can move it up: `sync` keeps it where it is. The report of `status` and `doctor` warns when a committed block starts past the first 30 lines of its file.

A blank line follows the BEGIN marker and comes before the END marker, so Markdown formatters such as Prettier leave the block as it is. A block written without them, as harnesspm 0.3 did, still counts as up to date, and the next `sync` rewrites it once.

## 4.7 Files shared with people

`CLAUDE.md` files, `~/.codex/AGENTS.md`, `.claude/settings.local.json` and `~/.claude/settings.json` are also written by people, or by the agent itself (Claude Code saves "don't ask again" approvals into `.claude/settings.local.json`). In these files, and in `~/.claude.json`, `.codex/hooks.json` and `~/.codex/config.toml`, harnesspm changes only its managed block or the entries it created. It records its entries in a per-machine state file, so it can remove them later: `harnesspm/state.json` in the clone's git folder for project outputs (`harnesspm/<folder>/state.json` for a project below the git root), and `~/.harnesspm/state.json` for user-level ones. An entry that is already in the file is not added twice, so a state file that is lost never doubles a hook. In a folder that is not a git repository, project outputs use `~/.harnesspm/state/<folder>-<hash>.json`, so harnesspm never creates a `.git` folder. The entries of each project in a parent folder ([4.10](#410-sessions-that-start-in-a-parent-folder)) use `~/.harnesspm/state/parents/<folder>-<hash>/<project>-<hash>.json`, so two projects never take each other's. A settings file that held only harnesspm's entries is deleted with them.

## 4.8 Why native files and not plugins

Both agents have plugin systems. harnesspm does not generate plugins in v1, because Claude Code cloud sessions do not install plugins that a repository declares, and plugins hide changes from pull request review. See [13-open-questions.md](13-open-questions.md#135-plugin-output-mode).

## 4.9 Size limits

| Agent | Limit |
| --- | --- |
| Codex | `AGENTS.md` files are joined up to `project_doc_max_bytes`, 32 KiB by default. The rest is cut off. |
| Claude Code | No hard limit. The vendor advises under about 200 lines per `CLAUDE.md`. |

The report of `status` and `doctor` gives the always-on size per agent, and warns under Outputs when `AGENTS.md` is close to or over 32 KiB, because Codex then reads only its first 32 KiB.

The committed block holds one line per unit, not the text of always-on rules ([4.6](#46-managed-blocks)). The always-on size that `status` reports is that of the files the agents load. The text that agents get with `help <package>` does not count toward it.

Codex reads one file per folder, `AGENTS.override.md` before `AGENTS.md`, from its project root, usually the git root, down to the folder it starts in, and only the files' bytes count toward the limit ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#codex)). So the report also names each managed block that Codex never reads, or reads only in part, with where it starts or ends in the joined files. Each warning adds that agents can still get what the block holds with `npx -y @harnesspm/cli help <package>`:

- a root block after long hand-written text;
- a workspace block below a long root `AGENTS.md`;
- a block in a folder that has an `AGENTS.override.md`.

A new block goes at the end of its file, and `sync` keeps a block where it is. So moving the root block to the top of `AGENTS.md` keeps it in the part Codex reads.

## 4.10 Sessions that start in a parent folder

A session often starts in a folder above the repositories it works on: a Claude Code cloud session with several repositories starts in `/home/user`, a person opens their folder of clones, and a job runner starts in its work folder. Claude Code reads settings only from the folder a session starts in, and Codex reads `AGENTS.md` only from its project root down to that folder ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#outside-the-start-folder)). So no hook of the repositories runs, and their rules do not load at the start.

`npx -y @harnesspm/cli sync` in a **parent folder** fixes that. A parent folder is not in a git repository and has projects right below it: subfolders with a `harnesspm.json`. Its sync writes, for each project:

| Output | Where | What |
| --- | --- | --- |
| Hooks | `.claude/settings.local.json` and `.codex/hooks.json` of the parent folder | The project's hooks and telemetry hooks with the same events, matchers and timeouts. Each starts harnesspm with `-C <project>`. |
| Pointer block | A managed block in the parent folder's `AGENTS.md`, and `@AGENTS.md` in its `CLAUDE.md` | Each project's name and absolute path, its `AGENTS.md`, and `npx -y @harnesspm/cli -C <path> help`. A project that is not installed is listed too: `help` fetches its harness. |

Rules:

1. **Explicit.** Only a sync in the parent folder starts these outputs. Then each project's own sync, such as an install's, keeps its entries there current. A project never writes into a folder above it that has no pointer block. A project linked into the folder is found by its real path, so only a sync in the folder updates its entries.
2. **Clean.** A sync in the folder removes the entries of projects that are gone. When none is left, it removes the block and the import it added too.
3. **Hooks only.** Allow rules, MCP servers, sub-agents and skills stay in the project, because they name commands and files that work only from there. The pointer block says how to reach them.
4. **The runner.** A hook starts the project's installed CLI file with `node` when that harnesspm runs parent hooks (0.11.0 or later), else `npx -y @harnesspm/cli`. A newer harnesspm may sync the parent folder than the one the project installed.
5. **Trust.** The project's trust applies as in the project ([06-trust.md](06-trust.md#62-trusting-a-package)). A sync by the agent's model writes the pointer block, and keeps or removes hooks, but adds none: not even what the project's default branch records, which [6.2](06-trust.md#62-trusting-a-package), rule 4, allows in the project. The folder is the person's, and the agent may have cloned the project itself. The environment's setup script runs as a person, so a cloud session starts with the hooks. With `CI=true` the outputs are written too: they are per machine.
6. **Paths.** Every path is absolute. These files are per machine: a parent folder is not in a git repository. The home folder is never a parent folder, because its `.claude/` and `.codex/` hold the user-level settings of every session.
7. **Where hooks run.** A session in the parent folder edits files of every repository below it, so every project's hook sees them. A hook that `-C` starts from outside its project runs in the project, as in a session there, and harnesspm skips it when its JSON names a file outside the project (`tool_input.file_path` or `notebook_path`).
8. **Inside a repository.** Claude Code also reads the `CLAUDE.md` files above the folder a session starts in, so a session inside one of the repositories sees the block too. It names the repositories next to it. Their hooks stay in the parent folder's settings, which that session does not read.

A job runner that clones during the session writes these outputs after the session started. Claude Code reads them at the next start or resume of the session. Tools work at once: the agent reads the clone's `AGENTS.md`, whose block commands say how to use `-C` (S18).

**Added harnesses.** A sync in a folder that is not in a git repository, and is not the home folder, also applies the person's added harnesses in each git repository right below it, with or without a `harnesspm.json`. The `SessionStart` hook of an added harness runs this sync in the folder a session starts in ([7.5](07-added.md#75-applying-in-every-repository)), so a session with several repositories gets every project entry.

- **Only the added layer.** Each repository gets the per-machine outputs of the added harnesses ([4.3](#43-project-outputs)): the managed block in `CLAUDE.local.md`, their skill links, their entries in `.claude/settings.local.json` and their lines in `.git/info/exclude`. The repository's own outputs, committed and per machine, stay as its own sync wrote them, as before its install: that install may run another harnesspm version than the one in the folder above. So the block lists the entry's own rules, not its changes to the repository's rules (`patch`, `replace`, `exclude`): a sync inside the repository adds those.
- **One level.** Only the folders right below are checked. A folder that is not a git repository gets nothing.
- **Only with added harnesses.** Without one, and with `CI=true`, the sync does what it did before.
- **What a session in the parent folder reads.** Claude Code reads each repository's `CLAUDE.md` and `CLAUDE.local.md`, and its skills, but no settings ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#cloud-sessions)). So the entry's rules and skills apply, and its hooks and permissions apply only in a session that starts in the repository. harnesspm does not move them into the parent folder's settings, because there they would apply to every repository below it ([13.14](13-open-questions.md#1314-entry-hooks-in-a-parent-folder)).
