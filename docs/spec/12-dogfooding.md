# 12. Dogfooding

**In short**

- This repository consumes its own harness and publishes it with the npm package.
- Every project that installs Tack gets three skills that match the three flows: `tack-export`, `tack-import` and `tack-improve`.
- A format change in the spec MUST update these files in the same change.

## 12.1 What this repository has

| File | Role |
| --- | --- |
| [`AGENTS.md`](../../AGENTS.md) | How to work on this repository, including how to save changes. A Tack block is added once the CLI exists. |
| [`CLAUDE.md`](../../CLAUDE.md) | Imports `AGENTS.md` for Claude Code. |
| [`tack.json`](../../tack.json) | This repository's project configuration. |
| [`harness/`](../../harness/) | The harness that ships to everyone who installs `@tenphi/tack`. Part of the project layer here, the dependency layer for users. |

Until the CLI exists, these files are drafts that show the format. The first implementation MUST make them work as written, or change them and this chapter together.

## 12.2 What Tack's harness gives its users

| Unit | Kind | Purpose |
| --- | --- | --- |
| `tack:rules/generated-files` | Always-on rule | Outputs are generated. To change one, find its source with `tack why`. |
| `tack:rules/tack-config` | File-scoped rule | How to change `tack.json`, `tack.local.json` and harness files safely. |
| `tack-export` | Skill | Share a harness from a package: units, IDs, `extends`, checks, publishing. |
| `tack-import` | Skill | Set up Tack in a project, trust packages, add a personal harness. |
| `tack-improve` | Skill | Change any harness: find the owner, edit the source, save under the owner's rules. |
| `tack:scripts/check` | Script, `allow: true` | Validate harness changes without a prompt: `npx tack run tack:check`. |
| Docs index | Docs | This specification, at the installed version. |

It is also the reference example for package authors: each unit kind once, at the smallest useful size.

## 12.3 Publishing

```json
{
  "name": "@tenphi/tack",
  "files": ["dist", "schema", "harness", "docs/spec"],
  "scripts": { "prepack": "tack check" }
}
```

`tack check` runs against the package itself, so a broken harness cannot be published.

## 12.4 Checks

| Check | When |
| --- | --- |
| `tack check` | Every pull request and `prepack` |
| `tack sync --check --no-local` | Every pull request |
| `tack sync` on fixture projects, checked for Claude Code and Codex outputs | Every pull request |
