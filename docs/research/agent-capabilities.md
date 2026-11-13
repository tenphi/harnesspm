# Agent capabilities

What Claude Code and Codex read, and where. Collected in November 2026. Agents change often: re-check before building on a fact.

✅ documented by the vendor · 🔍 observed in a real session · ❓ not confirmed

"Cloud probe" facts come from [probes/claude-cloud-probe.sh](probes/claude-cloud-probe.sh), a setup script for a personal Claude Code cloud environment, run with the prompt in [probes/claude-cloud-probe-prompt.md](probes/claude-cloud-probe-prompt.md). Re-run it when Claude Code changes. The Codex counterpart is [probes/codex-cloud-probe.sh](probes/codex-cloud-probe.sh), with the prompt in [probes/codex-cloud-probe-prompt.md](probes/codex-cloud-probe-prompt.md). Twice, a probe added to the install script did not reach Codex Cloud tasks. Publishing captures the filesystem that Codex prepared, so the block probably has to run in the setup chat. [probes/codex-live-probe.md](probes/codex-live-probe.md) tests from inside a task instead.

## Claude Code

### Instructions

| Fact | | Source |
| --- | --- | --- |
| Reads `AGENTS.md` as project instructions when there is no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the working folder or above (v2.1.277+). With a `CLAUDE.md`, only `CLAUDE.md` files load unless it imports `AGENTS.md`. | ✅ | [memory](https://code.claude.com/docs/en/memory) |
| `@path` imports resolve relative to the importing file, up to four hops. Imports outside the working folder need a one-time approval. | ✅ | [memory](https://code.claude.com/docs/en/memory) |
| `CLAUDE.local.md` loads right after `CLAUDE.md` in the same folder. It counts as a `CLAUDE.md` for the `AGENTS.md` check. | ✅ | [memory](https://code.claude.com/docs/en/memory) |
| `CLAUDE.md` files above the working folder load at start. Files in subfolders load when Claude works on a file there. A nested `AGENTS.md` loads only when that folder has no `CLAUDE.md` files and none exist above. | ✅ | [memory](https://code.claude.com/docs/en/memory) |
| Skills that `harnesspm sync` linked into `.claude/skills/` as symlinks, to a folder inside the repository, appeared in a running session at once. A skill symlinked to a folder outside the repository was listed and used too. | 🔍 | Proof of concept, Claude Code 2.1.322, Nov 2026 |
| Asked to improve a harness, a headless `claude -p` run followed the harnesspm flow without hints: it loaded the `harnesspm-improve` skill, ran `harnesspm why` and `harnesspm status`, created units with `harnesspm new patch` and `harnesspm new rule --to <plugin>`, read the owner's `AGENTS.md` and saved the change as it said (commit prefix, push to `main`). It also tried `harnesspm new --help`. | 🔍 | Proof of concept, Claude Code 2.1.322, Nov 2026 |
| Asked to add a color and fix a high-contrast problem in a project that depends on `@tenphi/glaze`, with no mention of harnesspm or the tools, a headless `claude -p` run loaded the package's `glaze-theme` skill first, read the docs index, ran `npx harnesspm run glaze:inspect` before and after its edits, and stopped once every contrast floor was met. The allow rule covered the script with arguments; a `cd <dir> && …` prefix on other commands still needed approval. | 🔍 | Glaze pilot (tenphi/glaze), Claude Code 2.1.322, Nov 2026 |
| In a project that depends only on `@cube-dev/ui-kit`, whose harness extends `@tenphi/glaze` and patches Glaze's colors rule, a headless `claude -p` run asked for a warning state on a card ran the UI Kit tool the patched section names (`uikit:tokens warning`) before anything else, read the `Card` and `Text` pages from UI Kit's docs index, used only palette tokens, and measured its pair with the Glaze tool passed on through UI Kit (`glaze:contrast`) in all four schemes. | 🔍 | UI Kit pilot (cube-js/cube-ui-kit), Claude Code 2.1.322, Nov 2026 |
| What harnesspm writes works in a headless `claude -p` run: hooks in `.claude/settings.local.json` that run `npx harnesspm run --agent claude …` (a `SessionStart` hook's output reached the context, a `PostToolUse` hook fired on `Write`); `Bash(npx harnesspm run kit:probe *)` allowed the script with and without arguments, while an unlisted command was denied; `Bash(git push --force *)` in `deny` blocked the push; a local-scope MCP server written into `~/.claude.json` (`projects.<dir>.mcpServers`) with `mcp__<server>` in `allow` answered without a prompt; a generated `.claude/agents/<name>.md` started. | 🔍 | Proof of concept, Claude Code 2.1.322, Nov 2026 |
| `.claude/rules/*.md` load every session, or only for matching files when they have `paths` frontmatter. Files in subfolders are found too. Symlinks work; one whose target is outside the working folder is treated like an external import and needs approval. | ✅ | [memory](https://code.claude.com/docs/en/memory) |
| Advice: keep each `CLAUDE.md` under about 200 lines. | ✅ | [memory](https://code.claude.com/docs/en/memory) |

### Settings, hooks, permissions

| Fact | | Source |
| --- | --- | --- |
| Scopes: managed, `--settings`, `.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json`. Lists such as `permissions.allow` merge across scopes. | ✅ | [settings](https://code.claude.com/docs/en/settings) |
| Allow rules in committed `.claude/settings.json` apply after the workspace trust dialog. Allow rules in an untracked `.claude/settings.local.json` apply without it. | ✅ | [settings](https://code.claude.com/docs/en/settings) |
| Claude Code reloads settings files when they change, including `permissions` and `hooks`. | ✅ | [settings](https://code.claude.com/docs/en/settings) |
| In auto mode, Claude Code blocks itself from writing an allow rule into `.claude/settings.local.json`, as self-modification. | 🔍 | Cloud-session test, Nov 2026 |
| Claude Code marks who runs a command: `AI_AGENT=claude-code_<version>_agent` for commands the model runs and `…_harness` for hooks, with `CLAUDECODE=1` in both. A cloud setup script gets neither. | 🔍 | Cloud probe, Nov 2026 |
| Hooks: event → matcher group → handlers. Entries merge across settings files and identical handlers run once. Exit `0` continues, exit `2` blocks with stderr as the reason. `${CLAUDE_PROJECT_DIR}` is available. | ✅ | [hooks](https://code.claude.com/docs/en/hooks) |
| Permission rules look like `Bash(npm run test *)`. | ✅ | [settings](https://code.claude.com/docs/en/settings) |
| Hook input on stdin has `session_id`, `transcript_path`, `cwd` and `hook_event_name`. `PostToolUse` adds `tool_name`, `tool_input`, `tool_response`, `tool_use_id` and `duration_ms`. `Read` gets `tool_input.file_path` (absolute), `offset` and `limit`. `SessionStart` has `source`: `startup`, `resume`, `clear`, `compact` or `fork`. | ✅ | [hooks](https://code.claude.com/docs/en/hooks) |
| In a headless `claude -p` run, a `PostToolUse` hook with matcher `Read\|Skill` got `tool_input: {"file_path": "<absolute path>"}` for `Read`, with the file's content in `tool_response`, and `tool_input: {"skill": "<name>"}` for `Skill`, with `tool_response: {"success": true, "commandName": "<name>"}`. `SessionStart` got `source: "startup"`. All three carried the same `session_id`. | 🔍 | Telemetry probe, Claude Code 2.1.323, Nov 2026 |
| `"async": true` on a command hook runs it in the background: Claude Code does not wait, does not enforce its `timeout`, and ignores its decision fields. In a `-p` run, Claude Code kills async hooks still running at teardown, so work that must outlive the session needs a detached process. | ✅ | [hooks](https://code.claude.com/docs/en/hooks#run-hooks-in-the-background) |
| Async `PostToolUse` and `SessionStart` hooks fired in a headless `claude -p` run. | 🔍 | Telemetry probe, Claude Code 2.1.323, Nov 2026 |
| `InstructionsLoaded` fires when a `CLAUDE.md` or `.claude/rules/*.md` file loads, with `file_path` and `load_reason` (`session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact`). The matcher runs against `load_reason`. | ✅ | [hooks](https://code.claude.com/docs/en/hooks) |
| `CLAUDE_CODE_SESSION_ID` is set in commands the model runs and in hooks, with the hook input's `session_id`. | 🔍 | Telemetry probe, Claude Code 2.1.323, Nov 2026 |
| A file-scoped rule linked into `.claude/rules/` fired `InstructionsLoaded` with `load_reason: "path_glob_match"` when the agent wrote a matching file. `file_path` was the link's real target in `node_modules`, and `trigger_file_path` the file the agent touched. | 🔍 | Telemetry end-to-end run, Claude Code 2.1.323, Nov 2026 |
| A `paths` pattern without a leading `/` matches at any depth, unlike the docs' example for `src/**/*`. With `paths: ["harness/**"]`, a rule loaded when the agent only read `vendor/pkg/harness/deep.md`, or `node_modules/.harnesspm/pkgs/<package>/harness/…`, both as a plain file and as a symlink in `.claude/rules/`. With `paths: ["/harness/**"]`, it loaded for `harness/top.md` but not for those files. | 🔍 | `paths` probe and telemetry end-to-end run, Claude Code 2.1.323, Nov 2026; [memory](https://code.claude.com/docs/en/memory#path-specific-rules) documents the leading `/` |
| A `Read` through a symlink whose target is outside the working folder asks for permission, so a headless run denies it. A package installed from a `file:` folder has such a target behind its stable path. | 🔍 | Telemetry end-to-end run, Claude Code 2.1.323, Nov 2026 |
| With harnesspm telemetry on and no mention of harnesspm in the prompt, a headless `claude -p` run sent `session`, `read` (docs pages, a rule it read, a file-scoped rule it loaded by itself), `run` and `skill` events. Asked to use a component that the kit's docs listed but its tool rejected, it followed a project rule built from the template in [spec 14.8](../spec/14-telemetry.md#148-reporting-harness-problems): it ran `harnesspm why` for both units and wrote the report where the rule said. A headless run needs an allow rule for `npx harnesspm why`. | 🔍 | Telemetry end-to-end run, Claude Code 2.1.323, Nov 2026 |
| `permissions.additionalDirectories` gives access to folders outside the project. From a committed file it applies after workspace trust. | ✅ | [settings](https://code.claude.com/docs/en/settings) |

### Skills, sub-agents, MCP, memory

| Fact | | Source |
| --- | --- | --- |
| Skills load from `.claude/skills/` and `~/.claude/skills/`. | ✅ | [cloud environments](https://code.claude.com/docs/en/cloud-environments) |
| Claude Code watches both skill folders: a skill added during a session is available within seconds, without a restart. | ✅ 🔍 | [skills](https://code.claude.com/docs/en/skills); observed in a cloud-session test, Nov 2026 |
| A skill hidden from git through `.git/info/exclude` is listed at startup and picked like a committed one. | 🔍 | Cloud-session test, Nov 2026 |
| Outside cloud sessions, Claude Code asks before invoking a skill. A headless `claude -p` run denies the call unless `Skill(<name>)` is in `permissions.allow`. (In the proof of concept, a nested `claude -p` inside a cloud container ran the Skill tool without the rule while it denied an unlisted Bash command; that run inherited the container's cloud settings, so it does not settle the laptop case.) Auto mode approved it by itself. `allowed-tools` in a `SKILL.md` only pre-approves tools while the skill runs. | ✅ 🔍 | [skills](https://code.claude.com/docs/en/skills); cloud-session test, Nov 2026 |
| A skill is picked by its description. A description that lists the situations and words people use ("Use when …") was picked for all 14 fitting headless prompts and for none of 3 unrelated ones. In one real cloud session a fitting question was answered by plain search instead, so being picked is likely, not certain. | 🔍 | Cloud-session test, Nov 2026 |
| Sub-agents are Markdown files in `.claude/agents/` and `~/.claude/agents/`. Frontmatter needs `name` and `description`; `tools`, `model` and others are optional. The body is the prompt. Unknown fields are ignored. | ✅ | [sub-agents](https://code.claude.com/docs/en/sub-agents) |
| Project MCP servers live in `.mcp.json` and need approval in interactive sessions. Local-scope servers live in `~/.claude.json` per project (`claude mcp add-json <name> '<json>' --scope local`). For one name, local beats project beats user. | ✅ | [MCP](https://code.claude.com/docs/en/mcp) |
| Auto memory lives in `~/.claude/projects/<project>/memory/`. `autoMemoryDirectory` moves it and can be set in any settings scope. The first 200 lines or 25 KB of `MEMORY.md` load each session. | ✅ | [memory](https://code.claude.com/docs/en/memory) |

### Plugins

| Fact | | Source |
| --- | --- | --- |
| Plugins hold skills, commands, agents, hooks, MCP and LSP servers, and a `bin/` folder that is on the Bash tool's `PATH` while the plugin is on. Components are namespaced as `plugin:name`. | ✅ | [plugin manifest](https://code.claude.com/docs/en/plugins-reference) |
| A `CLAUDE.md` inside a plugin is not loaded. | ✅ | [plugin manifest](https://code.claude.com/docs/en/plugins-reference) |

### Cloud sessions

| Fact | | Source |
| --- | --- | --- |
| A setup script runs as root before Claude Code starts. It cannot read the environment's variables or secrets. The result is cached for about 7 days. | ✅ | [cloud environments](https://code.claude.com/docs/en/cloud-environments) |
| Committed `CLAUDE.md`, `.claude/settings.json` hooks and permissions, `.mcp.json`, `.claude/rules/`, `.claude/skills/` and `.claude/agents/` are read in a one-repository session. | ✅ | [cloud environments](https://code.claude.com/docs/en/cloud-environments) |
| Plugins and marketplaces that a repository declares are not installed. | ✅ | [cloud environments](https://code.claude.com/docs/en/cloud-environments) |
| A `~/.claude/CLAUDE.md` written by a setup script is loaded. | ✅ | [cloud environments](https://code.claude.com/docs/en/cloud-environments) |
| `~/.claude/skills/` in the container is read. | 🔍 | Observed in a cloud session |
| Skills from the person's claude.ai account are synced into `~/.claude/skills/synced/`. | 🔍 | Observed in a cloud session |
| The setup script runs after the clone. The repository is in `/home/user/<repo>`. | 🔍 | Cloud probe, Nov 2026 |
| Every new session pays for the always-on instructions. In a large monorepo they were tens of thousands of tokens per cold session. | 🔍 | Cloud-session test, Nov 2026 |
| A `~/.claude/settings.json` written by a setup script is read: its `env` values reach commands, and its deny rules block tools. | 🔍 | Cloud-session test, Nov 2026 |
| Hooks in that `~/.claude/settings.json` fire (`SessionStart`, `UserPromptSubmit`, `PostToolUse`). A `.claude/settings.local.json` written in the clone, also by a `SessionStart` hook, is read in the same session: its `env` applies and its hooks fire. | 🔍 | Cloud probe, Nov 2026 |
| A `CLAUDE.local.md` written by the setup script or by a `SessionStart` hook is loaded, and `SessionStart` hook output reaches the context. | 🔍 | Cloud probe, Nov 2026 |
| A user-scope MCP server added with `claude mcp add-json --scope user` in the setup script did not load in the first session of a new environment. In a later session started from the cached snapshot it started with the session and its tool returned a result. | 🔍 | Cloud probe, Nov 2026 |
| Claude Code starts MCP servers with `AI_AGENT=…_harness`, like hooks. | 🔍 | Cloud probe, Nov 2026 |
| The setup script runs once per cached snapshot. A later session starts from the snapshot without running it again, and the snapshot keeps the clone together with its git-excluded files. | 🔍 | Cloud probe, Nov 2026 |
| When a paused session resumes, `SessionStart` hooks run again with `source: "resume"`. | 🔍 | Cloud probe, Nov 2026 |
| MCP tool calls are not covered by the cloud platform's auto-approval: the session asked for permission. | 🔍 | Cloud probe, Nov 2026 |
| A platform rule approves built-in tools in cloud sessions, even in default mode, so allow rules change nothing for them. MCP tools still ask. Deny rules from settings still apply and win. | 🔍 | Cloud-session test, Nov 2026 |
| A private repository that a setup script needs must be added under the environment's repositories. A token in a variable does not work. | ✅ | In-product documentation for cloud environments |
| Skills enabled on claude.ai load in every cloud session. | ✅ | [cloud environments](https://code.claude.com/docs/en/cloud-environments) |

## Codex

### Instructions

| Fact | | Source |
| --- | --- | --- |
| Global: the first non-empty of `~/.codex/AGENTS.override.md` and `~/.codex/AGENTS.md`. Project: from the root down to the current folder, at most one file per folder, `AGENTS.override.md` before `AGENTS.md`. Later files come later in the prompt. | ✅ | [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) |
| Files are joined up to `project_doc_max_bytes`, 32 KiB by default. | ✅ | [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) |
| `developer_instructions` and `model_instructions_file` exist in `config.toml`. | ✅ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| `developer_instructions` is read from a project's `.codex/config.toml` (when the project is trusted): it is not on the list of keys a project file cannot set. harnesspm uses it for added harnesses in a repository. | ✅ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |

### Configuration, hooks, rules, MCP

| Fact | | Source |
| --- | --- | --- |
| Project config is `.codex/config.toml`. It loads only when the project is trusted. There is no untracked project-local config. The only per-project key in the user config is `projects.<path>.trust_level`. | ✅ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| Hooks live in `hooks.json` or `[hooks]` next to each config layer, including `<repo>/.codex/hooks.json`. All layers load. Hooks are on by default (`[features] hooks = false` turns them off). Non-managed hooks need review in `/hooks`, keyed by hash, and are skipped until trusted; `--dangerously-bypass-hook-trust` skips the check for one run. Managed hooks (`[hooks]` in `requirements.toml`, `/etc/codex/requirements.toml` on Linux, or MDM and cloud policy) are trusted by policy. | ✅ | [hooks](https://learn.chatgpt.com/docs/hooks), [managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration) |
| Hook events: `SessionStart`, `SessionEnd`, `SubagentStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreModelRequest`, `PostModelRequest`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop`, `Interrupt`. Stdin JSON, exit `0` continues, exit `2` blocks. | ✅ | [hooks](https://learn.chatgpt.com/docs/hooks) |
| Hook input for `SessionStart`: `session_id`, `transcript_path`, `cwd`, `model`, `permission_mode` and `source` (`startup`, `resume`, `clear`, `compact`, `fork`). `PostToolUse` adds `tool_name`, `tool_input`, `tool_response`, `tool_use_id` and `turn_id`. | 🔍 | Source at commit 69231e1: [session-start input schema](https://github.com/openai/codex/blob/69231e119bfca0b14453515e97d99688ce1c47c9/codex-rs/hooks/schema/generated/session-start.command.input.schema.json), [post-tool-use input schema](https://github.com/openai/codex/blob/69231e119bfca0b14453515e97d99688ce1c47c9/codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json) |
| A command hook can set `"async": true` to run in the background, on every event except `SessionEnd`. | 🔍 | Source at commit 69231e1: [hooks.rs](https://github.com/openai/codex/blob/69231e119bfca0b14453515e97d99688ce1c47c9/codex-rs/protocol/src/hooks.rs#L148-L161), [discovery.rs](https://github.com/openai/codex/blob/69231e119bfca0b14453515e97d99688ce1c47c9/codex-rs/hooks/src/engine/discovery.rs#L678-L684) |
| Codex has no tool that reads a project file. The model reads files through its shell tool, which hooks see as `Bash` with a command line, so a hook cannot tell reliably which file was read. File edits reach hooks as `apply_patch`. | 🔍 | Source at commit 69231e1: [hook_names.rs](https://github.com/openai/codex/blob/69231e119bfca0b14453515e97d99688ce1c47c9/codex-rs/core/src/tools/hook_names.rs), [unified_exec.rs](https://github.com/openai/codex/blob/69231e119bfca0b14453515e97d99688ce1c47c9/codex-rs/core/src/tools/handlers/unified_exec.rs#L144) |
| Command rules are `.rules` files with `prefix_rule(pattern=[…], decision="allow" \| "prompt" \| "forbidden")` in `<repo>/.codex/rules/` (trusted projects) and `~/.codex/rules/`. Experimental. | ✅ | [rules](https://learn.chatgpt.com/docs/agent-configuration/rules) |
| MCP servers are `[mcp_servers.<id>]` tables. | ✅ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| `sandbox_workspace_write.writable_roots` adds writable folders. | ✅ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |

### Skills, plugins, memory

| Fact | | Source |
| --- | --- | --- |
| Skills load from `.agents/skills` in the current folder and each parent up to the repository root, and from `~/.agents/skills`. Symlinked skill folders work. `agents/openai.yaml` can set `policy.allow_implicit_invocation: false`. | ✅ | [skills](https://learn.chatgpt.com/docs/build-skills) |
| Plugins can bundle skills, MCP servers and hooks. Plugin hooks get `PLUGIN_ROOT` and `PLUGIN_DATA`. | ✅ | [hooks](https://learn.chatgpt.com/docs/hooks), [plugins](https://learn.chatgpt.com/docs/plugins) |
| Memories are behind `features.memories` and stored globally under `$CODEX_HOME/memories/`. No per-project folder setting. | ✅ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| Custom agents are TOML files, one per agent, in `.codex/agents/` (project) and `~/.codex/agents/` (user). Required: `name`, `description`, `developer_instructions`. Optional: `model`, `model_reasoning_effort` and feature switches. `sandbox_mode`, `approval_policy` and `mcp_servers` in an agent file do not override the parent. | ✅ | [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) |
| Project agents in `.codex/agents/` need a trusted project. | ❓ | — |
| `approval_policy.granular.skill_approval` exists. Whether Codex asks before using a skill by default. | ✅ ❓ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| Commands the model runs (the `exec_command` tool) get `CODEX_CI=1` and `CODEX_TOOL_CALL_ID`, on every platform, after the configured environment policy. Commands a person runs with `!` get `CODEX_THREAD_ID`, `CODEX_SESSION_ID` and `CODEX_VERSION` but not those two. Hooks get a copy of Codex's own environment; stdio MCP servers start from an almost empty one. There is no `AI_AGENT`-like marker. Like Claude Code's markers, these are advisory: the model can unset them. | 🔍 | Source at commit e58bf8f: [process_manager.rs](https://github.com/openai/codex/blob/e58bf8f5233b51e7cd1679d947e3028c1ed91b06/codex-rs/core/src/unified_exec/process_manager.rs#L90-L131), [user_shell.rs](https://github.com/openai/codex/blob/e58bf8f5233b51e7cd1679d947e3028c1ed91b06/codex-rs/core/src/tasks/user_shell.rs#L170-L172), [command_runner.rs](https://github.com/openai/codex/blob/e58bf8f5233b51e7cd1679d947e3028c1ed91b06/codex-rs/hooks/src/engine/command_runner.rs#L444-L497), [rmcp utils.rs](https://github.com/openai/codex/blob/e58bf8f5233b51e7cd1679d947e3028c1ed91b06/codex-rs/rmcp-client/src/utils.rs#L16-L58) |
| In the workspace-write sandbox, `.git`, `.agents`, `.codex` and `.aws` inside every writable root are read-only, on Linux and macOS; a missing `.codex` at the workspace root cannot be created either. `~/.codex` is not a writable root. Full access, approved escalations and `.rules` allow rules bypass this. | 🔍 ✅ | [permissions.rs](https://github.com/openai/codex/blob/e58bf8f5233b51e7cd1679d947e3028c1ed91b06/codex-rs/protocol/src/permissions.rs#L43-L54), [agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security) |

### Cloud

Codex Cloud is not supported in v1 ([spec 13.12](../spec/13-open-questions.md#1312-removed-in-review)). These facts stay for when it comes back.

| Fact | | Source |
| --- | --- | --- |
| There are two experiences. **Codex Cloud** (web, mobile, desktop: **Work in** > **Cloud**) runs each task in its own VM, started from a **published** environment. **Codex Cloud (Legacy)** remains for Code Review and the Linear and GitHub integrations, and OpenAI plans to deprecate it. | ✅ | [cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) |
| Codex Cloud: Codex inspects the repositories and records the tested setup in an **install script** and a **start skill** ("instructions to start services and check that they're ready"). Publishing captures the prepared filesystem for new tasks. A change needs **Republish**, and only new tasks use it. A repository refresh runs in the background without rerunning installation or startup. | ✅ | [cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) |
| Codex Cloud: skills stored in the repository are available in cloud tasks. Personal skills from the local computer are not synced. | ✅ | [cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) |
| Codex Cloud: environment variables reach programs directly. Network secrets reach programs as placeholders, and the proxy substitutes the real value for allowed HTTPS destinations, during setup and tasks. A shared environment can ask each person for their own values from **Personal vault**. | ✅ | [cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) |
| Work Cloud uses the Codex task-execution harness, in VM-backed sandboxes. Its tools and controls differ from Codex. | ✅ | [Work cloud security](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security) |
| Legacy: the setup script runs after the clone. Secrets exist only during setup scripts. The agent phase has no internet by default. The container is cached for up to 12 hours; a maintenance script runs on a cached resume. On Business and Enterprise plans the cache is shared by everyone with access. | ✅ | [Codex Cloud (Legacy)](https://learn.chatgpt.com/docs/environments/cloud-environment) |
| A system `/etc/codex/requirements.toml` does not apply to cloud environments automatically; cloud requirements come from admins in Agent Security. | ✅ | [managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration) |
| A task in a published environment: the repositories are in `/workspace/<repo>` next to `library-files`, `scratch` and `shared`, and commands start in the task's repository. They run as `agent` (uid 1000) with `HOME=/home/agent` and `CODEX_HOME=/home/agent/.codex`. The agent can start before its execution environment is ready ("No usable execution environment is available"). The repository's `AGENTS.md` reached the agent. | 🔍 | [probes/codex-cloud-probe.sh](probes/codex-cloud-probe.sh) |
| In that task the skill list held only cloud packages (`pages`, `sites`, `cloud-environment`, …), not the repository's skills, which sit behind a symlinked `.agents/skills`. The MCP namespaces were `codex_apps` and `cua_repl`. A task without the environment saw the same list, with `/workspace` holding only `library-files`, `scratch` and `shared`. | 🔍 | [probes/codex-cloud-probe.sh](probes/codex-cloud-probe.sh) |
| The agent runs outside the task's VM. Inside it, `/opt/codex/bin/codex exec-server --remote https://codex-cloud-environments.chatgpt.com/api --environment-id …` starts every command, and no other `codex` process runs there. Platform MCP tools (`cua_repl`) come through `cloud-agent-mcp-gateway` on `127.0.0.1:8001` in the VM. Rootless Docker runs in the VM. | 🔍 | [probes/codex-cloud-probe.sh](probes/codex-cloud-probe.sh) |
| In the VM, `~/.codex` holds an empty `config.toml`, an `auth.json` written at task start, and `plugins/` and `skills/` from the image. `/etc/codex` holds `config.toml` and `image-plugin-roots.json` from the image and a `network-policy.json` written at task start. The `/workspace` root holds empty `.agents`, `.codex`, `.git` and `.aws` folders created with the environment. | 🔍 | [probes/codex-cloud-probe.sh](probes/codex-cloud-probe.sh) |
| The agent lists skills from two sources: **cloud** (plugin packages, `skill://plugin_connector_…`) and **executor** (the task's VM). In an environment with two repositories, where the task started in `/workspace`, the executor list was empty, although one repository commits skills in a real `.agents/skills` folder. | 🔍 | [probes/codex-live-probe.md](probes/codex-live-probe.md) |
| Files written during a task do not reach the agent, in that turn or the next: skills in each repository's `.agents/skills` (a real folder and a symlink), in `/workspace/.agents/skills` and in `~/.agents/skills`; `developer_instructions` in each `.codex/config.toml`, including the workspace root's; and `~/.codex/AGENTS.md`. The agent can write all of them. | 🔍 | [probes/codex-live-probe.md](probes/codex-live-probe.md) |
| Whether the executor lists skills, or the agent reads `.codex/config.toml`, when they already exist at task start, prepared by the setup: in `/workspace/.agents/skills`, `/workspace/.codex`, or a repository the task starts in. Whether the environment's start skill reaches the agent. | ❓ | — |
| `~/.codex/AGENTS.md`, `~/.codex/config.toml` and `~/.agents/skills` in the VM are probably not read, because the agent runs outside the VM. Hooks need a managed source in the cloud, because nobody can trust them in `/hooks`. | ❓ | — |
