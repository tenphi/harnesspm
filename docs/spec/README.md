# Tack specification

**Version:** 0.1 draft
**Status:** Under discussion. Everything here can change before the first release.

## Reading order

1. [Overview](01-overview.md): goals, terms and base scenarios. Read this first.
2. [Package format](02-package-format.md): what a package ships.
3. [Resolution](03-resolution.md): how Tack combines layers.
4. [Outputs](04-outputs.md): what Tack writes for each agent.
5. [Executables](05-executables.md): scripts, hooks, MCP servers and permissions.
6. [Trust and lock](06-trust.md): what runs, and who approved it.
7. [Personal harness](07-personal.md): the developer's own layer.
8. [Cloud sessions](08-cloud.md): the same layers in cloud environments.
9. [CLI](09-cli.md): every command in one place.
10. [Standards](10-standards.md): what Tack reuses and what it adds.
11. [Dogfooding](11-dogfooding.md): this repository as the first user.
12. [Open questions](12-open-questions.md): what is not decided yet.

## Conformance language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** have the meaning given in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). They appear only where a rule is meant to be strict. Everything else is explanation.

## Verification markers

Statements about how an agent behaves come from that agent's documentation. Some are not confirmed yet. The research notes mark each one:

| Marker | Meaning |
| --- | --- |
| ✅ | Documented by the agent's vendor |
| 🔍 | Observed in a real session |
| ❓ | Not confirmed. The proof of concept must test it |

See [research/agent-capabilities.md](../research/agent-capabilities.md).
