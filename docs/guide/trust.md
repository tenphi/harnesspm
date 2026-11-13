---
description: What needs trust, how a project trusts a package, why an agent cannot grant itself permissions, and how the lock makes every change reviewable.
---

# Trust and safety

**In short**

- Rules, docs, skills and sub-agents are text and need no trust. Scripts, hooks, MCP servers and allow rules do.
- A project trusts a package in `harnesspm.json`. Trust never passes through `extends`.
- An agent cannot grant itself permissions through harnesspm. New tools from a run the agent started wait for a person.
- `harnesspm.lock.json` and `npx harnesspm sync --check` in CI make every change reviewable.

## What needs trust

| Unit | Needs trust | Why |
| --- | --- | --- |
| Rules, docs, skills, sub-agents | No | Text. The agent still asks before it runs commands. |
| Scripts, hooks, MCP servers | Yes | They run code, some of them automatically. |
| Allow rules, including `Skill(<name>)` | Yes | They remove a prompt. |
| Deny and ask rules | No | They only restrict. |
| The telemetry handler | Yes | It runs a command on every machine of the team. |

Until you trust a package, its executable units are **pending**. `sync` lists them and does not fail:

```text
⏳ pending: @tenphi/tasty: 1 script (not trusted; add it to "trust" in harnesspm.json)
```

## Trust a package

```json
{
  "trust": {
    "@cube-dev/ui-kit": true,
    "@tenphi/glaze": "pin"
  }
}
```

| Value | Meaning | For |
| --- | --- | --- |
| `true` | Active, also after upgrades. The lock diff shows changes. | Your team's own packages |
| `"pin"` | Active only in the version approved in the lock. A new version stays off until `npx harnesspm approve`. | Packages your team does not control |
| missing | Off. The units stay pending. | Everything else |

Then run `npx harnesspm sync`. Trust never passes through `extends`: trusting UI Kit does not trust Tasty, even when UI Kit passes Tasty's harness on. Adding a harness with `npx harnesspm add` is your trust decision for that harness, so added harnesses need no entry.

## What harnesspm allows

A dependency cannot grant itself broad rights. harnesspm writes allow rules only for units from the project, an added harness or a trusted package, and only for three things:

- each skill, as `Skill(<name>)`, so an unattended Claude Code session can run it;
- each script with `"allow": true`, as `Bash(npx harnesspm run <plugin>:<script> *)` for Claude Code and a `prefix_rule` for Codex;
- each MCP server's tools, for Claude Code.

Deny and ask rules from any package pass through, because they only restrict. Every script runs through `npx harnesspm run`, which refuses a script when its package is not trusted, or when the installed version differs from the lock.

## An agent cannot grant itself permissions

When the agent's model runs harnesspm, for example through an install the model starts, harnesspm adds no new allow rules, hooks or MCP servers. They wait, and `sync` says so:

```text
⏳ held back: 3 entries that an agent cannot grant (allow Skill(harnesspm-export); allow Skill(harnesspm-import); allow Skill(harnesspm-improve)).
   Ask the person to run `npx -y @tenphi/harnesspm sync` or `npx -y @tenphi/harnesspm approve` in their own terminal.
```

harnesspm tells a model run from the markers that Claude Code and Codex set on commands their models run. A hook runs from settings a person wrote, so a hook may add entries. The markers stop accidents, such as an install that the model starts. A model that unsets them on purpose is not stopped. See [trusting a package](../spec/06-trust.md#62-trusting-a-package) for the exact markers.

The agents keep their own gates too. Codex loads project `.codex/` files only in a trusted project and asks you to review each hook once ([sources](../research/agent-capabilities.md#codex)).

## Review every change

`harnesspm.lock.json` is committed. It records every harness package with its version and integrity, and every unit with its hash. A pull request that changes a script, a skill or a hook changes the lock, even when the block stays the same.

In CI, `npx harnesspm sync --check` fails when the block or the lock is out of date, or when a `"pin"` package has a version nobody approved. It ignores harnesses that people added on their machines.

## What this does not cover

- **A trusted package is compromised.** `true` follows new versions. The lock diff and your normal dependency review protect you. Use `"pin"` for packages you do not control.
- **Prompt injection in text units.** Rules and skills are instructions. Review them like code.
- **An agent ignores a rule.** harnesspm delivers instructions. Hooks and deny rules can enforce some of them.

## More

- [Trust and lock](../spec/06-trust.md) and [Executables](../spec/05-executables.md).
