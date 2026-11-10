# 5. Executables

**In short**

- A package declares **scripts**. Agents, hooks and MCP servers run them through one command: `npx harnesspm run <plugin>:<script>`.
- Hooks and MCP servers are written once and translated for each agent.
- A package can allow only its own scripts. It can always restrict (deny, ask).
- Nothing executable runs unless the project trusts the package ([06-trust.md](06-trust.md)).

## 5.1 Scripts

A script is a file a package ships for agents, hooks or MCP servers to run.

```json
"scripts": {
  "probe": {
    "file": "./dev.harnesspm/scripts/probe.mjs",
    "description": "Capture a story's DOM and computed CSS",
    "allow": true
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `file` | yes | Path inside `harness/`, starting with `./`. |
| `description` | no | Shown to the agent in the script list. Without it, the script is hidden from the agent and only hooks and MCP servers use it. |
| `allow` | no | The producer suggests that agents may run it without asking. Takes effect only when the consumer trusts the package. See [5.4](#54-permissions). |

### The runner

Every script runs through one command:

```bash
npx harnesspm run uikit:probe -- --story Button
```

The runner:

1. finds the package through the stable path in `node_modules/.harnesspm/pkgs/`, so the installed version always runs;
2. checks the script's hash against the lock and refuses a script that is not trusted;
3. picks the interpreter from the file: `node` for `.js`, `.mjs` and `.cjs`, `sh` for `.sh`, otherwise the file itself;
4. sets these environment variables:

| Variable | Value |
| --- | --- |
| `PLUGIN_ROOT` | The package's `harness/` folder (same meaning as in Agent Plugins) |
| `PLUGIN_DATA` | `~/.harnesspm/data/<plugin name>/`, kept across updates (same meaning as in Agent Plugins) |
| `HARNESSPM_PROJECT_DIR` | The project root |
| `HARNESSPM_AGENT` | `claude`, `codex`, or empty when a person runs it |

The runner must start fast, because hooks call it on every matching tool call.

Why a runner instead of file paths:

- one command works with every package manager and folder layout;
- permission rules match one stable prefix in both agents;
- hooks, MCP servers and skills use the same command, so a `SKILL.md` works on every machine.

## 5.2 Hooks

Claude Code and Codex use nearly the same hook model: event → matcher → command, JSON on stdin, exit code `0` to continue and `2` to block with the reason on stderr. harnesspm's format keeps that shape.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "id": "check-styles",
        "matcher": { "claude": "Edit|Write" },
        "run": "check-styles",
        "timeout": 30
      }
    ]
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unit name. The ID becomes `<plugin>:hooks/<id>`. |
| `run` | yes | A script name from `scripts`. harnesspm writes the full command for each agent. |
| `matcher` | no | A string for both agents, or an object with `claude` and `codex` keys. Tool names differ between agents (for example, file edits), so an object is common. Without it, the hook matches every tool. |
| `timeout` | no | Seconds. |
| `agents` | no | Limit the hook to some agents, such as `["claude"]`. |

### Events

Portable events, supported by both agents: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`.

An event that only one agent supports MUST set `agents`. `harnesspm check` fails otherwise.

### Contract for hook scripts

1. The script reads the agent's own JSON on stdin. `HARNESSPM_AGENT` says which agent sent it.
2. Exit `0` continues. Exit `2` blocks, for events that support blocking, with the reason on stderr.
3. JSON on stdout, such as `hookSpecificOutput.permissionDecision`, follows the agent's own format.

Agent Plugins has an open proposal for portable hooks ([PR #89](https://github.com/agentplugins/agent-plugins-spec/pull/89)). If it becomes part of the standard, harnesspm reads the standard file as well and keeps its own format working during a migration period.

## 5.3 MCP servers

MCP servers use the Agent Plugins `mcp.json` format.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "docs": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/dev.harnesspm/scripts/docs-mcp.mjs"]
    },
    "figma": { "type": "streamable-http", "url": "https://example.com/mcp" }
  }
}
```

harnesspm writes each server under the name `<plugin name>-<server>`, such as `uikit-docs`. For a server from the project, a personal harness or a trusted package, it also writes an allow rule for its tools (`mcp__uikit-docs` in Claude Code), because MCP tool calls ask for approval even in Claude Code cloud sessions.

- **stdio servers** are written as `npx harnesspm mcp uikit:docs`. The runner expands `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`, sets the environment from [5.1](#51-scripts) and starts the server. Both agents get the same command.
- **Remote servers** are written as they are. Secrets never go into `mcp.json`. Authentication stays with the agent.

## 5.4 Permissions

A dependency MUST NOT be able to grant itself broad rights. harnesspm therefore allows only two kinds of permission units.

**Skills get an allow rule to run unattended.** Outside cloud sessions, Claude Code asks before it invokes a skill, and a headless run denies the call. For each skill from the project's own harness, a personal harness or a trusted package, harnesspm writes `Skill(<name>)` into `permissions.allow`. The `allowed-tools` field inside a `SKILL.md` does not replace this: it only pre-approves tools while the skill runs. In Claude Code cloud sessions a platform rule approves built-in tools, including skills, so the rule changes nothing there.

**Other allow rules come only from a package's own scripts.** When a script has `"allow": true` and the consumer trusts the package, harnesspm writes:

| Agent | Rule |
| --- | --- |
| Claude Code | `Bash(npx harnesspm run uikit:probe *)` in `permissions.allow` |
| Codex | `prefix_rule(pattern=["npx", "harnesspm", "run", "uikit:probe"], decision="allow")` |

**Deny and ask rules pass through freely**, because they only restrict. They are written as command prefixes:

```json
{
  "deny": [["git", "push", "--force"]],
  "ask": [["npm", "publish"]]
}
```

| Neutral | Claude Code | Codex |
| --- | --- | --- |
| `deny` | `Bash(git push --force *)` in `permissions.deny` | `prefix_rule(…, decision="forbidden")` |
| `ask` | `Bash(npm publish *)` in `permissions.ask` | `prefix_rule(…, decision="prompt")` |

## 5.5 What the agents still decide

harnesspm adds a gate. It does not remove the agents' own gates:

| Agent | Own gate |
| --- | --- |
| Claude Code | Allow rules in the untracked `.claude/settings.local.json` apply without the workspace trust step, because the file belongs to the person. harnesspm's trust is the main gate here. |
| Claude Code cloud sessions | A platform rule approves built-in tools, even in default mode, but not MCP tools. Deny rules from settings still apply and win. The gates are harnesspm's trust, which decides which hooks, MCP servers and scripts exist, the lock check in `harnesspm run`, and deny rules. |
| Codex | Project `.codex/` files load only when the project is trusted. Each hook is reviewed by its hash in `/hooks`. |
