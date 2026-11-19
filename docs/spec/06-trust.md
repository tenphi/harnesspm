# 6. Trust and lock

**In short**

- Text units (rules, docs, skills, sub-agents) need no trust. Executable units, allow rules, and the keys in skills and sub-agents that run code or skip a prompt do.
- A project trusts a package in `harnesspm.json`. Adding a harness on top is the person trusting it. Trust never passes through `extends`.
- An agent never grants permissions through harnesspm: new allow rules, hooks and MCP servers wait for a person. The exception is what a person already reviewed: an agent's install writes what the default branch records.
- `harnesspm.lock.json` records every unit's hash, so pull requests show what changed.

## 6.1 What needs trust

| Unit | Needs trust? | Why |
| --- | --- | --- |
| Rules, docs, sub-agent definitions, skills | No | Text. The agent still asks before running commands, unless a permission allows them. |
| Keys in a sub-agent or a `SKILL.md` that run code or skip a prompt: `hooks`, `mcpServers` and `permissionMode` in a Claude Code sub-agent, `sandbox_mode` and `approval_policy` in a Codex one, `allowed-tools` and `hooks` in a skill | **Yes** | Claude Code runs a project sub-agent's hooks and MCP servers once the folder is trusted, and applies a skill's `allowed-tools` even in a folder nobody trusted. It ignores the same sub-agent keys in plugins, for security ([research](../research/agent-capabilities.md#skills-sub-agents-mcp-memory)). For an untrusted package, a sub-agent is written without them, and a skill is linked as a generated copy without them ([4.3](04-outputs.md#43-project-outputs)). `sync` names each key it leaves out. |
| The `Skill(<name>)` allow rule that lets an unattended session run a skill | **Yes** | It removes a prompt. Written only for skills from the project, an added harness or a trusted package. |
| Scripts, hooks, MCP servers | **Yes** | They run code, some of them automatically. |
| Allow permissions | **Yes** | They remove a prompt. |
| Deny and ask permissions | No | They only restrict. |
| The telemetry handler | **Yes** | It runs a command on every machine of the team. Recorded in the lock by a person's sync ([14.5](14-telemetry.md#145-trust)). |

## 6.2 Trusting a package

```json
{
  "trust": {
    "@cube-dev/ui-kit": true,
    "some-third-party": "pin"
  }
}
```

| Value | Meaning |
| --- | --- |
| `true` | Executable units are active, also after upgrades. The lock diff shows changes. For the team's own packages. |
| `"pin"` | Active only in the version approved in the lock. Adding the entry approves the installed version. A new version stays off until `harnesspm approve`. For packages the team does not control. |
| missing | Executable units stay off. `harnesspm sync` lists them as **pending** and does not fail. |

Rules:

1. Trust MUST NOT pass through `extends`. Trusting UI Kit does not trust Tasty.
2. `harnesspm add` is the person's trust decision for that harness. Added harnesses need no `trust` entry.
3. `harnesspm run` checks the lock before running a script, so the rules also hold when an agent calls a script directly.
4. harnesspm MUST NOT add or widen allow rules, hooks or MCP servers when the agent's model runs it, for example through an install the model starts, unless a person already reviewed them. Agents keep the model from granting itself permissions, and harnesspm must not be a way around that.
   - Claude Code marks who runs a command: `AI_AGENT` ends in `_agent` for commands the model runs and in `_harness` for hooks and MCP servers. Setup scripts get neither. harnesspm treats `_agent`, or `CLAUDECODE=1` without `AI_AGENT`, as a model run.
   - Codex sets `CODEX_CI=1` and `CODEX_TOOL_CALL_ID` in commands the model runs, and in neither hooks nor commands a person runs. harnesspm treats either as a model run. Codex's workspace-write sandbox also keeps `.codex/` and `~/.codex` read-only for model runs ([research](../research/agent-capabilities.md#codex)).
   - These markers are advisory: a model can unset them. They stop accidents, such as an install the model starts, not a model that works around them.
   - A hook runs from settings a person wrote, so a hook run may add entries.
   - A model run keeps the entries a person granted before, and never removes a deny or ask rule. Held-back entries stay pending until a person runs `harnesspm sync` or `harnesspm approve`, a setup script or a hook runs harnesspm, or the repository is in its reviewed state. Text units, skill links and other removals are written as usual.
   - **Reviewed state.** A model run writes the repository's entries as a person's run does when the repository is in its reviewed state, that is, when all of these hold. Then a teammate's merged change reaches every machine with the next install, and the agent's own edits still wait for review.
     1. The trust inputs are the same as at the merge base of `HEAD` and the remote default branch (`origin/HEAD`): `harnesspm.json`, `harnesspm.lock.json`, the project's `harness/` and `harnesspm/patches/`, and each workspace's `harness/` and `harnesspm/patches/`. An uncommitted change, a commit on the branch, or an untracked file there fails the check.
     2. The sync computes the committed lock, so every unit hash, package version and `"pin"` approval is what the review saw. An install that the lock does not record, such as `pnpm add <pkg>@next`, fails the check.
     3. It covers only the repository's layers. Added harnesses are not locked, and a person grants them with `add` (rule 2).
   - The check reads local refs only, so it costs a few git commands and no network. A stale `origin/HEAD` means an older reviewed state. Like the markers, it is advisory: a model can move a ref. It assumes that changes reach the default branch only through review.
   - Without `origin/HEAD` (`git remote set-head origin --auto` sets it), and in a Codex run, a model run holds back as before. Codex's sandbox keeps `.codex/` read-only, and Codex asks a person to review each new hook anyway.
   - A hook whose command changes only in its prefix, such as `node` with the installed CLI file in place of npx ([5.2](05-executables.md#52-hooks)), runs the same script. A model run writes it too.
   - A model run also keeps the telemetry handler that the lock has. A new or changed handler is held the same way ([14.5](14-telemetry.md#145-trust)).
   - `sync` lists the entries it held back, and why the repository is not in its reviewed state, such as `harnesspm.json differs from origin/main` or `the installed packages do not match harnesspm.lock.json`. So the person knows whether a review or an install is due. `status` and `doctor` list the same entries, counted the same way, with a held telemetry handler first. When the repository is in its reviewed state but this machine lacks entries, they say that a sync writes them. Outside a cloud session, they ask the person to run `sync` or `approve` in their own terminal. In a Claude Code cloud session (`CLAUDE_CODE_REMOTE=true`), the person has no terminal there, so they print the line for the environment's setup script instead ([9.1](09-cloud.md#91-the-repositorys-harness)).

## 6.3 The lock

`harnesspm.lock.json` is committed. It covers the dependency and project layers and records:

- every harness package: name, version, plugin name, tarball URL and integrity, so `harnesspm fetch` can download it without an install; for a `"pin"` package, also the approved version. The URL and integrity come from `package-lock.json`, `pnpm-lock.yaml` or Yarn 1's `yarn.lock`. pnpm records a URL only for a package outside the registry;
- the project's own harness, and each workspace's: name, plugin name and `"project": true`, without a version. The project layer is always trusted and its unit hashes show every change, so a release that raises the project's version leaves the lock as it is. A lock with that version, as harnesspm 0.3 wrote it, still counts as up to date, and the next `sync` drops it;
- every unit: ID, kind, content hash. A docs unit's content is its `llms.txt` and its `.md` and `.mdx` pages that git does not ignore ([2.7](02-package-format.md#27-docs)), so a change to another file in its folder, such as source code next to the pages, leaves the lock as it is;
- every patch: a hash of each section it replaces or removes, so an upgrade that changes one is reported;
- the telemetry handler that a person's sync recorded ([14.5](14-telemetry.md#145-trust)).

The lock holds no per-machine state, so every machine writes the same lock. `harnesspm status` shows which executable units are pending on this machine, and why.

People do not edit it. Added harnesses are not locked. They follow their branch or version range, and `harnesspm update` refreshes them.

## 6.4 CI

`harnesspm sync --check` and every run with `CI=true` ignore added harnesses. `--check` writes nothing and fails when:

- a committed output or the lock is out of date, including a telemetry handler that differs from `harnesspm.json`;
- a `"pin"` package has a version that nobody approved.

With `CI=true`, `sync` also leaves the committed outputs as they are. An install runs `sync` from `prepare` or `postinstall`, and if that sync rewrote them, a later `sync --check` would compare fresh files and pass while the pull request missed a sync. So in CI, `sync` writes only the per-machine outputs, such as stable package paths, docs indexes and skill links, which jobs and review bots read. It says so in one line. A job that commits the result runs `sync --write`.

## 6.5 Not covered

- **A trusted package is compromised.** `true` follows new versions. The lock diff and normal dependency review are the protection. Use `"pin"` for packages the team does not control.
- **Prompt injection in text units.** Rules and skills are instructions. Review them like code.
- **Commands in an untrusted skill.** A `` !`command` `` in a `SKILL.md` runs when the skill loads, if the person's permission rules allow it. Without `allowed-tools`, a command they don't allow stops the skill, except in auto mode, where the agent's own check decides ([research](../research/agent-capabilities.md#skills-sub-agents-mcp-memory)).
- **An agent ignores a rule.** harnesspm delivers instructions. Hooks and deny permissions can enforce some of them.
