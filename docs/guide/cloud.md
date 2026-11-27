---
description: Use the repository's harness and your own added harness in Claude Code cloud sessions.
---

# Cloud sessions

**In short**

- Claude Code cloud sessions are supported. Codex Cloud is not supported yet; Codex on your computer is.
- The repository's harness appears when the project's install runs `harnesspm sync`. Run the install in the environment's setup script, by absolute path: `cd /home/user/<repo> && npm ci`.
- A failing setup script stops every new session of the environment. Keep optional steps from failing it.
- Add your own harness with one command in the setup script of your own environment, or ask the agent to run it.

## The repository's harness

A cloud session starts from a clean clone. The committed block in `AGENTS.md` is there at once. The per-machine outputs, such as skills, hooks and allow rules, appear when the install runs `harnesspm sync`, as on a laptop.

Run the install in the environment's setup script:

```bash
cd /home/user/<repo> && npm ci
```

The setup script does not start in the clone, so name the clone by its absolute path. A path relative to the repository is not found, the script fails, and no new session of the environment starts. So:

- Add `|| true` to optional steps.
- When the environment also serves other repositories, start the script with `[ -d /home/user/<repo> ] || exit 0`.
- When `package.json` pins the package manager in `packageManager`, run `corepack enable` first. Default network access does not reach corepack's host for Yarn, so put `COREPACK_NPM_REGISTRY=https://registry.npmjs.org` before the install.

To check, start a new session and run `npx harnesspm status`: it shows no "held back" line. Hooks that the install writes work from that first session. Later sessions start from a saved snapshot, and the script runs again after you change it.

When the agent runs the install instead, new hooks, MCP servers and allow rules stay pending, because an agent cannot grant itself permissions. What the default branch records is the exception, but only when the clone has `origin/HEAD`, and cloud clones have none. So that the agent's later installs, such as after a pull, write what is merged, add `git -C /home/user/<repo> remote set-head origin main || true` to the setup script, with your default branch. Rules, docs and skills still work. In a cloud session, `sync`, `status` and `doctor` print the line for the setup script when they hold entries back.

### Several repositories

A session with more than one repository starts in `/home/user`, above the clones. Claude Code reads settings only from that folder, so no repository's hooks run there. After the installs, add one line to the setup script:

```bash
cd /home/user && npx -y @harnesspm/cli sync || true
```

It writes each repository's hooks into `/home/user/.claude/settings.local.json`, and a block in `/home/user/AGENTS.md` that names each repository, its `AGENTS.md` and its `help` command. Later installs of a repository keep its entries there current. A session with one repository starts in its clone and runs that clone's own hooks. It also sees the block, because Claude Code reads `CLAUDE.md` files above the folder a session starts in.

### For a team

Environments are personal, unless an organization Owner shares one. So each person sets the setup script in their own environment. Commit a script that starts with `cd /home/user/<repo>`, and give people the lines to paste:

```bash
[ -d /home/user/<repo> ] || exit 0
bash /home/user/<repo>/scripts/cloud-setup.sh
```

## Your own harness

```shell
npx -y @harnesspm/cli add github:<owner>/<repo>
```

| Way | How it works |
| --- | --- |
| Setup script of your own environment | Runs after the clone and before Claude Code starts, once per cached snapshot. The `SessionStart` hook that `add` installs fetches the harness's newest commits and refreshes the outputs in each later session, in any repository. |
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

- [Cloud sessions](https://github.com/tenphi/harnesspm/blob/main/docs/spec/09-cloud.md) in the specification, including what real sessions confirmed there.
- [Agent capabilities](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#cloud-sessions) in the research notes: the source of each fact about the agents.
