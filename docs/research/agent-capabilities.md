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
| `.claude/rules/*.md` load every session, or only for matching files when they have `paths` frontmatter. A symlink whose target is outside the working folder is treated like an external import. | ✅ | [memory](https://code.claude.com/docs/en/memory) |
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
| `permissions.additionalDirectories` gives access to folders outside the project. From a committed file it applies after workspace trust. | ✅ | [settings](https://code.claude.com/docs/en/settings) |

### Skills, sub-agents, MCP, memory

| Fact | | Source |
| --- | --- | --- |
| Skills load from `.claude/skills/` and `~/.claude/skills/`. | ✅ | [cloud environments](https://code.claude.com/docs/en/cloud-environments) |
| Claude Code watches both skill folders: a skill added during a session is available within seconds, without a restart. | ✅ 🔍 | [skills](https://code.claude.com/docs/en/skills); observed in a cloud-session test, Nov 2026 |
| A skill hidden from git through `.git/info/exclude` is listed at startup and picked like a committed one. | 🔍 | Cloud-session test, Nov 2026 |
| Outside cloud sessions, Claude Code asks before invoking a skill. A headless `claude -p` run denies the call unless `Skill(<name>)` is in `permissions.allow`. Auto mode approved it by itself. `allowed-tools` in a `SKILL.md` only pre-approves tools while the skill runs. | ✅ 🔍 | [skills](https://code.claude.com/docs/en/skills); cloud-session test, Nov 2026 |
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
| `developer_instructions` is read from a project's `.codex/config.toml`. It is not on the list of keys a project file cannot set, but no example confirms it. harnesspm uses it for personal rules with scope "this project". | ❓ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |

### Configuration, hooks, rules, MCP

| Fact | | Source |
| --- | --- | --- |
| Project config is `.codex/config.toml`. It loads only when the project is trusted. There is no untracked project-local config. The only per-project key in the user config is `projects.<path>.trust_level`. | ✅ | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| Hooks live in `hooks.json` or `[hooks]` next to each config layer, including `<repo>/.codex/hooks.json`. All layers load. Hooks are on by default (`[features] hooks = false` turns them off). Non-managed hooks need review in `/hooks`, keyed by hash, and are skipped until trusted; `--dangerously-bypass-hook-trust` skips the check for one run. Managed hooks (`[hooks]` in `requirements.toml`, `/etc/codex/requirements.toml` on Linux, or MDM and cloud policy) are trusted by policy. | ✅ | [hooks](https://learn.chatgpt.com/docs/hooks), [managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration) |
| Hook events: `SessionStart`, `SessionEnd`, `SubagentStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreModelRequest`, `PostModelRequest`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop`, `Interrupt`. Stdin JSON, exit `0` continues, exit `2` blocks. | ✅ | [hooks](https://learn.chatgpt.com/docs/hooks) |
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
| Which environment variables Codex sets in the commands it runs, so a tool can tell it is running under Codex. | ❓ | — |

### Cloud

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
