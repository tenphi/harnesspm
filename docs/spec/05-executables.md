# 5. Executables

**In short**

- A package declares **scripts**. Agents and hooks run them through one command: `npx harnesspm run <plugin>:<script>`. MCP servers start through `npx harnesspm mcp <plugin>:<server>`.
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
2. refuses the script when its package is not trusted, when the installed version differs from the lock (run `harnesspm sync`), or when a `"pin"` package has a version nobody approved;
3. picks the interpreter from the file: `node` for `.js`, `.mjs` and `.cjs`, `sh` for `.sh`, otherwise the file itself;
4. sets these environment variables:

| Variable | Value |
| --- | --- |
| `PLUGIN_ROOT` | The package's `harness/` folder (same meaning as in Agent Plugins) |
| `PLUGIN_DATA` | `~/.harnesspm/data/<plugin name>/`, kept across updates (same meaning as in Agent Plugins) |
| `HARNESSPM_PROJECT_DIR` | The project root |
| `HARNESSPM_AGENT` | `claude`, `codex`, or empty when a person runs it. harnesspm puts it into the hook and MCP commands it writes, and reads the agent's marker for a script an agent runs ([06-trust.md](06-trust.md#62-trusting-a-package), rule 4). |

The runner must start fast, because hooks call it on every matching tool call. With telemetry on, it sends a `run` event when the script ends ([14.2](14-telemetry.md#142-events)).

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
| `matcher` | no | A string for both agents, or an object with a `claude` key, a `codex` key or both. With an object, the hook is written only for the agents it names. Tool names differ between agents (for example, file edits), so an object is common. Without a matcher, the hook matches every tool in both agents. |
| `timeout` | no | Seconds. |

### Events

Portable events, supported by both agents: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`.

harnesspm writes a hook only for the agents that support its event.

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

harnesspm writes each server under the name `<plugin name>-<server>`, such as `uikit-docs`. For a server from the project, an added harness or a trusted package, it also writes an allow rule for its tools in Claude Code (`mcp__uikit-docs`), because MCP tool calls ask for approval even in cloud sessions. A trusted server already runs the package's code, so its tools need no opt-in of their own. Codex gets no rule.

- **stdio servers** are written as `npx harnesspm mcp uikit:docs`. The runner expands `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`, sets the environment from [5.1](#51-scripts) and starts the server. Both agents get the same command.
- **Remote servers** are written as they are. Secrets never go into `mcp.json`. Authentication stays with the agent.

## 5.4 Permissions

A dependency MUST NOT be able to grant itself broad rights. harnesspm writes allow rules only for units from the project, an added harness or a trusted package, and only for three things: skills, scripts with `"allow": true`, and MCP servers ([5.3](#53-mcp-servers)). Deny and ask rules pass through freely.

**Skills get an allow rule to run unattended.** Outside cloud sessions, Claude Code asks before it invokes a skill, and a headless run denies the call. For each skill from the project's own harness, an added harness or a trusted package, harnesspm writes `Skill(<name>)` into `permissions.allow`. The `allowed-tools` field inside a `SKILL.md` does not replace this: it only pre-approves tools while the skill runs. In cloud sessions the rule changes nothing ([5.5](#55-what-the-agents-still-decide)).

**Scripts get an allow rule when they ask for one.** When a script has `"allow": true` and the consumer trusts the package, harnesspm writes:

| Agent | Rule |
| --- | --- |
| Claude Code | `Bash(npx harnesspm run uikit:probe *)` in `permissions.allow` |
| Codex | `prefix_rule(pattern=["npx", "harnesspm", "run", "uikit:probe"], decision="allow")` |

**Deny and ask rules** only restrict. They are written as command prefixes:

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
