# 9. Cloud sessions

**In short**

- A cloud session starts from a clean clone. Team outputs appear when the project's install runs `tack sync`, as on a laptop.
- The personal layer needs one command in the container: in the person's own environment setup script, or asked of the agent.
- Improving a personal harness from the cloud needs push access to its repository. Without it, the agent shows the change in the session.

## 9.1 Installing the personal layer

```bash
npx -y @tenphi/tack personal add github:andrew/harness
```

| Way | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| **Setup script** of the person's own environment | ✅ Runs before Claude Code starts. Cached for about 7 days. | ✅ Runs after the clone. Cached for up to 12 hours. Add `npx -y @tenphi/tack personal update` to the maintenance script for cached resumes. |
| **Ask the agent** in a session | ✅ Tip: a small skill on claude.ai can hold the command, because claude.ai skills load in every cloud session. | ✅ Needs internet access in the agent phase, which is off by default. |

A committed repository hook is not the place for personal content, because it belongs to the team.

When the command runs inside a session, it prints the personal always-on rules so the agent follows them at once. New sessions read them from the files.

## 9.2 Private sources

| | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| Public git repository or npm package | Works | Works during setup |
| Private git repository | Add it under the environment's repositories, or attach it to the session. Setup scripts cannot read variables or secrets. | A token in the environment's secrets, which exist only during setup |
| Private npm package | Inside a session only: a network secret for `registry.npmjs.org` | `NPM_TOKEN` in the environment's secrets |

Tokens MUST NOT be written into Claude Code setup scripts or environment variables, because anyone who uses the environment can read them.

## 9.3 Improving from the cloud

The flow is the one in [08-improving.md](08-improving.md). Pushing needs access to the personal repository:

| Agent | Push access |
| --- | --- |
| Claude Code | Attach the personal repository to the session with push access. |
| Codex | Usually none: the agent phase has no secrets and often no network. |

A cloud container is discarded later. When the agent cannot push, it MUST show the full change in the session, so the person can apply it elsewhere.

## 9.4 Shared environments

Personal setup MUST go into the person's own environment:

- Claude Code: anyone who uses an environment can read its setup script and variables.
- Codex: on Business and Enterprise plans, the environment cache is shared by everyone with access.

## 9.5 Not confirmed yet

The proof of concept MUST test each ❓ before the release. Where an output does not work, Tack falls back to the nearest one that does and says so in `tack status`.

| Output | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| Personal rules, scope everywhere | ✅ `~/.claude/CLAUDE.md` written by a setup script is loaded | ❓ `~/.codex/AGENTS.md` |
| Personal skills, scope everywhere | 🔍 `~/.claude/skills/` is read | ❓ `~/.agents/skills/` |
| Personal rules, scope this project | ❓ `CLAUDE.local.md` | ❓ `developer_instructions` in `.codex/config.toml` |
| Hooks and permissions | ❓ `.claude/settings.local.json` written in the container | ❓ `.codex/`: does the cloud treat the project as trusted? |
| MCP servers | ❓ local and user scope | ❓ the agent phase has no network by default |
| A skill added during a session | ❓ | ❓ |
