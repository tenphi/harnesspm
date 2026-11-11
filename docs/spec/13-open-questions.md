# 13. Open questions

**In short**

- 13.1 to 13.7 are **decided**. They stay here as a record of why.
- 13.9 to 13.11 wait for the **proof of concept**. Each names the test or signal that settles it. 13.8 was settled by a cloud probe.
- 13.12 lists options that were removed and may come back.

## Decided

### 13.1 Memory

"Memory" here means everything a person wants agents to know that should live outside a project's repository: how they work, context, how their projects relate. It is the content of the personal harness ([07-personal.md](07-personal.md#71-what-goes-in-it)). Agents keep it current by improving the personal harness ([08-improving.md](08-improving.md)).

Notes that Claude Code or Codex save by themselves (Claude Code auto memory, Codex memories) are part of each agent's own harness. harnesspm does not move or merge them.

### 13.2 Partial edits of rules

**Decision:** rules can be patched by Markdown section ([02-package-format.md](02-package-format.md#25-rules)). A patch replaces, adds or removes sections and keeps the rest. Upgrades that change a patched section are reported.

Variables and slots were the other options. A patch covers the same cases, including "change a few words", when authors split rules into small sections. One mechanism is enough. Patches work on rules only. Extend them to skills if people start replacing whole skills to change one step.

### 13.3 Extension namespace

**Decision:** `dev.harnesspm`, based on the domain `harnesspm.dev`. Agent Plugins requires the namespace to be based on a domain the client controls.

**Before the first public release:** register `harnesspm.dev`. It was not registered when checked through RDAP in November 2026. The namespace cannot change after release, because every published harness uses it as a folder name.

### 13.4 Sub-agents for Codex

**Decision:** sub-agents are written for both agents. Codex reads custom agents from `.codex/agents/*.toml` and `~/.codex/agents/` ([research/agent-capabilities.md](../research/agent-capabilities.md)). The format is in [02-package-format.md](02-package-format.md#26-sub-agents).

### 13.5 Plugin output mode

**Decision:** not in v1. Native files work in Claude Code cloud sessions, which do not install repository-declared plugins, and they show up in pull request review. Revisit if cloud sessions start installing such plugins, or as an option for local-only use. Codex Cloud may need one: see 13.12.


### 13.6 CI without an install

**Decision:** `harnesspm fetch --frozen` downloads only the harness packages in the lock and fills `node_modules/.harnesspm/pkgs/` ([04-outputs.md](04-outputs.md#42-stable-package-paths)). The lock records each package's tarball URL and integrity for this.

### 13.7 Team lock on rules (rejected)

A team cannot mark a rule as one a person cannot exclude. Nothing could enforce it on a person's machine, and `harnesspm status` already shows personal changes.

## Waiting for the proof of concept

### 13.8 Committed Claude Code settings (settled)

Not needed. A cloud probe in November 2026 showed that a `.claude/settings.local.json` written in the clone, also by a `SessionStart` hook, is read in the same session: its `env` applies and its hooks fire. Team hooks and permissions stay in that per-machine file.

### 13.9 Upgrade report

After an upgrade, the diff of the managed block and the lock shows what changed. **Signal:** reviewers find the raw diff hard to read. **Then:** add `harnesspm diff`.

### 13.10 Structured project relations

A person's notes describe how repositories relate, such as "UI Kit builds on Tasty". v1 keeps them as plain notes. **Signal:** a task in the proof of concept needs harnesspm itself to act on relations, such as finding local clones of related repositories.

### 13.11 Agent behavior not confirmed yet

Every ❓ in [research/agent-capabilities.md](../research/agent-capabilities.md) that v1 relies on must be tested. The Codex Cloud rows are out of scope (13.12). The 🔍 rows in [9.5](09-cloud.md#95-observed-in-cloud-sessions) are checked again.

## 13.12 Removed in review

| Removed | Why | Comes back if |
| --- | --- | --- |
| Four layers, with a global personal layer below dependencies | Hard to explain. Three layers and two personal scopes say the same thing. | A real case needs personal defaults that team rules override by ID. |
| `include` and `self` in `harnesspm.json` | No scenario needed them. `exclude` covers narrowing. | A project needs an allowlist. |
| Committed Claude Code settings and `.mcp.json` entries | Two rules for two agents. Now: commit only the block and the lock. | See 13.8. |
| `AGENTS.override.md` as a copy of `AGENTS.md` for Codex | Copies go stale. `developer_instructions` adds personal rules without a copy. | `developer_instructions` is not read from project config. |
| `harnesspm personal save`, `push`, `pull`, `diff`, `status`, `extend` and a patch outbox | harnesspm does not need to wrap git. The owner's rules decide how changes are saved, and agents have their own git tools. | Agents turn out unable to follow owner rules reliably. |
| A folder picked up automatically as a personal harness | One more rule to learn. `personal add --project` does the same. | — |
| A separate lock for personal sources | Personal sources follow their branch or range. | People need reproducible personal setups. |
| Variables and slots in rules | Patches by section cover the same cases with one mechanism. | Patches copy most of a rule to change a word. |
| Codex Cloud support | Its agent runs outside the task's VM. In a probe, no file written in the VM during a task reached it, and skills came only from cloud plugins ([research](../research/agent-capabilities.md#cloud)). A setup step that prepares files never reached a task in five tries. Codex on a person's computer stays supported. | Codex Cloud is shown to load files that the setup prepares, or harnesspm gains a Codex plugin output (13.5). |
