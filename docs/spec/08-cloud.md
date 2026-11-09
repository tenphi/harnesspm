# 8. Cloud sessions

A cloud session runs in a fresh container with a clean clone of the repository. Nothing from the developer's laptop is there. The team layers work as usual, because they come from the repository and its dependencies. The personal layer needs one command inside the container:

```bash
npx -y @tenphi/tack personal add github:andrew/harness
```

There are three ways to run it.

## 8.1 Three ways to install the personal layer

| Way | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| **Setup script** of the developer's own environment | ✅ Runs before Claude Code starts. Cached for about 7 days. | ✅ Runs after the clone. Cached for up to 12 hours. Use the maintenance script for updates on a cached resume. |
| **Ask the agent** in a session | ✅ "Install my harness." Tip: a small skill on claude.ai can hold the command, because claude.ai skills load in every cloud session. | ✅ Needs internet access for the agent phase, which is off by default. |
| **Repository hook** | Not for personal content. A committed `SessionStart` hook belongs to the team. | Same. |

### Claude Code: setup script

```bash
#!/bin/bash
npx -y @tenphi/tack personal add github:andrew/harness || true
```

### Codex: setup and maintenance scripts

```bash
# setup script
npx -y @tenphi/tack personal add npm:@andrew/harness
```

```bash
# maintenance script
npx -y @tenphi/tack personal pull || true
```

## 8.2 The current session

Agents read instruction files when a session starts. When `tack personal add` runs inside a session:

1. It prints the personal always-on rules, so the agent reads them right away.
2. Claude Code reloads hooks and permissions when settings files change, so those apply at once.
3. New sessions load everything from the files.

## 8.3 Private sources

| | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| Public git repository or npm package | Works with the default network level | Works during setup |
| Private GitHub repository | Add it under the environment's repositories, or attach it to the session. A token in a variable does not work, because setup scripts cannot read environment variables or secrets. | A token in the environment's secrets. Secrets exist only during setup scripts. |
| Private npm package | Only inside a session: a network secret for `registry.npmjs.org` adds the token without the agent seeing it | `NPM_TOKEN` in the environment's secrets |

Tokens MUST NOT be written into setup scripts or environment variables in Claude Code, because anyone who uses the environment can read them.

## 8.4 Pushing changes from the cloud

`tack personal push` from a cloud session needs push access to the personal repository:

| Agent | How |
| --- | --- |
| Claude Code | Attach the personal repository to the session with push access. |
| Codex | Usually not possible: the agent phase has no secrets and often no network. |

Without access, `push` writes a patch to `~/.tack/outbox/` and prints it in the session, as defined in [07-personal.md](07-personal.md#743-save-push-and-pull). The developer can apply it from another machine.

## 8.5 Shared environments

Personal setup MUST go into the developer's own environment:

- Claude Code: anyone who uses an environment can read its setup script and variables.
- Codex: on Business and Enterprise plans, the environment cache is shared by everyone with access, so a personal harness installed during setup would reach colleagues.

## 8.6 Where personal outputs land in the cloud

The outputs are the same as on a laptop ([04-outputs.md](04-outputs.md)). Their support in cloud containers is not all confirmed yet:

| Output | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| Global rules | ✅ `~/.claude/CLAUDE.md` written by a setup script is loaded | ❓ `~/.codex/AGENTS.md` |
| Global skills | 🔍 `~/.claude/skills/` is read | ❓ `~/.agents/skills/` |
| Local rules | ❓ `CLAUDE.local.md` in the clone | ❓ `AGENTS.override.md` in the clone |
| Hooks and permissions | ❓ `~/.claude/settings.json` in the container | ❓ `.codex/` in the clone. Does the cloud treat the project as trusted? |
| MCP servers | ❓ user scope | ❓ `[mcp_servers]`. The agent phase has no network by default. |
| Skill added during a session | ❓ | ❓ |

The proof of concept MUST test every ❓ before the release. Where an output does not work, Tack falls back to the nearest one that does and says so in `tack status`.
