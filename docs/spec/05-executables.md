# 5. Executables

**In short**

- A package declares **scripts**. Agents, hooks and MCP servers run them through one command: `npx tack run <plugin>:<script>`.
- Hooks and MCP servers are written once and translated for each agent.
- A package can allow only its own scripts. It can always restrict (deny, ask).
- Nothing executable runs unless the project trusts the package ([06-trust.md](06-trust.md)).

## 5.1 Scripts

A script is a file a package ships for agents, hooks or MCP servers to run.

```json
"scripts": {
  "probe": {
    "file": "./io.github.tenphi.tack/scripts/probe.mjs",
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
npx tack run uikit:probe -- --story Button
```

The runner:

1. finds the package through the stable path in `node_modules/.tack/pkgs/`, so the installed version always runs;
2. checks the script's hash against the lock and refuses a script that is not trusted;
3. picks the interpreter from the file: `node` for `.js`, `.mjs` and `.cjs`, `sh` for `.sh`, otherwise the file itself;
4. sets these environment variables:

| Variable | Value |
| --- | --- |
| `PLUGIN_ROOT` | The package's `harness/` folder (same meaning as in Agent Plugins) |
| `PLUGIN_DATA` | `~/.tack/data/<plugin name>/`, kept across updates (same meaning as in Agent Plugins) |
| `TACK_PROJECT_DIR` | The project root |
| `TACK_AGENT` | `claude`, `codex`, or empty when a person runs it |

The runner must start fast, because hooks call it on every matching tool call.

Why a runner instead of file paths:

- one command works with every package manager and folder layout;
- permission rules match one stable prefix in both agents;
- hooks, MCP servers and skills use the same command, so a `SKILL.md` works on every machine.

## 5.2 Hooks

Claude Code and Codex use nearly the same hook model: event → matcher → command, JSON on stdin, exit code `0` to continue and `2` to block with the reason on stderr. Tack's format keeps that shape.

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
| `run` | yes | A script name from `scripts`. Tack writes the full command for each agent. |
| `matcher` | no | A string for both agents, or an object with `claude` and `codex` keys. Tool names differ between agents (for example, file edits), so an object is common. Without it, the hook matches every tool. |
| `timeout` | no | Seconds. |
| `agents` | no | Limit the hook to some agents, such as `["claude"]`. |

### Events

Portable events, supported by both agents: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`.

An event that only one agent supports MUST set `agents`. `tack check` fails otherwise.

### Contract for hook scripts

1. The script reads the agent's own JSON on stdin. `TACK_AGENT` says which agent sent it.
2. Exit `0` continues. Exit `2` blocks, for events that support blocking, with the reason on stderr.
3. JSON on stdout, such as `hookSpecificOutput.permissionDecision`, follows the agent's own format.

Agent Plugins has an open proposal for portable hooks ([PR #89](https://github.com/agentplugins/agent-plugins-spec/pull/89)). If it becomes part of the standard, Tack reads the standard file as well and keeps its own format working during a migration period.

## 5.3 MCP servers

MCP servers use the Agent Plugins `mcp.json` format.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "docs": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/io.github.tenphi.tack/scripts/docs-mcp.mjs"]
    },
    "figma": { "type": "streamable-http", "url": "https://example.com/mcp" }
  }
}
```

Tack writes each server under the name `<plugin name>-<server>`, such as `uikit-docs`.

- **stdio servers** are written as `npx tack mcp uikit:docs`. The runner expands `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`, sets the environment from [5.1](#51-scripts) and starts the server. Both agents get the same command.
- **Remote servers** are written as they are. Secrets never go into `mcp.json`. Authentication stays with the agent.

## 5.4 Permissions

A dependency MUST NOT be able to grant itself broad rights. Tack therefore allows only two kinds of permission units.

**Allow rules come only from a package's own scripts.** When a script has `"allow": true` and the consumer trusts the package, Tack writes:

| Agent | Rule |
| --- | --- |
| Claude Code | `Bash(npx tack run uikit:probe *)` in `permissions.allow` |
| Codex | `prefix_rule(pattern=["npx", "tack", "run", "uikit:probe"], decision="allow")` |

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

Tack adds a gate. It does not remove the agents' own gates:

| Agent | Own gate |
| --- | --- |
| Claude Code | Allow rules in the untracked `.claude/settings.local.json` apply without the workspace trust step, because the file belongs to the person. Tack's trust is the main gate here. |
| Codex | Project `.codex/` files load only when the project is trusted. Each hook is reviewed by its hash in `/hooks`. |
