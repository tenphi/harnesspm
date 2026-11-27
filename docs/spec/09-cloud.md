# 9. Cloud sessions

**In short**

- v1 supports **Claude Code cloud sessions**. Codex Cloud is not supported in v1 ([13.12](13-open-questions.md#1312-removed-in-review)); Codex on a person's computer is.
- A cloud session starts from a clean clone. Team outputs appear when the project's install runs `harnesspm sync`, as on a laptop. Run the install in the setup script, by absolute path ([9.1](#91-the-repositorys-harness)): when the agent runs it, new hooks, MCP servers and allow rules stay pending outside the reviewed state ([06-trust.md](06-trust.md#62-trusting-a-package), rule 4). In a cloud session, `sync`, `status` and `doctor` print that line when they hold entries back, instead of asking for a terminal.
- Added harnesses need one command in the container: in the setup script of the person's own environment, or asked of the agent. The hook that it installs fetches the harness's newest commits at the start of each session, so a cached snapshot never holds an old copy for long.
- Improving an added harness from the cloud needs push access to its repository. Without it, the agent shows the change in the session.

## 9.1 The repository's harness

```bash
cd /home/user/<repo> && npm ci
```

- **By absolute path.** The setup script does not start in the clone, so a path relative to the repository is not found.
- **A failing script stops the environment.** When the setup script fails, no new session of the environment starts. Optional steps end with `|| true`. An environment that also serves other repositories skips them with `[ -d /home/user/<repo> ] || exit 0`.
- **A pinned package manager** (`packageManager` in `package.json`) needs `corepack enable` before the install. Default network access does not reach corepack's host for Yarn; `COREPACK_NPM_REGISTRY=https://registry.npmjs.org` does.
- **Several repositories.** A session with more than one repository starts in `/home/user`, above the clones, and reads no settings from them ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#cloud-sessions)). After the installs, add `cd /home/user && npx -y @harnesspm/cli sync || true`. It writes each repository's hooks and a pointer block for sessions that start there ([4.10](04-outputs.md#410-sessions-that-start-in-a-parent-folder)). A session with one repository starts in its clone and runs that clone's own hooks. Claude Code also reads the `CLAUDE.md` files above its start folder, so it sees the block, which names the repositories next to it. The hook of an added harness applies its project entries in each clone too: the session reads their rules (`CLAUDE.local.md`) and skills, but not their hooks and permissions, which only a one-repository session gets.
- **In every person's environment.** Environments are personal unless an organization Owner shares one. A team commits its script and gives people the lines to paste.

The install runs as a person's would, before Claude Code starts, so nothing is held back, and its hooks work from the first session ([9.5](#95-what-real-sessions-confirmed)). To check, `harnesspm status` in a new session lists no entries that an agent cannot grant.

A later install by the agent, such as after a pull, writes what the default branch records only when the clone has `origin/HEAD` ([06-trust.md](06-trust.md#62-trusting-a-package), rule 4). The cloud clones seen so far had none ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#cloud-sessions)). The setup script can set it without network: `git -C /home/user/<repo> remote set-head origin main || true`, with the repository's default branch.

When a cloud session holds entries back, `sync`, `status` and `doctor` print this line for the project: its absolute path, and the install that its lockfile asks for, with corepack when `packageManager` is set. Without a lockfile or `harnesspm.json`, they name "the install".

## 9.2 Adding harnesses

```bash
npx -y @harnesspm/cli add github:alex/harness
```

| Way | How it works |
| --- | --- |
| **Setup script** of the person's own environment | ✅ Runs after the clone and before Claude Code starts, once per cached snapshot (about 7 days). Later sessions start from the snapshot, and the `SessionStart` hook fetches the harness's newest commits and refreshes the outputs in each one. |
| **Ask the agent** in a session | ✅ Rules and skills apply at once; Claude Code loads new skills live. Hooks and MCP servers stay pending, because an agent cannot grant itself permissions ([06-trust.md](06-trust.md#62-trusting-a-package)). Built-in tools need no allow rule there; MCP tools do ([05-executables.md](05-executables.md#55-what-the-agents-still-decide)). Tip: a small skill on claude.ai can hold the command, because claude.ai skills load in every cloud session. |

Add harnesses in your own environment: anyone who uses an environment can read its setup script and variables. A committed repository hook is not the place either, because it belongs to the team.

When the command runs inside a session, it prints the added always-on rules so the agent follows them at once. New sessions read them from the files.

In a setup script, `harnesspm add` adds the harness with user scope and installs the `SessionStart` hook ([07-added.md](07-added.md#75-applying-in-every-repository)). The hook fetches the harness, applies project entries and writes per-machine outputs in every session, so the setup script does not depend on the repository. A private source that the session cannot reach is not fetched: the hook warns, and the session starts with the snapshot's copy.

A `~/.claude/settings.json` written by the setup script is read in cloud sessions: its `env` values and deny rules apply. Deny rules are the way to restrict a cloud session.

## 9.3 Private sources

| Source | How to reach it |
| --- | --- |
| Public git repository or npm package | Works |
| Private git repository | Add it under the environment's repositories, or attach it to the session. Setup scripts cannot read variables or secrets. |
| Private npm package | Inside a session only: a network secret for `registry.npmjs.org` |

Never write tokens into setup scripts or environment variables: anyone who uses the environment can read them.

## 9.4 Improving from the cloud

The flow is the one in [08-improving.md](08-improving.md). Pushing needs the added harness's repository attached to the session with push access.

A cloud container is discarded later. When the agent cannot push, it shows the full change in the session, so the person can apply it elsewhere.

## 9.5 What real sessions confirmed

In November 2026 Claude Code cloud sessions confirmed both paths. Details are in [research/agent-capabilities.md](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#cloud-sessions). They are to be checked again ([13.11](13-open-questions.md#1311-agent-behavior-not-confirmed-yet)).

- **Added harnesses**, in a probe: every output they use. User-level rules, skills and settings written by a setup script, `CLAUDE.local.md` and `.claude/settings.local.json` written by a `SessionStart` hook, hooks, MCP servers from the cached snapshot, and skills added during a session.
- **The repository's harness**, in a rollout in a large Yarn 4 monorepo. The setup script's install wrote the hooks and held nothing back, and a package's edit hook ran in the first session. A setup script named by a relative path failed, and no new session started.
