# 6. Trust and lock

**In short**

- Text units (rules, docs, skills, sub-agents) need no trust. Executable units do.
- A project trusts a package in `tack.json`. Trust never passes through `extends`.
- Adding a personal source is the person trusting it.
- `tack.lock.json` records every unit's hash, so pull requests show what changed.

## 6.1 What needs trust

| Unit | Needs trust? | Why |
| --- | --- | --- |
| Rules, docs, sub-agent definitions, skills | No | Text. The agent still asks before running commands, unless a permission allows them. |
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
| `"pin"` | Active only with the hashes in the lock. A changed unit stays off until `tack approve`. For packages the team does not control. |
| missing | Executable units stay off. `tack sync` lists them as **pending** and does not fail. |

Rules:

1. Trust MUST NOT pass through `extends`. Trusting UI Kit does not trust Tasty.
2. `tack personal add` is the person's trust decision for that source. Personal sources need no `trust` entry.
3. `tack run` checks the lock before running a script, so the rules also hold when an agent calls a script directly.

## 6.3 The lock

`tack.lock.json` is committed. It covers the dependency and project layers and records:

- every harness package: name, version, plugin name, integrity of its `harness/` folder;
- every unit: ID, kind, content hash;
- every executable unit: whether it is active, pending or pinned.

People do not edit it. Personal sources are not locked. They follow their branch or version range, and `tack personal update` refreshes them.

## 6.4 CI

`tack sync --check` runs with the personal layer off. It fails when:

- a committed output or the lock is out of date;
- a `"pin"` package has a changed executable unit that nobody approved.

## 6.5 Not covered

- **A trusted package is compromised.** `true` follows new versions. The lock diff and normal dependency review are the protection. Use `"pin"` for packages the team does not control.
- **Prompt injection in text units.** Rules and skills are instructions. Review them like code.
- **An agent ignores a rule.** Tack delivers instructions. Hooks and deny permissions can enforce some of them.
