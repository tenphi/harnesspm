---
description: Use the repository's harness and your own added harness in Claude Code cloud sessions.
---

# Cloud sessions

**In short**

- Claude Code cloud sessions are supported. Codex Cloud is not supported yet; Codex on your computer is.
- The repository's harness appears when the project's install runs `harnesspm sync`. Run the install in the environment's setup script.
- Add your own harness with one command in the setup script of your own environment, or ask the agent to run it.

## The repository's harness

A cloud session starts from a clean clone. The committed block in `AGENTS.md` is there at once. The per-machine outputs, such as skills, hooks and allow rules, appear when the install runs `harnesspm sync`, as on a laptop.

Run the install in the environment's setup script. When the agent runs the install instead, new hooks, MCP servers and allow rules stay pending, because an agent cannot grant itself permissions. Rules, docs and skills still work.

## Your own harness

```shell
npx -y @tenphi/harnesspm add github:<owner>/<repo>
```

| Way | How it works |
| --- | --- |
| Setup script of your own environment | Runs after the clone and before Claude Code starts, once per cached snapshot. The `SessionStart` hook that `add` installs refreshes the outputs in each later session, in any repository. |
| Ask the agent in a session | Rules and skills apply at once, and Claude Code loads new skills live. Hooks and MCP servers stay pending. |

- Use your own environment. Anyone who uses an environment can read its setup script and variables.
- Do not use a committed repository hook for this. It belongs to the team.
- A small claude.ai skill can hold the `add` command, because claude.ai skills load in every cloud session.

## Private sources

| Source | How to reach it |
| --- | --- |
| Public git repository or npm package | Works |
| Private git repository | Add it to the environment's repositories, or attach it to the session. Setup scripts cannot read secrets. |
| Private npm package | Inside a session only, through a network secret for the registry |

Never put tokens into setup scripts or environment variables.

## Improve from the cloud

The agent changes your harness the usual way ([Change upstream units](./change-upstream.md#improve-a-harness-with-an-agent)). To push, the session needs your harness's repository attached with push access. When it cannot push, the agent shows the whole change in the session, so you can apply it elsewhere.

## More

- [Cloud sessions](https://github.com/tenphi/harnesspm/blob/main/docs/spec/09-cloud.md) in the specification, including what a probe confirmed there.
- [Agent capabilities](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#cloud-sessions) in the research notes: the source of each fact about the agents.
