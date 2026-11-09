# 13. Open questions

**In short**

- Memory is decided: a person's workflow and context live in the personal harness. The agent's own memory is out of scope.
- The biggest open item is the list of agent behaviors not confirmed yet (13.11).
- 13.12 lists options that were removed and may come back.

## 13.1 Memory (decided)

"Memory" here means everything a person wants agents to know that should live outside a project's repository: how they work, context, how their projects relate. It is the content of the personal harness ([07-personal.md](07-personal.md#71-what-goes-in-it)). Agents keep it current by improving the personal harness ([08-improving.md](08-improving.md)).

Notes that Claude Code or Codex save by themselves (Claude Code auto memory, Codex memories) are part of each agent's own harness. Tack does not move or merge them.

## 13.2 Variables and slots

Repositories often fork a rule only to change a few words, such as a linter's name. Options: variables (`{{name}}` set by the consumer) or slots (a named section the consumer fills). Both add a concept. v1 has only whole-file `replace`. Decide after seeing how often a `replace` copies most of a rule.

## 13.3 Extension namespace

Agent Plugins requires a reverse-domain namespace based on a domain the client controls. The draft uses `io.github.tenphi.tack`, which is long and appears as a folder name in every package. Register a short domain and switch before the first public release, because a later change breaks every published harness.

## 13.4 Sub-agents for Codex

v1 writes sub-agents for Claude Code only. Find out whether Codex has a project-level format for custom agents.

## 13.5 Plugin output mode

A generated plugin could put scripts on `PATH` and namespace skills. Not in v1, because Claude Code cloud sessions do not install repository-declared plugins. Revisit when that changes, or as an option for local-only use.

## 13.6 CI without an install

A review bot that does not install dependencies sees no `node_modules`, so pointers into `node_modules/.tack/pkgs/` lead nowhere. Option: `tack fetch --frozen`, which downloads only the harness packages in the lock.

## 13.7 Team lock on rules (rejected)

A team cannot mark a rule as one a person cannot exclude. Nothing could enforce it on a person's machine, and `tack status` already shows personal changes.

## 13.8 Committed Claude Code settings

v1 writes Claude Code hooks and permissions into the untracked `.claude/settings.local.json`. If cloud sessions do not read that file when it is generated in the container (13.11), team hooks and permissions may need to go into the committed `.claude/settings.json` instead.

## 13.9 Upgrade report

After a dependency upgrade, the diff of the managed block and the lock shows what changed. A readable report (`tack diff`) may help reviewers. Add it if the raw diff turns out to be hard to read.

## 13.10 Structured project relations

A person's notes can describe how repositories relate, such as "UI Kit builds on Tasty". Plain notes are enough for agents to read. Structured data would let Tack do more, such as finding local clones of related repositories. Decide after the proof of concept.

## 13.11 Agent behavior not confirmed yet

Every ❓ in [research/agent-capabilities.md](../research/agent-capabilities.md) and [09-cloud.md](09-cloud.md#95-not-confirmed-yet) must be tested in the proof of concept.

## 13.12 Removed in the first review

| Removed | Why | Comes back if |
| --- | --- | --- |
| Four layers, with a global personal layer below dependencies | Hard to explain. Three layers and two personal scopes say the same thing. | A real case needs personal defaults that team rules override by ID. |
| `include` and `self` in `tack.json` | No scenario needed them. `exclude` covers narrowing. | A project needs an allowlist. |
| Committed Claude Code settings and `.mcp.json` entries | Two rules for two agents. Now: commit only the block and the lock. | See 13.8. |
| `AGENTS.override.md` as a copy of `AGENTS.md` for Codex | Copies go stale. `developer_instructions` adds personal rules without a copy. | `developer_instructions` is not read from project config. |
| `tack personal save`, `push`, `pull`, `diff`, `status`, `extend` and a patch outbox | Tack does not need to wrap git. The owner's rules decide how changes are saved, and agents have their own git tools. | Agents turn out unable to follow owner rules reliably. |
| A folder picked up automatically as a personal harness | One more rule to learn. `personal add --project` does the same. | — |
| A separate lock for personal sources | Personal sources follow their branch or range. | People need reproducible personal setups. |
