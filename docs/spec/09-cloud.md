# 9. Cloud sessions

**In short**

- v1 supports **Claude Code cloud sessions**. Codex Cloud is not supported in v1 ([13.12](13-open-questions.md#1312-removed-in-review)); Codex on a person's computer is.
- A cloud session starts from a clean clone. Team outputs appear when the project's install runs `harnesspm sync`, as on a laptop. Run the install in the setup script: when the agent runs it, new hooks, MCP servers and allow rules stay pending ([06-trust.md](06-trust.md#62-trusting-a-package), rule 4).
- Added harnesses need one command in the container: in the setup script of the person's own environment, or asked of the agent.
- Improving an added harness from the cloud needs push access to its repository. Without it, the agent shows the change in the session.

## 9.1 Adding harnesses

```bash
npx -y @tenphi/harnesspm add github:alex/harness
```

| Way | How it works |
| --- | --- |
| **Setup script** of the person's own environment | ✅ Runs after the clone and before Claude Code starts, once per cached snapshot (about 7 days). Later sessions start from the snapshot, and the `SessionStart` hook refreshes the outputs in each one. |
| **Ask the agent** in a session | ✅ Rules and skills apply at once; Claude Code loads new skills live. Hooks and MCP servers stay pending, because an agent cannot grant itself permissions ([06-trust.md](06-trust.md#62-trusting-a-package)). Built-in tools need no allow rule there; MCP tools do ([05-executables.md](05-executables.md#55-what-the-agents-still-decide)). Tip: a small skill on claude.ai can hold the command, because claude.ai skills load in every cloud session. |

Add harnesses in your own environment: anyone who uses an environment can read its setup script and variables. A committed repository hook is not the place either, because it belongs to the team.

When the command runs inside a session, it prints the added always-on rules so the agent follows them at once. New sessions read them from the files.

In a setup script, `harnesspm add` adds the harness with user scope and installs the `SessionStart` hook ([07-added.md](07-added.md#75-applying-in-every-repository)). The hook applies project entries and writes per-machine outputs in every session, so the setup script does not depend on the repository.

A `~/.claude/settings.json` written by the setup script is read in cloud sessions: its `env` values and deny rules apply. Deny rules are the way to restrict a cloud session.

## 9.2 Private sources

| Source | How to reach it |
| --- | --- |
| Public git repository or npm package | Works |
| Private git repository | Add it under the environment's repositories, or attach it to the session. Setup scripts cannot read variables or secrets. |
| Private npm package | Inside a session only: a network secret for `registry.npmjs.org` |

Never write tokens into setup scripts or environment variables: anyone who uses the environment can read them.

## 9.3 Improving from the cloud

The flow is the one in [08-improving.md](08-improving.md). Pushing needs the added harness's repository attached to the session with push access.

A cloud container is discarded later. When the agent cannot push, it shows the full change in the session, so the person can apply it elsewhere.

## 9.4 What a probe confirmed

In November 2026 a probe confirmed in Claude Code cloud sessions every output that added harnesses use: user-level rules, skills and settings written by a setup script, `CLAUDE.local.md` and `.claude/settings.local.json` written by a `SessionStart` hook, hooks, MCP servers from the cached snapshot, and skills added during a session. Details are in [research/agent-capabilities.md](../research/agent-capabilities.md#cloud-sessions). The proof of concept checks them again ([13.11](13-open-questions.md#1311-agent-behavior-not-confirmed-yet)).
