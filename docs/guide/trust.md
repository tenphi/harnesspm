---
description: What needs trust, how a project trusts a package, why an agent cannot grant itself permissions, and how the lock makes every change reviewable.
---

# Trust and safety

**In short**

- Rules, docs, skills and sub-agents are text and need no trust. Scripts, hooks, MCP servers and allow rules do, and so do the keys in skills and sub-agents that run code or skip a prompt.
- A project trusts a package in `harnesspm.json`. Trust never passes through `extends`.
- An agent cannot grant itself permissions through harnesspm. New tools from a run the agent started wait for a person, unless a person already reviewed and merged them.
- `harnesspm.lock.json` and `npx harnesspm sync --check` in CI make every change reviewable.

## What needs trust

| Unit | Needs trust | Why |
| --- | --- | --- |
| Rules, docs, skills, sub-agents | No | Text. The agent still asks before it runs commands. |
| Keys in skills and sub-agents that run code or skip a prompt, such as a skill's `allowed-tools` and `hooks` | Yes | Until you trust the package, harnesspm writes its skills and sub-agents without them, as Claude Code does for plugins. `sync` names each key it leaves out. |
| Scripts, hooks, MCP servers | Yes | They run code, some of them automatically. |
| Allow rules, including `Skill(<name>)` | Yes | They remove a prompt. |
| Deny and ask rules | No | They only restrict. |
| The telemetry handler | Yes | It runs a command on every machine of the team. |

Until you trust a package, its executable units are **pending**. `sync` lists them and does not fail:

```text
⏳ pending: @acme/styles: 1 script, 1 hook (not trusted; a person turns it on in "trust" in harnesspm.json)
```

## Trust a package

```json
{
  "trust": {
    "@acme/ui": true,
    "@acme/colors": "pin"
  }
}
```

| Value | Meaning | For |
| --- | --- | --- |
| `true` | Active, also after upgrades. The lock diff shows changes. | Your team's own packages |
| `"pin"` | Active only in the version approved in the lock. A new version stays off until `npx harnesspm approve`. | Packages your team does not control |
| missing | Off. The units stay pending. | Everything else |

Then run `npx harnesspm sync`. Trust never passes through `extends`: trusting `@acme/ui` does not trust `@acme/colors`, even when `@acme/ui` passes its harness on. Adding a harness with `npx harnesspm add` is your trust decision for that harness, so added harnesses need no entry.

## What harnesspm allows

A dependency cannot grant itself broad rights. harnesspm writes allow rules only for units from the project, an added harness or a trusted package, and only for three things:

- each skill, as `Skill(<name>)`, so an unattended Claude Code session can run it;
- each script with `"allow": true`, as `Bash(npx -y @harnesspm/cli run <plugin>:<script> *)` for Claude Code, and for now also the earlier `Bash(npx harnesspm run <plugin>:<script> *)`, and a `prefix_rule` for Codex;
- each MCP server's tools, for Claude Code.

Deny and ask rules from any package pass through, because they only restrict. Every script runs through `harnesspm run`, which refuses a script when its package is not trusted, or when the installed version differs from the lock.

## An agent cannot grant itself permissions

When the agent's model runs harnesspm, for example through an install the model starts, harnesspm adds no new allow rules, hooks or MCP servers that nobody reviewed. They wait, and `sync` says why:

```text
⏳ held back: 3 entries that an agent cannot grant (allow Skill(harnesspm-export); allow Skill(harnesspm-import); allow Skill(harnesspm-improve)), because harnesspm.json differs from origin/main.
   Ask the person to run `npx -y @harnesspm/cli sync` or `npx -y @harnesspm/cli approve` in their own terminal.
```

This example is from a repository where the agent has just set up harnesspm, and whose own harness has three skills. A run with nothing new to add prints no such line. `status` and `doctor` list the same entries. In a Claude Code cloud session, the second line names the environment's setup script instead, with the line to put there, such as `cd /home/user/app && npm ci`, because nobody has a terminal there.

A change that a person already reviewed needs no step. When a teammate's merged pull request adds a hook, the agent's next install writes it. The repository is then in its reviewed state: `harnesspm.json`, the lock and the harness files are as the default branch has them, and the install reproduces the lock. The agent's own edits, committed or not, and an install that the lock does not record still wait, and the line says what differs. The check reads `origin/HEAD`; `git remote set-head origin --auto` sets it when a clone lacks it.

harnesspm tells a model run from the markers that Claude Code and Codex set on commands their models run. A hook runs from settings a person wrote, so a hook may add entries. The markers stop accidents, such as an install that the model starts. A model that unsets them on purpose is not stopped. See [trusting a package](https://github.com/tenphi/harnesspm/blob/main/docs/spec/06-trust.md#62-trusting-a-package) for the exact markers.

The agents keep their own gates too. Codex loads project `.codex/` files only in a trusted project and asks you to review each hook once ([sources](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#codex)).

## Review every change

`harnesspm.lock.json` is committed. It records every harness package with its version and integrity, and every unit with its hash. A pull request that changes a script, a skill or a hook changes the lock, even when the block stays the same.

In CI, `npx harnesspm sync --check` fails when the block or the lock is out of date, or when a `"pin"` package has a version nobody approved. It ignores harnesses that people added on their machines. The `sync` that the install runs in CI leaves the committed files as they are, so the check still sees a missed sync.

## What this does not cover

- **A trusted package is compromised.** `true` follows new versions. The lock diff and your normal dependency review protect you. Use `"pin"` for packages you do not control.
- **Prompt injection in text units.** Rules and skills are instructions. Review them like code.
- **An agent ignores a rule.** harnesspm delivers instructions. Hooks and deny rules can enforce some of them.

## More

- [Trust and lock](https://github.com/tenphi/harnesspm/blob/main/docs/spec/06-trust.md) and [Executables](https://github.com/tenphi/harnesspm/blob/main/docs/spec/05-executables.md) in the specification.
