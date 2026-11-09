# 11. Standards

**In short**

- The package format is **Agent Plugins 1.0**. Skills are **Agent Skills**. The main output is **AGENTS.md**. MCP servers use the Agent Plugins `mcp.json`.
- Tack adds only what no standard covers yet: `extends`, trust, rules, hooks, scripts, overrides and the personal layer.
- Tack should propose its additions upstream once they are proven.

## 11.1 Standards Tack uses

| Standard | Steward | Status (Nov 2026) | How Tack uses it |
| --- | --- | --- | --- |
| [Agent Plugins](https://agent-plugins.org/) | Vendor-neutral steering committee (Amazon, Cursor, Microsoft, OpenAI, Vercel) | 1.0.0 published; 1.1.0 working draft | **The package format.** `harness/` is a plugin: `plugin.json`, `skills/`, `mcp.json`, `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`. Tack data lives in the client-extension namespace, as §8 of the standard requires. |
| [Agent Skills](https://agentskills.io/specification) | Agentic AI Foundation (Linux Foundation) | Published; contributed to the foundation in Oct 2026 | **Skills.** `SKILL.md` with `name` and `description`. Tack never renames a skill, because `name` must match the folder name. |
| [AGENTS.md](https://agents.md/) | Agentic AI Foundation | Widely adopted | **The main instructions output** for every agent that reads it. Tack writes a marked block in it. A harness repository's own `AGENTS.md` is also where its owner says how changes are saved. |
| `CONTRIBUTING.md` | Community convention, recognized by GitHub and GitLab | Widely used | **How to propose changes** to a harness repository, read together with its `AGENTS.md` ([08-improving.md](08-improving.md#83-the-owner-decides-how-to-save)). |
| [Model Context Protocol](https://modelcontextprotocol.io/) | Agentic AI Foundation | Published | **MCP servers.** Tack does not touch the protocol. It configures servers through the Agent Plugins `mcp.json` format. |
| [llms.txt](https://llmstxt.org/) | Community convention | Widely used | **Docs index.** A package's `llms.txt` is its docs index. |
| [Semantic Versioning](https://semver.org/), [SPDX](https://spdx.org/licenses/), [JSON Schema](https://json-schema.org/) | — | Stable | Versions, licenses and the schemas for `tack.json` and the Tack extension. |

## 11.2 What no standard covers yet

| Need | Standard today | What Tack does |
| --- | --- | --- |
| Dependencies between plugins | Agent Plugins lists "dependency resolution" as a future consideration | `extends`, resolved through npm |
| Trust, permissions, approvals | Agent Plugins lists "permission and approval UX" as a future consideration | `trust`, hash locks, allow rules only for a package's own scripts |
| Always-on and file-scoped rules | None. Each agent has its own format | Markdown rules with `paths` and `description` frontmatter |
| Hooks | Agent Plugins [PR #89](https://github.com/agentplugins/agent-plugins-spec/pull/89) proposes portable hooks for 1.1. It is open, and one reviewer objects to putting hook execution in the core spec | Hooks in the shape Claude Code and Codex share |
| Sub-agents | None | The Claude Code sub-agent format, Claude Code only in v1 |
| Scripts for agents | Agent Skills allows `scripts/` inside a skill, with no runner or permission model | Named scripts, one runner, generated permissions |
| Overrides across packages | None | `replace` and `exclude` by unit ID |
| A personal layer | None | Personal harnesses with two scopes, improved under their owner's rules |

## 11.3 Proposing upstream

Tack is a working example of what Agent Plugins lists as future work. Once Tack has real users, the project SHOULD propose:

1. a `dependencies` (or `extends`) field, based on [03-resolution.md](03-resolution.md);
2. a trust and approval model, based on [06-trust.md](06-trust.md);
3. feedback on the hooks proposal, based on running the same hooks in two agents.

## 11.4 Watch list

| Item | Why it matters | Action when it changes |
| --- | --- | --- |
| Agent Plugins 1.1 | May add hooks and other fields | Read the new files. Keep the Tack format working during a migration period. |
| Claude Code and Codex reading Agent Plugins directly | Tack could then write plugins instead of native files for some units | Re-check [04-outputs.md](04-outputs.md#48-why-native-files-and-not-plugins). |
| A standard for rules | Would replace the Tack rule format | Map frontmatter, keep IDs. |
| pnpm and the `skills` CLI linking skills from `node_modules` | Overlaps with Tack's skill outputs | Avoid double links. Tack reads `harness/skills/`, which they do not. |
