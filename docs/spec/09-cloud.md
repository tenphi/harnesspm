# 9. Cloud sessions

**In short**

- A cloud session starts from a clean clone. Team outputs appear when the project's install runs `harnesspm sync`, as on a laptop.
- The personal layer needs one command in the container: in the person's own environment setup script, or asked of the agent.
- Improving a personal harness from the cloud needs push access to its repository. Without it, the agent shows the change in the session.

## 9.1 Installing the personal layer

```bash
npx -y harnesspm personal add github:andrew/harness
```

| Way | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| **Setup script** of the person's own environment (Codex: **install script**) | ✅ Runs after the clone and before Claude Code starts, once per cached snapshot (about 7 days). Later sessions start from the snapshot, and the `SessionStart` hook refreshes the outputs in each one. | ✅ Runs when Codex prepares the environment. After **Republish**, new tasks start from the prepared files. ❓ Whether the environment's start skill can refresh the outputs in each task. Legacy: the setup script, with `npx -y harnesspm personal update` in the maintenance script. |
| **Ask the agent** in a session | ✅ Rules and skills apply at once; Claude Code loads new skills live. Hooks and MCP servers stay pending, because an agent cannot grant itself permissions ([06-trust.md](06-trust.md#62-trusting-a-package)). Allow rules are not needed for built-in tools, which a platform rule approves in cloud sessions. MCP tools still need one. Tip: a small skill on claude.ai can hold the command, because claude.ai skills load in every cloud session. | ✅ Needs the environment's network settings to allow npm. The same limit on permissions applies. |

A committed repository hook is not the place for personal content, because it belongs to the team.

When the command runs inside a session, it prints the personal always-on rules so the agent follows them at once. New sessions read them from the files.

In a setup script, `harnesspm personal add` installs the scope "everywhere" and the `SessionStart` hook ([07-personal.md](07-personal.md#75-applying-in-every-repository)). The hook applies project entries and writes per-machine outputs in every session, so the setup script does not depend on the repository. Claude Code runs the setup script after the clone, with the repository in `/home/user/<repo>`, but nothing relies on that.

A `~/.claude/settings.json` written by the setup script is read in cloud sessions: its `env` values and deny rules apply. Deny rules are the way to restrict a cloud session, because its platform rule allows all built-in tools.

In Codex Cloud the agent runs outside the task's VM, and `codex exec-server` runs its commands inside it (🔍). Files that a setup writes into the VM's home, such as `~/.codex` and `~/.agents`, therefore probably never reach the agent. Whether project files written into the clone do is still open ([9.5](#95-not-confirmed-yet)).

## 9.2 Private sources

| | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| Public git repository or npm package | Works | Works when the environment's network settings allow the host |
| Private git repository | Add it under the environment's repositories, or attach it to the session. Setup scripts cannot read variables or secrets. | Add it to the environment's repositories, or a network secret for the git host. Legacy: a secret, which exists only during setup. |
| Private npm package | Inside a session only: a network secret for `registry.npmjs.org` | A network secret for `registry.npmjs.org`, during setup and tasks |

Tokens MUST NOT be written into Claude Code setup scripts or environment variables, because anyone who uses the environment can read them.

## 9.3 Improving from the cloud

The flow is the one in [08-improving.md](08-improving.md). Pushing needs access to the personal repository:

| Agent | Push access |
| --- | --- |
| Claude Code | Attach the personal repository to the session with push access. |
| Codex | ❓ A network secret for the git host, from the person's Personal vault. Legacy: usually none, because the agent phase has no secrets. |

A cloud container is discarded later. When the agent cannot push, it MUST show the full change in the session, so the person can apply it elsewhere.

## 9.4 Shared environments

Personal setup MUST go into the person's own environment:

- Claude Code: anyone who uses an environment can read its setup script and variables.
- Codex: a shared environment shares its prepared files and environment-owned credentials. Personal values belong in Personal vault, which a shared environment can request from each person. Legacy: the cache is shared by everyone with access.

## 9.5 Not confirmed yet

The proof of concept MUST test each ❓ before the release. Where an output does not work, harnesspm falls back to the nearest one that does and says so in `harnesspm status`.

| Output | Claude Code cloud | Codex cloud |
| --- | --- | --- |
| Personal rules, scope everywhere | ✅ `~/.claude/CLAUDE.md` written by a setup script is loaded | ❓ `~/.codex/AGENTS.md`: probably not read, because the agent runs outside the VM |
| Personal skills, scope everywhere | 🔍 `~/.claude/skills/` is read | ❓ `~/.agents/skills/`: probably not read, for the same reason |
| Personal rules, scope this project | 🔍 `CLAUDE.local.md`, also when a `SessionStart` hook writes it | ❓ `developer_instructions` in `.codex/config.toml` |
| `SessionStart` hook output | 🔍 Reaches the agent's context | ❓ |
| Settings written by a setup script | 🔍 `~/.claude/settings.json` is read: `env` and deny rules apply. Built-in tools are approved by the platform; MCP tools are not | ❓ `~/.codex/` |
| Hooks | 🔍 Fire from `~/.claude/settings.json`, and from a `.claude/settings.local.json` written in the clone, also by a `SessionStart` hook | ❓ A hook waits for review in `/hooks`, which nobody can give in a cloud task, so only managed hooks may run. Also: does the cloud treat the project's `.codex/` as trusted? |
| MCP servers | 🔍 A user-scope server added by the setup script works in sessions started from the cached snapshot; it did not load in the first session of the new environment. Its tool calls ask for approval | ❓ the agent phase has no network by default |
| A skill added during a session | 🔍 Loaded within seconds, from `.claude/skills/` and `~/.claude/skills/` | ❓ |
| A git-excluded skill in the clone | 🔍 Listed and picked like a committed one | ❓ |
