# 9. Cloud sessions

**In short**

- v1 supports **Claude Code cloud sessions**. Codex Cloud is not supported in v1 ([13.12](13-open-questions.md#1312-removed-in-review)); Codex on a person's computer is.
- A cloud session starts from a clean clone. Team outputs appear when the project's install runs `harnesspm sync`, as on a laptop.
- The personal layer needs one command in the container: in the setup script of the person's own environment, or asked of the agent.
- Improving a personal harness from the cloud needs push access to its repository. Without it, the agent shows the change in the session.

## 9.1 Installing the personal layer

```bash
npx -y harnesspm personal add github:andrew/harness
```

| Way | How it works |
| --- | --- |
| **Setup script** of the person's own environment | ✅ Runs after the clone and before Claude Code starts, once per cached snapshot (about 7 days). Later sessions start from the snapshot, and the `SessionStart` hook refreshes the outputs in each one. |
| **Ask the agent** in a session | ✅ Rules and skills apply at once; Claude Code loads new skills live. Hooks and MCP servers stay pending, because an agent cannot grant itself permissions ([06-trust.md](06-trust.md#62-trusting-a-package)). Allow rules are not needed for built-in tools, which a platform rule approves in cloud sessions. MCP tools still need one. Tip: a small skill on claude.ai can hold the command, because claude.ai skills load in every cloud session. |

A committed repository hook is not the place for personal content, because it belongs to the team.

When the command runs inside a session, it prints the personal always-on rules so the agent follows them at once. New sessions read them from the files.

In a setup script, `harnesspm personal add` installs the scope "everywhere" and the `SessionStart` hook ([07-personal.md](07-personal.md#75-applying-in-every-repository)). The hook applies project entries and writes per-machine outputs in every session, so the setup script does not depend on the repository. Claude Code runs the setup script after the clone, with the repository in `/home/user/<repo>`, but nothing relies on that.

A `~/.claude/settings.json` written by the setup script is read in cloud sessions: its `env` values and deny rules apply. Deny rules are the way to restrict a cloud session, because its platform rule allows all built-in tools.

## 9.2 Private sources

| Source | How to reach it |
| --- | --- |
| Public git repository or npm package | Works |
| Private git repository | Add it under the environment's repositories, or attach it to the session. Setup scripts cannot read variables or secrets. |
| Private npm package | Inside a session only: a network secret for `registry.npmjs.org` |

Tokens MUST NOT be written into setup scripts or environment variables, because anyone who uses the environment can read them.

## 9.3 Improving from the cloud

The flow is the one in [08-improving.md](08-improving.md). Pushing needs the personal repository attached to the session with push access.

A cloud container is discarded later. When the agent cannot push, it MUST show the full change in the session, so the person can apply it elsewhere.

## 9.4 Shared environments

Personal setup MUST go into the person's own environment, because anyone who uses an environment can read its setup script and variables.

## 9.5 Observed in cloud sessions

A probe confirmed each row in November 2026 ([research](../research/agent-capabilities.md#cloud-sessions)). The proof of concept checks them again before the release. Where an output does not work, harnesspm falls back to the nearest one that does and says so in `harnesspm status`.

| Output | Claude Code cloud |
| --- | --- |
| Personal rules, scope everywhere | ✅ `~/.claude/CLAUDE.md` written by a setup script is loaded |
| Personal skills, scope everywhere | 🔍 `~/.claude/skills/` is read |
| Personal rules, scope this project | 🔍 `CLAUDE.local.md`, also when a `SessionStart` hook writes it |
| `SessionStart` hook output | 🔍 Reaches the agent's context |
| Settings written by a setup script | 🔍 `~/.claude/settings.json` is read: `env` and deny rules apply. Built-in tools are approved by the platform; MCP tools are not |
| Hooks | 🔍 Fire from `~/.claude/settings.json`, and from a `.claude/settings.local.json` written in the clone, also by a `SessionStart` hook |
| MCP servers | 🔍 A user-scope server added by the setup script works in sessions started from the cached snapshot; it did not load in the first session of the new environment. Its tool calls ask for approval |
| A skill added during a session | 🔍 Loaded within seconds, from `.claude/skills/` and `~/.claude/skills/` |
| A git-excluded skill in the clone | 🔍 Listed and picked like a committed one |
