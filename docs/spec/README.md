# harnesspm specification

**Version:** 0.5 draft
**Status:** Under discussion. Everything here can change before the first release.

## Reading order

| If you want to | Read |
| --- | --- |
| Understand harnesspm in five minutes | [1. Overview](01-overview.md) |
| Share a harness from a package | [2. Package format](02-package-format.md), then [5. Executables](05-executables.md) if it ships tools |
| Use harness in a project | [3. Resolution](03-resolution.md), [6. Trust and lock](06-trust.md) |
| Keep your own workflow and context | [7. Added harnesses](07-added.md), [9. Cloud sessions](09-cloud.md) |
| Let agents improve a harness | [8. Improving a harness](08-improving.md) |
| Implement harnesspm | Everything, including [4. Outputs](04-outputs.md) and [10. CLI](10-cli.md) |

Also: [11. Standards](11-standards.md), [12. Dogfooding](12-dogfooding.md), [13. Open questions](13-open-questions.md).

Every chapter starts with **In short**: the few points an agent or a person needs to act on it.

## Conformance language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** have the meaning given in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). They appear only where a rule is meant to be strict.

## Verification markers

Statements about how an agent behaves are marked in [research/agent-capabilities.md](../research/agent-capabilities.md):

| Marker | Meaning |
| --- | --- |
| ✅ | Documented by the agent's vendor |
| 🔍 | Observed in a real session |
| ❓ | Not confirmed. The proof of concept must test it |
