# 6. Trust and lock

**In short**

- Text units (rules, docs, skills, sub-agents) need no trust. Executable units and allow rules do.
- A project trusts a package in `harnesspm.json`. Adding a personal source is the person trusting it. Trust never passes through `extends`.
- An agent never grants permissions through harnesspm: new allow rules, hooks and MCP servers wait for a person.
- `harnesspm.lock.json` records every unit's hash, so pull requests show what changed.

## 6.1 What needs trust

| Unit | Needs trust? | Why |
| --- | --- | --- |
| Rules, docs, sub-agent definitions, skills | No | Text. The agent still asks before running commands, unless a permission allows them. |
| The `Skill(<name>)` allow rule that lets an unattended session run a skill | **Yes** | It removes a prompt. Written only for skills from the project, a personal harness or a trusted package. |
| Scripts, hooks, MCP servers | **Yes** | They run code, some of them automatically. |
| Allow permissions | **Yes** | They remove a prompt. |
| Deny and ask permissions | No | They only restrict. |

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
| `"pin"` | Active only with the hashes in the lock. A changed unit stays off until `harnesspm approve`. For packages the team does not control. |
| missing | Executable units stay off. `harnesspm sync` lists them as **pending** and does not fail. |

Rules:

1. Trust MUST NOT pass through `extends`. Trusting UI Kit does not trust Tasty.
2. `harnesspm personal add` is the person's trust decision for that source. Personal sources need no `trust` entry.
3. `harnesspm run` checks the lock before running a script, so the rules also hold when an agent calls a script directly.
4. harnesspm MUST NOT add or widen allow rules, hooks or MCP servers when the agent's model runs it, for example through an install the model starts. Claude Code blocks the model from granting its own permissions, and harnesspm must not be a way around that. Claude Code marks who runs a command: `AI_AGENT` ends in `_agent` for commands the model runs and in `_harness` for hooks, and setup scripts get neither. harnesspm treats `_agent`, or `CLAUDECODE=1` without `AI_AGENT`, as a model run. A hook run comes from settings a person wrote, so it may add entries. Pending entries wait until a person runs `harnesspm sync` or `harnesspm approve`, or a setup script or a hook runs harnesspm. Text units, skill links and removals are written as usual.

## 6.3 The lock

`harnesspm.lock.json` is committed. It covers the dependency and project layers and records:

- every harness package: name, version, plugin name, tarball URL and integrity, so `harnesspm fetch --frozen` can download it without an install;
- every unit: ID, kind, content hash;
- every executable unit: whether it is active, pending or pinned;
- every patch: a hash of each section it replaces or removes, so an upgrade that changes one is reported.

People do not edit it. Personal sources are not locked. They follow their branch or version range, and `harnesspm personal update` refreshes them.

## 6.4 CI

`harnesspm sync --check` runs with the personal layer off. It fails when:

- a committed output or the lock is out of date;
- a `"pin"` package has a changed executable unit that nobody approved.

## 6.5 Not covered

- **A trusted package is compromised.** `true` follows new versions. The lock diff and normal dependency review are the protection. Use `"pin"` for packages the team does not control.
- **Prompt injection in text units.** Rules and skills are instructions. Review them like code.
- **An agent ignores a rule.** harnesspm delivers instructions. Hooks and deny permissions can enforce some of them.
