# 6. Trust and lock

## 6.1 What needs trust

| Unit | Needs trust? | Why |
| --- | --- | --- |
| Rules, docs, sub-agent definitions | No | Text. The agent still asks before acting on it. |
| Skills | No | Text. Scripts inside a skill run only when the agent runs them, and the agent asks unless a permission allows it. |
| Scripts | **Yes** | They run code. |
| Hooks | **Yes** | They run automatically. |
| MCP servers | **Yes** | They start automatically and expose tools. |
| Allow permissions | **Yes** | They remove a prompt. |
| Deny and ask permissions | No | They only restrict. |

## 6.2 Trusting a package

Trust is set per package in the committed `tack.json`:

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
| `true` | The package's executable units are active, including in future versions. Changes still show up in the lock diff. Good for the team's own packages. |
| `"pin"` | Active only with the exact hashes in the lock. A changed unit stays off until someone runs `tack approve`. Good for third-party packages. |
| missing | Executable units stay off. `tack sync` lists them as **pending** and never fails the install because of them. |

Rules:

1. Trust MUST NOT pass through `extends`. Trusting UI Kit does not trust Tasty.
2. Personal sources on disk that the developer controls (`harness.local/`, a local path) are trusted by default. Personal npm and git sources need a `trust` entry in `tack.local.json` or `~/.tack/config.json`.
3. `tack run` checks the lock before it runs a script, so the rules also hold when an agent calls a script directly.

## 6.3 Lock files

| File | Layers | Committed? |
| --- | --- | --- |
| `tack.lock.json` | 2 and 3 | yes |
| `tack.local.lock.json` | 4 | no |
| `~/.tack/state.json` | 1 | — |

The lock records:

- every harness package: name, version, plugin name, integrity of its `harness/` folder;
- every unit: ID, kind, content hash;
- every executable unit: trust state (`active`, `pending`, `pinned`);
- every entry Tack wrote into a shared file, so it can remove them later.

Because every unit has a hash, `tack diff` can show what changed in the harness after a dependency upgrade: added, removed and changed rules, skills, scripts and hooks.

## 6.4 CI

`tack sync --check` runs in CI with layers 1 and 4 turned off. It fails when:

- a committed output differs from what Tack would write;
- the lock is out of date;
- a `"pin"` package has a changed executable unit that nobody approved.

## 6.5 Threats this does not cover

- A trusted package is compromised. Trust `true` follows new versions, so the lock diff and normal dependency review are the protection. Use `"pin"` for packages the team does not control.
- Prompt injection inside text units. Rules and skills are instructions to the agent. Review them like code.
- An agent ignores a rule. Tack delivers instructions and cannot enforce them. Hooks and deny permissions can enforce some rules.
